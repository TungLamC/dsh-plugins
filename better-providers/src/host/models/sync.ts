/**
 * Refreshing a built-in pi-ai route's model list from the newest pi-ai catalog.
 * A preview compares the models the route serves with the newest catalog; applying
 * it writes the chosen list as the route's `models`, so the route keeps serving it
 * whatever pi-ai version dsh installs. A model the installed catalog describes is
 * listed by id alone and keeps everything the catalog knows of it; a model only the
 * newest catalog has is described by what a profile can state (entry.ts). A preview
 * applies only while the route's settings are as they were when it was made.
 *
 * The ports are declared here: the newest catalog, the installed one, and the
 * route's settings.
 */

import { isDeepStrictEqual } from 'node:util'
import { randomUUID } from 'node:crypto'
import type { PiAiModelOverride, PiAiModelProfile, PiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import type { ModelThinkingLevel } from '@earendil-works/pi-ai'
import type {
  AddedModel, ApplyOutcome, CatalogChoice, CatalogPreview, PreviewModel, SkippedModel, WriteBlock,
} from '../../shared/models.wire.ts'
import { Refusal } from '../kit/refusal.ts'
import { toModelEntry } from './entry.ts'

/** One chat model of a catalog, as far as a refresh reads it; pi-ai's `Model` is one. */
export interface CatalogModel {
  id: string
  name: string
  api: string
  baseUrl: string
  reasoning: boolean
  thinkingLevelMap?: Readonly<Partial<Record<ModelThinkingLevel, string | null>>>
  input: readonly ('text' | 'image')[]
  contextWindow: number
  maxTokens: number
  compat?: object
}

/** A failed read of the newest catalog. */
export class CatalogFailure extends Error {
  readonly code: 'unreachable' | 'unknown' | 'invalid'

  constructor(code: CatalogFailure['code']) {
    super(code)
    this.code = code
  }
}

/** The newest pi-ai catalog. */
export interface RemoteCatalog {
  /**
   * The route's chat models in catalog order, and the entries too malformed to use.
   * @throws {CatalogFailure} when the catalog cannot be read.
   */
  models(provider: string, signal: AbortSignal): Promise<{ models: CatalogModel[]; invalid: { id: string; name?: string }[] }>
}

/** What the installed pi-ai catalog says of one route. */
export interface InstalledRoute {
  /** The protocol every model of the route speaks; absent when they differ. */
  api?: string
  /** The route's endpoint, which a model the catalog does not describe is sent to. */
  baseUrl?: string
  models: ReadonlyMap<string, { name: string }>
}

/** The pi-ai catalog dsh serves. */
export interface InstalledCatalog {
  /** The route, or undefined when the catalog has no chat model for it. */
  route(provider: string): InstalledRoute | undefined
}

/** One route's settings as the refresh sees them. */
export interface RouteState {
  /** The route's profile with every layer applied; undefined when none configures it. */
  profile?: PiAiProviderProfile
  /** Revision of the settings this was read at. */
  revision: number
  /** No layer of the profile holds providers yet. */
  firstWrite: boolean
  /** The route cannot be written from here. */
  blocked?: WriteBlock
}

/** Fields of a route's profile a refresh writes; null removes one. */
export interface RouteFields {
  models?: PiAiModelProfile[]
  modelOverrides?: null
  defaultMaxTokens?: number
}

/** A refused write. */
export class WriteFailure extends Error {
  readonly kind: 'conflict' | 'expression' | 'overridden' | 'rejected'

  constructor(kind: WriteFailure['kind'], detail?: string) {
    super(detail ?? kind)
    this.kind = kind
  }
}

/** The settings of pi-ai routes. */
export interface RouteSettings {
  read(provider: string): Promise<RouteState>
  /**
   * Write some fields of a route's profile, if the settings still stand at `revision`.
   * @throws {WriteFailure} when the write is refused; nothing was written then.
   */
  write(provider: string, fields: RouteFields, revision: number): Promise<void>
}

export interface SyncDependencies {
  remote: RemoteCatalog
  installed: InstalledCatalog
  settings: RouteSettings
  now?(): number
  newId?(): string
}

export interface CatalogSync {
  /**
   * Compare the route with the newest catalog.
   * @throws {Refusal} `unsupported` for a route the installed catalog has no chat model for,
   *   `catalog-unreachable` / `catalog-unknown` / `catalog-invalid` when the newest catalog cannot be read.
   */
  preview(provider: string, signal: AbortSignal): Promise<CatalogPreview>
  /**
   * Write what a preview proposes, with the added models chosen to add and the removed ones chosen to keep.
   * @throws {Refusal} `bad-choice` when the choice names a model the preview does not list there.
   */
  apply(previewId: string, choice: CatalogChoice): Promise<ApplyOutcome>
}

/** How long a preview can be applied. */
const PREVIEW_TTL_MS = 10 * 60_000
/** Previews kept at once; the oldest goes first. */
const PREVIEW_LIMIT = 8

interface Snapshot {
  provider: string
  createdAt: number
  /** The route's profile the preview was made against. */
  profile?: PiAiProviderProfile
  /** The models the route served then, in order. */
  current: PiAiModelProfile[]
  /** The route's models of the newest catalog that are not malformed, in its order. */
  remote: CatalogModel[]
  installed: InstalledRoute
  added: readonly AddedModel[]
  removed: readonly PreviewModel[]
}

function overridesOf(profile: PiAiProviderProfile | undefined): Readonly<Record<string, PiAiModelOverride>> {
  return profile?.modelOverrides ?? {}
}

/** The models a route serves: its own list, or the installed catalog with its overrides. */
function currentModels(profile: PiAiProviderProfile | undefined, installed: InstalledRoute): PiAiModelProfile[] {
  if (profile?.models !== undefined && profile.models.length > 0) return profile.models
  const overrides = overridesOf(profile)
  return [...installed.models.keys()].map(id => ({ id, ...Object.hasOwn(overrides, id) ? overrides[id] : {} }))
}

/** Whether the route can serve a model the installed catalog does not describe; why not otherwise. */
function misfit(model: CatalogModel, installed: InstalledRoute): SkippedModel['reason'] | undefined {
  if (installed.api === undefined || model.api !== installed.api) return 'api'
  if (installed.baseUrl === undefined || model.baseUrl !== installed.baseUrl) return 'endpoint'
  return undefined
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length
}

export function createCatalogSync(deps: SyncDependencies): CatalogSync {
  const now = deps.now ?? Date.now
  const newId = deps.newId ?? randomUUID
  const previews = new Map<string, Snapshot>()

  function remember(id: string, snapshot: Snapshot): void {
    for (const [key, held] of previews) if (now() - held.createdAt > PREVIEW_TTL_MS) previews.delete(key)
    previews.set(id, snapshot)
    while (previews.size > PREVIEW_LIMIT) previews.delete(previews.keys().next().value!)
  }

  async function readCatalog(provider: string, signal: AbortSignal): Promise<Awaited<ReturnType<RemoteCatalog['models']>>> {
    try {
      return await deps.remote.models(provider, signal)
    } catch (error) {
      signal.throwIfAborted()
      throw new Refusal(error instanceof CatalogFailure ? `catalog-${error.code}` : 'catalog-unreachable', provider)
    }
  }

  /** The route's new model list, or undefined when the choice changes nothing. */
  function listOf(snapshot: Snapshot, add: ReadonlySet<string>, keep: ReadonlySet<string>): PiAiModelProfile[] | undefined {
    const dropped = snapshot.removed.filter(model => !keep.has(model.id))
    if (add.size === 0 && dropped.length === 0) return undefined
    const current = new Map(snapshot.current.map(entry => [entry.id, entry]))
    const listed: PiAiModelProfile[] = []
    for (const model of snapshot.remote) {
      const entry = current.get(model.id)
      if (entry !== undefined) listed.push(entry)
      else if (add.has(model.id)) listed.push(snapshot.installed.models.has(model.id) ? { id: model.id } : toModelEntry(model))
    }
    const gone = new Set(snapshot.removed.map(model => model.id))
    for (const entry of snapshot.current) if (gone.has(entry.id) && keep.has(entry.id)) listed.push(entry)
    return listed
  }

  /**
   * The output capability of the listed models the installed catalog does not describe: the smallest
   * the newest catalog gives any of them, since the route states one for all (a model's own would
   * become its request default).
   */
  function capabilityOf(snapshot: Snapshot, listed: readonly PiAiModelProfile[]): number | undefined {
    const remote = new Map(snapshot.remote.map(model => [model.id, model]))
    const sizes = listed.flatMap(entry => {
      const model = remote.get(entry.id)
      return model === undefined || snapshot.installed.models.has(entry.id) ? [] : [model.maxTokens]
    })
    return sizes.length === 0 ? undefined : Math.min(...sizes)
  }

  return {
    async preview(provider, signal) {
      const installed = deps.installed.route(provider)
      if (installed === undefined) throw new Refusal('unsupported', provider)
      const catalog = await readCatalog(provider, signal)
      const state = await deps.settings.read(provider)
      const current = currentModels(state.profile, installed)
      const listed = new Map(current.map(entry => [entry.id, entry]))
      const nameOf = (id: string): string => listed.get(id)?.name ?? installed.models.get(id)?.name ?? id

      const remote: CatalogModel[] = []
      const added: AddedModel[] = []
      const unchanged: PreviewModel[] = []
      const skipped: SkippedModel[] = []
      const seen = new Set<string>()
      for (const model of catalog.models) {
        if (seen.has(model.id)) continue
        seen.add(model.id)
        if (listed.has(model.id)) {
          remote.push(model)
          unchanged.push({ id: model.id, name: model.name })
          continue
        }
        const known = installed.models.has(model.id)
        const reason = known ? undefined : misfit(model, installed)
        if (reason !== undefined) {
          skipped.push({ id: model.id, name: model.name, reason })
          continue
        }
        remote.push(model)
        added.push({ id: model.id, name: model.name, inherited: known })
      }
      for (const model of catalog.invalid) {
        if (seen.has(model.id)) continue
        seen.add(model.id)
        // A malformed entry cannot be added, but it says the model is still offered.
        if (listed.has(model.id)) unchanged.push({ id: model.id, name: nameOf(model.id) })
        else skipped.push({ id: model.id, ...model.name === undefined ? {} : { name: model.name }, reason: 'invalid' })
      }
      const removed = current.filter(entry => !seen.has(entry.id)).map(entry => ({ id: entry.id, name: nameOf(entry.id) }))

      const id = newId()
      remember(id, {
        provider, createdAt: now(), current, remote, installed, added, removed,
        ...state.profile === undefined ? {} : { profile: structuredClone(state.profile) },
      })
      return {
        id, provider, added, removed, unchanged, skipped, firstWrite: state.firstWrite,
        ...state.blocked === undefined ? {} : { blocked: state.blocked },
      }
    },

    async apply(previewId, choice) {
      const snapshot = previews.get(previewId)
      if (snapshot === undefined || now() - snapshot.createdAt > PREVIEW_TTL_MS) {
        previews.delete(previewId)
        return { status: 'expired' }
      }
      const addable = new Set(snapshot.added.map(model => model.id))
      const keepable = new Set(snapshot.removed.map(model => model.id))
      if (!unique(choice.add) || !unique(choice.keep) || !choice.add.every(id => addable.has(id)) || !choice.keep.every(id => keepable.has(id))) {
        throw new Refusal('bad-choice')
      }
      const listed = listOf(snapshot, new Set(choice.add), new Set(choice.keep))
      if (listed === undefined) return { status: 'unchanged' }

      const state = await deps.settings.read(snapshot.provider)
      if (!isDeepStrictEqual(state.profile, snapshot.profile)) {
        previews.delete(previewId)
        return { status: 'stale' }
      }
      if (state.blocked !== undefined) return { status: 'blocked', reason: state.blocked }
      const capability = capabilityOf(snapshot, listed)
      const fields: RouteFields = {
        // A models list cannot stand beside overrides; the overrides are already folded into its entries.
        ...Object.keys(overridesOf(snapshot.profile)).length > 0 ? { modelOverrides: null } : {},
        models: listed,
        ...capability === undefined ? {} : { defaultMaxTokens: capability },
      }
      try {
        await deps.settings.write(snapshot.provider, fields, state.revision)
      } catch (error) {
        if (!(error instanceof WriteFailure)) throw error
        switch (error.kind) {
          case 'conflict':
            previews.delete(previewId)
            return { status: 'stale' }
          case 'expression':
          case 'overridden':
            return { status: 'blocked', reason: error.kind }
          case 'rejected':
            return { status: 'rejected', detail: error.message }
        }
      }
      previews.delete(previewId)
      return { status: 'applied' }
    },
  }
}
