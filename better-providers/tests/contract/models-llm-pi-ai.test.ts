/**
 * The model refresh against the real llm-pi-ai: every list it writes passes the
 * check llm-pi-ai runs before dsh writes its settings, and the compatibility
 * switches it carries over are exactly the ones llm-pi-ai lets a profile set.
 * The installed catalog is the real pi-ai the workspace pins; the newest is the
 * pi.dev fixtures.
 */

import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { Context, resolveConfig } from '@deepseek-ai/cordis'
import * as llmPiAi from '@deepseek-ai/dsh-llm-pi-ai'
import type { PiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import { builtinProviders, getBuiltinModels } from '@earendil-works/pi-ai/providers/all'
import { OFFERED_COMPAT } from '../../src/host/models/entry.ts'
import { installedCatalog } from '../../src/host/models/local.ts'
import { piDevCatalog } from '../../src/host/models/pi-dev.ts'
import { createCatalogSync, WriteFailure, type RouteSettings } from '../../src/host/models/sync.ts'

const cleanup: (() => unknown)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })

type Providers = Record<string, PiAiProviderProfile>

/** llm-pi-ai's check of a new configuration, as the configuration editor runs it before writing. */
async function piAiCheck(): Promise<(providers: Providers) => void> {
  const ctx = new Context()
  cleanup.push(() => ctx.fiber.dispose())
  ctx.reflect.provide('llm', {
    registerConfigurableProviders: () => ({ replace() {}, dispose() {} }),
    registerModelDiscovery: () => () => {},
    registerAdapter: () => ({ replace() {}, dispose() {} }),
  })
  const fiber = await ctx.plugin(llmPiAi, { providers: {} })
  return (providers) => {
    const next = { providers: structuredClone(providers) }
    const resolved = fiber.ctx.waterfall(fiber, 'internal/config', next, () => next)
    resolveConfig(fiber.runtime!, resolved)
  }
}

/** Route settings held in memory, written only when llm-pi-ai accepts them. */
function checkedSettings(check: (providers: Providers) => void, providers: Providers = {}): RouteSettings & { providers: Providers } {
  const held = { providers: structuredClone(providers), revision: 0 }
  return {
    get providers() { return held.providers },
    async read(provider) {
      return { ...Object.hasOwn(held.providers, provider) ? { profile: structuredClone(held.providers[provider]!) } : {}, revision: held.revision, firstWrite: true }
    },
    async write(provider, fields) {
      const profile: Record<string, unknown> = { ...held.providers[provider] }
      for (const [field, value] of Object.entries(fields)) {
        if (value === null) delete profile[field]
        else profile[field] = value
      }
      const next = { ...held.providers, [provider]: profile as PiAiProviderProfile }
      try {
        check(next)
      } catch (error) {
        throw new WriteFailure('rejected', error instanceof Error ? error.message : String(error))
      }
      held.providers = next
      held.revision += 1
    },
  }
}

const piDev = piDevCatalog((async (input: string | URL | Request) => {
  const route = String(input).split('/').at(-1)!
  return new Response(readFileSync(new URL(`../fixtures/pi-dev/${route}.json`, import.meta.url), 'utf8'), { headers: { 'content-type': 'application/json' } })
}) as typeof fetch)

const signal = new AbortController().signal

