/**
 * The models row: the `betterProvidersModels` Remote service the Models page calls
 * to refresh a built-in pi-ai route's model list (sync.ts) from pi.dev (pi-dev.ts)
 * against the catalog dsh serves (local.ts), writing the route's settings
 * (settings.ts). Refreshing needs this plugin to load dsh's own pi-ai: another copy
 * may ship another catalog.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { SERVICE } from '../../shared/ids.ts'
import { MODELS_REMOTE, type ApplyOutcome, type CatalogChoice, type CatalogPreview } from '../../shared/models.wire.ts'
import { nodeLocator, piAiIdentity } from '../kit/pi-ai-identity.ts'
import { guard, Refusal } from '../kit/refusal.ts'
import { registerHost } from '../kit/typert.ts'
import { installedCatalog } from './local.ts'
import { piDevCatalog } from './pi-dev.ts'
import { routeSettings, type ConfigEntries } from './settings.ts'
import { createCatalogSync, type CatalogSync } from './sync.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    betterProvidersModels: BetterProvidersModels
  }
}

export default class BetterProvidersModels extends TypertRemoteService {
  static inject = [SERVICE.main, 'typert', 'settings']

  /** Undefined when this plugin loads another pi-ai than dsh does. */
  private readonly sync: CatalogSync | undefined

  constructor(ctx: Context) {
    super(ctx, SERVICE.models)
    registerHost(ctx, MODELS_REMOTE)
    const identity = piAiIdentity(nodeLocator(specifier => import.meta.resolve(specifier)))
    if (!identity.shared) {
      ctx.logger.warn('better-providers-models: model refresh is off because this plugin does not load dsh\'s pi-ai (%s)', identity.detail)
      this.sync = undefined
      return
    }
    this.sync = createCatalogSync({
      // The global fetch, so dsh's NODE_USE_ENV_PROXY applies.
      remote: piDevCatalog((input, init) => globalThis.fetch(input, init)),
      installed: installedCatalog(),
      // The settings service writes through the configuration editor, so it is there whenever settings is.
      settings: routeSettings({ settings: ctx.settings, editor: ctx.get('configEditor') as ConfigEntries }),
    })
  }

  private running(): CatalogSync {
    if (this.sync === undefined) throw new Refusal('pi-ai-mismatch')
    return this.sync
  }

  @Remote
  async preview(provider: string, signal: AbortSignal): Promise<CatalogPreview> {
    return guard(() => this.running().preview(provider, signal))
  }

  @Remote
  async apply(previewId: string, choice: CatalogChoice): Promise<ApplyOutcome> {
    return guard(() => this.running().apply(previewId, choice))
  }
}
