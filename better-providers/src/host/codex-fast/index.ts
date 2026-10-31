/**
 * The codex-fast row: the `betterProvidersCodexFast` Remote service behind the
 * composer's fast-mode switch. Codex runs a request fast when it asks for the
 * priority service tier. Each session's switch (toggles.ts, kept by store.ts)
 * decides whether its Codex requests ask for it, which the bridge (bridge.ts)
 * adds to the requests llm-pi-ai sends through pi-ai. That
 * needs this plugin to load dsh's own pi-ai: patching another copy would change
 * nothing.
 */

import { readFileSync } from 'node:fs'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-storage-domain'
import Schema from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { createModels } from '@earendil-works/pi-ai/models'
import { SERVICE } from '../../shared/ids.ts'
import { CODEX_FAST_REMOTE } from '../../shared/codex-fast.wire.ts'
import { nodeLocator, piAiIdentity } from '../kit/pi-ai-identity.ts'
import { guard, guardStream } from '../kit/refusal.ts'
import { registerHost } from '../kit/typert.ts'
import { installPriorityBridge, TESTED_PI_AI, untestedPiAi, type PriorityBridge } from './bridge.ts'
import { openSwitches } from './store.ts'
import { createSessionToggles, type SessionToggles } from './toggles.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    betterProvidersCodexFast: BetterProvidersCodexFast
  }
}

export interface Config {
  /** The switch of a session seen for the first time with no parent; edited on the row's own page. */
  defaultEnabled: Volatile<boolean>
}

export const Config = Schema.object({
  defaultEnabled: Schema.boolean().default(false).volatile(),
})

/** What this row reads of dsh's session store: a session's lineage. */
interface Sessions {
  get(sessionId: string): { header: { parentSession?: string } } | undefined
}

/** The version of the pi-ai whose package.json is at `path`, if it can be read. */
function versionAt(path: string): string | undefined {
  try {
    const { version } = JSON.parse(readFileSync(path, 'utf8')) as { version?: unknown }
    return typeof version === 'string' ? version : undefined
  } catch {
    return undefined
  }
}

export default class BetterProvidersCodexFast extends TypertRemoteService {
  static inject = [SERVICE.main, 'typert', 'llm', 'storageDomain']
  static Config = Config

  private readonly bridge: PriorityBridge
  private readonly toggles: SessionToggles

  constructor(ctx: Context, config: Config) {
    super(ctx, SERVICE.codexFast)
    registerHost(ctx, CODEX_FAST_REMOTE)
    const identity = piAiIdentity(nodeLocator(specifier => import.meta.resolve(specifier)))
    if (identity.shared) {
      const version = versionAt(identity.path)
      if (version !== undefined && untestedPiAi(version)) {
        ctx.logger.info('better-providers-codex-fast: pi-ai %s is outside the tested %s; fast mode is checked as requests run', version, TESTED_PI_AI.join(', '))
      }
    } else {
      ctx.logger.warn('better-providers-codex-fast: fast mode is off because this plugin does not load dsh\'s pi-ai (%s)', identity.detail)
    }
    this.bridge = installPriorityBridge(identity.shared ? Object.getPrototypeOf(createModels()) as object : undefined, (fault) => {
      ctx.logger.warn('better-providers-codex-fast: fast mode is off until dsh restarts: pi-ai no longer takes the priority service tier the way this plugin adds it (%s)', fault)
    })
    const switches = openSwitches(ctx.storageDomain)
    switches.store.catch((error: unknown) => {
      ctx.logger.warn('better-providers-codex-fast: the session switches cannot be stored, so every session is off: %s', error instanceof Error ? error.message : String(error))
    })
    this.toggles = createSessionToggles({
      store: switches.store,
      parentOf: sessionId => (ctx.get('sessions') as Sessions | undefined)?.get(sessionId)?.header.parentSession,
      initial: () => config.defaultEnabled.get(),
    })
    // Global: the llm service filters listeners to its own isolation; requests of an isolated llm service count too.
    ctx.on('llm/stream', (request, next) => this.bridge.stream(request, next, sessionId => this.toggles.enabled(sessionId)), { global: true })
    ctx.effect(() => async () => {
      this.bridge.dispose()
      await switches.close()
    }, 'better-providers-codex-fast: priority bridge and switches')
  }

  @Remote({ mode: 'stream' })
  async *watchSupport(signal: AbortSignal): AsyncIterable<boolean> {
    yield* this.bridge.support(signal)
  }

  @Remote({ mode: 'stream' })
  async *watch(sessionId: string, signal: AbortSignal): AsyncIterable<boolean> {
    yield* guardStream(() => this.toggles.watch(sessionId, signal))
  }

  @Remote
  async set(sessionId: string, enabled: boolean): Promise<boolean> {
    return guard(() => this.toggles.set(sessionId, enabled))
  }
}
