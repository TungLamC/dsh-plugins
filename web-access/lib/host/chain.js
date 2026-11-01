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
import { WebError } from '@deepseek-ai/dsh-web';
import { describeError } from "./kit/http.js";
/** A search's whole time, inside tool-web's 60 seconds. */
export const SEARCH_MS = 58_000;
/** The time each keyless tier gets. */
export const OPEN_TIER_MS = 8_000;
/** A hosted tier is not started with less time left than this: it would only be cut off, and billed. */
export const MIN_HOSTED_MS = 10_000;
/** Settle with the work, or reject as soon as the signal aborts, even if the work ignores it. */
function until(work, signal) {
    if (signal.aborted) {
        work.catch(() => { });
        return Promise.reject(signal.reason);
    }
    return new Promise((resolve, reject) => {
        const abort = () => { reject(signal.reason); };
        signal.addEventListener('abort', abort, { once: true });
        work.then(resolve, reject).finally(() => { signal.removeEventListener('abort', abort); });
    });
}
/** A signal that aborts after `ms`, on timers tests can fake; `clear` stops the timer. */
function timeout(ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => { controller.abort(new Error('timed out')); }, Math.max(0, ms));
    return { signal: controller.signal, clear: () => { clearTimeout(timer); } };
}
function found(result) {
    return result.sources.length > 0 || (result.content ?? '').trim() !== '';
}
function seconds(ms) {
    return `${Math.round(ms / 1000)}s`;
}
export function createSearchProvider(options) {
    const aborted = (cause) => new WebError('web search aborted', 'WEB_ABORTED', { cause });
    return {
        id: options.id,
        available: () => options.enabled().length > 0,
        async search(request, signal = new AbortController().signal) {
            const order = options.enabled();
            const deadline = Date.now() + SEARCH_MS;
            const hostedDeadline = deadline - OPEN_TIER_MS * order.filter(id => !options.tiers[id].hosted).length;
            const failures = [];
            let empty;
            for (const id of order) {
                if (signal.aborted)
                    throw aborted(signal.reason);
                const tier = options.tiers[id];
                const now = Date.now();
                const budget = tier.hosted ? hostedDeadline - now : Math.min(OPEN_TIER_MS, deadline - now);
                if (tier.hosted ? budget < MIN_HOSTED_MS : budget <= 0) {
                    options.log.info(`web search: ${id} not tried, ${seconds(Math.max(0, budget))} left`);
                    continue;
                }
                const timer = timeout(budget);
                const step = AbortSignal.any([signal, timer.signal]);
                let result;
                try {
                    const search = await until(tier.prepare(step), step);
                    if (search === undefined)
                        continue;
                    result = await until(search(request, step), step);
                }
                catch (error) {
                    if (signal.aborted)
                        throw aborted(signal.reason);
                    const reason = timer.signal.aborted ? `timed out after ${seconds(budget)}` : describeError(error);
                    failures.push(`${id}: ${reason}`);
                    options.log.warn(`web search: ${id} failed: ${reason}`);
                    continue;
                }
                finally {
                    timer.clear();
                }
                if (found(result)) {
                    options.log.info(`web search: answered by ${id}`);
                    return result;
                }
                options.log.info(`web search: ${id} found nothing`);
                empty ??= result;
            }
            if (signal.aborted)
                throw aborted(signal.reason);
            if (empty !== undefined)
                return empty;
            if (failures.length === 0) {
                throw new WebError(`no web search tier is set up; enabled: ${order.join(', ') || 'none'}`, 'WEB_PROVIDER_UNAVAILABLE');
            }
            throw new WebError(`web search failed: ${failures.join('; ')}`, 'WEB_PROVIDER_ERROR');
        },
    };
}
