/**
 * Each session's fast-mode switch. A session gets its switch the first time it
 * is seen, by the browser or by a request: a forked or delegated session takes
 * its parent's, any other the row's default at that moment, so changing the
 * default never flips a session already seen. A switch counts as on only once
 * stored: while storage is unavailable every session is off.
 */

import { cell } from '../kit/cell.ts'
import { Refusal } from '../kit/refusal.ts'

/** Where the switches are kept; reads are synchronous once open, a write is durable when it resolves. */
export interface SwitchStore {
  get(sessionId: string): boolean | undefined
  put(sessionId: string, enabled: boolean): Promise<void>
}

export interface TogglesOptions {
  /** The opened store; a rejection leaves storage unavailable. */
  store: Promise<SwitchStore>
  /** The session a session was forked or delegated from, if any. */
  parentOf(sessionId: string): string | undefined
  /** The switch for a session seen for the first time with no parent. */
  initial(): boolean
}

export interface SessionToggles {
  /** The session's switch, recording it on first sight; off while storage is unavailable or the record cannot be written. */
  enabled(sessionId: string): Promise<boolean>
  /** The session's switch at once, then on every change, until `signal` aborts. */
  watch(sessionId: string, signal: AbortSignal): AsyncIterable<boolean>
  /**
   * Turn the session's switch; refuses `storage-unavailable`.
   * @returns the switch as stored.
   */
  set(sessionId: string, enabled: boolean): Promise<boolean>
}

export function createSessionToggles(options: TogglesOptions): SessionToggles {
  const opened = options.store.then(store => store, () => undefined)
  /** First-sight records being written, so a session seen twice meanwhile gets one switch. */
  const recording = new Map<string, Promise<boolean>>()
  /** Bumped after every stored write, so watchers read their session again. */
  const writes = cell(0)

  const parentOf = (sessionId: string): string | undefined => {
    try {
      return options.parentOf(sessionId)
    } catch {
      return undefined
    }
  }

  async function record(store: SwitchStore, sessionId: string, lineage: ReadonlySet<string>): Promise<boolean> {
    const parent = parentOf(sessionId)
    const value = parent !== undefined && !lineage.has(parent)
      ? await read(store, parent, new Set([...lineage, sessionId]))
      : options.initial()
    try {
      await store.put(sessionId, value)
    } catch {
      // Not stored, so off; the next sight tries again. Watchers are not woken, or they would retry at once.
      return false
    }
    writes.set(writes.get() + 1)
    return value
  }

  async function read(store: SwitchStore, sessionId: string, lineage: ReadonlySet<string>): Promise<boolean> {
    const stored = store.get(sessionId)
    if (stored !== undefined) return stored
    let pending = recording.get(sessionId)
    if (pending === undefined) {
      pending = record(store, sessionId, lineage)
      recording.set(sessionId, pending)
      void pending.finally(() => { recording.delete(sessionId) })
    }
    return pending
  }

  const enabled = async (sessionId: string): Promise<boolean> => {
    const store = await opened
    return store === undefined ? false : read(store, sessionId, new Set())
  }

  return {
    enabled,
    async *watch(sessionId, signal) {
      let last: boolean | undefined
      for await (const _ of writes.watch(signal)) {
        const value = await enabled(sessionId)
        if (signal.aborted) return
        if (value !== last) {
          last = value
          yield value
        }
      }
    },
    async set(sessionId, value) {
      const store = await opened
      if (store === undefined) throw new Refusal('storage-unavailable')
      await store.put(sessionId, value)
      writes.set(writes.get() + 1)
      return value
    },
  }
}
