/**
 * The main row: provides the `betterProviders` service every part injects, so
 * turning this row off stops the whole plugin, and tells the browser which parts
 * run. Its browser half (lib/client.js) carries every part's UI.
 */

import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { SERVICE } from '../../shared/ids.ts'
import { MAIN_REMOTE, type PartsPresence } from '../../shared/main.wire.ts'
import type { Cell } from '../kit/cell.ts'
import { registerHost } from '../kit/typert.ts'
import { trackParts } from './presence.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    betterProviders: BetterProviders
  }
}

export default class BetterProviders extends TypertRemoteService {
  static inject = ['typert']

  private readonly parts: Cell<PartsPresence>

  constructor(ctx: Context) {
    super(ctx, SERVICE.main)
    registerHost(ctx, MAIN_REMOTE)
    this.parts = trackParts(ctx)
  }

  @Remote({ mode: 'stream' })
  async *watchParts(signal: AbortSignal): AsyncIterable<PartsPresence> {
    yield* this.parts.watch(signal)
  }
}
