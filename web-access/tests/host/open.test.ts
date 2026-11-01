import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Tier } from '../../src/host/chain.ts'
import { anysearchTier } from '../../src/host/open/anysearch.ts'
import { exaTier } from '../../src/host/open/exa.ts'
import { textResults } from '../../src/host/open/mcp.ts'
import { parallelTier } from '../../src/host/open/parallel.ts'
import { json, recordingFetch, sse, type Call } from '../kit/fakes.ts'

afterEach(() => { vi.unstubAllGlobals() })

const signal = new AbortController().signal

function stub(respond: (call: Call) => Response) {
  const vendor = recordingFetch(respond)
  vi.stubGlobal('fetch', vendor.fetch)
  return vendor
}

async function run(tier: Tier, maxResults?: number) {
  const search = await tier.prepare(signal)
  if (search === undefined) throw new Error('a keyless tier is always set up')
  return search({ query: 'dsh', ...maxResults === undefined ? {} : { maxResults } }, signal)
}

const toolResult = (result: object) => ({ jsonrpc: '2.0', id: 1, result })
const text = (value: string) => ({ content: [{ type: 'text', text: value }] })

const TEXT_RESULTS = [
  'Title: First page',
  'URL: https://a.example/one',
  'Published: 2026-10-01',
  'Text: The first page says',
  'URL: https://not-a-field.example',
  '---',
  'Title: Second page',
  'URL: https://b.example/two',
  'Published: N/A',
  'Highlights:',
  'A highlight',
].join('\n')

describe('the plain-text result format', () => {
  it('reads each block\'s fields before its page text', () => {
    expect(textResults(TEXT_RESULTS)).toEqual([
      { url: 'https://a.example/one', title: 'First page', snippet: 'The first page says URL: https://not-a-field.example', publishedAt: '2026-10-01' },
      { url: 'https://b.example/two', title: 'Second page', snippet: 'A highlight' },
    ])
  })
})

describe('Exa', () => {
  it('calls the keyless MCP tool with the result count', async () => {
    const vendor = stub(() => sse([toolResult(text(TEXT_RESULTS))]))
    await expect(run(exaTier(), 8)).resolves.toMatchObject({ sources: [{ url: 'https://a.example/one' }, { url: 'https://b.example/two' }] })
    expect(vendor.calls[0]).toMatchObject({
      url: 'https://mcp.exa.ai/mcp?tools=web_search_exa',
      body: { jsonrpc: '2.0', method: 'tools/call', params: { name: 'web_search_exa', arguments: { query: 'dsh', numResults: 8 } } },
    })
    expect(vendor.calls[0]?.headers.get('accept')).toBe('application/json, text/event-stream')
  })

  it('reads JSON results, joining the highlights', async () => {
    stub(() => json(toolResult(text(JSON.stringify({ results: [{ url: 'https://a.example', title: 'A', highlights: ['one', 'two'], publishedDate: '2026-01-01' }] })))))
    await expect(run(exaTier())).resolves.toEqual({ sources: [{ url: 'https://a.example', title: 'A', snippet: 'one … two', publishedAt: '2026-01-01' }], truncated: false })
  })

  it('treats no JSON results as finding nothing', async () => {
    stub(() => json(toolResult(text('{"results":[]}'))))
    await expect(run(exaTier())).resolves.toEqual({ sources: [], truncated: false })
  })

  it('fails when the endpoint flags the request as rate limited', async () => {
    stub(() => json(toolResult({ ...text('You have hit the rate limit'), _meta: { 'ai.exa/rateLimited': true } })))
    await expect(run(exaTier())).rejects.toThrow('rate limited')
  })

  it('fails on text it cannot read results from', async () => {
    stub(() => json(toolResult(text('Something unexpected'))))
    await expect(run(exaTier())).rejects.toThrow('no results could be read from the reply: Something unexpected')
  })

  it('fails with the tool\'s error', async () => {
    stub(() => json({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'overloaded' } }))
    await expect(run(exaTier())).rejects.toThrow('MCP error -32000: overloaded')
    stub(() => json(toolResult({ ...text('bad query'), isError: true })))
    await expect(run(exaTier())).rejects.toThrow('bad query')
    stub(() => new Response('Too Many Requests', { status: 429 }))
    await expect(run(exaTier())).rejects.toThrow('HTTP 429: Too Many Requests')
  })
})

describe('Parallel', () => {
  it('names itself, and reads structured results', async () => {
    const vendor = stub(() => sse([toolResult({ structuredContent: { results: [{ url: 'https://p.example', title: 'P', excerpts: ['', 'An excerpt'] }] } })]))
    await expect(run(parallelTier())).resolves.toEqual({ sources: [{ url: 'https://p.example', title: 'P', snippet: 'An excerpt' }], truncated: false })
    expect(vendor.calls[0]).toMatchObject({ url: 'https://search.parallel.ai/mcp', body: { params: { name: 'web_search', arguments: { objective: 'dsh', search_queries: ['dsh'] } } } })
    expect(vendor.calls[0]?.headers.get('user-agent')).toBe('dsh-web-access')
  })

  it('reads the plain-text format', async () => {
    stub(() => json(toolResult(text(TEXT_RESULTS))))
    await expect(run(parallelTier())).resolves.toMatchObject({ sources: [{ url: 'https://a.example/one' }, { url: 'https://b.example/two' }] })
  })
})

describe('AnySearch', () => {
  it('searches anonymously within the count it accepts', async () => {
    const vendor = stub(() => json({ code: 0, data: { results: [{ title: 'S', url: 'https://s.example', snippet: 'A snippet' }, { title: 'S again', url: 'https://s.example' }] } }))
    await expect(run(anysearchTier(), 50)).resolves.toEqual({ sources: [{ url: 'https://s.example', title: 'S', snippet: 'A snippet' }], truncated: false })
    expect(vendor.calls[0]).toMatchObject({ url: 'https://api.anysearch.com/v1/search', body: { query: 'dsh', max_results: 20 } })
    expect(vendor.calls[0]?.headers.get('authorization')).toBeNull()
  })

  it('fails with the code and message of an unsuccessful answer', async () => {
    stub(() => json({ code: 1003, message: 'quota exceeded' }))
    await expect(run(anysearchTier())).rejects.toThrow('the service answered code 1003: quota exceeded')
  })
})
