/**
 * A catalog model as a `models` entry of a route's profile, for a model the
 * installed catalog does not describe. The entry states what llm-pi-ai lets a
 * profile state: name, context window, modalities, reasoning efforts, and the
 * compatibility switches dsh offers for the model's protocol. The output limit
 * is left to the route (a model's own would become its request default). What no
 * entry can carry (pricing, input limits, the switches dsh withholds) the model
 * goes without until an installed catalog describes it.
 */

import type { PiAiModelProfile, PiAiReasoningEfforts } from '@deepseek-ai/dsh-llm-pi-ai'
import type { ModelThinkingLevel } from '@earendil-works/pi-ai'
import type { CatalogModel } from './sync.ts'

const RESPONSES = ['supportsDeveloperRole', 'supportsMaxOutputTokens', 'supportsStrictMode', 'supportsLongCacheRetention'] as const

/**
 * The compatibility switches llm-pi-ai lets a profile set, by protocol; a protocol
 * absent here takes none. Mirrors llm-pi-ai's compat gates, which a contract test
 * checks against the real package.
 */
export const OFFERED_COMPAT: Readonly<Partial<Record<string, readonly string[]>>> = {
  'openai-completions': [
    'supportsStore', 'supportsDeveloperRole', 'supportsReasoningEffort', 'supportsUsageInStreaming', 'supportsFinishReason',
    'maxTokensField', 'requiresToolResultName', 'requiresAssistantAfterToolResult', 'requiresThinkingAsText',
    'requiresReasoningContentOnAssistantMessages', 'thinkingFormat', 'chatTemplateKwargs', 'chatTemplateArgs',
    'supportsThinkingTokenBudget', 'thinkingTokenBudgetField', 'vllmPriority', 'supportsStrictMode', 'cacheControlFormat',
    'supportsLongCacheRetention',
  ],
  'openai-responses': RESPONSES,
  'azure-openai-responses': RESPONSES,
  'openai-codex-responses': RESPONSES,
  'anthropic-messages': [
    'supportsEagerToolInputStreaming', 'supportsLongCacheRetention', 'supportsCacheControlOnTools', 'supportsTemperature',
    'forceAdaptiveThinking', 'allowEmptySignature', 'supportsStrictTools',
  ],
  'bedrock-converse-stream': ['supportsStrictMode'],
}

/** pi-ai's thinking levels, in escalation order. */
const LEVELS: readonly ModelThinkingLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

/**
 * The levels a model offers with the value each sends, as a profile declares them.
 * pi-ai reads its level map asymmetrically: null rules a level out, and an absent
 * key means "send the level's own name" for the base levels but "not offered" for
 * `xhigh` and `max`. `off` sends its mapped value, or nothing when it has none.
 * @returns false for a model that does not reason, or offers no level beyond `off`.
 */
export function reasoningEfforts(model: Pick<CatalogModel, 'reasoning' | 'thinkingLevelMap'>): false | PiAiReasoningEfforts {
  if (!model.reasoning) return false
  const map = model.thinkingLevelMap ?? {}
  const efforts: PiAiReasoningEfforts = {}
  for (const level of LEVELS) {
    const mapped = Object.hasOwn(map, level) ? map[level] : undefined
    if (mapped === null) continue
    if ((level === 'xhigh' || level === 'max') && mapped === undefined) continue
    efforts[level] = level === 'off' ? mapped ?? null : mapped ?? level
  }
  return Object.keys(efforts).some(level => level !== 'off') ? efforts : false
}

/** The entry for a model the installed catalog does not describe. */
export function toModelEntry(model: CatalogModel): PiAiModelProfile {
  const offered = new Set(OFFERED_COMPAT[model.api] ?? [])
  const compat = Object.fromEntries(Object.entries(model.compat ?? {}).filter(([field, value]) => offered.has(field) && value !== undefined && value !== null))
  return {
    id: model.id,
    name: model.name,
    contextWindow: model.contextWindow,
    input: [...model.input],
    reasoningEfforts: reasoningEfforts(model),
    ...Object.keys(compat).length > 0 ? { compat: compat as PiAiModelProfile['compat'] } : {},
  }
}
