/**
 * The `web-access` row: registers the search provider `web-access`, which the
 * plugin's cordis.patch.yml makes `web.searchProvider`, and provides the
 * `webAccess` Remote service the settings page reads its model choices from.
 * The row's settings are its volatile Config fields, read at every search.
 */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-web'
import Schema from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { Provider } from '@earendil-works/pi-ai'
import { googleProvider } from '@earendil-works/pi-ai/providers/google'
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { HOSTED_TIERS, MODEL_FIELD, ON_BY_DEFAULT, ROW, SERVICE, TIERS, type HostedTier, type Tier } from '../shared/ids.ts'
import { WEB_ACCESS_REMOTE, type SearchModels } from '../shared/web-access.wire.ts'
import { createSearchProvider } from './chain.ts'
import { hostedTiers, ROUTE } from './hosted/tiers.ts'
import { isObject } from './kit/http.ts'
import { registerHost } from './kit/typert.ts'
import { anysearchTier } from './open/anysearch.ts'
import { exaTier } from './open/exa.ts'
import { parallelTier } from './open/parallel.ts'
import { createRoutes, PI_AI, type Routes } from './routes.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    webAccess: WebAccess
  }
}

export type Config = { readonly [T in Tier]: Volatile<boolean> } & { readonly [T in HostedTier as typeof MODEL_FIELD[T]]: Volatile<string | undefined> }

export const Config = Schema.object({
  codex: Schema.boolean().default(ON_BY_DEFAULT.codex).volatile(),
  openai: Schema.boolean().default(ON_BY_DEFAULT.openai).volatile(),
  gemini: Schema.boolean().default(ON_BY_DEFAULT.gemini).volatile(),
  exa: Schema.boolean().default(ON_BY_DEFAULT.exa).volatile(),
  parallel: Schema.boolean().default(ON_BY_DEFAULT.parallel).volatile(),
  anysearch: Schema.boolean().default(ON_BY_DEFAULT.anysearch).volatile(),
  codexModel: Schema.string().volatile(),
  openaiModel: Schema.string().volatile(),
  geminiModel: Schema.string().volatile(),
})

/** The pi-ai providers behind the hosted tiers' routes, built once each. */
function piProviders(): (route: string) => Provider | undefined {
  const factories: Readonly<Record<string, () => Provider>> = {
    [ROUTE.codex]: openaiCodexProvider,
    [ROUTE.openai]: openaiProvider,
    [ROUTE.gemini]: googleProvider,
  }
  const built = new Map<string, Provider>()
  return (route) => {
    if (!Object.hasOwn(factories, route)) return undefined
    let provider = built.get(route)
    if (provider === undefined) built.set(route, provider = factories[route]!())
    return provider
  }
}

export default class WebAccess extends TypertRemoteService {
  // Only the web service is required: without settings, credentials or llm the hosted tiers are simply not set up.
  static inject = ['web', 'typert']
  static Config = Config

  private readonly routes: Routes

  constructor(ctx: Context, config: Config) {
    super(ctx, SERVICE)
    registerHost(ctx, WEB_ACCESS_REMOTE)
    const log = {
      info: (message: string) => { ctx.logger.info(message) },
      warn: (message: string) => { ctx.logger.warn(message) },
    }
    this.routes = createRoutes({
      providers() {
        const value = ctx.get('settings')?.describe().find(entry => entry.ns === PI_AI)?.value
        return isObject(value) && isObject(value['providers']) ? value['providers'] : undefined
      },
      credentials: () => ctx.get('credentials'),
      llm: () => ctx.get('llm'),
      piProvider: piProviders(),
      env: name => process.env[name],
    })
    ctx.web.registerSearchProvider(createSearchProvider({
      id: ROW,
      enabled: () => TIERS.filter(tier => config[tier].get()),
      tiers: {
        ...hostedTiers({
          routes: this.routes,
          chosenModel: (tier) => {
            const model = config[MODEL_FIELD[tier]].get()?.trim()
            return model === '' ? undefined : model
          },
          log,
        }),
        exa: exaTier(),
        parallel: parallelTier(),
        anysearch: anysearchTier(),
      },
      log,
    }))
  }

  @Remote
  async searchModels(): Promise<SearchModels> {
    const entries = await Promise.all(HOSTED_TIERS.map(async tier => [tier, await this.routes.models(ROUTE[tier]) ?? null] as const))
    return Object.fromEntries(entries) as Record<HostedTier, SearchModels[HostedTier]>
  }
}
