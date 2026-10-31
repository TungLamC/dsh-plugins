/**
 * The switches kept in dsh's storage domain. The storage sits in dsh's home, so
 * every profile's dsh process shares it: each session's switch is a document of
 * its own, and two processes never rewrite each other's sessions.
 */

import { z } from 'zod'
import type { DomainFacility, DomainSpec, DomainTableSpec } from '@deepseek-ai/dsh-storage-domain'
import type { SwitchStore } from './toggles.ts'

type SwitchSpec = DomainSpec & { tables: { sessions: DomainTableSpec<string, { enabled: boolean }> } }

export const SWITCHES = {
  name: 'better_providers_codex_fast',
  version: 1,
  layout: 'per-record',
  // A switch is cheap to lose: a record that no longer reads is set aside and the session starts from the default again.
  invalidRecords: 'backup-and-skip',
  tables: {
    sessions: { valueSchema: z.object({ enabled: z.boolean() }) },
  },
} as const

export interface OpenedSwitches {
  /** Rejects when the domain cannot be opened. */
  store: Promise<SwitchStore>
  /** Close the domain once its queued writes are stored, so the next start can open it again. */
  close(): Promise<void>
}

export function openSwitches(domains: Pick<DomainFacility, 'open'>): OpenedSwitches {
  // The schema is this plugin's zod, typed apart from the copy dsh's storage names; storage only calls its parse.
  const opening = domains.open(SWITCHES as unknown as SwitchSpec)
  const store = opening.then((domain): SwitchStore => {
    const sessions = domain.table('sessions')
    return {
      get: sessionId => sessions.get(sessionId)?.enabled,
      put: (sessionId, enabled) => sessions.put(sessionId, { enabled }),
    }
  })
  return {
    store,
    async close() {
      const domain = await opening.catch(() => undefined)
      await domain?.close()
    },
  }
}
