/**
 * The credential records llm-pi-ai keeps for its providers: `llm-pi-ai/<provider>`,
 * where an account sign-in is a `grant` holding pi-ai's OAuthCredential verbatim.
 * The only module that knows that layout.
 */
import { PI_AI, providerId } from "../../shared/ids.js";
import { Refusal } from "./refusal.js";
/** The record key of a provider route; refuses a route that cannot address a record. */
export function recordKey(provider) {
    if (!providerId.safeParse(provider).success)
        throw new Refusal('bad-provider', provider);
    // The grammar was just checked, which is all the brand stands for.
    return `${PI_AI}/${provider}`;
}
/** The provider route a record key belongs to, or undefined for another scope. */
export function providerOf(key) {
    const prefix = `${PI_AI}/`;
    return key.startsWith(prefix) ? key.slice(prefix.length) : undefined;
}
/** The account sign-in a record holds, or undefined for an API key, nothing, or a malformed payload. */
export function readGrant(record) {
    if (record?.kind !== 'grant')
        return undefined;
    const raw = record.payload;
    if (raw === null || typeof raw !== 'object' || raw.type !== 'oauth')
        return undefined;
    if (typeof raw.access !== 'string' || raw.access === '' || typeof raw.refresh !== 'string' || raw.refresh === '')
        return undefined;
    if (typeof raw.expires !== 'number' || !Number.isFinite(raw.expires))
        return undefined;
    return raw;
}
/** The record for an account sign-in; the store takes JSON, so absent members stay absent. */
export function grantRecord(credential) {
    return { kind: 'grant', payload: JSON.parse(JSON.stringify(credential)) };
}
/** The claims part of a JWT, or undefined for an opaque token. */
export function tokenClaims(token) {
    try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'));
        return payload !== null && typeof payload === 'object' ? payload : undefined;
    }
    catch {
        return undefined;
    }
}
/**
 * The subscription plan an account sign-in's token states, without asking the provider.
 * OpenAI puts it in its access token (`https://api.openai.com/auth` → `chatgpt_plan_type`);
 * other providers' tokens carry none, which gives undefined.
 */
export function planOf(credential) {
    if (credential === undefined)
        return undefined;
    const auth = tokenClaims(credential.access)?.['https://api.openai.com/auth'];
    const plan = auth !== null && typeof auth === 'object' ? auth['chatgpt_plan_type'] : undefined;
    return typeof plan === 'string' && plan !== '' ? plan : undefined;
}
/** The routes' sign-ins over dsh's credential service. */
export function grantsOf(credentials) {
    return {
        read: async (provider) => readGrant(await credentials.readRecord(recordKey(provider))),
        modify: async (provider, mutate) => readGrant(await credentials.modifyRecord(recordKey(provider), async (current) => {
            const next = await mutate(readGrant(current));
            return next === undefined ? undefined : grantRecord(next);
        })),
    };
}