describe('model refresh with llm-pi-ai', () => {
  it('carries over exactly the compatibility switches llm-pi-ai lets a profile set, for every protocol of the catalog', async () => {
    const check = await piAiCheck()
    const fields = Object.entries((llmPiAi.Config as unknown as { dict: { providers: { inner: { dict: { compat: { dict: Record<string, { type: string; list?: { value?: unknown }[] }> } } } } } })
      .dict.providers.inner.dict.compat.dict)
    const sample = (node: { type: string; list?: { value?: unknown }[] }): unknown =>
      node.type === 'boolean' ? true : node.type === 'number' ? 1 : node.type === 'dict' ? { probe: true } : node.list?.[0]?.value
    // One catalog model of every protocol, on its own route.
    const byApi = new Map<string, { route: string; model: string }>()
    for (const provider of builtinProviders()) {
      for (const model of getBuiltinModels(provider.id as Parameters<typeof getBuiltinModels>[0])) {
        if (!byApi.has(model.api)) byApi.set(model.api, { route: provider.id, model: model.id })
      }
    }
    expect(byApi.size).toBeGreaterThan(3)
    for (const [api, { route, model }] of byApi) {
      const offered = fields.filter(([field, node]) => {
        try {
          check({ [route]: { models: [{ id: model, compat: { [field]: sample(node) } }] } } as Providers)
          return true
        } catch {
          return false
        }
      }).map(([field]) => field)
      expect([api, [...OFFERED_COMPAT[api] ?? []].sort()]).toEqual([api, offered.sort()])
    }
  })

  it('adds a model only the newest catalog has to a route llm-pi-ai then serves', async () => {
    const settings = checkedSettings(await piAiCheck(), { 'openai-codex': {} })
    const sync = createCatalogSync({ remote: piDev, installed: installedCatalog(), settings })
    const preview = await sync.preview('openai-codex', signal)
    expect(preview.added).toEqual([{ id: 'gpt-6.1-terra', name: 'GPT-6.1 Terra', inherited: false }])
    expect(preview.removed).toEqual([])
    await expect(sync.apply(preview.id, { add: ['gpt-6.1-terra'], keep: [] })).resolves.toEqual({ status: 'applied' })
    const models = settings.providers['openai-codex']?.models ?? []
    expect(models.slice(0, -1).every(entry => Object.keys(entry).length === 1)).toBe(true)
    expect(models.at(-1)).toEqual({
      id: 'gpt-6.1-terra', name: 'GPT-6.1 Terra', contextWindow: 500_000, input: ['text', 'image'],
      reasoningEfforts: { off: 'none', minimal: 'low', low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' },
    })
    expect(settings.providers['openai-codex']).not.toHaveProperty('api')
    expect(settings.providers['openai-codex']?.defaultMaxTokens).toBe(128_000)
  })

  it('adds models with their offered switches and leaves out those llm-pi-ai withholds', async () => {
    const settings = checkedSettings(await piAiCheck())
    const sync = createCatalogSync({ remote: piDev, installed: installedCatalog(), settings })
    const preview = await sync.preview('kimi-coding', signal)
    expect(preview.added.map(model => model.id)).toEqual(['k3.1-pro', 'k3.1-pro-highspeed'])
    await expect(sync.apply(preview.id, { add: ['k3.1-pro', 'k3.1-pro-highspeed'], keep: [] })).resolves.toEqual({ status: 'applied' })
    const added = settings.providers['kimi-coding']?.models?.find(entry => entry.id === 'k3.1-pro')
    expect(added?.compat).toMatchObject({ thinkingFormat: 'openai', maxTokensField: 'max_tokens' })
    expect(added?.compat).not.toHaveProperty('supportsMidConvoSystemMessages')
  })

  it('folds a route\'s overrides into the list it writes', async () => {
    const settings = checkedSettings(await piAiCheck(), { 'kimi-coding': { modelOverrides: { k3: { name: 'My K3' } } } })
    const sync = createCatalogSync({ remote: piDev, installed: installedCatalog(), settings })
    const preview = await sync.preview('kimi-coding', signal)
    await expect(sync.apply(preview.id, { add: ['k3.1-pro'], keep: [] })).resolves.toEqual({ status: 'applied' })
    expect(settings.providers['kimi-coding']).not.toHaveProperty('modelOverrides')
    expect(settings.providers['kimi-coding']?.models?.[0]).toEqual({ id: 'k3', name: 'My K3' })
  })

  it('finds nothing to change on a route the newest catalog matches', async () => {
    const sync = createCatalogSync({ remote: piDev, installed: installedCatalog(), settings: checkedSettings(await piAiCheck()) })
    const preview = await sync.preview('xai', signal)
    expect([preview.added, preview.removed, preview.skipped]).toEqual([[], [], []])
    await expect(sync.apply(preview.id, { add: [], keep: [] })).resolves.toEqual({ status: 'unchanged' })
  })

  it('passes on llm-pi-ai\'s refusal', async () => {
    const settings = checkedSettings(await piAiCheck(), { 'kimi-coding': { modelOverrides: { k3: { name: 'My K3' } } } })
    // An override another layer keeps cannot be removed: the list then stands beside it.
    const kept = settings.write.bind(settings)
    settings.write = async (provider, { modelOverrides: _kept, ...fields }, revision) => kept(provider, fields, revision)
    const sync = createCatalogSync({ remote: piDev, installed: installedCatalog(), settings })
    const preview = await sync.preview('kimi-coding', signal)
    const outcome = await sync.apply(preview.id, { add: ['k3.1-pro'], keep: [] })
    expect(outcome).toMatchObject({ status: 'rejected', detail: expect.stringContaining('modelOverrides') })
  })
})
