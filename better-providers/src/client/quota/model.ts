/**
 * What the usage section shows of a view: every line it renders, worded and in
 * order, as plain data. The component only lays it out, so all decisions about
 * what appears when are made, and tested, here.
 */

import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { QuotaBalance, QuotaPool, QuotaView, QuotaWindow, Redemption, ResetCard } from '../../shared/quota.wire.ts'
import type { LocaleKey } from './locales.ts'

type T = TranslateNS<'better-providers-quota'>

/** How close a limit is to running out. */
export type Level = 'ok' | 'low' | 'critical'

export interface WindowLine {
  id: string
  label: string
  /** When the window resets, worded relative to now, with the exact time. */
  reset?: { text: string; at: number }
  left: string
  /** The share still available, 0..100, when known. */
  remaining?: number
  level: Level
}

export interface CardLine {
  card: ResetCard
  title: string
  expires?: string
  usable: boolean
}

export interface QuotaPresentation {
  /** Lines above the limits, in order. */
  notes: { tone: 'hint' | 'error'; text: string }[]
  /** The main limits. */
  windows: WindowLine[]
  /** What the details panel holds, when there is more than the main limits. */
  details?: {
    pools: { name: string; windows: WindowLine[]; empty?: string }[]
    balances: { label: string; value: string }[]
    cards?: {
      heading: string
      /** How many cards the account has; `available` when there is at least one. */
      count?: { text: string; available: boolean }
      note?: string
      items: CardLine[]
    }
  }
  /** A redemption whose result is unknown; only retrying it settles it. */
  pending?: { text: string; retry: Redemption }
}

export interface PresentContext {
  now: number
  t: T
  /** A redemption from this card is being sent. */
  busy: boolean
  /** Formatting locale; the browser's when absent. */
  locale?: string
}

function duration(ms: number, t: T): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor(minutes % 1440 / 60)
  const parts: [unit: 'days' | 'hours' | 'minutes', count: number][] = days > 0
    ? [['days', days], ['hours', hours]]
    : hours > 0 ? [['hours', hours], ['minutes', minutes % 60]] : [['minutes', minutes]]
  return parts.filter(([, count], index) => index === 0 || count > 0).map(([unit, count]) => t(`unit.${unit}`, { count })).join(' ')
}

function windowLine(window: QuotaWindow, { now, t, locale }: PresentContext): WindowLine {
  const remaining = window.usedPercent === undefined ? undefined : Math.min(100, Math.max(0, 100 - window.usedPercent))
  const left = remaining === undefined
    ? t('notReported')
    : remaining === 0 ? t('limitReached') : t('remaining', { percent: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(remaining) })
  const level: Level = remaining !== undefined && remaining <= 10 ? 'critical' : remaining !== undefined && remaining <= 25 ? 'low' : 'ok'
  const at = window.resetsAt
  return {
    id: window.id,
    label: t(`span.${window.span ?? 'period'}`),
    ...at === undefined ? {} : { reset: { text: at > now ? t('resetsIn', { time: duration(at - now, t) }) : t('resetDue'), at } },
    left,
    ...remaining === undefined ? {} : { remaining },
    level,
  }
}

function poolName(pool: QuotaPool, t: T): string {
  if (pool.name !== undefined) return pool.name
  return pool.id === 'codex' || pool.id === 'code-review' || pool.id === 'subscription' ? t(`pool.${pool.id}`) : pool.id
}

function amount(unit: QuotaBalance['unit'], value: number | undefined, { t, locale }: PresentContext): string {
  if (value === undefined) return t('notReported')
  if (unit === 'usd-cents') return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol' }).format(value / 100)
  return t('credits', { amount: new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value) })
}

function balanceValue(balance: QuotaBalance, context: PresentContext): string {
  if (balance.unlimited === true) return context.t('unlimited')
  if (balance.limit !== undefined) return context.t('spent', { used: amount(balance.unit, balance.used, context), limit: amount(balance.unit, balance.limit, context) })
  return amount(balance.unit, balance.remaining, context)
}

/** The usage section of a view; null when there is nothing to show (nobody signed in). */
export function describeQuota(view: QuotaView, context: PresentContext): QuotaPresentation | null {
  if (view.status === 'signed-out') return null
  const { now, t } = context
  const usage = view.usage
  const notes: QuotaPresentation['notes'] = []
  if (usage === undefined && view.status === 'loading') notes.push({ tone: 'hint', text: t('loading') })
  if (view.issue !== undefined) {
    const { code, retryAt } = view.issue
    notes.push({
      tone: 'error',
      text: code === 'rate-limited' && retryAt !== undefined && retryAt > now
        ? t('issue.rate-limited-until', { time: duration(retryAt - now, t) })
        : t(`issue.${code}` as LocaleKey),
    })
    if (usage !== undefined) notes.push({ tone: 'hint', text: t('stale') })
  }
  if (usage?.managedByTeam === true) notes.push({ tone: 'hint', text: t('managedByTeam') })
  const shown = usage !== undefined && usage.managedByTeam !== true ? usage : undefined

  let details: QuotaPresentation['details']
  if (shown !== undefined && (shown.pools.length > 1 || shown.balances.length > 0 || shown.resets !== undefined)) {
    const resets = shown.resets
    // A card is offered only on a current list, with no read, redemption or unknown result in the way.
    const open = view.status === 'ready' && !view.reading && !view.redeeming && view.pending === undefined
      && view.account !== undefined && !context.busy && resets?.status === 'ready'
    details = {
      pools: shown.pools.slice(1).map(pool => ({
        name: poolName(pool, t),
        windows: pool.windows.map(window => windowLine(window, context)),
        ...pool.windows.length === 0 ? { empty: t('notReported') } : {},
      })),
      balances: shown.balances.map(balance => ({ label: t(`balance.${balance.id}`), value: balanceValue(balance, context) })),
      ...resets === undefined ? {} : {
        cards: {
          heading: t('resets'),
          ...resets.count === undefined ? {} : { count: { text: t('resetCount', { count: resets.count }), available: resets.count > 0 } },
          ...resets.status === 'unavailable'
            ? { note: t('resetsUnavailable') }
            : resets.cards.length === 0 ? { note: t('noResets') } : {},
          items: resets.cards.map(card => ({
            card,
            title: card.title ?? t('cardTitle'),
            ...card.expiresAt === undefined ? {} : { expires: t('cardExpires', { date: new Date(card.expiresAt).toLocaleDateString(context.locale) }) },
            usable: open && (card.expiresAt === undefined || card.expiresAt > now),
          })),
        },
      },
    }
  }

  return {
    notes,
    windows: shown?.pools[0]?.windows.map(window => windowLine(window, context)) ?? [],
    ...details === undefined ? {} : { details },
    ...view.pending !== undefined && !view.redeeming ? { pending: { text: t('pending'), retry: view.pending } } : {},
  }
}

/** A random UUID for a redemption; `randomUUID` exists only on secure pages, so build one when it is missing. */
export function newRequestId(random: Pick<Crypto, 'getRandomValues'> & Partial<Pick<Crypto, 'randomUUID'>> = crypto): string {
  if (typeof random.randomUUID === 'function') return random.randomUUID()
  const bytes = random.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
