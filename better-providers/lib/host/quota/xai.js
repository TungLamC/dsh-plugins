/**
 * Usage of a Grok subscription sign-in on the `xai` route, from the endpoints the
 * Grok Build CLI reads (cli-chat-proxy.grok.com): one credit window for the
 * current period, prepaid credit and pay-as-you-go spending.
 */
import { date, number, optionalRecord, record, requestJson, text } from "./http.js";
import { QuotaFailure } from "./tracker.js";
const BASE = 'https://cli-chat-proxy.grok.com/v1';
/**
 * The Grok Build release this plugin presents itself as. The proxy answers 426 to
 * a release it no longer serves, which shows as `client-outdated`: raise it then.
 */
const CLIENT_VERSION = '1.0.70';
function headers(auth, userId) {
    return {
        authorization: `Bearer ${auth.token}`,
        'x-xai-token-auth': 'xai-grok-cli',
        'x-grok-client-version': CLIENT_VERSION,
        'x-grok-client-mode': 'interactive',
        ...userId === undefined ? {} : { 'x-userid': userId },
    };
}
/** Period types read `USAGE_PERIOD_TYPE_WEEKLY` and the like. */
function spanOf(type) {
    if (typeof type !== 'string')
        return undefined;
    return type.endsWith('_WEEKLY') ? 'weekly' : type.endsWith('_MONTHLY') ? 'monthly' : undefined;
}
/** An amount in cents, `{ val }`; protobuf JSON leaves a zero `val` out. */
function cents(value) {
    const raw = optionalRecord(value);
    return raw === undefined ? undefined : number(raw['val'] ?? 0);
}
export function xaiQuota(http) {
    return {
        async read(auth, signal) {
            const user = record(await requestJson(http, `${BASE}/user?include=subscription`, headers(auth), signal));
            const userId = text(user['userId']);
            if (userId === undefined)
                throw new QuotaFailure({ code: 'invalid-response' });
            const tier = text(user['subscriptionTier']);
            // A team member's limits are the team's: Grok Build shows nothing else either.
            if (text(user['teamId']) !== undefined) {
                return { ...tier === undefined ? {} : { plan: tier }, managedByTeam: true, pools: [], balances: [] };
            }
            const [billing, settings] = await Promise.all([
                requestJson(http, `${BASE}/billing?format=credits`, headers(auth, userId), signal).then(record),
                // Only the plan's display name comes from here; usage does without it.
                requestJson(http, `${BASE}/settings`, headers(auth, userId), signal).then(record).catch(() => undefined),
            ]);
            const plan = text(settings?.['subscription_tier_display']) ?? text(settings?.['subscription_tier']) ?? tier;
            const config = record(billing['config']);
            const period = optionalRecord(config['currentPeriod']);
            const resetsAt = date(period?.['end']) ?? date(config['billingPeriodEnd']);
            const limit = cents(config['monthlyLimit']);
            const used = cents(config['used']);
            const reported = number(config['creditUsagePercent']);
            const share = reported ?? (limit !== undefined && limit > 0 && used !== undefined ? used / limit * 100 : undefined);
            const span = spanOf(period?.['type']);
            const balances = [];
            // Prepaid credit is booked as a negative amount.
            const prepaid = Math.abs(cents(config['prepaidBalance']) ?? 0);
            if (prepaid > 0)
                balances.push({ id: 'prepaid', unit: 'usd-cents', remaining: prepaid });
            // Pay-as-you-go is on only with a positive cap; without a reported figure, spending past the limit counts.
            const cap = Math.abs(cents(config['onDemandCap']) ?? 0);
            if (cap > 0) {
                const spent = Math.abs(cents(config['onDemandUsed']) ?? Math.max((used ?? 0) - (limit ?? 0), 0));
                balances.push({ id: 'on-demand', unit: 'usd-cents', used: spent, limit: cap });
            }
            return {
                ...plan === undefined ? {} : { plan },
                pools: [{
                        id: 'subscription',
                        windows: [{
                                id: 'period',
                                ...span === undefined ? {} : { span },
                                ...share === undefined ? {} : { usedPercent: Math.min(100, Math.max(0, share)) },
                                ...resetsAt === undefined ? {} : { resetsAt },
                            }],
                    }],
                balances,
            };
        },
    };
}
