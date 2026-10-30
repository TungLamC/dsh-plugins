/**
 * The credential records llm-pi-ai keeps for its providers: `llm-pi-ai/<provider>`,
 * where an account sign-in is a `grant` holding pi-ai's OAuthCredential verbatim.
 * The only module that knows that layout.
 */

import type { CredentialRecord } from '@deepseek-ai/dsh-credentials'
import type { OAuthCredential } from '@earendil-works/pi-ai'
import { PI_AI, providerId } from '../../shared/ids.ts'
import { Refusal } from './refusal.ts'

/** The record key of a provider route; refuses a route that cannot address a record. */
export function recordKey(provider: string): string {
  if (!providerId.safeParse(provider).success) throw new Refusal('bad-provider', provider)
  return `${PI_AI}/${provider}`
}

/** The provider route a record key belongs to, or undefined for another scope. */
export function providerOf(key: string): string | undefined {
  const prefix = `${PI_AI}/`
  return key.startsWith(prefix) ? key.slice(prefix.length) : undefined
}

/** The account sign-in a record holds, or undefined for an API key, nothing, or a malformed payload. */
export function readGrant(record: CredentialRecord | undefined): OAuthCredential | undefined {
  if (record?.kind !== 'grant') return undefined
  const raw = record.payload as Partial<OAuthCredential> | null
  if (raw === null || typeof raw !== 'object' || raw.type !== 'oauth') return undefined
  if (typeof raw.access !== 'string' || raw.access === '' || typeof raw.refresh !== 'string' || raw.refresh === '') return undefined
  if (typeof raw.expires !== 'number' || !Number.isFinite(raw.expires)) return undefined
  return raw as OAuthCredential
}

/** The record for an account sign-in; the store takes JSON, so absent members stay absent. */
export function grantRecord(credential: OAuthCredential): CredentialRecord {
  return { kind: 'grant', payload: JSON.parse(JSON.stringify(credential)) as object }
}

/** The claims part of a JWT, or undefined for an opaque token. */
function claims(token: string): Record<string, unknown> | undefined {
  try {
    const payload: unknown = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'))
    return payload !== null && typeof payload === 'object' ? payload as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

/**
 * The subscription plan an account sign-in's token states, without asking the provider.
 * OpenAI puts it in its access token (`https://api.openai.com/auth` → `chatgpt_plan_type`);
 * other providers' tokens carry none, which gives undefined.
 */
export function planOf(credential: OAuthCredential | undefined): string | undefined {
  if (credential === undefined) return undefined
  const auth = claims(credential.access)?.['https://api.openai.com/auth']
  const plan = auth !== null && typeof auth === 'object' ? (auth as Record<string, unknown>)['chatgpt_plan_type'] : undefined
  return typeof plan === 'string' && plan !== '' ? plan : undefined
}
