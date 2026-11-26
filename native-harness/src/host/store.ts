/** Durable per-session state: harness settings, native identity, fork checkpoints. */
import { z } from 'zod'
import type { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import type { Adoption, HarnessId, HarnessSettings } from '../shared/types.ts'
import type { NativeCut, NativeRef } from './harness/types.ts'

export const CHECKPOINT_LIMIT = 64
export const FORWARDED_LIMIT = 64

export interface Checkpoint {
  /** Seq of the dsh assistant event that closed the native turn. */
  seq: number
  cut: NativeCut
}
export interface SessionRecord {
  harness: HarnessId
  settings: HarnessSettings
  ref?: NativeRef
  /**
   * A terminal Claude conversation this blank session takes over, until its
   * first native turn is committed. Continuing it also sets `ref` to it; a
   * fork leaves `ref` unset until the copy reports its own id.
   */
  adopted?: Adoption
  /** Claude Code endpoint the native process last started on, so a switch is noticed across restarts. */
  lastEndpoint?: string
  /** Directory the native session was last opened in. */
  cwd?: string
  checkpoints: Checkpoint[]
  /** dsh MessageIds already delivered to the native session, newest last. */
  forwarded: string[]
}

export interface SessionStore {
  read(sessionId: string): Promise<SessionRecord | undefined>
  /** Updates of one session run one at a time; `change` sees the latest record. */
  update(
    sessionId: string,
    change: (record: SessionRecord | undefined) => SessionRecord,
  ): Promise<SessionRecord>
  close(): Promise<void>
}

const harness = z.enum(['claude-code', 'codex', 'antigravity'])
const ref = z.object({ harness, id: z.string().min(1) })
const recordSchema = z.object({
  harness,
  settings: z.object({
    model: z.string().optional(),
    effort: z.string().optional(),
    mode: z.string().optional(),
    fast: z.boolean().optional(),
    endpoint: z.string().optional(),
  }),
  ref: ref.optional(),
  adopted: z.object({ id: z.string().min(1), title: z.string(), fork: z.boolean() }).optional(),
  lastEndpoint: z.string().optional(),
  cwd: z.string().min(1).optional(),
  checkpoints: z
    .array(z.object({ seq: z.number().int().nonnegative(), cut: z.object({ ref, at: z.string().min(1) }) }))
    .max(CHECKPOINT_LIMIT),
  forwarded: z.array(z.string()).max(FORWARDED_LIMIT),
})
const DOMAIN = {
  name: 'native_harness',
  version: 1,
  layout: 'per-record',
  tables: { sessions: { valueSchema: recordSchema } },
} as const

/** Keep bounded lists bounded before every write. */
export function normalize(record: SessionRecord): SessionRecord {
  return {
    ...record,
    checkpoints: record.checkpoints.slice(-CHECKPOINT_LIMIT),
    forwarded: record.forwarded.slice(-FORWARDED_LIMIT),
  }
}

function serialized(
  read: (id: string) => Promise<SessionRecord | undefined>,
  write: (id: string, record: SessionRecord) => Promise<void>,
): Pick<SessionStore, 'update'> & { settle(): Promise<void> } {
  const chains = new Map<string, Promise<unknown>>()
  return {
    update(id, change) {
      const task = (chains.get(id) ?? Promise.resolve())
        .catch(() => undefined)
        .then(async () => {
          const next = normalize(change(await read(id)))
          await write(id, next)
          return next
        })
      chains.set(id, task)
      void task.finally(() => {
        if (chains.get(id) === task) chains.delete(id)
      }).catch(() => undefined)
      return task
    },
    async settle() {
      await Promise.allSettled(chains.values())
    },
  }
}

export function openSessionStore(domains: Pick<DomainFacility, 'open'>): SessionStore {
  const opening = domains.open(DOMAIN)
  const table = async () => (await opening).table('sessions')
  const read = async (id: string) => (await (await table()).get(id)) as SessionRecord | undefined
  const updates = serialized(read, async (id, record) => {
    await (await table()).put(id, JSON.parse(JSON.stringify(record)) as SessionRecord)
  })
  return {
    read,
    update: updates.update,
    async close() {
      await updates.settle()
      await (await opening.catch(() => undefined))?.close()
    },
  }
}

/** In-memory store with the same serialization contract, for tests. */
export function memoryStore(): SessionStore & { records: Map<string, SessionRecord> } {
  const records = new Map<string, SessionRecord>()
  const read = async (id: string) => structuredClone(records.get(id))
  const updates = serialized(read, async (id, record) => {
    records.set(id, structuredClone(record))
  })
  return { records, read, update: updates.update, close: updates.settle }
}

export function emptyRecord(harness: HarnessId): SessionRecord {
  return { harness, settings: {}, checkpoints: [], forwarded: [] }
}
