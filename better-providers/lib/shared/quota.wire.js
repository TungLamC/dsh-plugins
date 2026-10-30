/** The quota row's Remote contract: subscription usage of signed-in pi-ai provider routes. */
import { z } from 'zod';
import { MODULE, providerId, SERVICE } from "./ids.js";
import { defineRemote } from "./remote.js";
/** Routes whose provider reports subscription usage for an account sign-in. */
export const QUOTA_PROVIDERS = ['openai-codex', 'xai'];
export function hasQuota(provider) {
    return QUOTA_PROVIDERS.includes(provider);
}
/** Seconds between reads while a usage view is open: the row's `quotaRefreshSeconds` setting. */
export const REFRESH_SECONDS = { min: 15, max: 3600, initial: 60 };
const token = z.string().min(1).max(200);
const redemption = z.strictObject({ account: token, card: token, request: z.uuid() });
export const QUOTA_REMOTE = defineRemote(MODULE.quota, SERVICE.quota, {
    watch: { params: [['provider', providerId]], stream: true, signal: true },
    redeem: { params: [['provider', providerId], ['redemption', redemption]] },
});
