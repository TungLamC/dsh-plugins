/**
 * The quota row: the `betterProvidersQuota` Remote service the Models page calls
 * for subscription usage of signed-in routes (tracker.ts), read through the
 * provider adapters (codex.ts, xai.ts) with the stored sign-ins (accounts.ts).
 */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-credentials'
import Schema from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { Provider } from '@earendil-works/pi-ai'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { xaiProvider } from '@earendil-works/pi-ai/providers/xai'
import { SERVICE } from '../../shared/ids.ts'
import {
  hasQuota, QUOTA_PROVIDERS, QUOTA_REMOTE, REFRESH_SECONDS,
  type QuotaProvider, type QuotaView, type Redemption, type RedemptionOutcome,
} from '../../shared/quota.wire.ts'
import { grantsOf, providerOf } from '../kit/pi-ai-record.ts'
import { guard, guardStream } from '../kit/refusal.ts'
import { registerHost } from '../kit/typert.ts'
import { createAccounts } from './accounts.ts'
import { codexQuota } from './codex.ts'
import type { Http } from './http.ts'
import { createQuotaTracker, type QuotaAdapter, type QuotaTracker } from './tracker.ts'
import { xaiQuota } from './xai.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    betterProvidersQuota: BetterProvidersQuota
  }
}

export interface Config {
  /** Seconds between usage reads while a usage view is open; edited on the row's own page. */
  quotaRefreshSeconds: Volatile<number>
}

export const Config = Schema.object({
  quotaRefreshSeconds: Schema.natural().min(REFRESH_SECONDS.min).max(REFRESH_SECONDS.max).default(REFRESH_SECONDS.initial).volatile(),
})

/** Every route the browser shows usage for: how its usage is read, and the pi-ai provider that refreshes its sign-in. */
const ROUTES: Readonly<Record<QuotaProvider, { adapter(http: Http): QuotaAdapter; signIn(): Provider }>> = {
  'openai-codex': { adapter: codexQuota, signIn: openaiCodexProvider },
  xai: { adapter: xaiQuota, signIn: xaiProvider },
}

export default class BetterProvidersQuota extends TypertRemoteService {
  static inject = [SERVICE.main, 'typert', 'credentials']
  static Config = Config

  private readonly tracker: QuotaTracker

  constructor(ctx: Context, config: Config) {
    super(ctx, SERVICE.quota)
    registerHost(ctx, QUOTA_REMOTE)
    // The global fetch, so dsh's NODE_USE_ENV_PROXY applies.
    const http: Http = { fetch: (input, init) => globalThis.fetch(input, init), now: () => Date.now() }
    this.tracker = createQuotaTracker({
      accounts: createAccounts({
        grants: grantsOf(ctx.credentials),
        provider: id => hasQuota(id) ? ROUTES[id].signIn() : undefined,
      }),
      adapters: Object.fromEntries(QUOTA_PROVIDERS.map(provider => [provider, ROUTES[provider].adapter(http)])),
      interval: () => config.quotaRefreshSeconds.get(),
    })
    ctx.on('credentials/record-updated', (key) => {
      const provider = providerOf(String(key))
      if (provider !== undefined) this.tracker.credentialsChanged(provider)
    })
    ctx.on('loader/volatile-update', () => { this.tracker.intervalChanged() })
    ctx.effect(() => () => { this.tracker.dispose() }, 'better-providers-quota: usage reads')
  }

  @Remote({ mode: 'stream' })
  async *watch(provider: string, signal: AbortSignal): AsyncIterable<QuotaView> {
    yield* guardStream(() => this.tracker.watch(provider, signal))
  }

  @Remote
  async redeem(provider: string, redemption: Redemption): Promise<RedemptionOutcome> {
    return guard(() => this.tracker.redeem(provider, redemption))
  }
}
