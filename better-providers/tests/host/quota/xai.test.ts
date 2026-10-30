import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Http } from '../../../src/host/quota/http.ts'
import type { QuotaAuth } from '../../../src/host/quota/tracker.ts'
import { xaiQuota } from '../../../src/host/quota/xai.ts'

const fixture = (name: string): Record<string, unknown> => JSON.parse(readFileSync(new URL(`../../fixtures/xai/${name}.json`, import.meta.url), 'utf8')) as Record<string, unknown>
const AUTH: QuotaAuth = { identity: 'id', token: 'token-1' }
const NOW = Date.parse('2027-01-03T00:00:00Z')
const signal = new AbortController().signal

function provider(routes: Record<string, unknown>) {
  const sent: { path: string; headers: Record<string, string> }[] = []
  const http: Http = {
    now: () => NOW,
    async fetch(input, init) {
      const url = new URL(String(input))
      const path = url.pathname.replace('/v1', '') + url.search
      sent.push({ path, headers: Object.fromEntries(Object.entries(init?.headers ?? {})) as Record<string, string> })
      const value = routes[path]
      if (typeof value === 'number') return new Response('{}', { status: value })
      return value === undefined ? new Response('not found', { status: 404 }) : Response.json(value)
    },
  }
  return { http, sent }
}

const ROUTES = {
  '/user?include=subscription': fixture('user'),
  '/billing?format=credits': fixture('billing'),
  '/settings': fixture('settings'),
}

describe('xai usage', () => {
  it('reads the period window, the plan name and prepaid credit', async () => {
    const { http, sent } = provider(ROUTES)
    const usage = await xaiQuota(http).read(AUTH, signal)
    expect(usage).toEqual({
      plan: 'SuperGrok',
      pools: [{ id: 'subscription', windows: [{ id: 'period', span: 'weekly', usedPercent: 25, resetsAt: Date.parse('2027-01-08T00:00:00Z') }] }],
      balances: [{ id: 'prepaid', unit: 'usd-cents', remaining: 300 }],
    })
    expect(sent[0]?.headers).toMatchObject({ authorization: 'Bearer token-1', 'x-xai-token-auth': 'xai-grok-cli' })
    expect(sent[1]?.headers).toMatchObject({ 'x-userid': 'user-fixture' })
  })

  it('does without the plan name, and works out the share from the amounts', async () => {
    const billing = { config: { monthlyLimit: { val: '400' }, used: { val: 100 }, onDemandCap: { val: '1000' } } }
    const { http } = provider({ ...ROUTES, '/settings': 500, '/billing?format=credits': billing })
    const usage = await xaiQuota(http).read(AUTH, signal)
    expect(usage.plan).toBe('SUPER_GROK')
    expect(usage.pools[0]?.windows).toEqual([{ id: 'period', usedPercent: 25 }])
    expect(usage.balances).toEqual([{ id: 'on-demand', unit: 'usd-cents', used: 0, limit: 1000 }])
  })

  it('shows only that a team manages a member\'s limits', async () => {
    const { http, sent } = provider({ ...ROUTES, '/user?include=subscription': { ...fixture('user'), teamId: 'team-1' } })
    await expect(xaiQuota(http).read(AUTH, signal)).resolves.toEqual({ plan: 'SUPER_GROK', managedByTeam: true, pools: [], balances: [] })
    expect(sent).toHaveLength(1)
  })

  it('needs a user id, and reports an outdated client', async () => {
    await expect(xaiQuota(provider({ ...ROUTES, '/user?include=subscription': {} }).http).read(AUTH, signal))
      .rejects.toMatchObject({ issue: { code: 'invalid-response' } })
    await expect(xaiQuota(provider({ ...ROUTES, '/user?include=subscription': 426 }).http).read(AUTH, signal))
      .rejects.toMatchObject({ issue: { code: 'client-outdated' } })
  })
})
