/** The codex-fast row's Remote contract: a per-session switch for OpenAI Codex fast mode, which asks for priority processing. */

import { z } from 'zod'
import type { RemoteResult, RemoteStreamHandle, TypertRemoteNamespace } from '@deepseek-ai/dsh-typert-protocol'
import { MODULE, SERVICE, sessionId } from './ids.ts'
import { defineRemote } from './remote.ts'

/** The pi-ai route that has fast mode: Codex, signed in with a ChatGPT account. */
export const CODEX_ROUTE = 'openai-codex'

/** Whether a route has fast mode; the Host decides which requests ask for it, the browser where to offer the switch. */
export function prioritizable(provider: string): boolean {
  return provider === CODEX_ROUTE
}

/** Reasons a codex-fast request is refused (the bad-request message). */
export type CodexFastRefusal = 'storage-unavailable'

export const CODEX_FAST_REMOTE = defineRemote(MODULE.codexFast, SERVICE.codexFast, {
  watchSupport: { params: [], stream: true, signal: true },
  watch: { params: [['sessionId', sessionId]], stream: true, signal: true },
  set: { params: [['sessionId', sessionId], ['enabled', z.boolean()]] },
})

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteMap {
    /** Whether fast mode works in this dsh at all: at once, then every change. */
    'betterProvidersCodexFast/watchSupport': (signal?: AbortSignal) => RemoteStreamHandle<boolean, never>
    /** The session's switch at once, then every change. */
    'betterProvidersCodexFast/watch': (sessionId: string, signal?: AbortSignal) => RemoteStreamHandle<boolean, never>
    /** Turn the session's switch; resolves to the switch as stored. */
    'betterProvidersCodexFast/set': (sessionId: string, enabled: boolean) => Promise<RemoteResult<boolean>>
  }
  interface TypertRemoteNamespaceMap {
    betterProvidersCodexFast: TypertRemoteNamespace<'betterProvidersCodexFast'>
  }
}

/** The browser-side handle of the namespace. */
export type CodexFastRemote = TypertRemoteNamespace<'betterProvidersCodexFast'>
