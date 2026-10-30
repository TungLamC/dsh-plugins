import { describe, expect, it } from 'vitest'
import type { CredentialKey, CredentialRecord } from '@deepseek-ai/dsh-credentials'
import { grantRecord, grantsOf, planOf, providerOf, readGrant, recordKey } from '../../../src/host/kit/pi-ai-record.ts'
import { Refusal } from '../../../src/host/kit/refusal.ts'

const grant = { type: 'oauth' as const, access: 'a', refresh: 'r', expires: 1, accountId: 'acc' }

describe('pi-ai records', () => {
  it('addresses provider routes under llm-pi-ai', () => {
    expect(recordKey('openai-codex')).toBe('llm-pi-ai/openai-codex')
    expect(providerOf('llm-pi-ai/xai')).toBe('xai')
    expect(providerOf('other/xai')).toBeUndefined()
  })

  it('refuses a route that cannot address a record', () => {
    expect(() => recordKey('OpenAI')).toThrow(Refusal)
    expect(() => recordKey('a/b')).toThrow(Refusal)
  })

  it('reads an account sign-in and nothing else', () => {
    expect(readGrant({ kind: 'grant', payload: grant })).toEqual(grant)
    expect(readGrant({ kind: 'api-key', key: 'k' })).toBeUndefined()
    expect(readGrant(undefined)).toBeUndefined()
    expect(readGrant({ kind: 'grant', payload: { ...grant, access: '' } })).toBeUndefined()
    expect(readGrant({ kind: 'grant', payload: { ...grant, expires: Number.NaN } })).toBeUndefined()
    expect(readGrant({ kind: 'grant', payload: null })).toBeUndefined()
  })

  it('stores a sign-in as plain JSON', () => {
    const record = grantRecord({ ...grant, enterpriseUrl: undefined })
    expect(record).toEqual({ kind: 'grant', payload: grant })
    expect(Object.hasOwn(record.kind === 'grant' ? record.payload as object : {}, 'enterpriseUrl')).toBe(false)
  })
})

describe('planOf', () => {
  const jwt = (claims: object): string => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`

  it('reads the plan OpenAI puts in its access token', () => {
    expect(planOf({ ...grant, access: jwt({ 'https://api.openai.com/auth': { chatgpt_plan_type: 'pro' } }) })).toBe('pro')
  })

  it('has none for other tokens', () => {
    expect(planOf({ ...grant, access: jwt({ sub: 'x' }) })).toBeUndefined()
    expect(planOf({ ...grant, access: 'opaque' })).toBeUndefined()
    expect(planOf(undefined)).toBeUndefined()
  })
})

/** The record half of a credential service, in memory. */
function credentials(initial: Record<string, CredentialRecord> = {}) {
  const records = new Map<string, CredentialRecord>(Object.entries(initial))
  return {
    records,
    readRecord: async (key: CredentialKey) => records.get(key),
    async modifyRecord(key: CredentialKey, mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>) {
      const next = await mutate(records.get(key))
      if (next !== undefined) records.set(key, next)
      return records.get(key)
    },
  }
}

describe('grantsOf', () => {
  it('reads the account sign-in of a route, and nothing for an API key', async () => {
    const store = credentials({ 'llm-pi-ai/openai-codex': { kind: 'grant', payload: grant }, 'llm-pi-ai/xai': { kind: 'api-key', key: 'k' } })
    const grants = grantsOf(store)
    await expect(grants.read('openai-codex')).resolves.toEqual(grant)
    await expect(grants.read('xai')).resolves.toBeUndefined()
    await expect(grants.read('anthropic')).resolves.toBeUndefined()
    await expect(grants.read('Bad/Name')).rejects.toBeInstanceOf(Refusal)
  })

  it('writes a sign-in back as plain JSON, and shows a mutation only the sign-in', async () => {
    const store = credentials({ 'llm-pi-ai/xai': { kind: 'api-key', key: 'k' } })
    const grants = grantsOf(store)
    const seen: unknown[] = []
    const written = await grants.modify('openai-codex', async (current) => {
      seen.push(current)
      return { ...grant, idToken: undefined }
    })
    expect(written).toEqual(grant)
    expect(store.records.get('llm-pi-ai/openai-codex')).toEqual({ kind: 'grant', payload: grant })
    await grants.modify('xai', async (current) => {
      seen.push(current)
      return undefined
    })
    expect(seen).toEqual([undefined, undefined])
    expect(store.records.get('llm-pi-ai/xai')).toEqual({ kind: 'api-key', key: 'k' })
  })
})
