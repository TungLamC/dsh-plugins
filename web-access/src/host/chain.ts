/**
 * The one search provider the row registers. dsh runs exactly the provider
 * `web.searchProvider` names and never falls back, so the fallback lives here:
 * a search tries the enabled tiers in order, skips the ones not set up, and
 * moves on when one fails, runs out of time, or finds nothing.
 *
 * Time: tool-web gives a `web_search` call 60 seconds. Every enabled keyless
 * tier keeps {@link OPEN_TIER_MS} of it; the hosted tiers share the rest, so a
 * hosted tier that fails fast leaves its time to the next one, and one that
 * runs long still leaves the keyless tiers theirs.
 */

import { WebError } from '@deepseek-ai/dsh-web'
import type { WebSearchProvider, WebSearchRequest, WebSearchResult } from '@deepseek-ai/dsh-web'
import type { Tier as TierId } from '../shared/ids.ts'
import { describeError } from './kit/http.ts'

/** A search's whole time, inside tool-web's 60 seconds. */
export const SEARCH_MS = 58_000
/** The time each keyless tier gets. */
export const OPEN_TIER_MS = 8_000
/** A hosted tier is not started with less time left than this: it would only be cut off, and billed. */
export const MIN_HOSTED_MS = 10_000

/** One search on a tier that is set up. */
export type Search = (request: WebSearchRequest, signal: AbortSignal) => Promise<WebSearchResult>

export interface Tier {
  /** A model searches on the provider's side; hosted tiers share their time. */
  readonly hosted: boolean
  /**
   * Read what the tier needs, at every search. Undefined when it is not set up,
   * which skips it; a throw is a failure, reported like a failed search.
   */
  prepare(signal: AbortSignal): Promise<Search | undefined>
}

export interface ChainOptions {
  /** The provider id `web.searchProvider` names. */
  id: string
  /** The enabled tiers, in order; read at every search. */
  enabled(): readonly TierId[]
  tiers: Readonly<Record<TierId, Tier>>
  log: { info(message: string): void; warn(message: string): void }
}

/** Settle with the work, or reject as soon as the signal aborts, even if the work ignores it. */
function until<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    work.catch(() => {})
    return Promise.reject(signal.reason as Error)
  }
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => { reject(signal.reason as Error) }
    signal.addEventListener('abort', abort, { once: true })
    work.then(resolve, reject).finally(() => { signal.removeEventListener('abort', abort) })
  })
}

/** A signal that aborts after `ms`, on timers tests can fake; `clear` stops the timer. */
function timeout(ms: number): { signal: AbortSignal; clear(): void } {
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort(new Error('timed out')) }, Math.max(0, ms))
  return { signal: controller.signal, clear: () => { clearTimeout(timer) } }
}

function found(result: WebSearchResult): boolean {
  return result.sources.length > 0 || (result.content ?? '').trim() !== ''
}

function seconds(ms: number): string {
  return `${Math.round(ms / 1000)}s`
}

export function createSearchProvider(options: ChainOptions): WebSearchProvider {
  const aborted = (cause: unknown): WebError => new WebError('web search aborted', 'WEB_ABORTED', { cause })

  return {
    id: options.id,
    available: () => options.enabled().length > 0,

    async search(request, signal = new AbortController().signal) {
      const order = options.enabled()
      const deadline = Date.now() + SEARCH_MS
      const hostedDeadline = deadline - OPEN_TIER_MS * order.filter(id => !options.tiers[id].hosted).length
      const failures: string[] = []
      let empty: WebSearchResult | undefined

      for (const id of order) {
        if (signal.aborted) throw aborted(signal.reason)
        const tier = options.tiers[id]
        const now = Date.now()
        const budget = tier.hosted ? hostedDeadline - now : Math.min(OPEN_TIER_MS, deadline - now)
        if (tier.hosted ? budget < MIN_HOSTED_MS : budget <= 0) {
          options.log.info(`web search: ${id} not tried, ${seconds(Math.max(0, budget))} left`)
          continue
        }
        const timer = timeout(budget)
        const step = AbortSignal.any([signal, timer.signal])
        let result: WebSearchResult
        try {
          const search = await until(tier.prepare(step), step)
          if (search === undefined) continue
          result = await until(search(request, step), step)
        } catch (error) {
          if (signal.aborted) throw aborted(signal.reason)
          const reason = timer.signal.aborted ? `timed out after ${seconds(budget)}` : describeError(error)
          failures.push(`${id}: ${reason}`)
          options.log.warn(`web search: ${id} failed: ${reason}`)
          continue
        } finally {
          timer.clear()
        }
        if (found(result)) {
          options.log.info(`web search: answered by ${id}`)
          return result
        }
        options.log.info(`web search: ${id} found nothing`)
        empty ??= result
      }

      if (signal.aborted) throw aborted(signal.reason)
      if (empty !== undefined) return empty
      if (failures.length === 0) {
        throw new WebError(`no web search tier is set up; enabled: ${order.join(', ') || 'none'}`, 'WEB_PROVIDER_UNAVAILABLE')
      }
      throw new WebError(`web search failed: ${failures.join('; ')}`, 'WEB_PROVIDER_ERROR')
    },
  }
}
