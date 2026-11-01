import { describe, expect, it, vi } from 'vitest'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { choicesStore, modelMenu } from '../../src/client/choices.ts'
import type { SearchModels } from '../../src/shared/web-access.wire.ts'

const models: SearchModels = { codex: [{ id: 'gpt-6-luna', name: 'GPT-6 Luna' }], openai: null, gemini: [] }

describe('the model menu', () => {
  it('says when the Models page has no route for the tier', () => {
    expect(modelMenu(null, '')).toEqual({ kind: 'no-route' })
  })

  it('offers the route\'s models', () => {
    expect(modelMenu(models.codex, '')).toEqual({ kind: 'models', models: models.codex })
  })

  it('keeps a chosen model the route no longer lists, and the choice while the models load', () => {
    expect(modelMenu(models.codex, 'gpt-5')).toEqual({ kind: 'models', models: [...models.codex!, { id: 'gpt-5', name: 'gpt-5' }] })
    expect(modelMenu(undefined, 'gpt-5')).toEqual({ kind: 'models', models: [{ id: 'gpt-5', name: 'gpt-5' }] })
    expect(modelMenu(undefined, '')).toEqual({ kind: 'models', models: [] })
  })
})

describe('the model choices', () => {
  it('load once at a time and tell their readers', async () => {
    let answer: (result: RemoteResult<SearchModels>) => void = () => {}
    const fetch = vi.fn(() => new Promise<RemoteResult<SearchModels>>((resolve) => { answer = resolve }))
    const store = choicesStore(fetch)
    const listener = vi.fn()
    store.subscribe(listener)
    store.load()
    store.load()
    expect(fetch).toHaveBeenCalledTimes(1)
    answer({ ok: true, value: models } as RemoteResult<SearchModels>)
    await vi.waitFor(() => { expect(listener).toHaveBeenCalledTimes(1) })
    expect(store.getSnapshot()).toBe(models)
    store.load()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('keep what they had when the Host does not answer', async () => {
    const store = choicesStore(async () => { throw new Error('offline') })
    store.load()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(store.getSnapshot()).toBeUndefined()
  })
})
