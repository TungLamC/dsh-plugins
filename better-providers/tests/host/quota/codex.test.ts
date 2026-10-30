import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { codexQuota } from '../../../src/host/quota/codex.ts'
import type { Http } from '../../../src/host/quota/http.ts'
import { QuotaFailure, type QuotaAuth } from '../../../src/host/quota/tracker.ts'

const fixture = (name: string): Record<string, unknown> => JSON.parse(readFileSync(new URL(`../../fixtures/codex/${name}.json`, import.meta.url), 'utf8')) as Record<string, unknown>
const AUTH: QuotaAuth = { identity: 'id', token: 'token-1', accountId: 'workspace-1' }
const NOW = Date.parse('2027-01-10T00:00:00Z')
const signal = new AbortController().signal

interface Sent { url: string; method: string; headers: Record<string, string>; body?: unknown }

/** A provider that answers by path; an Error or a number (HTTP status) fails the request. */
function provider(routes: Record<string, unknown | (() => unknown)>) {
  const sent: Sent[] = []
  const http: Http = {
    now: () => NOW,
    async fetch(input, init) {
      const url = String(input)
      const headers = Object.fromEntries(Object.entries(init?.headers ?? {})) as Record<string, string>
      sent.push({ url, method: init?.method ?? 'GET', headers, ...init?.body === undefined ? {} : { body: JSON.parse(String(init.body)) } })
      const path = new URL(url).pathname.replace('/backend-api/wham', '')
      const answer = routes[path]
      const value = typeof answer === 'function' ? (answer as () => unknown)() : answer
      if (value instanceof Error) throw value
      if (typeof value === 'number') return new Response('{}', { status: value, headers: value === 429 ? { 'retry-after': '120' } : {} })
      if (value === undefined) return new Response('not found', { status: 404 })
      return Response.json(value)
    },
  }
  return { http, sent }
}

