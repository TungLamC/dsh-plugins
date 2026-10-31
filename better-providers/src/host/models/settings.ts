/**
 * The settings of pi-ai routes over dsh's settings service, which writes them into
 * the profile through the configuration editor. The editor writes the entry's
 * whole configuration, so the first write copies every route the profile inherits;
 * llm-pi-ai checks every changed route before anything is written.
 *
 * A route's profile is read as configured, every layer composed but nothing
 * resolved: that is what a write merges into, and the resolved form fills in
 * defaults (empty modalities and compat on every model) that would then be
 * written back.
 *
 * Two things make a write go wrong rather than fail: an `!!js` expression where a
 * field is written would get the field merged into the expression, so such a
 * route is refused before trying; and a home patch that overrides the entry makes
 * the editor refuse, which is reported as such.
 */

import type { PiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import type { SettingsForms, SettingsPathOp } from '@deepseek-ai/dsh-settings'
import { PI_AI } from '../../shared/ids.ts'
import { Refusal } from '../kit/refusal.ts'
import { WriteFailure, type RouteFields, type RouteSettings } from './sync.ts'

/** The configuration editor's view of the profile's entries, with `!!js` expressions unevaluated. */
export interface ConfigEntries {
  entries(): readonly { options: { id: string; config?: unknown } }[]
}

export interface SettingsDependencies {
  settings: Pick<SettingsForms, 'describe' | 'mutate'>
  editor: ConfigEntries
}

const FIELDS = ['modelOverrides', 'models', 'defaultMaxTokens'] as const satisfies readonly (keyof RouteFields)[]

function member(node: unknown, key: string): unknown {
  return node !== null && typeof node === 'object' && !Array.isArray(node) && Object.hasOwn(node, key) ? (node as Record<string, unknown>)[key] : undefined
}

/** How the loader keeps an unevaluated `!!js` value. */
function isExpression(node: unknown): boolean {
  return node !== null && typeof node === 'object' && Object.keys(node).length === 1 && typeof member(node, '__jsExpr') === 'string'
}

export function routeSettings(deps: SettingsDependencies): RouteSettings {
  /** The llm-pi-ai entry's configuration as composed from the profile's layers. */
  function configured(): unknown {
    return deps.editor.entries().find(entry => entry.options.id === PI_AI)?.options.config
  }

  /** Whether an expression stands where a write to the route lands. */
  function expressionAt(root: unknown, provider: string): boolean {
    const providers = member(root, 'providers')
    const profile = member(providers, provider)
    return [root, providers, profile, ...FIELDS.map(field => member(profile, field))].some(isExpression)
  }

  function descriptor() {
    const found = deps.settings.describe().find(entry => entry.ns === PI_AI)
    // llm-pi-ai is not running, so nothing serves the route.
    if (found === undefined) throw new Refusal('unsupported')
    return found
  }

  return {
    async read(provider) {
      const { user, revision } = descriptor()
      const root = configured()
      const profile = member(member(root, 'providers'), provider) as PiAiProviderProfile | undefined
      return {
        ...profile === undefined ? {} : { profile: structuredClone(profile) },
        revision,
        firstWrite: member(user, 'providers') === undefined,
        ...expressionAt(root, provider) ? { blocked: 'expression' as const } : {},
      }
    },

    async write(provider, fields, revision) {
      if (expressionAt(configured(), provider)) throw new WriteFailure('expression')
      const ops: SettingsPathOp[] = FIELDS.flatMap((field): SettingsPathOp[] => {
        const value = fields[field]
        if (value === undefined) return []
        const path = ['providers', provider, field]
        return [value === null ? { op: 'unset', path } : { op: 'set', path, value }]
      })
      try {
        await deps.settings.mutate(PI_AI, ops, revision)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        // The settings service's own class may be another copy's: match its stable code.
        if ((error as { code?: unknown } | null)?.code === 'SETTINGS_CONFLICT') throw new WriteFailure('conflict', message)
        if (message.includes('overridden by a home patch')) throw new WriteFailure('overridden', message)
        throw new WriteFailure('rejected', message)
      }
    },
  }
}
