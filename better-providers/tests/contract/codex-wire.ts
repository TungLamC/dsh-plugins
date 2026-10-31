/** Codex as pi-ai's Codex protocol sees it, for the contract tests: a sign-in and an endpoint that records what it is sent. */

import { readFileSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'

const STREAM = readFileSync(new URL('../fixtures/codex/stream.sse', import.meta.url), 'utf8')

/** An unsigned token shaped like a ChatGPT sign-in's: pi-ai reads only the account id from it. */
export function codexToken(): string {
  const part = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${part({ alg: 'none' })}.${part({ 'https://api.openai.com/auth': { chatgpt_account_id: 'acct-test' } })}.sig`
}

/** pi-ai's OAuthCredential for that sign-in, valid for an hour. */
export function codexGrant(): { type: 'oauth'; access: string; refresh: string; expires: number } {
  return { type: 'oauth', access: codexToken(), refresh: 'refresh-test', expires: Date.now() + 3_600_000 }
}

/** A fetch answering every Codex request with a short completed response, recording the request bodies. */
export function codexEndpoint(): { fetch: typeof fetch; bodies: Record<string, unknown>[] } {
  const bodies: Record<string, unknown>[] = []
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    if (!String(input).endsWith('/codex/responses')) throw new Error(`unexpected request to ${String(input)}`)
    // pi-ai sends the body zstd-compressed where Node can compress it.
    const raw = init?.body instanceof Uint8Array && new Headers(init.headers).get('content-encoding') === 'zstd'
      ? zstdDecompressSync(init.body).toString('utf8')
      : String(init?.body)
    bodies.push(JSON.parse(raw) as Record<string, unknown>)
    return new Response(STREAM, { headers: { 'content-type': 'text/event-stream' } })
  }) as typeof globalThis.fetch
  return { fetch, bodies }
}
