import { describe, expect, it } from 'vitest'
import { grantRecord, planOf, providerOf, readGrant, recordKey } from '../../../src/host/kit/pi-ai-record.ts'
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
