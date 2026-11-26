/**
 * `/` menu groups for native slash commands and skills: one group per
 * harness, populated only in that harness's sessions. A pick inserts
 * `/token ` literally; the Host turns it into the harness's own invocation.
 */
import type {
  ClientSessionContext,
  InputTriggerCandidate,
  InputTriggerSource,
} from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import { HARNESS_NAMES, type CommandEntry, type HarnessId } from '../shared/types.ts'
import { rankByName } from './rank-by-name.ts'
import type { Translate } from './locales.ts'
import type { NativeActions } from './actions.ts'

const FRESH_MS = 30_000

interface Cached {
  at: number
  entries?: CommandEntry[]
  loading?: Promise<CommandEntry[]>
}

export function commandSources(
  actions: NativeActions,
  harnessOf: (sessionId: string) => HarnessId | undefined,
  t: Translate,
): InputTriggerSource[] {
  const cache = new Map<string, Cached>()
  const listeners = new Map<string, Set<() => void>>()
  const notify = (sessionId: string) => {
    for (const listener of listeners.get(sessionId) ?? []) listener()
  }
  const load = (sessionId: string): Promise<CommandEntry[]> => {
    const entry = cache.get(sessionId) ?? { at: 0 }
    cache.set(sessionId, entry)
    if (entry.entries && Date.now() - entry.at < FRESH_MS) return Promise.resolve(entry.entries)
    entry.loading ??= actions
      .commands(sessionId)
      .then((entries) => {
        entry.entries = entries
        entry.at = Date.now()
        notify(sessionId)
        return entries
      })
      .finally(() => {
        entry.loading = undefined
      })
    return entry.loading.catch(() => entry.entries ?? [])
  }
  return (Object.keys(HARNESS_NAMES) as HarnessId[]).map((harness) => {
    const mine = (session: ClientSessionContext) => harnessOf(session.sessionId) === harness
    return {
      trigger: '/',
      name: HARNESS_NAMES[harness],
      order: 1,
      async candidates(session, request): Promise<readonly InputTriggerCandidate[]> {
        if (!mine(session)) return []
        const entries = await load(session.sessionId)
        request.signal.throwIfAborted()
        const rows = entries.map((entry) => ({
          name: entry.token,
          description: entry.token === entry.name ? entry.description : `${entry.name} · ${entry.description}`,
          section: `${HARNESS_NAMES[harness]} · ${entry.kind === 'skill' ? t('skills') : t('commands')}`,
          ...(entry.argumentHint && request.position === 'leading' ? { hint: entry.argumentHint } : {}),
        }))
        return request.query ? rankByName(rows, request.query) : rows
      },
      onPick({ candidate }) {
        return { text: `/${candidate.name} ` }
      },
      lexicon(session) {
        if (!mine(session)) return undefined
        const entries = cache.get(session.sessionId)?.entries
        if (!entries) void load(session.sessionId)
        return entries?.map((entry) => entry.token)
      },
      subscribeLexicon(session, listener) {
        const set = listeners.get(session.sessionId) ?? new Set()
        set.add(listener)
        listeners.set(session.sessionId, set)
        return () => {
          set.delete(listener)
          if (!set.size) listeners.delete(session.sessionId)
        }
      },
    } satisfies InputTriggerSource
  })
}
