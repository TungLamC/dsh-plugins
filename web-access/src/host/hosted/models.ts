/**
 * Which model a hosted tier searches with when none is chosen on the settings
 * page. It searches and writes a short cited answer, so a fast, low-cost model
 * does: within the preferred kind, the newest version, a stable release before
 * a preview.
 *
 * The preference for OpenAI models follows pi-web-access 0.46.0
 * (`openai-search.ts`), Copyright (c) 2025 Nico Bailon, MIT License; see THIRD_PARTY_NOTICES.md.
 */

import type { ModelChoice } from '../../shared/web-access.wire.ts'

interface Preference {
  /** The model family's ids and their version, e.g. `gpt-6.1` → 6.1; undefined for another family. */
  version(id: string): number | undefined
  /** Name segments of models that never search: price tiers above the standard one, and non-chat models. */
  excluded: ReadonlySet<string>
  /** Kinds in order of preference; a model of none of them ranks last. */
  kinds: readonly ((id: string) => boolean)[]
}

function versionAfter(prefix: string): (id: string) => number | undefined {
  const pattern = new RegExp(`^${prefix}-(\\d+(?:\\.\\d+)?)(?:-|$)`)
  return (id) => {
    const match = pattern.exec(id)
    return match === null ? undefined : Number(match[1])
  }
}

function pick(models: readonly ModelChoice[], preference: Preference): ModelChoice | undefined {
  const rank = (id: string): number => {
    const kind = preference.kinds.findIndex(matches => matches(id))
    return kind === -1 ? preference.kinds.length : kind
  }
  const preview = (id: string): number => /(?:^|-)(?:preview|exp|experimental)(?:-|$)/.test(id) ? 1 : 0
  return models
    .filter(model => preference.version(model.id) !== undefined && !model.id.split('-').some(segment => preference.excluded.has(segment)))
    .sort((a, b) => rank(a.id) - rank(b.id)
      || preference.version(b.id)! - preference.version(a.id)!
      || preview(a.id) - preview(b.id)
      || a.id.length - b.id.length
      || a.id.localeCompare(b.id))[0]
}

const GPT: Preference = {
  version: versionAfter('gpt'),
  excluded: new Set(['pro', 'ultra', 'image', 'audio', 'realtime', 'search', 'transcribe', 'tts']),
  // The low-cost luna line, then a mainline model such as `gpt-5.5`.
  kinds: [id => id.split('-').includes('luna'), id => /^gpt-\d+(?:\.\d+)?$/.test(id)],
}

const GEMINI: Preference = {
  version: versionAfter('gemini'),
  excluded: new Set(['image', 'tts', 'audio', 'live', 'native', 'embedding', 'robotics', 'computer']),
  kinds: [id => id.includes('-flash') && !id.includes('-lite'), id => id.includes('-flash'), id => id.includes('-pro')],
}

/** The model for the Codex and OpenAI tiers. */
export function pickGptModel(models: readonly ModelChoice[]): ModelChoice | undefined {
  return pick(models, GPT)
}

/** The model for the Gemini tier. */
export function pickGeminiModel(models: readonly ModelChoice[]): ModelChoice | undefined {
  return pick(models, GEMINI)
}
