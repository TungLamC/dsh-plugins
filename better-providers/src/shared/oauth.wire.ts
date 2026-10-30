/** The oauth row's Remote contract: account sign-in of pi-ai provider routes, relayed to the Models page. */

import { z } from 'zod'
import type { RemoteResult, RemoteStreamHandle, TypertRemoteNamespace } from '@deepseek-ai/dsh-typert-protocol'
import { MODULE, providerId, SERVICE } from './ids.ts'
import { defineRemote } from './remote.ts'

/** A question the running sign-in waits on; `id` makes an answer to a replaced question fail. */
export type SignInPrompt = { id: string; message: string } & (
  | { kind: 'text' | 'secret'; placeholder?: string }
  | { kind: 'select'; options: { id: string; label: string; description?: string }[] }
)

/** Sign-in state of one provider route. */
export interface SignInView {
  /** Display name of the provider's sign-in flow. */
  label: string
  /** Account sign-in methods, most preferred first (typing an API key is left to the Models page). */
  methods: { id: string; label: string }[]
  inFlight: boolean
  /** What the stored credential is: an account sign-in, an API key, or nothing. */
  credential: 'account' | 'api-key' | 'none'
  /** The signed-in account's plan as its token states it (a provider id such as `pro`), when it states one. */
  plan?: string
  /** Whether signing in and out can write the credential store. */
  writable: boolean
  /** The latest notice of the running sign-in: a message, a page to open, a code to enter there. */
  notice?: { message: string; url?: string; code?: string }
  prompt?: SignInPrompt
}

/** Reasons a sign-in request is refused (the bad-request message). */
export type SignInRefusal = 'bad-provider' | 'no-flow' | 'unknown-method' | 'in-flight' | 'no-prompt' | 'invalid-option' | 'not-writable'

export const OAUTH_REMOTE = defineRemote(MODULE.oauth, SERVICE.oauth, {
  watch: { params: [['provider', providerId]], stream: true, signal: true },
  begin: { params: [['provider', providerId], ['method', z.string().min(1).max(64)]], signal: true },
  answer: { params: [['provider', providerId], ['promptId', z.string().min(1).max(64)], ['value', z.string().max(4096)]] },
  cancel: { params: [['provider', providerId]] },
  signOut: { params: [['provider', providerId]] },
})

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteMap {
    /** The route's sign-in state, then every change; null when it offers no account sign-in. */
    'betterProvidersOauth/watch': (provider: string, signal?: AbortSignal) => RemoteStreamHandle<SignInView | null, never>
    /** Run one sign-in until it ends; aborting the call cancels it. */
    'betterProvidersOauth/begin': (provider: string, method: string, signal?: AbortSignal) => Promise<RemoteResult<'authorized' | 'cancelled'>>
    'betterProvidersOauth/answer': (provider: string, promptId: string, value: string) => Promise<RemoteResult<void>>
    'betterProvidersOauth/cancel': (provider: string) => Promise<RemoteResult<void>>
    /** Forget the stored sign-in locally; the provider is not told. */
    'betterProvidersOauth/signOut': (provider: string) => Promise<RemoteResult<void>>
  }
  interface TypertRemoteNamespaceMap {
    betterProvidersOauth: TypertRemoteNamespace<'betterProvidersOauth'>
  }
}

/** The browser-side handle of the namespace. */
export type OauthRemote = TypertRemoteNamespace<'betterProvidersOauth'>
