/**
 * Usage of a ChatGPT sign-in on the `openai-codex` route, from the endpoints the
 * Codex CLI reads (chatgpt.com/backend-api/wham): the rate-limit windows, credits,
 * and the reset cards an account can be granted.
 */
import { date, number, optionalRecord, record, requestJson, text } from "./http.js";
import { QuotaFailure } from "./tracker.js";
const BASE = 'https://chatgpt.com/backend-api/wham';
/** Window lengths in minutes; a reported length within 5% of one names its span. */
const SPANS = [
    ['five-hour', 300], ['daily', 1440], ['weekly', 10_080], ['monthly', 43_200], ['annual', 525_600],
];
function spanOf(seconds) {
    if (seconds === undefined || seconds <= 0)
        return undefined;
    const minutes = seconds / 60;
    return SPANS.find(([, length]) => Math.abs(minutes - length) <= length * 0.05)?.[0];
}
const OUTCOMES = {
    reset: 'reset', already_redeemed: 'already-redeemed', nothing_to_reset: 'nothing-to-reset', no_credit: 'no-credit',
};
function headers(auth) {
    // Every wham endpoint is scoped to a workspace; a sign-in without one cannot be read.
    if (auth.accountId === undefined)
        throw new QuotaFailure({ code: 'auth-required' });
    return { authorization: `Bearer ${auth.token}`, 'chatgpt-account-id': auth.accountId };
}
export function codexQuota(http) {
    function window(id, value) {
        const raw = optionalRecord(value);
        if (raw === undefined)
            return undefined;
        const used = number(raw['used_percent']);
        const span = spanOf(number(raw['limit_window_seconds']));
        const resetAt = number(raw['reset_at']);
        const resetAfter = number(raw['reset_after_seconds']);
        const resetsAt = resetAt !== undefined ? resetAt * 1000 : resetAfter !== undefined ? http.now() + resetAfter * 1000 : undefined;
        return {
            id,
            ...span === undefined ? {} : { span },
            ...used === undefined ? {} : { usedPercent: Math.min(100, Math.max(0, used)) },
            ...resetsAt === undefined ? {} : { resetsAt },
        };
    }
    function pool(id, value, name) {
        const raw = optionalRecord(value);
        if (raw === undefined)
            return undefined;
        const windows = [window('primary', raw['primary_window']), window('secondary', raw['secondary_window'])];
        return {
            id,
            ...name === undefined ? {} : { name },
            windows: windows.filter(entry => entry !== undefined),
            ...typeof raw['limit_reached'] === 'boolean' ? { limitReached: raw['limit_reached'] } : {},
        };
    }
    function pools(raw) {
        const result = [pool('codex', raw['rate_limit']) ?? { id: 'codex', windows: [] }];
        const review = pool('code-review', raw['code_review_rate_limit']);
        if (review !== undefined)
            result.push(review);
        const extra = Array.isArray(raw['additional_rate_limits']) ? raw['additional_rate_limits'] : [];
        for (const value of extra) {
            const entry = record(value);
            const id = text(entry['metered_feature']);
            // The first group of a feature wins; a repeat must not replace it.
            if (id === undefined || result.some(existing => existing.id === id))
                continue;
            const found = pool(id, entry['rate_limit'], text(entry['limit_name']));
            if (found !== undefined)
                result.push(found);
        }
        return result;
    }
    /** Credits are shown only when the account has some, or unlimited ones; a workspace may cap a member's monthly spend. */
    function balances(raw) {
        const result = [];
        const credits = optionalRecord(raw['credits']);
        if (credits?.['unlimited'] === true)
            result.push({ id: 'credits', unit: 'credits', unlimited: true });
        else if (credits?.['has_credits'] === true) {
            const remaining = number(credits['balance']);
            result.push({ id: 'credits', unit: 'credits', ...remaining === undefined ? {} : { remaining } });
        }
        const cap = optionalRecord(optionalRecord(raw['spend_control'])?.['individual_limit']);
        if (cap !== undefined) {
            const used = number(cap['used']);
            const limit = number(cap['limit']);
            result.push({ id: 'monthly-limit', unit: 'credits', ...used === undefined ? {} : { used }, ...limit === undefined ? {} : { limit } });
        }
        return result;
    }
    /** How many reset cards the reply counts; undefined when the account has none at all. */
    function cardCount(raw) {
        const summary = optionalRecord(raw['rate_limit_reset_credits']);
        if (summary === undefined)
            return undefined;
        const count = number(summary['available_count']);
        return count !== undefined && Number.isInteger(count) && count >= 0 ? count : undefined;
    }
    return {
        async read(auth, signal) {
            const raw = record(await requestJson(http, `${BASE}/usage`, headers(auth), signal));
            const plan = text(raw['plan_type']);
            const count = cardCount(raw);
            return {
                ...plan === undefined ? {} : { plan },
                pools: pools(raw),
                balances: balances(raw),
                ...count === undefined ? {} : { cardCount: count },
            };
        },
        async cards(auth, signal) {
            const raw = record(await requestJson(http, `${BASE}/rate-limit-reset-credits`, headers(auth), signal));
            const count = number(raw['available_count']);
            if (count === undefined || !Number.isInteger(count) || count < 0 || !Array.isArray(raw['credits'])) {
                throw new QuotaFailure({ code: 'invalid-response' });
            }
            const now = http.now();
            const cards = [];
            for (const value of raw['credits']) {
                const card = record(value);
                const id = text(card['id']);
                const expiresAt = date(card['expires_at']);
                if (id === undefined || card['reset_type'] !== 'codex_rate_limits' || card['status'] !== 'available')
                    continue;
                if (card['is_supported_by_plan'] === false || (expiresAt !== undefined && expiresAt <= now))
                    continue;
                const title = text(card['title']);
                const description = text(card['description']);
                cards.push({
                    id,
                    ...title === undefined ? {} : { title },
                    ...description === undefined ? {} : { description },
                    ...expiresAt === undefined ? {} : { expiresAt },
                });
            }
            cards.sort((a, b) => (a.expiresAt ?? Number.POSITIVE_INFINITY) - (b.expiresAt ?? Number.POSITIVE_INFINITY));
            return { count, cards: cards.slice(0, count) };
        },
        async redeem(auth, card, request, signal) {
            const body = { credit_id: card, redeem_request_id: request };
            const raw = record(await requestJson(http, `${BASE}/rate-limit-reset-credits/consume`, headers(auth), signal, body));
            const code = String(raw['code']);
            if (!Object.hasOwn(OUTCOMES, code))
                throw new QuotaFailure({ code: 'invalid-response' });
            return OUTCOMES[code];
        },
    };
}
