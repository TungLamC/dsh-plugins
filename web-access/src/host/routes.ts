/**
 * The hosted tiers reach a provider the way dsh's llm-pi-ai reaches it for chat:
 * through a route on the Models page, with that route's endpoint, headers,
 * models, and key or sign-in, read afresh at every search.
 *
 * Credentials resolve in llm-pi-ai's order. A route's `apiKeyEnv` names a
 * credential reference that wins outright. Otherwise pi-ai resolves the
 * provider's own auth: the route's stored record `llm-pi-ai/<route>` (an API
 * key or an account sign-in) or the provider's environment variables. An
 * expiring sign-in is refreshed by pi-ai inside the credential service's write
 * lock, exactly as llm-pi-ai refreshes it before a model request, so the two
 * never rotate one token at once.
 */

import { credentialKey, credentialRef, isCredentialKeySegment, isCredentialRefName } from '@deepseek-ai/dsh-credentials'
import type { CredentialProvider, CredentialRecord } from '@deepseek-ai/dsh-credentials'
import type { LlmRuntime } from '@deepseek-ai/dsh-llm'
import { createModels } from '@earendil-works/pi-ai/models'
import type { AuthContext, Credential, CredentialStore, Provider } from '@earendil-works/pi-ai'
import type { ModelChoice } from '../shared/web-access.wire.ts'
import { describeError, isObject } from './kit/http.ts'

/** llm-pi-ai's settings namespace, which is also the scope of its credential records. */
export const PI_AI = 'llm-pi-ai'

export type RouteCredentials = Pick<CredentialProvider, 'readRecord' | 'modifyRecord' | 'resolve'>
export type RouteCatalog = Pick<LlmRuntime, 'listModels' | 'resolveModelInfo'>

export interface RouteDependencies {
  /** llm-pi-ai's `providers` setting; undefined without the settings service. */
  providers(): Readonly<Record<string, unknown>> | undefined
  /** dsh's credential service; undefined in compositions without one. */
  credentials(): RouteCredentials | undefined
  /** dsh's model service; undefined without one. */
  llm(): RouteCatalog | undefined
  /** The pi-ai provider a route is built on. */
  piProvider(route: string): Provider | undefined
  /** A launch environment variable, read when there is no credential service. */
  env(name: string): string | undefined
}

/** A route ready to call. */
export interface Route {
  /** The route's `baseURL`, else the one its sign-in names, else pi-ai's for the provider. */
  baseUrl: string
  /** The API key or access token. */
  token: string
  /** The route's own headers, then any its sign-in adds. */
  headers: Readonly<Record<string, string>>
  /** The models the route serves, in dsh's order. */
  models: readonly ModelChoice[]
  /** The reasoning efforts the route offers for one of its models; empty when it offers none or cannot tell. */
  efforts(model: string, signal: AbortSignal): Promise<readonly string[]>
}

export interface Routes {
  /** The models a route serves; undefined when the Models page has no such route. */
  models(route: string): Promise<readonly ModelChoice[] | undefined>
  /**
   * The route with its credential. Undefined when the Models page has no such
   * route, or nothing signs it in; throws when it names a credential that is not
   * set or its sign-in cannot be refreshed.
   */
  open(route: string, signal: AbortSignal): Promise<Route | undefined>
}

/** pi-ai's view of a stored record, as llm-pi-ai keeps them: an `api-key` record, or a grant holding pi-ai's credential verbatim. */
function toPiCredential(record: CredentialRecord | undefined): Credential | undefined {
  if (record === undefined) return undefined
  if (record.kind === 'api-key') return { type: 'api_key', ...record.key === undefined ? {} : { key: record.key }, ...record.env === undefined ? {} : { env: { ...record.env } } }
  return record.payload as Credential
}

function toRecord(credential: Credential): CredentialRecord {
  if (credential.type === 'api_key') return { kind: 'api-key', ...credential.key === undefined ? {} : { key: credential.key }, ...credential.env === undefined ? {} : { env: { ...credential.env } } }
  // The store takes JSON: members pi-ai leaves undefined are dropped.
  return { kind: 'grant', payload: JSON.parse(JSON.stringify(credential)) as object }
}

/** pi-ai reports a failed token refresh as a `ModelsError` with code `oauth`; matched without the class, which another pi-ai copy defines. */
function refreshFailed(error: unknown): boolean {
  return error instanceof Error && error.name === 'ModelsError' && (error as { code?: unknown }).code === 'oauth'
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isObject(value)) return {}
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

