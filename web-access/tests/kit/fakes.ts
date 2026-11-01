/** Stand-ins for the dsh services the Host half reads, and wire helpers the tests share. */

import type { CredentialRecord } from '@deepseek-ai/dsh-credentials'
import type { RouteCatalog } from '../../src/host/routes.ts'

/** An unsigned token shaped like a ChatGPT sign-in's: only its account claim is read. */
export function chatgptToken(account = 'acct-test', nonce = 'a'): string {
  const part = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${part({ alg: 'none' })}.${part({ 'https://api.openai.com/auth': { chatgpt_account_id: account }, nonce })}.sig`
}

/** pi-ai's OAuthCredential for a ChatGPT sign-in, expiring in `ms`. */
export function chatgptGrant(ms = 3_600_000, access = chatgptToken()) {
  return { type: 'oauth' as const, access, refresh: 'refresh-test', expires: Date.now() + ms, accountId: 'acct-test' }
}

/** dsh's credential service over memory: stored records, and reference values. */
export function memoryCredentials(records: Record<string, CredentialRecord> = {}, refs: Record<string, string> = {}) {
  const store = new Map(Object.entries(records))
  const writes: string[] = []
  return {
    store,
    writes,
    async readRecord(key: string) {
      return store.get(key)
    },
    async modifyRecord(key: string, mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>) {
      const next = await mutate(store.get(key))
      if (next !== undefined) {
        store.set(key, next)
        writes.push(key)
      }
      return store.get(key)
    },
    async resolve(ref: string) {
      return Object.hasOwn(refs, ref) ? { value: refs[ref]!, source: 'test' } : undefined
    },
    async listRecords() {
      return [...store.entries()].map(([key, record]) => ({ key, kind: record.kind }))
    },
  }
}

/** dsh's model service as the hosted tiers read it: each route's models, and the efforts each offers. */
export function fakeLlm(models: Record<string, readonly string[]>, efforts: Record<string, readonly string[]> = {}): RouteCatalog {
  const catalog = {
    async listModels(provider: string) {
      if (!Object.hasOwn(models, provider)) throw new Error(`no route ${provider}`)
      return models[provider]!.map(id => ({ provider, id, name: id.toUpperCase() }))
    },
    async resolveModelInfo(provider: string, model: string) {
      const ids = efforts[`${provider}/${model}`] ?? []
      return { provider, id: model, name: model, ...ids.length === 0 ? {} : { reasoning: { efforts: ids.map(id => ({ id, name: id })) } } }
    },
  }
  // Effort ids are branded strings in dsh; the fake's are plain ones.
  return catalog as unknown as RouteCatalog
}

export interface Call {
  url: string
  method: string
  headers: Headers
  body: unknown
  redirect: RequestRedirect | undefined
}

/** A fetch that records each request and answers with what `respond` returns for it. */
export function recordingFetch(respond: (call: Call) => Response | Promise<Response>): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = []
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const raw = init?.body
    const text = typeof raw === 'string' ? raw : raw instanceof URLSearchParams ? raw.toString() : undefined
    let body: unknown = text
    try {
      body = text === undefined ? undefined : JSON.parse(text)
    } catch {
      // Not JSON: kept as text.
    }
    const call = { url: String(input), method: init?.method ?? 'GET', headers: new Headers(init?.headers), body, redirect: init?.redirect }
    calls.push(call)
    init?.signal?.throwIfAborted()
    return respond(call)
  }) as typeof globalThis.fetch
  return { fetch, calls }
}

export function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
}

export function sse(events: readonly unknown[]): Response {
  return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
}
