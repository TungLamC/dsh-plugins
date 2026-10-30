import { describe, expect, it } from 'vitest'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { QuotaUsage, QuotaView } from '../../../src/shared/quota.wire.ts'
import { describeQuota, newRequestId, type PresentContext } from '../../../src/client/quota/model.ts'

const MINUTE = 60_000
const NOW = 100 * 1440 * MINUTE

/** Spells a key with its parameters, so a test reads which copy was chosen and with what. */
const t = ((key: string, params?: Record<string, unknown>) => params === undefined ? key : `${key} ${JSON.stringify(params)}`) as unknown as TranslateNS<'better-providers-quota'>
const context: PresentContext = { now: NOW, t, busy: false, locale: 'en-US' }

const usage: QuotaUsage = {
  fetchedAt: NOW - 5 * MINUTE,
  plan: 'pro',
  pools: [{ id: 'codex', windows: [{ id: 'primary', span: 'weekly', usedPercent: 42, resetsAt: NOW + (2 * 1440 + 3 * 60) * MINUTE }] }],
  balances: [],
}
const ready: QuotaView = { status: 'ready', account: 'a', usage, reading: false, redeeming: false }

describe('describeQuota', () => {
  it('shows nothing while nobody is signed in', () => {
    expect(describeQuota({ status: 'signed-out', reading: false, redeeming: false }, context)).toBeNull()
  })

  it('says it is loading before the first reading', () => {
    expect(describeQuota({ status: 'loading', account: 'a', reading: true, redeeming: false }, context)).toEqual({
      notes: [{ tone: 'hint', text: 'loading' }], windows: [],
    })
  })

  it('shows the main limits with what is left and when they reset', () => {
    expect(describeQuota(ready, context)).toEqual({
      notes: [],
      windows: [{
        id: 'primary',
        label: 'span.weekly',
        reset: { text: 'resetsIn {"time":"unit.days {\\"count\\":2} unit.hours {\\"count\\":3}"}', at: NOW + (2 * 1440 + 3 * 60) * MINUTE },
        left: 'remaining {"percent":"58"}',
        remaining: 58,
        level: 'ok',
      }],
    })
  })

  it('marks limits running low, used up, or not reported', () => {
    const windows = (usedPercent: number | undefined) => describeQuota({
      ...ready,
      usage: { ...usage, pools: [{ id: 'codex', windows: [{ id: 'w', ...usedPercent === undefined ? {} : { usedPercent } }] }] },
    }, context)?.windows[0]
    expect(windows(75)).toMatchObject({ level: 'low' })
    expect(windows(90)).toMatchObject({ level: 'critical' })
    expect(windows(100)).toMatchObject({ left: 'limitReached', remaining: 0, level: 'critical' })
    expect(windows(undefined)).toEqual({ id: 'w', label: 'span.period', left: 'notReported', level: 'ok' })
  })

  it('shows a failed read above the last reading, and when a rate-limited query goes out again', () => {
    expect(describeQuota({ ...ready, status: 'error', issue: { code: 'request-failed' } }, context)?.notes).toEqual([
      { tone: 'error', text: 'issue.request-failed' },
      { tone: 'hint', text: 'stale' },
    ])
    const limited = describeQuota({ status: 'error', account: 'a', issue: { code: 'rate-limited', retryAt: NOW + 6 * MINUTE }, reading: false, redeeming: false }, context)
    expect(limited?.notes).toEqual([{ tone: 'error', text: 'issue.rate-limited-until {"time":"unit.minutes {\\"count\\":6}"}' }])
  })

  it('shows only that a team manages the limits', () => {
    expect(describeQuota({ ...ready, usage: { fetchedAt: NOW, managedByTeam: true, pools: [], balances: [] } }, context)).toMatchObject({
      notes: [{ tone: 'hint', text: 'managedByTeam' }], windows: [],
    })
  })

  it('puts other limits, balances and reset cards in the details', () => {
    const detailed: QuotaView = {
      ...ready,
      usage: {
        ...usage,
        pools: [...usage.pools, { id: 'code-review', windows: [] }, { id: 'extra', name: 'Extra', windows: [{ id: 'p', usedPercent: 0 }] }],
        balances: [
          { id: 'credits', unit: 'credits', remaining: 1250 },
          { id: 'prepaid', unit: 'usd-cents', remaining: 300 },
          { id: 'on-demand', unit: 'usd-cents', used: 250, limit: 1000 },
          { id: 'monthly-limit', unit: 'credits', unlimited: true },
        ],
        resets: { status: 'ready', count: 1, cards: [{ id: 'card-1', expiresAt: NOW + MINUTE }] },
      },
    }
    const details = describeQuota(detailed, context)?.details
    expect(details?.pools).toEqual([
      { name: 'pool.code-review', windows: [], empty: 'notReported' },
      { name: 'Extra', windows: [expect.objectContaining({ left: 'remaining {"percent":"100"}' })] },
    ])
    expect(details?.balances).toEqual([
      { label: 'balance.credits', value: 'credits {"amount":"1,250"}' },
      { label: 'balance.prepaid', value: '$3.00' },
      { label: 'balance.on-demand', value: 'spent {"used":"$2.50","limit":"$10.00"}' },
      { label: 'balance.monthly-limit', value: 'unlimited' },
    ])
    expect(details?.cards).toEqual({
      heading: 'resets',
      count: { text: 'resetCount {"count":1}', available: true },
      items: [{ card: { id: 'card-1', expiresAt: NOW + MINUTE }, title: 'cardTitle', expires: expect.stringMatching(/^cardExpires /), usable: true }],
    })
    expect(describeQuota(ready, context)).not.toHaveProperty('details')
  })

  it('offers a card only on a settled, current view with nothing in the way', () => {
    const card = { id: 'card-1', expiresAt: NOW + MINUTE }
    const view: QuotaView = { ...ready, usage: { ...usage, resets: { status: 'ready', count: 1, cards: [card] } } }
    const usable = (next: QuotaView, extra: Partial<PresentContext> = {}) => describeQuota(next, { ...context, ...extra })?.details?.cards?.items[0]?.usable
    expect(usable(view)).toBe(true)
    expect(usable(view, { busy: true })).toBe(false)
    expect(usable(view, { now: NOW + MINUTE })).toBe(false)
    expect(usable({ ...view, reading: true })).toBe(false)
    expect(usable({ ...view, redeeming: true })).toBe(false)
    expect(usable({ ...view, status: 'error', issue: { code: 'request-failed' } })).toBe(false)
    const pending = { account: 'a', card: 'card-1', request: 'r' }
    expect(usable({ ...view, pending })).toBe(false)
  })

  it('offers to settle a redemption whose result is unknown once nothing is being sent', () => {
    const pending = { account: 'a', card: 'card-1', request: 'r' }
    expect(describeQuota({ ...ready, pending }, context)?.pending).toEqual({ text: 'pending', retry: pending })
    expect(describeQuota({ ...ready, pending, redeeming: true }, context)).not.toHaveProperty('pending')
  })

  it('says why the card list is missing or empty', () => {
    const cards = (resets: NonNullable<QuotaUsage['resets']>) => describeQuota({ ...ready, usage: { ...usage, resets } }, context)?.details?.cards
    expect(cards({ status: 'unavailable', cards: [], issue: { code: 'rate-limited' } })).toEqual({ heading: 'resets', note: 'resetsUnavailable', items: [] })
    expect(cards({ status: 'ready', count: 0, cards: [] })).toEqual({ heading: 'resets', count: { text: 'resetCount {"count":0}', available: false }, note: 'noResets', items: [] })
  })
})

describe('newRequestId', () => {
  it('makes a v4 UUID even where randomUUID is missing', () => {
    // A page that is not a secure context has getRandomValues but no randomUUID.
    const id = newRequestId({ getRandomValues: crypto.getRandomValues.bind(crypto) })
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(newRequestId()).toMatch(/^[0-9a-f-]{36}$/)
  })
})
