import { describe, expect, it } from 'vitest'
import type { OAuthCredential, Provider } from '@earendil-works/pi-ai'
import type { Grants } from '../../../src/host/kit/pi-ai-record.ts'
import { createAccounts, identityOf } from '../../../src/host/quota/accounts.ts'
import { QuotaFailure } from '../../../src/host/quota/tracker.ts'

const ROUTE = 'openai-codex'
const HOUR = 3_600_000

function jwt(claims: Record<string, unknown>): string {
  const part = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${part({ alg: 'none' })}.${part(claims)}.signature`
}

function credential(overrides: Partial<OAuthCredential> = {}): OAuthCredential {
  return { type: 'oauth', access: jwt({ sub: 'user-1', n: 1 }), refresh: 'refresh-1', expires: Date.now() + HOUR, accountId: 'workspace-1', ...overrides }
}

/** One record behind a lock, like the credential service; `locked` is true while a write runs. */
function store(initial: OAuthCredential | undefined) {
  let stored = initial
  let locked = false
  let chain = Promise.resolve()
  const writes: (OAuthCredential | undefined)[] = []
  const grants: Grants = {
    read: async () => stored,
    modify(_provider, mutate) {
      const run = chain.then(async () => {
        locked = true
        try {
          const next = await mutate(stored)
          if (next !== undefined) {
            stored = next
            writes.push(next)
          }
          return stored
        } finally {
          locked = false
        }
      })
      chain = run.then(() => undefined, () => undefined)
      return run
    },
  }
  return { grants, writes, locked: () => locked, stored: () => stored }
}

/** A pi-ai provider whose sign-in refresh the test controls. */
function provider(refresh: (current: OAuthCredential) => Promise<OAuthCredential>): Provider {
  return {
    id: ROUTE,
    name: 'Test',
    auth: {
      oauth: {
        name: 'Test sign-in',
        login: async () => { throw new Error('not in tests') },
        refresh,
        toAuth: async (current: OAuthCredential) => ({ apiKey: current.access }),
      },
    },
    getModels: () => [],
  } as unknown as Provider
}

const signal = new AbortController().signal

describe('quota accounts', () => {
  it('identifies an account by its workspace and user, across token refreshes', () => {
    const before = credential()
    const after = credential({ access: jwt({ sub: 'user-1', n: 2 }), refresh: 'refresh-2' })
    expect(identityOf(after)).toBe(identityOf(before))
    expect(identityOf(credential({ access: jwt({ sub: 'user-2' }) }))).not.toBe(identityOf(before))
    expect(identityOf(credential({ accountId: 'workspace-2' }))).not.toBe(identityOf(before))
    expect(identityOf(before)).not.toContain('workspace-1')
  })

  it('identifies an opaque token by its refresh token', () => {
    const opaque = { type: 'oauth', access: 'opaque', refresh: 'refresh-1', expires: 0 } as OAuthCredential
    expect(identityOf(opaque)).toBe(identityOf({ ...opaque, access: 'other' }))
    expect(identityOf(opaque)).not.toBe(identityOf({ ...opaque, refresh: 'refresh-2' }))
  })

  it('uses a fresh stored token as it is', async () => {
    const stored = credential()
    const s = store(stored)
    const accounts = createAccounts({ grants: s.grants, provider: () => provider(async () => { throw new Error('no refresh expected') }) })
    await expect(accounts.resolve(ROUTE, signal)).resolves.toEqual({ identity: identityOf(stored), token: stored.access, accountId: 'workspace-1' })
    expect(s.writes).toHaveLength(0)
  })

  it('refreshes an expiring token inside the record lock and stores the result', async () => {
    const s = store(credential({ expires: Date.now() + 1000 }))
    let lockedDuringRefresh: boolean | undefined
    const refreshed = credential({ access: jwt({ sub: 'user-1', n: 2 }), refresh: 'refresh-2', expires: Date.now() + HOUR })
    const accounts = createAccounts({
      grants: s.grants,
      provider: () => provider(async () => {
        lockedDuringRefresh = s.locked()
        return refreshed
      }),
    })
    const auth = await accounts.resolve(ROUTE, signal)
    expect(lockedDuringRefresh).toBe(true)
    expect(s.writes).toEqual([refreshed])
    expect(auth).toEqual({ identity: identityOf(refreshed), token: refreshed.access, accountId: 'workspace-1' })
    await expect(accounts.identity(ROUTE)).resolves.toBe(identityOf(refreshed))
  })

  it('reports a failed refresh and keeps the sign-in', async () => {
    const expiring = credential({ expires: Date.now() })
    const s = store(expiring)
    const accounts = createAccounts({ grants: s.grants, provider: () => provider(async () => { throw new Error('invalid_grant') }) })
    const failure = await accounts.resolve(ROUTE, signal).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(QuotaFailure)
    expect(failure).toMatchObject({ issue: { code: 'refresh-failed' } })
    expect(s.stored()).toBe(expiring)
  })

  it('has no account without a stored sign-in or a known provider', async () => {
    const empty = createAccounts({ grants: store(undefined).grants, provider: () => provider(async current => current) })
    await expect(empty.identity(ROUTE)).resolves.toBeUndefined()
    await expect(empty.resolve(ROUTE, signal)).resolves.toBeUndefined()
    const unknown = createAccounts({ grants: store(credential()).grants, provider: () => undefined })
    await expect(unknown.resolve(ROUTE, signal)).resolves.toBeUndefined()
  })
})
