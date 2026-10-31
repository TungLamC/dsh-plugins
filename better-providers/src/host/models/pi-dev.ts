/**
 * The newest pi-ai catalog as pi.dev publishes it: `GET /api/models/providers/<id>`
 * answers the route's models keyed by id, each a pi-ai `Model`. Entries are read
 * leniently: one that lacks what a refresh needs is reported as invalid rather
 * than failing the whole catalog, and models of other kinds (image, classifier)
 * are left out.
 */

import type { ModelThinkingLevel } from '@earendil-works/pi-ai'
import { CATALOG_SOURCE } from '../../shared/models.wire.ts'
import { CatalogFailure, type CatalogModel, type RemoteCatalog } from './sync.ts'

const BASE = `https://${CATALOG_SOURCE}`
const TIMEOUT_MS = 30_000
const LEVELS: ReadonlySet<string> = new Set<ModelThinkingLevel>(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
const MODALITIES: ReadonlySet<string> = new Set(['text', 'image'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function size(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined
}

function levelMap(value: unknown): CatalogModel['thinkingLevelMap'] | null | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) return null
  const map: Partial<Record<ModelThinkingLevel, string | null>> = {}
  for (const [level, mapped] of Object.entries(value)) {
    if (!LEVELS.has(level) || (mapped !== null && text(mapped) === undefined)) return null
    map[level as ModelThinkingLevel] = mapped as string | null
  }
  return map
}

/** One catalog entry as a model, or undefined when it lacks what a refresh needs. */
function modelOf(id: string, raw: Record<string, unknown>): CatalogModel | undefined {
  const name = text(raw['name'])
  const api = text(raw['api'])
  const baseUrl = text(raw['baseUrl'])
  const contextWindow = size(raw['contextWindow'])
  const maxTokens = size(raw['maxTokens'])
  const input = Array.isArray(raw['input']) && raw['input'].length > 0 && raw['input'].every(item => typeof item === 'string' && MODALITIES.has(item))
    ? raw['input'] as CatalogModel['input']
    : undefined
  const thinkingLevelMap = levelMap(raw['thinkingLevelMap'])
  if (raw['id'] !== id || name === undefined || api === undefined || baseUrl === undefined || contextWindow === undefined
    || maxTokens === undefined || input === undefined || typeof raw['reasoning'] !== 'boolean' || thinkingLevelMap === null) return undefined
  if (raw['compat'] !== undefined && !isRecord(raw['compat'])) return undefined
  return {
    id, name, api, baseUrl, reasoning: raw['reasoning'], input, contextWindow, maxTokens,
    ...thinkingLevelMap === undefined ? {} : { thinkingLevelMap },
    ...raw['compat'] === undefined ? {} : { compat: raw['compat'] },
  }
}

export function piDevCatalog(fetch: typeof globalThis.fetch): RemoteCatalog {
  return {
    async models(provider, signal) {
      let response: Response
      try {
        response = await fetch(`${BASE}/${encodeURIComponent(provider)}`, {
          redirect: 'error',
          headers: { accept: 'application/json' },
          signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
        })
      } catch {
        throw new CatalogFailure('unreachable')
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined)
        throw new CatalogFailure(response.status === 404 ? 'unknown' : 'unreachable')
      }
      let body: unknown
      try {
        body = await response.json()
      } catch {
        throw new CatalogFailure('invalid')
      }
      if (!isRecord(body)) throw new CatalogFailure('invalid')
      const models: CatalogModel[] = []
      const invalid: { id: string; name?: string }[] = []
      for (const [id, raw] of Object.entries(body)) {
        if (!isRecord(raw)) {
          invalid.push({ id })
          continue
        }
        if (raw['type'] !== undefined && raw['type'] !== 'chat') continue
        const model = modelOf(id, raw)
        if (model !== undefined) {
          models.push(model)
          continue
        }
        const name = text(raw['name'])
        invalid.push({ id, ...name === undefined ? {} : { name } })
      }
      return { models, invalid }
    },
  }
}
