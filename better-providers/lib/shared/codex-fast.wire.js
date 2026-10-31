/** The codex-fast row's Remote contract: a per-session switch for OpenAI Codex fast mode, which asks for priority processing. */
import { z } from 'zod';
import { MODULE, SERVICE, sessionId } from "./ids.js";
import { defineRemote } from "./remote.js";
/** The pi-ai route that has fast mode: Codex, signed in with a ChatGPT account. */
export const CODEX_ROUTE = 'openai-codex';
/** Whether a route has fast mode; the Host decides which requests ask for it, the browser where to offer the switch. */
export function prioritizable(provider) {
    return provider === CODEX_ROUTE;
}
export const CODEX_FAST_REMOTE = defineRemote(MODULE.codexFast, SERVICE.codexFast, {
    watchSupport: { params: [], stream: true, signal: true },
    watch: { params: [['sessionId', sessionId]], stream: true, signal: true },
    set: { params: [['sessionId', sessionId], ['enabled', z.boolean()]] },
});
