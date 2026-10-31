import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { reasoningEfforts, toModelEntry } from '../../../src/host/models/entry.ts'
import type { CatalogModel } from '../../../src/host/models/sync.ts'

const catalog = (route: string): Record<string, CatalogModel> =>
  JSON.parse(readFileSync(new URL(`../../fixtures/pi-dev/${route}.json`, import.meta.url), 'utf8')) as Record<string, CatalogModel>

describe('reasoningEfforts', () => {
  it('declares a model that does not reason as such', () => {
    expect(reasoningEfforts({ reasoning: false, thinkingLevelMap: { high: 'high' } })).toBe(false)
  })

  it('offers the base levels by their own names and off as sending nothing when the map is silent', () => {
    expect(reasoningEfforts({ reasoning: true })).toEqual({ off: null, minimal: 'minimal', low: 'low', medium: 'medium', high: 'high' })
  })

  it('offers xhigh and max only when mapped, and leaves out levels mapped to null', () => {
    expect(reasoningEfforts({ reasoning: true, thinkingLevelMap: { xhigh: 'xhigh', max: 'max', minimal: 'low' } })).toEqual({
      off: null, minimal: 'low', low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max',
    })
    expect(reasoningEfforts({ reasoning: true, thinkingLevelMap: { off: null, minimal: null, low: 'low', medium: null, high: 'high', xhigh: null, max: 'max' } }))
      .toEqual({ low: 'low', high: 'high', max: 'max' })
  })

  it('sends what off is mapped to', () => {
    expect(reasoningEfforts({ reasoning: true, thinkingLevelMap: { off: 'none' } })).toMatchObject({ off: 'none' })
  })

  it('treats a model offering nothing beyond off as one that does not reason', () => {
    const none = { off: 'none', minimal: null, low: null, medium: null, high: null }
    expect(reasoningEfforts({ reasoning: true, thinkingLevelMap: none })).toBe(false)
  })
})

describe('toModelEntry', () => {
  it('states what a profile can, keeping only the switches dsh offers for the protocol', () => {
    expect(toModelEntry(catalog('kimi-coding')['k3.1-pro']!)).toEqual({
      id: 'k3.1-pro',
      name: 'Kimi K3.1 Pro',
      contextWindow: 1_048_576,
      input: ['text', 'image'],
      reasoningEfforts: { low: 'low', high: 'high', max: 'max' },
      // supportsMidConvoSystemMessages and supportsMidConvoToolAdditions are withheld.
      compat: {
        supportsStrictMode: false,
        supportsStore: false,
        supportsDeveloperRole: false,
        supportsReasoningEffort: true,
        maxTokensField: 'max_tokens',
        thinkingFormat: 'openai',
        requiresReasoningContentOnAssistantMessages: true,
      },
    })
  })

  it('never states the output limit, which would become the request default', () => {
    expect(toModelEntry(catalog('openai-codex')['gpt-6.1-terra']!)).not.toHaveProperty('maxTokens')
  })

  it('leaves out compat when the protocol offers none of the switches', () => {
    expect(toModelEntry({ ...catalog('openai-codex')['gpt-6.1-terra']!, compat: { supportsToolSearch: true } })).not.toHaveProperty('compat')
  })

  it('declares a model that does not reason', () => {
    const model: CatalogModel = {
      id: 'm', name: 'M', api: 'openai-completions', baseUrl: 'https://example.test/v1', reasoning: false, input: ['text'], contextWindow: 1000, maxTokens: 100,
    }
    expect(toModelEntry(model)).toEqual({ id: 'm', name: 'M', contextWindow: 1000, input: ['text'], reasoningEfforts: false })
  })
})
