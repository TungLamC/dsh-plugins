import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchGemini, type GeminiTarget } from '../../src/host/hosted/gemini.ts'
import { json, recordingFetch, type Call } from '../kit/fakes.ts'

afterEach(() => { vi.unstubAllGlobals() })

const target: GeminiTarget = {
  url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent',
  headers: { 'x-goog-api-key': 'gemini-secret' },
  secrets: ['gemini-secret'],
}

const signal = new AbortController().signal
const REDIRECT = 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/'

const grounded = {
  candidates: [{
    content: { role: 'model', parts: [{ text: 'Thinking it over', thought: true }, { text: 'DeepSeek Harness is ' }, { text: 'an agent harness.' }] },
    groundingMetadata: {
      webSearchQueries: ['deepseek harness'],
      groundingChunks: [
        { web: { uri: `${REDIRECT}one`, title: 'a.example' } },
        { web: { uri: `${REDIRECT}two`, title: 'b.example' } },
        { web: { uri: `${REDIRECT}broken`, title: 'c.example' } },
        { web: { uri: 'https://d.example/direct', title: 'd.example' } },
      ],
    },
  }],
}

function stub(answer: unknown, status = 200) {
  const vendor = recordingFetch((call: Call) => {
    if (call.method === 'HEAD') {
      if (call.url.endsWith('broken')) throw new Error('connection reset')
      return new Response(null, { status: 302, headers: { location: `https://${call.url.endsWith('one') ? 'a' : 'b'}.example/page` } })
    }
    return json(answer, status)
  })
  vi.stubGlobal('fetch', vendor.fetch)
  return vendor
}

describe('a Gemini grounded search', () => {
  it('asks the model with Google Search grounding', async () => {
    const vendor = stub(grounded)
    await searchGemini(target, { query: 'what is dsh' }, signal)
    const [call] = vendor.calls
    expect(call?.url).toBe(target.url)
    expect(call?.headers.get('x-goog-api-key')).toBe('gemini-secret')
    expect(call?.redirect).toBe('error')
    expect(call?.body).toMatchObject({ contents: [{ role: 'user', parts: [{ text: 'what is dsh' }] }], tools: [{ google_search: {} }] })
  })

  it('answers without the thoughts, citing where the grounding links lead', async () => {
    const vendor = stub(grounded)
    const result = await searchGemini(target, { query: 'q' }, signal)
    expect(result).toEqual({
      content: 'DeepSeek Harness is an agent harness.',
      sources: [
        { url: 'https://a.example/page', title: 'a.example' },
        { url: 'https://b.example/page', title: 'b.example' },
        // A redirect whose destination cannot be read stays as it is.
        { url: `${REDIRECT}broken`, title: 'c.example' },
        { url: 'https://d.example/direct', title: 'd.example' },
      ],
      truncated: false,
    })
    // The redirects are read, not followed, and without the key.
    const heads = vendor.calls.filter(call => call.method === 'HEAD')
    expect(heads).toHaveLength(3)
    expect(heads.every(call => call.redirect === 'manual' && call.headers.get('x-goog-api-key') === null)).toBe(true)
  })

  it('fails when the model answered without searching', async () => {
    stub({ candidates: [{ content: { parts: [{ text: 'From memory.' }] } }] })
    await expect(searchGemini(target, { query: 'q' }, signal)).rejects.toThrow('the model answered without searching')
  })

  it('fails on a blocked query', async () => {
    stub({ promptFeedback: { blockReason: 'SAFETY' } })
    await expect(searchGemini(target, { query: 'q' }, signal)).rejects.toThrow('the query was blocked: SAFETY')
  })

  it('keeps the key out of a failure', async () => {
    stub({ error: { message: 'API key gemini-secret not valid' } }, 400)
    await expect(searchGemini(target, { query: 'q' }, signal)).rejects.toThrow('HTTP 400: {"error":{"message":"API key *** not valid"}}')
  })
})
