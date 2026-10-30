/**
 * The account sign-in a usage read queries with. An expiring token is refreshed
 * by pi-ai itself, through a credential store over the route's own record, so the
 * refresh runs inside the credential service's write lock exactly as llm-pi-ai's
 * refresh before a model request does: the two never rotate one token at once.
 */

import { createHash } from 'node:crypto'
import { createModels, type AuthContext, type CredentialStore, type OAuthCredential, type Provider } from '@earendil-works/pi-ai'
import { tokenClaims, type Grants } from '../kit/pi-ai-record.ts'
import { QuotaFailure, type Accounts } from './tracker.ts'

export interface AccountDependencies {
  grants: Grants
  /** The pi-ai provider whose sign-in a route holds. */
  provider(id: string): Provider | undefined
}

/** Usage is read with the stored sign-in only, never with a key found in the environment. */
const NO_AMBIENT: AuthContext = { env: async () => undefined, fileExists: async () => false }

function accountIdOf(credential: OAuthCredential): string | undefined {
  if (typeof credential['accountId'] === 'string' && credential['accountId'] !== '') return credential['accountId']
  const auth = tokenClaims(credential.access)?.['https://api.openai.com/auth']
  const id = auth !== null && typeof auth === 'object' ? (auth as Record<string, unknown>)['chatgpt_account_id'] : undefined
  return typeof id === 'string' && id !== '' ? id : undefined
}

/**
 * The account and user a sign-in belongs to, which survive token refreshes, hashed so
 * no part of a credential is kept. An opaque token names neither: its refresh token
 * stands in, so a refresh reads as a new account rather than two accounts reading as one.
 */
export function identityOf(credential: OAuthCredential): string {
  const account = accountIdOf(credential) ?? ''
  const subject = tokenClaims(credential.access)?.['sub']
  const user = typeof subject === 'string' ? subject : ''
  const parts = account === '' && user === '' ? ['', '', credential.refresh] : [account, user]
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex')
}

/** pi-ai reports a failed token refresh as a `ModelsError` with code `oauth`; match it without its class, which another copy defines. */
function refreshFailed(error: unknown): boolean {
  return error instanceof Error && error.name === 'ModelsError' && (error as { code?: unknown }).code === 'oauth'
}

export function createAccounts(deps: AccountDependencies): Accounts {
  return {
    async identity(provider) {
      const stored = await deps.grants.read(provider)
      return stored === undefined ? undefined : identityOf(stored)
    },

    async resolve(provider, signal) {
      const piProvider = deps.provider(provider)
      if (piProvider === undefined || await deps.grants.read(provider) === undefined) return undefined
      let seen: OAuthCredential | undefined
      // A store over this one record: pi-ai reads through it and writes a refresh back under its lock.
      const store: CredentialStore = {
        async read() {
          seen = await deps.grants.read(provider)
          return seen
        },
        async list() {
          return []
        },
        async modify(_id, mutate) {
          seen = await deps.grants.modify(provider, async (current) => {
            const next = await mutate(current)
            if (next !== undefined && next.type !== 'oauth') throw new Error('a token refresh returned something other than an account sign-in')
            return next
          })
          return seen
        },
        async delete() {
          throw new Error('reading usage never signs out')
        },
      }
      const models = createModels({ credentials: store, authContext: NO_AMBIENT })
      models.setProvider(piProvider)
      let resolved
      try {
        resolved = await models.getAuth(provider, { signal })
      } catch (error) {
        signal.throwIfAborted()
        // pi-ai keeps the sign-in after a failed refresh: an outage passes, a revoked sign-in needs a new one.
        throw new QuotaFailure({ code: refreshFailed(error) ? 'refresh-failed' : 'request-failed' })
      }
      // Use the token only when it is the stored sign-in's.
      if (seen === undefined || resolved?.auth.apiKey !== seen.access) return undefined
      const accountId = accountIdOf(seen)
      return { identity: identityOf(seen), token: seen.access, ...accountId === undefined ? {} : { accountId } }
    },
  }
}
