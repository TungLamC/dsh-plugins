import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Provider } from '@earendil-works/pi-ai'
import { googleProvider } from '@earendil-works/pi-ai/providers/google'
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { createRoutes, type RouteDependencies } from '../../src/host/routes.ts'
import { chatgptGrant, chatgptToken, fakeLlm, json, memoryCredentials, recordingFetch } from '../kit/fakes.ts'

afterEach(() => { vi.unstubAllGlobals() })

const PROVIDERS: Record<string, () => Provider> = { 'openai-codex': openaiCodexProvider, openai: openaiProvider, google: googleProvider }

function routes(overrides: Partial<RouteDependencies> & { profiles?: Record<string, unknown> } = {}) {
  const { profiles = {}, ...deps } = overrides
  return createRoutes({
    providers: () => profiles,
    credentials: () => undefined,
    llm: () => fakeLlm({ 'openai-codex': ['gpt-6-luna'], openai: ['gpt-6-luna', 'gpt-6'], google: ['gemini-3.6-flash'] }, { 'openai/gpt-6-luna': ['low', 'medium'] }),
    piProvider: route => PROVIDERS[route]?.(),
    env: () => undefined,
    ...deps,
  })
}

const signal = new AbortController().signal

describe('routes', () => {
  it('knows only the routes on the Models page', async () => {
    const credentials = memoryCredentials({}, { OPENAI_API_KEY: 'sk-env' })
    const subject = routes({ profiles: {}, credentials: () => credentials })
    await expect(subject.open('openai', signal)).resolves.toBeUndefined()
    await expect(subject.models('openai')).resolves.toBeUndefined()
  })

  it('takes a key from the route\'s credential reference first', async () => {
    const credentials = memoryCredentials({ 'llm-pi-ai/openai': { kind: 'api-key', key: 'sk-stored' } }, { MY_OPENAI: 'sk-ref' })
    const route = await routes({ profiles: { openai: { apiKeyEnv: 'MY_OPENAI' } }, credentials: () => credentials }).open('openai', signal)
    expect(route).toMatchObject({ baseUrl: 'https://api.openai.com/v1', token: 'sk-ref', headers: {} })
  })

  it('fails when the route\'s credential reference is not set', async () => {
    const credentials = memoryCredentials()
    await expect(routes({ profiles: { openai: { apiKeyEnv: 'MY_OPENAI' } }, credentials: () => credentials }).open('openai', signal))
      .rejects.toThrow('the route\'s credential MY_OPENAI is not set')
  })

  it('reads a reference from the launch environment when there is no credential service', async () => {
    const route = await routes({ profiles: { openai: { apiKeyEnv: 'MY_OPENAI' } }, env: name => name === 'MY_OPENAI' ? 'sk-launch' : undefined }).open('openai', signal)
    expect(route?.token).toBe('sk-launch')
  })

  it('uses the API key stored for the route', async () => {
    const credentials = memoryCredentials({ 'llm-pi-ai/google': { kind: 'api-key', key: 'gemini-key' } })
    const route = await routes({ profiles: { google: {} }, credentials: () => credentials }).open('google', signal)
    expect(route).toMatchObject({ baseUrl: 'https://generativelanguage.googleapis.com/v1beta', token: 'gemini-key' })
  })

  it('finds the provider\'s own environment variable through the credential service', async () => {
    const credentials = memoryCredentials({}, { GEMINI_API_KEY: 'gemini-env' })
    const route = await routes({ profiles: { google: {} }, credentials: () => credentials }).open('google', signal)
    expect(route?.token).toBe('gemini-env')
  })

  it('leaves a route nothing signs in to as not set up', async () => {
    const credentials = memoryCredentials()
    await expect(routes({ profiles: { 'openai-codex': {} }, credentials: () => credentials }).open('openai-codex', signal)).resolves.toBeUndefined()
  })

  it('uses a valid ChatGPT sign-in as it is', async () => {
    const vendor = recordingFetch(() => { throw new Error('no request expected') })
    vi.stubGlobal('fetch', vendor.fetch)
    const grant = chatgptGrant()
    const credentials = memoryCredentials({ 'llm-pi-ai/openai-codex': { kind: 'grant', payload: grant } })
    const route = await routes({ profiles: { 'openai-codex': {} }, credentials: () => credentials }).open('openai-codex', signal)
    expect(route).toMatchObject({ baseUrl: 'https://chatgpt.com/backend-api', token: grant.access })
    expect(credentials.writes).toEqual([])
  })

  it('refreshes an expired sign-in inside the credential service\'s write and keeps the new token', async () => {
    const fresh = chatgptToken('acct-test', 'b')
    const vendor = recordingFetch(() => json({ access_token: fresh, refresh_token: 'refresh-2', expires_in: 3600 }))
    vi.stubGlobal('fetch', vendor.fetch)
    const credentials = memoryCredentials({ 'llm-pi-ai/openai-codex': { kind: 'grant', payload: chatgptGrant(-1_000) } })
    const route = await routes({ profiles: { 'openai-codex': {} }, credentials: () => credentials }).open('openai-codex', signal)
    expect(route?.token).toBe(fresh)
    expect(vendor.calls.map(call => call.url)).toEqual(['https://auth.openai.com/oauth/token'])
    expect(credentials.writes).toEqual(['llm-pi-ai/openai-codex'])
    expect(credentials.store.get('llm-pi-ai/openai-codex')).toMatchObject({ kind: 'grant', payload: { type: 'oauth', access: fresh, refresh: 'refresh-2' } })
  })

  it('reports a sign-in that cannot be refreshed', async () => {
    vi.stubGlobal('fetch', recordingFetch(() => json({ error: 'invalid_grant' }, 400)).fetch)
    const credentials = memoryCredentials({ 'llm-pi-ai/openai-codex': { kind: 'grant', payload: chatgptGrant(-1_000) } })
    await expect(routes({ profiles: { 'openai-codex': {} }, credentials: () => credentials }).open('openai-codex', signal))
      .rejects.toThrow('the sign-in could not be refreshed; sign in again if this persists')
  })

  it('takes the route\'s own endpoint and headers', async () => {
    const credentials = memoryCredentials({}, { KEY: 'sk-gateway' })
    const route = await routes({
      profiles: { openai: { apiKeyEnv: 'KEY', baseURL: 'https://gateway.example/v1/', headers: { 'x-team': 'search', bad: 3 } } },
      credentials: () => credentials,
    }).open('openai', signal)
    expect(route).toMatchObject({ baseUrl: 'https://gateway.example/v1', headers: { 'x-team': 'search' } })
  })

  it('lists the route\'s models and the efforts each offers', async () => {
    const credentials = memoryCredentials({}, { OPENAI_API_KEY: 'sk-env' })
    const subject = routes({ profiles: { openai: {} }, credentials: () => credentials })
    await expect(subject.models('openai')).resolves.toEqual([{ id: 'gpt-6-luna', name: 'GPT-6-LUNA' }, { id: 'gpt-6', name: 'GPT-6' }])
    const route = await subject.open('openai', signal)
    expect(route?.models.map(model => model.id)).toEqual(['gpt-6-luna', 'gpt-6'])
    await expect(route?.efforts('gpt-6-luna', signal)).resolves.toEqual(['low', 'medium'])
    await expect(route?.efforts('gpt-6', signal)).resolves.toEqual([])
  })

  it('lists no models for a route the model service does not serve', async () => {
    await expect(routes({ profiles: { openai: {} }, llm: () => fakeLlm({}) }).models('openai')).resolves.toEqual([])
    await expect(routes({ profiles: { openai: {} }, llm: () => undefined }).models('openai')).resolves.toEqual([])
  })
})
