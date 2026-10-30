/**
 * Which parts are running. A part counts as present exactly while its service is
 * provided by an active row, which is when its Remote namespace is callable: a
 * disabled row, one waiting on a missing dependency, and one that failed to start
 * all count as absent.
 */

import type { Context } from '@deepseek-ai/cordis'
import { PARTS, SERVICE } from '../../shared/ids.ts'
import { NO_PARTS, samePresence, type PartsPresence } from '../../shared/main.wire.ts'
import { cell, type Cell } from '../kit/cell.ts'

export function trackParts(ctx: Context): Cell<PartsPresence> {
  const presence = cell<PartsPresence>(NO_PARTS, samePresence)
  for (const part of PARTS) {
    ctx.inject([SERVICE[part]], (child) => {
      presence.set({ ...presence.get(), [part]: true })
      child.effect(() => () => { presence.set({ ...presence.get(), [part]: false }) }, `presence of ${part}`)
    })
  }
  return presence
}
