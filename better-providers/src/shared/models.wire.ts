/**
 * The models row's Remote contract: refresh a built-in pi-ai route's model list
 * from the newest pi-ai catalog. A preview lists what changed; applying it writes
 * the chosen list into the route's settings.
 */

import { z } from 'zod'
import type { RemoteResult, TypertRemoteNamespace } from '@deepseek-ai/dsh-typert-protocol'
import { MODULE, modelId, providerId, SERVICE } from './ids.ts'
import { defineRemote } from './remote.ts'

/** Where a route's models are read from: `https://<source>/<route>` answers pi-ai's newest catalog of it. */
export const CATALOG_SOURCE = 'pi.dev/api/models/providers'

export interface PreviewModel {
  id: string
  name: string
}

export interface AddedModel extends PreviewModel {
  /** The installed catalog describes it, so it keeps everything the catalog knows. */
  inherited: boolean
}

/** Why a model of the newest catalog cannot be added to the route. */
export type SkipReason = 'api' | 'endpoint' | 'invalid'

export interface SkippedModel {
  id: string
  name?: string
  reason: SkipReason
}

/** Why the route's settings cannot be written from here. */
export type WriteBlock = 'expression' | 'overridden'

export interface CatalogPreview {
  /** Names this preview when it is applied. */
  id: string
  provider: string
  /** In the newest catalog, not on the route. */
  added: AddedModel[]
  /** On the route, gone from the newest catalog. */
  removed: PreviewModel[]
  unchanged: PreviewModel[]
  skipped: SkippedModel[]
  /** No settings of this profile hold providers yet: writing copies every shared route into the profile. */
  firstWrite: boolean
  blocked?: WriteBlock
}

/** Which of a preview's changes to make: the added models to add and the removed ones to keep. */
export interface CatalogChoice {
  add: string[]
  keep: string[]
}

export type ApplyOutcome =
  | { status: 'applied' }
  /** The choice leaves the route as it is; nothing was written. */
  | { status: 'unchanged' }
  /** The route changed since the preview, or the preview is gone: preview again. */
  | { status: 'stale' }
  | { status: 'expired' }
  | { status: 'blocked'; reason: WriteBlock }
  /** dsh refused the new settings; `detail` is its message. */
  | { status: 'rejected'; detail: string }

/** Reasons a models request is refused (the bad-request message). */
export type ModelsRefusal =
  | 'bad-provider' | 'unsupported' | 'pi-ai-mismatch' | 'bad-choice'
  | 'catalog-unreachable' | 'catalog-unknown' | 'catalog-invalid'

const ids = z.array(modelId).max(1000)

export const MODELS_REMOTE = defineRemote(MODULE.models, SERVICE.models, {
  preview: { params: [['provider', providerId]], signal: true },
  apply: { params: [['previewId', z.uuid()], ['choice', z.strictObject({ add: ids, keep: ids })]] },
})

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteMap {
    /** Compare the route with the newest catalog. */
    'betterProvidersModels/preview': (provider: string, signal?: AbortSignal) => Promise<RemoteResult<CatalogPreview>>
    'betterProvidersModels/apply': (previewId: string, choice: CatalogChoice) => Promise<RemoteResult<ApplyOutcome>>
  }
  interface TypertRemoteNamespaceMap {
    betterProvidersModels: TypertRemoteNamespace<'betterProvidersModels'>
  }
}

/** The browser-side handle of the namespace. */
export type ModelsRemote = TypertRemoteNamespace<'betterProvidersModels'>
