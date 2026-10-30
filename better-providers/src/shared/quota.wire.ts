/** The quota row's Remote contract: subscription usage of signed-in pi-ai provider routes. */

import { z } from 'zod'
import type { RemoteResult, RemoteStreamHandle, TypertRemoteNamespace } from '@deepseek-ai/dsh-typert-protocol'
import { MODULE, providerId, SERVICE } from './ids.ts'
import { defineRemote } from './remote.ts'

/** Routes whose provider reports subscription usage for an account sign-in. */
export const QUOTA_PROVIDERS = ['openai-codex', 'xai'] as const
export type QuotaProvider = typeof QUOTA_PROVIDERS[number]

export function hasQuota(provider: string): provider is QuotaProvider {
  return (QUOTA_PROVIDERS as readonly string[]).includes(provider)
}

/** Seconds between reads while a usage view is open: the row's `quotaRefreshSeconds` setting. */
export const REFRESH_SECONDS = { min: 15, max: 3600, initial: 60 } as const

/** A limit's period, when its length is one the UI names. */
export type QuotaSpan = 'five-hour' | 'daily' | 'weekly' | 'monthly' | 'annual'

export interface QuotaWindow {
  id: string
  span?: QuotaSpan
  /** Share of the window's limit used, 0..100. */
  usedPercent?: number
  /** Epoch milliseconds. */
  resetsAt?: number
}

/** One group of limits; the first pool of a reading is the provider's main one. */
export interface QuotaPool {
  id: string
  /** The provider's own name for the pool, when it gives one. */
  name?: string
  windows: QuotaWindow[]
  limitReached?: boolean
}

/** Credit beside the limits: a balance, or spending against a cap. */
export interface QuotaBalance {
  id: 'credits' | 'monthly-limit' | 'prepaid' | 'on-demand'
  unit: 'credits' | 'usd-cents'
  unlimited?: true
  remaining?: number
  used?: number
  limit?: number
}

/** A card that resets the account's limits once. */
export interface ResetCard {
  id: string
  title?: string
  description?: string
  /** Epoch milliseconds. */
  expiresAt?: number
}

export interface ResetCards {
  /** `unavailable`: the list could not be read; `count` may still say how many there are. */
  status: 'ready' | 'unavailable'
  count?: number
  /** Usable cards, soonest expiry first. */
  cards: ResetCard[]
  issue?: QuotaIssue
}

export type QuotaIssueCode =
  | 'auth-required' | 'auth-expired' | 'refresh-failed' | 'forbidden'
  | 'rate-limited' | 'request-failed' | 'invalid-response' | 'client-outdated'

export interface QuotaIssue {
  code: QuotaIssueCode
  /** When the provider allows the next query (epoch milliseconds). */
  retryAt?: number
}

/** One successful reading. */
export interface QuotaUsage {
  /** Epoch milliseconds. */
  fetchedAt: number
  /** The plan as the provider names it now: an id such as `pro`, or a display name. */
  plan?: string
  /** A team manages the account's limits; there is nothing else to show. */
  managedByTeam?: true
  pools: QuotaPool[]
  balances: QuotaBalance[]
  /** Absent when the provider has no reset cards. */
  resets?: ResetCards
}

export interface QuotaView {
  /** `signed-out` also covers a route that stores an API key. */
  status: 'signed-out' | 'loading' | 'ready' | 'error'
  /** Changes whenever the signed-in account does; a redemption names the account its card was chosen under. */
  account?: string
  /** The last successful reading of this account; kept while later reads fail. */
  usage?: QuotaUsage
  /** Why the last read failed. */
  issue?: QuotaIssue
  reading: boolean
  redeeming: boolean
  /** A redemption whose outcome is not known: retry it, never another card, until it settles. */
  pending?: Redemption
}

/** Use one reset card; `request` makes repeating the same redemption safe. */
export interface Redemption {
  account: string
  card: string
  request: string
}

export type RedemptionOutcome = 'reset' | 'already-redeemed' | 'nothing-to-reset' | 'no-credit' | 'unknown'

/** Reasons a quota request is refused (the bad-request message). */
export type QuotaRefusal = 'bad-provider' | 'unsupported' | 'account-changed' | 'reset-pending' | 'request-mismatch' | 'card-unavailable' | 'redeem-refused'

const token = z.string().min(1).max(200)
const redemption = z.strictObject({ account: token, card: token, request: z.uuid() })

export const QUOTA_REMOTE = defineRemote(MODULE.quota, SERVICE.quota, {
  watch: { params: [['provider', providerId]], stream: true, signal: true },
  redeem: { params: [['provider', providerId], ['redemption', redemption]] },
})

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteMap {
    /** The route's usage at once, then every change. */
    'betterProvidersQuota/watch': (provider: string, signal?: AbortSignal) => RemoteStreamHandle<QuotaView, never>
    'betterProvidersQuota/redeem': (provider: string, redemption: Redemption) => Promise<RemoteResult<RedemptionOutcome>>
  }
  interface TypertRemoteNamespaceMap {
    betterProvidersQuota: TypertRemoteNamespace<'betterProvidersQuota'>
  }
}

/** The browser-side handle of the namespace. */
export type QuotaRemote = TypertRemoteNamespace<'betterProvidersQuota'>
