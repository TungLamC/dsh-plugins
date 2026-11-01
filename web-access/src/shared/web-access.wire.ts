/** The row's Remote contract: the models each hosted tier can search with, for the settings page's choices. */

import type { RemoteResult, TypertRemoteNamespace } from '@deepseek-ai/dsh-typert-protocol'
import { PACKAGE, SERVICE, type HostedTier } from './ids.ts'
import { defineRemote } from './remote.ts'

/** One model a route serves, as dsh's model selector names it. */
export interface ModelChoice {
  id: string
  name: string
}

/** Each hosted tier's models; null when the Models page has no route for it. */
export type SearchModels = Readonly<Record<HostedTier, readonly ModelChoice[] | null>>

export const WEB_ACCESS_REMOTE = defineRemote(PACKAGE, SERVICE, {
  searchModels: { params: [] },
})

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteMap {
    'webAccess/searchModels': () => Promise<RemoteResult<SearchModels>>
  }
  interface TypertRemoteNamespaceMap {
    webAccess: TypertRemoteNamespace<'webAccess'>
  }
}

/** The browser-side handle of the namespace. */
export type WebAccessRemote = TypertRemoteNamespace<'webAccess'>
