import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchResponses, type ResponsesTarget } from '../../src/host/hosted/responses.ts'
import { json, recordingFetch, sse } from '../kit/fakes.ts'

afterEach(() => { vi.unstubAllGlobals() })

const target: ResponsesTarget = {
  url: 'https://api.openai.com/v1/responses',
  headers: { authorization: 'Bearer sk-secret' },
  model: 'gpt-6-luna',
  effort: 'low',
  secrets: ['sk-secret'],
}

const signal = new AbortController().signal

const searchCall = {
  type: 'web_search_call',
  status: 'completed',
  action: { type: 'search', query: 'dsh', sources: [{ type: 'url', url: 'https://b.example/page' }, { type: 'url', url: 'https://a.example/?utm_source=openai' }] },
}
const message = (text: string, annotations: unknown[] = []) => ({
  type: 'message',
  role: 'assistant',
  content: [{ type: 'output_text', text, annotations }],
})
const final = message('DeepSeek Harness is an agent harness ([a](https://a.example/?utm_source=openai)).', [
  { type: 'url_citation', url: 'https://a.example/?utm_source=openai', title: 'A page', start_index: 30, end_index: 70 },
])

function stub(response: () => Response) {
  const vendor = recordingFetch(response)
  vi.stubGlobal('fetch', vendor.fetch)
  return vendor
}

describe('a Responses web search', () => {
  it('asks for a required web search with the sources, the effort, and no storage', async () => {
    const vendor = stub(() => sse([{ type: 'response.completed', response: { status: 'completed', output: [searchCall, final] } }]))
    await searchResponses(target, { query: 'what is dsh', maxResults: 8 }, signal)
    const [call] = vendor.calls
    expect(call?.url).toBe(target.url)
    expect(call?.headers.get('authorization')).toBe('Bearer sk-secret')
    expect(call?.headers.get('accept')).toBe('text/event-stream')
    expect(call?.redirect).toBe('error')
    expect(call?.body).toMatchObject({
      model: 'gpt-6-luna',
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'what is dsh' }] }],
      tools: [{ type: 'web_search' }],
      tool_choice: 'required',
      include: ['web_search_call.action.sources'],
      reasoning: { effort: 'low' },
      store: false,
      stream: true,
    })
    expect((call?.body as { instructions: string }).instructions).toContain('about 8 distinct sources')
  })

  it('leaves the effort to the model when none is given', async () => {
    const vendor = stub(() => sse([{ type: 'response.completed', response: { status: 'completed', output: [searchCall, final] } }]))
    const { effort: _effort, ...rest } = target
    await searchResponses(rest, { query: 'q' }, signal)
    expect(vendor.calls[0]?.body).not.toHaveProperty('reasoning')
  })

  it('answers with the last message, cited sources first, without the tool\'s tracking parameter', async () => {
    stub(() => sse([
      { type: 'response.output_item.done', item: message('Searching…') },
      { type: 'response.completed', response: { status: 'completed', output: [message('Searching…'), searchCall, final] } },
    ]))
    const result = await searchResponses(target, { query: 'q' }, signal)
    expect(result).toEqual({
      content: 'DeepSeek Harness is an agent harness ([a](https://a.example/?utm_source=openai)).',
      // A citation's surrounding text is the model's writing, so no snippet.
      sources: [{ url: 'https://a.example/', title: 'A page' }, { url: 'https://b.example/page' }],
      truncated: false,
    })
  })

  it('reads the output items when the final event carries none', async () => {
    stub(() => sse([
      { type: 'response.output_item.done', item: searchCall },
      { type: 'response.output_item.done', item: final },
      { type: 'response.completed', response: { status: 'completed', output: [] } },
    ]))
    await expect(searchResponses(target, { query: 'q' }, signal)).resolves.toMatchObject({ sources: [{ url: 'https://a.example/' }, { url: 'https://b.example/page' }] })
  })

  it('fails when the model did not search', async () => {
    stub(() => sse([{ type: 'response.completed', response: { status: 'completed', output: [final] } }]))
    await expect(searchResponses(target, { query: 'q' }, signal)).rejects.toThrow('the model answered without searching')
  })

  it('fails with what a failed response reports', async () => {
    stub(() => sse([
      { type: 'response.output_item.done', item: searchCall },
      { type: 'response.failed', response: { status: 'failed', error: { code: 'rate_limit_exceeded', message: 'Slow down' } } },
    ]))
    await expect(searchResponses(target, { query: 'q' }, signal)).rejects.toThrow('rate_limit_exceeded: Slow down')
  })

  it('fails on an error event even after output', async () => {
    stub(() => sse([{ type: 'response.output_item.done', item: searchCall }, { type: 'error', error: { type: 'server_error', message: 'boom' } }]))
    await expect(searchResponses(target, { query: 'q' }, signal)).rejects.toThrow('server_error: boom')
  })

  it('fails on a stream cut before the response completed', async () => {
    stub(() => sse([{ type: 'response.output_item.done', item: searchCall }]))
    await expect(searchResponses(target, { query: 'q' }, signal)).rejects.toThrow('the response ended before it completed')
  })

  it('reads a JSON body', async () => {
    stub(() => json({ status: 'completed', output: [searchCall, final] }))
    await expect(searchResponses(target, { query: 'q' }, signal)).resolves.toMatchObject({ content: expect.stringContaining('DeepSeek Harness') })
  })

  it('keeps the key out of a failure', async () => {
    stub(() => json({ error: { message: 'Incorrect API key provided: sk-secret' } }, 401))
    await expect(searchResponses(target, { query: 'q' }, signal)).rejects.toMatchObject({ message: 'HTTP 401: {"error":{"message":"Incorrect API key provided: ***"}}' })
  })
})