export function createRoutes(deps: RouteDependencies): Routes {
  const profileOf = (route: string): Record<string, unknown> | undefined => {
    const profile = deps.providers()?.[route]
    return isObject(profile) ? profile : undefined
  }

  async function modelsOf(route: string): Promise<ModelChoice[]> {
    const llm = deps.llm()
    if (llm === undefined) return []
    try {
      return (await llm.listModels(route)).map(model => ({ id: model.id, name: model.name }))
    } catch {
      // A route llm-pi-ai has not registered (yet) serves nothing.
      return []
    }
  }

  /** A credential reference's value, or a launch environment variable's without a credential service. */
  async function lookup(name: string): Promise<string | undefined> {
    const credentials = deps.credentials()
    if (credentials === undefined) return nonEmpty(deps.env(name))
    if (!isCredentialRefName(name)) return undefined
    return nonEmpty((await credentials.resolve(credentialRef(name)))?.value)
  }

  /** A pi-ai credential store over the route records llm-pi-ai keeps; a search reads them and writes back only a refresh. */
  function recordStore(): CredentialStore {
    const keyOf = (id: string) => credentialKey(PI_AI, id)
    return {
      async read(id) {
        const credentials = deps.credentials()
        if (credentials === undefined || !isCredentialKeySegment(id)) return undefined
        return toPiCredential(await credentials.readRecord(keyOf(id)))
      },
      async list() {
        return []
      },
      async modify(id, mutate) {
        const credentials = deps.credentials()
        if (credentials === undefined) throw new Error('there is no credential service to store a refreshed sign-in in')
        const stored = await credentials.modifyRecord(keyOf(id), async (current) => {
          const next = await mutate(toPiCredential(current))
          return next === undefined ? undefined : toRecord(next)
        })
        return toPiCredential(stored)
      },
      async delete() {
        throw new Error('a web search never signs out')
      },
    }
  }

  const authContext: AuthContext = {
    env: lookup,
    // None of the providers the hosted tiers use authenticate from a file.
    fileExists: async () => false,
  }

  /** The route's key: its `apiKeyEnv` reference, else what pi-ai resolves for the provider; undefined when nothing signs it in. */
  async function authenticate(route: string, profile: Record<string, unknown>, provider: Provider, signal: AbortSignal) {
    const ref = nonEmpty(profile['apiKeyEnv'])
    if (ref !== undefined) {
      const key = await lookup(ref)
      if (key === undefined) throw new Error(`the route's credential ${ref} is not set`)
      return { token: key, headers: {}, baseUrl: undefined }
    }
    const models = createModels({ credentials: recordStore(), authContext })
    models.setProvider(provider)
    let resolved
    try {
      resolved = await models.getAuth(route, { signal })
    } catch (error) {
      signal.throwIfAborted()
      // pi-ai keeps the sign-in after a failed refresh: an outage passes, a revoked sign-in needs a new one.
      throw new Error(refreshFailed(error) ? 'the sign-in could not be refreshed; sign in again if this persists' : `the credential could not be read: ${describeError(error)}`)
    }
    const token = nonEmpty(resolved?.auth.apiKey)
    if (resolved === undefined || token === undefined) return undefined
    return { token, headers: stringRecord(resolved.auth.headers), baseUrl: nonEmpty(resolved.auth.baseUrl) }
  }

  return {
    async models(route) {
      return profileOf(route) === undefined ? undefined : modelsOf(route)
    },

    async open(route, signal) {
      const profile = profileOf(route)
      const provider = deps.piProvider(route)
      if (profile === undefined || provider === undefined) return undefined
      const auth = await authenticate(route, profile, provider, signal)
      if (auth === undefined) return undefined
      const baseUrl = nonEmpty(profile['baseURL']) ?? auth.baseUrl ?? nonEmpty(provider.baseUrl)
      if (baseUrl === undefined) throw new Error('the route names no endpoint')
      return {
        baseUrl: baseUrl.replace(/\/+$/, ''),
        token: auth.token,
        headers: { ...stringRecord(profile['headers']), ...auth.headers },
        models: await modelsOf(route),
        async efforts(model, effortSignal) {
          try {
            const info = await deps.llm()?.resolveModelInfo(route, model, effortSignal)
            return info?.reasoning?.efforts.map(effort => effort.id) ?? []
          } catch {
            return []
          }
        },
      }
    },
  }
}