describe('codex usage', () => {
  it('reads the limits, plan, credits and the number of reset cards', async () => {
    const { http, sent } = provider({ '/usage': fixture('usage') })
    await expect(codexQuota(http).read(AUTH, signal)).resolves.toEqual({
      plan: 'pro',
      pools: [{ id: 'codex', windows: [{ id: 'primary', span: 'weekly', usedPercent: 42, resetsAt: 1_800_000_000_000 }], limitReached: false }],
      balances: [{ id: 'credits', unit: 'credits', remaining: 1250 }],
      cardCount: 1,
    })
    expect(sent.map(request => request.url)).toEqual(['https://chatgpt.com/backend-api/wham/usage'])
    expect(sent[0]?.headers).toMatchObject({ authorization: 'Bearer token-1', 'chatgpt-account-id': 'workspace-1' })
  })

  it('reads the reset cards', async () => {
    const { http, sent } = provider({ '/rate-limit-reset-credits': fixture('reset-credits') })
    await expect(codexQuota(http).cards!(AUTH, signal)).resolves.toEqual({
      count: 1,
      cards: [{ id: 'credit-fixture-1', title: 'Full reset', description: 'A free rate limit reset.', expiresAt: Date.parse('2027-01-31T00:00:00Z') }],
    })
    expect(sent[0]?.url).toBe('https://chatgpt.com/backend-api/wham/rate-limit-reset-credits')
  })

  it('leaves out cards that are used, expired, or not for this plan, and keeps the soonest to expire', async () => {
    const card = (id: string, extra: Record<string, unknown>) => ({ id, reset_type: 'codex_rate_limits', status: 'available', ...extra })
    const list = {
      available_count: 2,
      credits: [
        card('later', { expires_at: '2027-03-01T00:00:00Z' }),
        card('used', { status: 'redeemed' }),
        card('expired', { expires_at: '2027-01-01T00:00:00Z' }),
        card('other-plan', { is_supported_by_plan: false }),
        card('sooner', { expires_at: '2027-02-01T00:00:00Z' }),
        card('never', {}),
      ],
    }
    const { http } = provider({ '/rate-limit-reset-credits': list })
    const read = await codexQuota(http).cards!(AUTH, signal)
    expect(read).toMatchObject({ count: 2 })
    expect(read.cards.map(entry => entry.id)).toEqual(['sooner', 'later'])
  })

  it('reads extra pools, two windows, workspace limits, and names only known window lengths', async () => {
    const usage = {
      ...fixture('usage'),
      rate_limit: {
        primary_window: { used_percent: 120, limit_window_seconds: 18_000, reset_after_seconds: 600 },
        secondary_window: { used_percent: 10, limit_window_seconds: 604_800, reset_at: 1_800_000_000 },
        limit_reached: true,
      },
      additional_rate_limits: [
        { metered_feature: 'codex_other', limit_name: 'Other', rate_limit: { primary_window: { used_percent: 5, limit_window_seconds: 86_400 * 1.04 } } },
        { metered_feature: 'codex_hourly', rate_limit: { primary_window: { used_percent: 1, limit_window_seconds: 3600 } } },
        { metered_feature: 'codex_other', limit_name: 'Repeat', rate_limit: null },
      ],
      credits: { has_credits: false, unlimited: true },
      spend_control: { individual_limit: { used: '12.5', limit: 100 } },
      rate_limit_reset_credits: null,
    }
    const { http } = provider({ '/usage': usage })
    const read = await codexQuota(http).read(AUTH, signal)
    expect(read.pools).toEqual([
      {
        id: 'codex',
        windows: [
          { id: 'primary', span: 'five-hour', usedPercent: 100, resetsAt: NOW + 600_000 },
          { id: 'secondary', span: 'weekly', usedPercent: 10, resetsAt: 1_800_000_000_000 },
        ],
        limitReached: true,
      },
      { id: 'codex_other', name: 'Other', windows: [{ id: 'primary', span: 'daily', usedPercent: 5 }] },
      { id: 'codex_hourly', windows: [{ id: 'primary', usedPercent: 1 }] },
    ])
    expect(read.balances).toEqual([
      { id: 'credits', unit: 'credits', unlimited: true },
      { id: 'monthly-limit', unit: 'credits', used: 12.5, limit: 100 },
    ])
    expect(read).not.toHaveProperty('cardCount')
  })

  it('maps failures to issues', async () => {
    const failing = async (answer: unknown) => codexQuota(provider({ '/usage': answer }).http).read(AUTH, signal).catch((error: unknown) => error)
    expect(await failing(401)).toMatchObject({ issue: { code: 'auth-expired' }, refused: true })
    expect(await failing(403)).toMatchObject({ issue: { code: 'forbidden' } })
    expect(await failing(429)).toMatchObject({ issue: { code: 'rate-limited', retryAt: NOW + 120_000 } })
    expect(await failing(502)).toMatchObject({ issue: { code: 'request-failed' }, refused: false })
    expect(await failing(new TypeError('fetch failed'))).toMatchObject({ issue: { code: 'request-failed' }, refused: false })
    expect(await failing([1, 2])).toMatchObject({ issue: { code: 'invalid-response' } })
    const noWorkspace = await codexQuota(provider({}).http).read({ identity: 'id', token: 't' }, signal).catch((error: unknown) => error)
    expect(noWorkspace).toBeInstanceOf(QuotaFailure)
    expect(noWorkspace).toMatchObject({ issue: { code: 'auth-required' } })
  })

  it('redeems a card with its request id', async () => {
    const { http, sent } = provider({ '/rate-limit-reset-credits/consume': fixture('consume') })
    const adapter = codexQuota(http)
    await expect(adapter.redeem!(AUTH, 'credit-fixture-1', 'request-1', signal)).resolves.toBe('reset')
    expect(sent[0]).toMatchObject({ method: 'POST', body: { credit_id: 'credit-fixture-1', redeem_request_id: 'request-1' } })
    const answers = { already_redeemed: 'already-redeemed', nothing_to_reset: 'nothing-to-reset', no_credit: 'no-credit' }
    for (const [code, outcome] of Object.entries(answers)) {
      await expect(codexQuota(provider({ '/rate-limit-reset-credits/consume': { code } }).http).redeem!(AUTH, 'c', 'r', signal)).resolves.toBe(outcome)
    }
    for (const code of ['surprise', 'constructor']) {
      await expect(codexQuota(provider({ '/rate-limit-reset-credits/consume': { code } }).http).redeem!(AUTH, 'c', 'r', signal))
        .rejects.toMatchObject({ issue: { code: 'invalid-response' } })
    }
  })
})
