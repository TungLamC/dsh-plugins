/**
 * Account sign-in of pi-ai provider routes, relayed to a browser view. The flows
 * themselves are llm-pi-ai's (registered with dsh's authorization service); this
 * module shows a running sign-in's notices and questions to the view that started
 * it and takes the answers back. It never holds or shows a secret.
 */

import type { SignInPrompt, SignInView } from '../../shared/oauth.wire.ts'
import { recordKey } from '../kit/pi-ai-record.ts'
import { Refusal } from '../kit/refusal.ts'

export interface Notice { message: string; url?: string; code?: string }

export type FlowPrompt = { signal?: AbortSignal; message: string } & (
  | { kind: 'text' | 'secret'; placeholder?: string }
  | { kind: 'select'; options: readonly { id: string; label: string; description?: string }[] }
)

/** Port over dsh's authorization service. */
export interface Flows {
  describe(key: string): { label: string; methods: readonly { id: string; label: string }[]; inFlight: boolean } | undefined
  begin(request: {
    key: string
    method: string
    signal: AbortSignal
    interaction: { notify(notice: Notice): void; prompt(prompt: FlowPrompt): Promise<string> }
  }): Promise<{ status: 'authorized' | 'cancelled' }>
  cancel(key: string): void
}

/** Port over dsh's credential store. */
export interface Records {
  describe(key: string): Promise<{ configured: boolean; kind?: 'api-key' | 'grant'; writable: boolean }>
  /** The plan the stored account sign-in's token states, if any. */
  plan(key: string): Promise<string | undefined>
  remove(key: string): Promise<void>
}

export interface SignInRelay {
  /** The route's sign-in state at once, then after every change, until `signal` aborts. */
  watch(provider: string, signal: AbortSignal): AsyncIterable<SignInView | null>
  /** Run one sign-in until it ends; its notices and questions show in `watch`. Aborting `signal` cancels it. */
  begin(provider: string, method: string, signal: AbortSignal): Promise<'authorized' | 'cancelled'>
  /** Answer the question `promptId` names. */
  answer(provider: string, promptId: string, value: string): void
  cancel(provider: string): void
  /** Forget the stored sign-in locally. */
  signOut(provider: string): Promise<void>
}

export interface SignInDependencies {
  flows: Flows
  records: Records
  /** Subscribe to a record key's sign-in settling or its stored record changing; returns the unsubscribe. */
  changes(listener: (key: string) => void): () => void
  newId(): string
}

/** The interactive method that collects an API key; keys are typed on the Models page. */
const API_KEY_METHOD = 'api-key'
/** Error codes of the authorization service that mean the caller asked for something impossible. */
const REFUSED: Readonly<Record<string, string>> = { NO_FLOW: 'no-flow', UNKNOWN_METHOD: 'unknown-method', ALREADY_IN_FLIGHT: 'in-flight' }

interface Pending { view: SignInPrompt; resolve(value: string): void; reject(reason: Error): void }
interface Attempt { notice?: Notice; prompt?: Pending }

