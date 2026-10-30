/**
 * What the provider adapters share: one JSON request to a fixed provider URL,
 * whose failures become quota issues, and lenient readers of the parsed body.
 * Response bodies and exceptions stay on the Host; only an issue code reaches
 * the browser.
 */
import { QuotaFailure } from "./tracker.js";
const TIMEOUT_MS = 15_000;
function retryAt(header, now) {
    if (header === null)
        return undefined;
    const seconds = Number(header);
    const at = header.trim() !== '' && Number.isFinite(seconds) ? now + Math.max(0, seconds) * 1000 : Date.parse(header);
    return Number.isFinite(at) ? Math.max(now, at) : undefined;
}
/**
 * Send one JSON request; a body makes it a POST. Redirects are refused.
 * @throws {QuotaFailure} for every failure.
 */
export async function requestJson(http, url, headers, signal, body) {
    let response;
    try {
        response = await http.fetch(url, {
            method: body === undefined ? 'GET' : 'POST',
            redirect: 'error',
            headers: { accept: 'application/json', ...headers, ...body === undefined ? {} : { 'content-type': 'application/json' } },
            signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
            ...body === undefined ? {} : { body: JSON.stringify(body) },
        });
    }
    catch {
        throw new QuotaFailure({ code: 'request-failed' });
    }
    if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        const refused = response.status >= 400 && response.status < 500;
        switch (response.status) {
            case 401: throw new QuotaFailure({ code: 'auth-expired' }, true);
            // A team or access policy can refuse a valid sign-in: signing in again would not help.
            case 403: throw new QuotaFailure({ code: 'forbidden' }, true);
            case 426: throw new QuotaFailure({ code: 'client-outdated' }, true);
            case 429: {
                const at = retryAt(response.headers.get('retry-after'), http.now());
                throw new QuotaFailure({ code: 'rate-limited', ...at === undefined ? {} : { retryAt: at } }, true);
            }
            default: throw new QuotaFailure({ code: 'request-failed' }, refused);
        }
    }
    try {
        return await response.json();
    }
    catch {
        throw new QuotaFailure({ code: 'invalid-response' });
    }
}
/** A JSON object. @throws {QuotaFailure} `invalid-response` for anything else. */
export function record(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        throw new QuotaFailure({ code: 'invalid-response' });
    return value;
}
/** A JSON object, or undefined for null and absence. @throws {QuotaFailure} for anything else. */
export function optionalRecord(value) {
    return value === null || value === undefined ? undefined : record(value);
}
/** A non-empty string. */
export function text(value) {
    return typeof value === 'string' && value !== '' ? value : undefined;
}
/** A finite number, from a JSON number or a numeric string. */
export function number(value) {
    if (typeof value === 'string' ? value.trim() === '' : typeof value !== 'number')
        return undefined;
    const result = Number(value);
    return Number.isFinite(result) ? result : undefined;
}
/** Epoch milliseconds of an ISO date. */
export function date(value) {
    const time = typeof value === 'string' ? Date.parse(value) : Number.NaN;
    return Number.isFinite(time) ? time : undefined;
}
