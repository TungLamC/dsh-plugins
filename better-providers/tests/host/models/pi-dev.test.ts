import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { piDevCatalog } from '../../../src/host/models/pi-dev.ts'
import { CatalogFailure } from '../../../src/host/models/sync.ts'

const body = (route: string): string => readFileSync(new URL(`../../fixtures/pi-dev/${route}.json`, import.meta.url), 'utf8')
const signal = new AbortController().signal

/** pi.dev answering with `answer` for every route; an Error fails the request. */
function serve(answer: Response | Error | ((url: string) => Response)) {
  const sent: { url: string; init?: RequestInit }[] = []
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    sent.push({ url, ...init === undefined ? {} : { init } })
    if (answer instanceof Error) throw answer
    return typeof answer === 'function' ? answer(url) : answer
  }) as typeof globalThis.fetch
  return { catalog: piDevCatalog(fetch), sent }
}

const json = (value: unknown, status = 200): Response => new Response(typeof value === 'string' ? value : JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })

describe('pi.dev catalog', () => {
  it('reads a route\'s models in catalog order from its provider endpoint', async () => {
    const { catalog, sent } = serve(json(body('openai-codex')))
    const { models, invalid } = await catalog.models('openai-codex', signal)
    expect(sent.map(request => request.url)).toEqual(['https://pi.dev/api/models/providers/openai-codex'])
    expect(sent[0]?.init?.redirect).toBe('error')
    expect(invalid).toEqual([])
    expect(models.map(model => model.id)).toEqual([
      'gpt-5.6-luna', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-6-astra', 'gpt-6-luna', 'gpt-6-sol', 'gpt-6.1-sol', 'gpt-6.1-terra',
    ])
    expect(models.at(-1)).toMatchObject({
      id: 'gpt-6.1-terra',
      name: 'GPT-6.1 Terra',
      api: 'openai-codex-responses',
      baseUrl: 'https://chatgpt.com/backend-api',
      reasoning: true,
      input: ['text', 'image'],
      contextWindow: 500_000,
      maxTokens: 128_000,
      thinkingLevelMap: { off: 'none', minimal: 'low', low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' },
      compat: { supportsToolSearch: true },
    })
  })

  it('reads every published route', async () => {
    for (const [route, count] of [['kimi-coding', 6], ['xai', 4]] as const) {
      const { models, invalid } = await serve(json(body(route))).catalog.models(route, signal)
      expect(models).toHaveLength(count)
      expect(invalid).toEqual([])
    }
  })

  it('reports an entry that lacks what a refresh needs instead of failing the catalog', async () => {
    const good = JSON.parse(body('xai'))['grok-4.7'] as Record<string, unknown>
    const { catalog } = serve(json({
      'grok-4.7': good,
      'no-window': { ...good, id: 'no-window', name: 'No window', contextWindow: 0 },
      'bad-levels': { ...good, id: 'bad-levels', thinkingLevelMap: { turbo: 'x' } },
      'other-id': { ...good, id: 'something-else' },
      'not-an-object': 42,
      'audio': { ...good, id: 'audio', input: ['text', 'audio'] },
    }))
    const { models, invalid } = await catalog.models('xai', signal)
    expect(models.map(model => model.id)).toEqual(['grok-4.7'])
    expect(invalid).toEqual([
      { id: 'no-window', name: 'No window' },
      { id: 'bad-levels', name: good['name'] },
      { id: 'other-id', name: good['name'] },
      { id: 'not-an-object' },
      { id: 'audio', name: good['name'] },
    ])
  })

  it('leaves out models that are not chat models', async () => {
    const good = JSON.parse(body('xai'))['grok-4.7'] as Record<string, unknown>
    const { models, invalid } = await serve(json({ 'grok-4.7': good, 'grok-imagine': { id: 'grok-imagine', type: 'image' } })).catalog.models('xai', signal)
    expect(models.map(model => model.id)).toEqual(['grok-4.7'])
    expect(invalid).toEqual([])
  })

  it('names a route pi.dev does not know, an unreachable catalog, and a reply that is not one', async () => {
    const failure = (catalog: ReturnType<typeof serve>['catalog']) => catalog.models('xai', signal).then(() => undefined, (error: unknown) => error)
    expect(await failure(serve(json({ ok: false, error: 'Model provider not found.' }, 404)).catalog)).toEqual(new CatalogFailure('unknown'))
    expect(await failure(serve(json({}, 502)).catalog)).toEqual(new CatalogFailure('unreachable'))
    expect(await failure(serve(new TypeError('fetch failed')).catalog)).toEqual(new CatalogFailure('unreachable'))
    expect(await failure(serve(json('<html>')).catalog)).toEqual(new CatalogFailure('invalid'))
    expect(await failure(serve(json([])).catalog)).toEqual(new CatalogFailure('invalid'))
  })
})
