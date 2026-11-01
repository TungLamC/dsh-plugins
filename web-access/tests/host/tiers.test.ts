import { afterEach, describe, expect, it, vi } from 'vitest'
import { pickGeminiModel, pickGptModel } from '../../src/host/hosted/models.ts'
import { hostedTiers } from '../../src/host/hosted/tiers.ts'
import type { Route, Routes } from '../../src/host/routes.ts'
import type { HostedTier } from '../../src/shared/ids.ts'
import { chatgptToken, json, recordingFetch, sse } from '../kit/fakes.ts'

afterEach(() => { vi.unstubAllGlobals() })

const choices = (...ids: string[]) => ids.map(id => ({ id, name: id }))
const signal = new AbortController().signal

describe('picking a model', () => {
  it('prefers the newest luna GPT, then the newest mainline one', () => {
    expect(pickGptModel(choices('gpt-5.5', 'gpt-6-luna', 'gpt-5.6-luna', 'gpt-6.1-sol', 'gpt-6-pro'))?.id).toBe('gpt-6-luna')
    expect(pickGptModel(choices('gpt-5.5', 'gpt-6', 'gpt-6-pro', 'gpt-6-mini', 'gpt-6.1-ultra'))?.id).toBe('gpt-6')
    expect(pickGptModel(choices('gpt-6-mini', 'gpt-5.5-codex'))?.id).toBe('gpt-6-mini')
    expect(pickGptModel(choices('gpt-image-2', 'gpt-realtime', 'o4'))).toBeUndefined()
  })

  it('prefers the newest stable Gemini Flash', () => {
    expect(pickGeminiModel(choices('gemini-2.5-flash', 'gemini-3.6-flash-preview', 'gemini-3.6-flash', 'gemini-3.6-pro', 'gemini-3.6-flash-lite'))?.id).toBe('gemini-3.6-flash')
    expect(pickGeminiModel(choices('gemini-3-flash-preview', 'gemini-2.5-flash'))?.id).toBe('gemini-3-flash-preview')
    expect(pickGeminiModel(choices('gemini-3.6-flash-image', 'gemini-3.6-flash-lite', 'gemini-3.6-pro'))?.id).toBe('gemini-3.6-flash-lite')
    expect(pickGeminiModel(choices('gemini-embedding-001'))).toBeUndefined()
  })
})

function route(overrides: Partial<Route> = {}): Route {
  return {
    baseUrl: 'https://example.test/v1',
    token: 'secret',
    headers: { 'x-route': 'yes' },
    models: choices('gpt-6-luna', 'gpt-6', 'gemini-3.6-flash'),
    efforts: async model => model === 'gpt-6-luna' ? ['low', 'high'] : [],
    ...overrides,
  }
}

function tiers(routes: Record<string, Route | undefined>, chosen: Partial<Record<HostedTier, string>> = {}) {
  const log = { info: vi.fn<(message: string) => void>() }
  const open = vi.fn<Routes['open']>(async name => routes[name])
  return { tiers: hostedTiers({ routes: { open, models: async () => undefined }, chosenModel: tier => chosen[tier], log }), log, open }
}

const completed = () => sse([{ type: 'response.completed', response: { status: 'completed', output: [{ type: 'web_search_call', action: { sources: [{ url: 'https://a.example' }] } }] } }])

describe('the hosted tiers', () => {
  it('are not set up without their route', async () => {
    const { tiers: subject, open } = tiers({})
    await expect(subject.codex.prepare(signal)).resolves.toBeUndefined()
    await expect(subject.openai.prepare(signal)).resolves.toBeUndefined()
    await expect(subject.gemini.prepare(signal)).resolves.toBeUndefined()
    expect(open.mock.calls.map(([name]) => name)).toEqual(['openai-codex', 'openai', 'google'])
  })

  it('search Codex as the signed-in ChatGPT account, at low effort when offered', async () => {
    const vendor = recordingFetch(completed)
    vi.stubGlobal('fetch', vendor.fetch)
    const token = chatgptToken('acct-1')
    const search = await tiers({ 'openai-codex': route({ baseUrl: 'https://chatgpt.com/backend-api', token }) }).tiers.codex.prepare(signal)
    await search?.({ query: 'q' }, signal)
    const [call] = vendor.calls
    expect(call?.url).toBe('https://chatgpt.com/backend-api/codex/responses')
    expect(Object.fromEntries(call!.headers)).toMatchObject({
      authorization: `Bearer ${token}`,
      'chatgpt-account-id': 'acct-1',
      originator: 'pi',
      'openai-beta': 'responses=experimental',
      'x-route': 'yes',
    })
    expect(call?.body).toMatchObject({ model: 'gpt-6-luna', reasoning: { effort: 'low' } })
  })

  it('refuse a Codex token that names no account', async () => {
    await expect(tiers({ 'openai-codex': route({ token: 'opaque' }) }).tiers.codex.prepare(signal)).rejects.toThrow('the ChatGPT sign-in names no account')
  })

  it('search OpenAI with the chosen model, leaving the effort to a model that offers no low one', async () => {
    const vendor = recordingFetch(completed)
    vi.stubGlobal('fetch', vendor.fetch)
    const search = await tiers({ openai: route() }, { openai: 'gpt-6' }).tiers.openai.prepare(signal)
    await search?.({ query: 'q' }, signal)
    expect(vendor.calls[0]?.url).toBe('https://example.test/v1/responses')
    expect(vendor.calls[0]?.headers.get('authorization')).toBe('Bearer secret')
    expect(vendor.calls[0]?.body).toMatchObject({ model: 'gpt-6' })
    expect(vendor.calls[0]?.body).not.toHaveProperty('reasoning')
  })

  it('pick a model when the chosen one is no longer on the route', async () => {
    const vendor = recordingFetch(completed)
    vi.stubGlobal('fetch', vendor.fetch)
    const { tiers: subject, log } = tiers({ openai: route() }, { openai: 'gpt-4.1' })
    await (await subject.openai.prepare(signal))?.({ query: 'q' }, signal)
    expect(vendor.calls[0]?.body).toMatchObject({ model: 'gpt-6-luna' })
    expect(log.info).toHaveBeenCalledWith('web search: openai model gpt-4.1 is not on route openai any more; picking one')
  })

  it('fail when the route has no model to search with', async () => {
    await expect(tiers({ openai: route({ models: choices('o4') }) }).tiers.openai.prepare(signal))
      .rejects.toThrow('route openai has no model to search with; choose one on the plugin\'s page')
  })

  it('search Gemini with the key in its header', async () => {
    const vendor = recordingFetch(() => json({ candidates: [{ content: { parts: [{ text: 'ok' }] }, groundingMetadata: { webSearchQueries: ['q'] } }] }))
    vi.stubGlobal('fetch', vendor.fetch)
    const search = await tiers({ google: route({ baseUrl: 'https://generativelanguage.googleapis.com/v1beta' }) }).tiers.gemini.prepare(signal)
    await expect(search?.({ query: 'q' }, signal)).resolves.toMatchObject({ content: 'ok' })
    expect(vendor.calls[0]?.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent')
    expect(vendor.calls[0]?.headers.get('x-goog-api-key')).toBe('secret')
  })
})
