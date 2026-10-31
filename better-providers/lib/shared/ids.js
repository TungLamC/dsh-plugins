/**
 * Names shared by the Host and browser halves: the package, its rows, and the
 * service each row provides (which is also the row's Remote namespace).
 */
import { z } from 'zod';
export const PACKAGE = 'dsh-better-providers';
/** Parts that can be switched off one by one; the main row switches them all. */
export const PARTS = ['oauth', 'quota', 'models', 'codexFast'];
/** Row ids as written in cordis.patch.yml; a part's row id is also its settings namespace. */
export const ROW = {
    main: 'better-providers',
    oauth: 'better-providers-oauth',
    quota: 'better-providers-quota',
    models: 'better-providers-models',
    codexFast: 'better-providers-codex-fast',
};
/** Cordis service keys; each also names the row's Remote namespace. */
export const SERVICE = {
    main: 'betterProviders',
    oauth: 'betterProvidersOauth',
    quota: 'betterProvidersQuota',
    models: 'betterProvidersModels',
    codexFast: 'betterProvidersCodexFast',
};
/** Typert takes one registration per package and face, so each row registers under its own module specifier. */
export const MODULE = {
    main: PACKAGE,
    oauth: `${PACKAGE}/oauth`,
    quota: `${PACKAGE}/quota`,
    models: `${PACKAGE}/models`,
    codexFast: `${PACKAGE}/codex-fast`,
};
/** The settings namespace and credential scope of dsh's built-in pi-ai providers. */
export const PI_AI = 'llm-pi-ai';
/** A pi-ai provider route that can address a credential record (`llm-pi-ai/<provider>`). */
export const providerId = z.string().regex(/^[a-z][a-z0-9-]*$/).max(64);
/** A dsh session id (`session-<uuid>`); also a key dsh's per-record storage can file. */
export const sessionId = z.string().regex(/^[A-Za-z0-9_-]+$/).max(200);
export const modelId = z.string().min(1).max(200);
/** Whether a route name can address a credential record; llm-pi-ai stores no sign-in for any other. */
export function isCredentialRoute(provider) {
    return providerId.safeParse(provider).success;
}
