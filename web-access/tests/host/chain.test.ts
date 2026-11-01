import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebError, type WebSearchResult } from '@deepseek-ai/dsh-web'
import { createSearchProvider, type Tier } from '../../src/host/chain.ts'
import { TIERS, type Tier as TierId } from '../../src/shared/ids.ts'

const answer = (text: string): WebSearchResult => ({ content: text, sources: [], truncated: false })
const nothing: WebSearchResult = { sources: [], truncated: false }

/** A tier that is not set up. */
const unset = (hosted: boolean): Tier => ({ hosted, prepare: async () => undefined })

/** A tier whose search does `run`. */
const tier = (hosted: boolean, run: (signal: AbortSignal) => Promise<WebSearchResult>): Tier => ({
  hosted,
  prepare: async () => async (_request, signal) => run(signal),
})

/** A search that never settles, not even when aborted. */
const hang = (): Promise<never> => new Promise(() => {})

function provider(tiers: Partial<Record<TierId, Tier>>, enabled: readonly TierId[] = TIERS) {
  const log = { info: vi.fn<(message: string) => void>(), warn: vi.fn<(message: string) => void>() }
  const all = Object.fromEntries(TIERS.map(id => [id, tiers[id] ?? unset(['codex', 'openai', 'gemini'].includes(id))])) as Record<TierId, Tier>
  return { search: createSearchProvider({ id: 'web-access', enabled: () => enabled, tiers: all, log }), log }
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('the search provider', () => {
  it('answers with the first tier that finds something, skipping tiers not set up', async () => {
    const { search, log } = provider({
      openai: tier(true, async () => answer('from openai')),
      exa: tier(false, async () => answer('from exa')),
    })
    await expect(search.search({ query: 'q' })).resolves.toEqual(answer('from openai'))
    expect(log.info).toHaveBeenCalledWith('web search: answered by openai')
  })

  it('moves on when a tier fails or finds nothing', async () => {
    const { search, log } = provider({
      codex: tier(true, async () => { throw new Error('HTTP 401') }),
      exa: tier(false, async () => nothing),
      parallel: tier(false, async () => answer('from parallel')),
    })
    await expect(search.search({ query: 'q' })).resolves.toEqual(answer('from parallel'))
    expect(log.warn).toHaveBeenCalledWith('web search: codex failed: HTTP 401')
    expect(log.info).toHaveBeenCalledWith('web search: exa found nothing')
  })

  it('counts a tier that fails while preparing as failed', async () => {
    const { search } = provider({
      codex: { hosted: true, prepare: async () => { throw new Error('the sign-in could not be refreshed') } },
      exa: tier(false, async () => answer('from exa')),
    })
    await expect(search.search({ query: 'q' })).resolves.toEqual(answer('from exa'))
  })

  it('returns an empty result when every tier tried found nothing', async () => {
    const { search } = provider({ exa: tier(false, async () => nothing), anysearch: tier(false, async () => { throw new Error('down') }) })
    await expect(search.search({ query: 'q' })).resolves.toEqual(nothing)
  })

  it('reports every failure when all tiers fail', async () => {
    const { search } = provider({
      exa: tier(false, async () => { throw new Error('rate limited') }),
      parallel: tier(false, async () => { throw new Error('HTTP 503') }),
    })
    const error = await search.search({ query: 'q' }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(WebError)
    expect(error).toMatchObject({ code: 'WEB_PROVIDER_ERROR', message: 'web search failed: exa: rate limited; parallel: HTTP 503' })
  })

  it('reports a provider with nothing set up as unavailable', async () => {
    const { search } = provider({}, ['codex', 'gemini'])
    await expect(search.search({ query: 'q' })).rejects.toMatchObject({ code: 'WEB_PROVIDER_UNAVAILABLE' })
  })

  it('tries only the enabled tiers', async () => {
    const codex = vi.fn(async () => answer('from codex'))
    const { search } = provider({ codex: tier(true, codex), exa: tier(false, async () => answer('from exa')) }, ['exa'])
    await expect(search.search({ query: 'q' })).resolves.toEqual(answer('from exa'))
    expect(codex).not.toHaveBeenCalled()
  })

  it('is unavailable with every tier switched off', () => {
    expect(provider({}, []).search.available()).toBe(false)
    expect(provider({}, ['anysearch']).search.available()).toBe(true)
  })

  it('leaves each enabled keyless tier its 8 seconds, giving the hosted tiers the rest', async () => {
    const started: string[] = []
    const { search, log } = provider({
      codex: tier(true, async () => { started.push(`codex ${Date.now()}`); return hang() }),
      openai: tier(true, async () => { started.push('openai'); return answer('never') }),
      exa: tier(false, async () => { started.push(`exa ${Date.now()}`); return hang() }),
      parallel: tier(false, async () => { started.push(`parallel ${Date.now()}`); return answer('from parallel') }),
    })
    const start = Date.now()
    const result = search.search({ query: 'q' })
    await vi.advanceTimersByTimeAsync(58_000)
    await expect(result).resolves.toEqual(answer('from parallel'))
    // 58s less 8s for each of the three keyless tiers: codex is cut off at 34s, too late to start openai.
    expect(started).toEqual([`codex ${start}`, `exa ${start + 34_000}`, `parallel ${start + 42_000}`])
    expect(log.warn).toHaveBeenCalledWith('web search: codex failed: timed out after 34s')
    expect(log.info).toHaveBeenCalledWith('web search: openai not tried, 0s left')
  })

  it('gives the next hosted tier the time a failed one left', async () => {
    const { search } = provider({
      codex: tier(true, async () => { await new Promise(resolve => setTimeout(resolve, 5_000)); throw new Error('HTTP 500') }),
      openai: tier(true, async () => { await new Promise(resolve => setTimeout(resolve, 20_000)); return answer('from openai') }),
    })
    const result = search.search({ query: 'q' })
    await vi.advanceTimersByTimeAsync(25_000)
    await expect(result).resolves.toEqual(answer('from openai'))
  })

  it('gives hosted tiers the whole time when no keyless tier is on', async () => {
    const { search } = provider({ codex: tier(true, async () => { await new Promise(resolve => setTimeout(resolve, 50_000)); return answer('slow') }) }, ['codex'])
    const result = search.search({ query: 'q' })
    await vi.advanceTimersByTimeAsync(50_000)
    await expect(result).resolves.toEqual(answer('slow'))
  })

  it('stops at once when the caller aborts', async () => {
    const controller = new AbortController()
    const exa = vi.fn(async () => answer('late'))
    const { search } = provider({ codex: tier(true, hang), exa: tier(false, exa) })
    const result = search.search({ query: 'q' }, controller.signal)
    const caught = expect(result).rejects.toMatchObject({ code: 'WEB_ABORTED' })
    await vi.advanceTimersByTimeAsync(1_000)
    controller.abort()
    await caught
    expect(exa).not.toHaveBeenCalled()
  })

  it('hands each tier a signal that aborts with the caller or at its deadline', async () => {
    let seen: AbortSignal | undefined
    const { search } = provider({ exa: tier(false, async (signal) => { seen = signal; return hang() }), anysearch: tier(false, async () => answer('ok')) }, ['exa', 'anysearch'])
    const result = search.search({ query: 'q' })
    await vi.advanceTimersByTimeAsync(8_000)
    await expect(result).resolves.toEqual(answer('ok'))
    expect(seen?.aborted).toBe(true)
  })
})