export function createSignInRelay(deps: SignInDependencies): SignInRelay {
  const attempts = new Map<string, Attempt>()
  const versions = new Map<string, number>()
  const wakers = new Map<string, Set<() => void>>()

  const changed = (key: string): void => {
    versions.set(key, (versions.get(key) ?? 0) + 1)
    for (const wake of [...wakers.get(key) ?? []]) wake()
  }

  function methodsOf(key: string): { label: string; methods: { id: string; label: string }[]; inFlight: boolean } | undefined {
    const entry = deps.flows.describe(key)
    if (entry === undefined) return undefined
    const methods = entry.methods.filter(method => method.id !== API_KEY_METHOD).map(({ id, label }) => ({ id, label }))
    return methods.length === 0 ? undefined : { label: entry.label, methods, inFlight: entry.inFlight }
  }

  async function view(key: string): Promise<SignInView | null> {
    const entry = methodsOf(key)
    if (entry === undefined) return null
    const record = await deps.records.describe(key)
    const account = record.configured && record.kind === 'grant'
    const plan = account ? await deps.records.plan(key) : undefined
    const attempt = attempts.get(key)
    return {
      ...entry,
      credential: !record.configured ? 'none' : account ? 'account' : 'api-key',
      ...plan === undefined ? {} : { plan },
      writable: record.writable,
      ...attempt?.notice === undefined ? {} : { notice: { ...attempt.notice } },
      ...attempt?.prompt === undefined ? {} : { prompt: structuredClone(attempt.prompt.view) },
    }
  }

  async function* follow(key: string, signal: AbortSignal): AsyncIterable<SignInView | null> {
    let wake: () => void = () => {}
    const set = wakers.get(key) ?? new Set<() => void>()
    wakers.set(key, set)
    const listener = (): void => { wake() }
    set.add(listener)
    const off = deps.changes((changedKey) => { if (changedKey === key) changed(key) })
    signal.addEventListener('abort', listener, { once: true })
    try {
      let seen: number | undefined
      while (!signal.aborted) {
        const version = versions.get(key) ?? 0
        if (version !== seen) {
          seen = version
          const next = await view(key)
          if (signal.aborted) return
          yield next
          continue
        }
        await new Promise<void>((resolve) => { wake = resolve })
      }
    } finally {
      off()
      signal.removeEventListener('abort', listener)
      set.delete(listener)
      if (set.size === 0) wakers.delete(key)
    }
  }

  function ask(key: string, attempt: Attempt, alive: () => boolean, question: FlowPrompt): Promise<string> {
    if (!alive()) return Promise.reject(new Error('the sign-in has ended'))
    if (attempt.prompt !== undefined) return Promise.reject(new Error('a sign-in asks one question at a time'))
    const { signal: withdrawn, ...data } = question
    if (withdrawn?.aborted === true) return Promise.reject(new Error('the question was withdrawn'))
    const id = deps.newId()
    const answer = Promise.withResolvers<string>()
    const settle = (): void => {
      withdrawn?.removeEventListener('abort', onWithdraw)
      if (attempt.prompt?.view.id !== id) return
      delete attempt.prompt
      changed(key)
    }
    // A flow withdraws a question it no longer needs (say, the browser callback won); that ends only the question.
    const onWithdraw = (): void => { attempt.prompt?.reject(new Error('the question was withdrawn')) }
    attempt.prompt = {
      view: data.kind === 'select'
        ? { id, kind: 'select', message: data.message, options: data.options.map(option => ({ ...option })) }
        : { id, kind: data.kind, message: data.message, ...data.placeholder === undefined ? {} : { placeholder: data.placeholder } },
      resolve: (value) => { settle(); answer.resolve(value) },
      reject: (reason) => { settle(); answer.reject(reason) },
    }
    withdrawn?.addEventListener('abort', onWithdraw, { once: true })
    changed(key)
    return answer.promise
  }

  return {
    // The key is checked before the stream starts, so a bad one fails the call rather than the stream.
    watch: (provider, signal) => follow(recordKey(provider), signal),

    async begin(provider, method, signal) {
      const key = recordKey(provider)
      if (method === API_KEY_METHOD) throw new Refusal('unknown-method', method)
      const attempt: Attempt = {}
      let ended = false
      const alive = (): boolean => !ended && !signal.aborted
      try {
        const running = deps.flows.begin({
          key,
          method,
          signal,
          interaction: {
            notify(notice) {
              if (!alive()) return
              attempt.notice = { ...notice }
              attempts.set(key, attempt)
              changed(key)
            },
            prompt(question) {
              attempts.set(key, attempt)
              return ask(key, attempt, alive, question)
            },
          },
        })
        // The service claims the key synchronously: show the sign-in as running at once.
        changed(key)
        return (await running).status
      } catch (error) {
        const reason = REFUSED[String((error as { code?: unknown } | null)?.code)]
        if (reason !== undefined) throw new Refusal(reason, error instanceof Error ? error.message : undefined)
        throw error
      } finally {
        ended = true
        attempt.prompt?.reject(new Error('the sign-in has ended'))
        // Clear only this attempt's state; a refused call must not clear a running one.
        if (attempts.get(key) === attempt) attempts.delete(key)
        changed(key)
      }
    },

    answer(provider, promptId, value) {
      const pending = attempts.get(recordKey(provider))?.prompt
      if (pending === undefined || pending.view.id !== promptId) throw new Refusal('no-prompt')
      if (pending.view.kind === 'select' && !pending.view.options.some(option => option.id === value)) throw new Refusal('invalid-option')
      pending.resolve(value)
    },

    cancel(provider) {
      deps.flows.cancel(recordKey(provider))
    },

    async signOut(provider) {
      const key = recordKey(provider)
      if (deps.flows.describe(key)?.inFlight === true) throw new Refusal('in-flight')
      if (!(await deps.records.describe(key)).writable) throw new Refusal('not-writable')
      await deps.records.remove(key)
      changed(key)
    },
  }
}
