import { describe, expect, it } from 'vitest'
import type { PiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import type { CatalogPreview } from '../../../src/shared/models.wire.ts'
import { Refusal } from '../../../src/host/kit/refusal.ts'
import {
  CatalogFailure, createCatalogSync, WriteFailure,
  type CatalogModel, type InstalledCatalog, type RemoteCatalog, type RouteFields, type RouteSettings, type RouteState,
} from '../../../src/host/models/sync.ts'

const API = 'openai-completions'
const BASE = 'https://api.example.test/v1'
const signal = new AbortController().signal

function model(id: string, extra: Partial<CatalogModel> = {}): CatalogModel {
  return { id, name: `Model ${id}`, api: API, baseUrl: BASE, reasoning: false, input: ['text'], contextWindow: 64_000, maxTokens: 8_000, ...extra }
}

/** An installed catalog of one route, `r`, serving `a`, `b` and `c`. */
function installed(ids: readonly string[] = ['a', 'b', 'c'], route: { api?: string; baseUrl?: string } = { api: API, baseUrl: BASE }): InstalledCatalog {
  return {
    route: provider => provider !== 'r' ? undefined : { ...route, models: new Map(ids.map(id => [id, { name: `Installed ${id}` }])) },
  }
}

/** The newest catalog: `b` and `c` still, `d` new, `e` on another protocol, `f` on another endpoint, `g` malformed. */
const NEWEST = {
  models: [model('b'), model('c'), model('d', { maxTokens: 32_000 }), model('e', { api: 'anthropic-messages' }), model('f', { baseUrl: 'https://elsewhere.test' })],
  invalid: [{ id: 'g', name: 'Model g' }],
}

function remote(answer: Awaited<ReturnType<RemoteCatalog['models']>> | Error = NEWEST): RemoteCatalog & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    async models(provider) {
      calls.push(provider)
      if (answer instanceof Error) throw answer
      return structuredClone(answer)
    },
  }
}

/** Settings held in memory, with a revision every write moves; `refuse` makes the next write fail. */
function memory(providers: Record<string, PiAiProviderProfile> = {}, state: Partial<Pick<RouteState, 'firstWrite' | 'blocked'>> = {}) {
  const held = { providers: structuredClone(providers), revision: 0, writes: [] as { provider: string; fields: RouteFields; revision: number }[] }
  let refusal: WriteFailure | undefined
  const settings: RouteSettings = {
    async read(provider) {
      const profile = Object.hasOwn(held.providers, provider) ? structuredClone(held.providers[provider]) : undefined
      return { ...profile === undefined ? {} : { profile }, revision: held.revision, firstWrite: state.firstWrite ?? true, ...state.blocked === undefined ? {} : { blocked: state.blocked } }
    },
    async write(provider, fields, revision) {
      held.writes.push({ provider, fields: structuredClone(fields), revision })
      if (refusal !== undefined) {
        const error = refusal
        refusal = undefined
        throw error
      }
      if (revision !== held.revision) throw new WriteFailure('conflict')
      const profile: Record<string, unknown> = { ...held.providers[provider] }
      for (const [field, value] of Object.entries(fields)) {
        if (value === null) delete profile[field]
        else profile[field] = value
      }
      held.providers[provider] = profile as PiAiProviderProfile
      held.revision += 1
    },
  }
  return {
    settings, held,
    refuse(failure: WriteFailure) { refusal = failure },
    /** Another editor changes the settings. */
    edit(provider: string, profile: PiAiProviderProfile) {
      held.providers[provider] = profile
      held.revision += 1
    },
  }
}

function setup(options: { providers?: Record<string, PiAiProviderProfile>; catalog?: InstalledCatalog; newest?: RemoteCatalog; state?: Partial<RouteState> } = {}) {
  const store = memory(options.providers, options.state)
  let now = 1_000_000
  let ids = 0
  const sync = createCatalogSync({
    remote: options.newest ?? remote(),
    installed: options.catalog ?? installed(),
    settings: store.settings,
    now: () => now,
    newId: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`,
  })
  return { sync, store, advance: (ms: number) => { now += ms } }
}

const ids = (models: readonly { id: string }[]): string[] => models.map(entry => entry.id)

describe('preview', () => {
  it('compares the models the route serves with the newest catalog', async () => {
    const { sync } = setup()
    const preview = await sync.preview('r', signal)
    expect(preview).toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      provider: 'r',
      added: [{ id: 'd', name: 'Model d', inherited: false }],
      removed: [{ id: 'a', name: 'Installed a' }],
      unchanged: [{ id: 'b', name: 'Model b' }, { id: 'c', name: 'Model c' }],
      skipped: [{ id: 'e', name: 'Model e', reason: 'api' }, { id: 'f', name: 'Model f', reason: 'endpoint' }, { id: 'g', name: 'Model g', reason: 'invalid' }],
      firstWrite: true,
    } satisfies CatalogPreview)
  })

  it('compares with the route\'s own list once it has one, naming its models as the list does', async () => {
    const { sync } = setup({ providers: { r: { models: [{ id: 'b', name: 'My b' }, { id: 'x' }] } } })
    const preview = await sync.preview('r', signal)
    expect(ids(preview.unchanged)).toEqual(['b'])
    expect(preview.removed).toEqual([{ id: 'x', name: 'x' }])
    // `c` is in the installed catalog: added back, it keeps everything the catalog knows.
    expect(preview.added).toEqual([
      { id: 'c', name: 'Model c', inherited: true },
      { id: 'd', name: 'Model d', inherited: false },
    ])
  })

  it('does not check where a model the installed catalog describes is served', async () => {
    const newest = remote({ models: [model('a', { api: 'anthropic-messages' }), model('c', { baseUrl: 'https://elsewhere.test' })], invalid: [] })
    const preview = await setup({ newest, providers: { r: { models: [{ id: 'a' }] } } }).sync.preview('r', signal)
    expect(preview.unchanged).toEqual([{ id: 'a', name: 'Model a' }])
    expect(preview.added).toEqual([{ id: 'c', name: 'Model c', inherited: true }])
  })

  it('skips every new model when the installed catalog has no single protocol or endpoint for the route', async () => {
    const mixed = await setup({ catalog: installed(['a', 'b', 'c'], { baseUrl: BASE }) }).sync.preview('r', signal)
    expect(mixed.skipped.filter(entry => entry.id === 'd')).toEqual([{ id: 'd', name: 'Model d', reason: 'api' }])
    const endless = await setup({ catalog: installed(['a', 'b', 'c'], { api: API }) }).sync.preview('r', signal)
    expect(endless.skipped.filter(entry => entry.id === 'd')).toEqual([{ id: 'd', name: 'Model d', reason: 'endpoint' }])
  })

  it('keeps a listed model the newest catalog still offers, even malformed', async () => {
    const newest = remote({ models: [model('b'), model('c')], invalid: [{ id: 'a' }] })
    const preview = await setup({ newest }).sync.preview('r', signal)
    expect(preview.removed).toEqual([])
    expect(ids(preview.unchanged)).toEqual(['b', 'c', 'a'])
  })

  it('says when the profile holds no providers yet, and when the route cannot be written', async () => {
    expect((await setup({ state: { firstWrite: false } }).sync.preview('r', signal)).firstWrite).toBe(false)
    expect((await setup({ state: { blocked: 'expression' } }).sync.preview('r', signal)).blocked).toBe('expression')
  })

  it('refuses a route the installed catalog has no chat model for, without reading the newest catalog', async () => {
    const newest = remote()
    await expect(setup({ newest }).sync.preview('custom', signal)).rejects.toEqual(new Refusal('unsupported', 'custom'))
    expect(newest.calls).toEqual([])
  })

  it('refuses with the reason the newest catalog could not be read', async () => {
    await expect(setup({ newest: remote(new CatalogFailure('unknown')) }).sync.preview('r', signal)).rejects.toMatchObject({ reason: 'catalog-unknown' })
    await expect(setup({ newest: remote(new CatalogFailure('invalid')) }).sync.preview('r', signal)).rejects.toMatchObject({ reason: 'catalog-invalid' })
    await expect(setup({ newest: remote(new Error('boom')) }).sync.preview('r', signal)).rejects.toMatchObject({ reason: 'catalog-unreachable' })
  })
})

describe('apply', () => {
  it('writes the route\'s list in catalog order: known models by id, new ones described, kept ones last', async () => {
    const { sync, store } = setup()
    const preview = await sync.preview('r', signal)
    await expect(sync.apply(preview.id, { add: ['d'], keep: ['a'] })).resolves.toEqual({ status: 'applied' })
    expect(store.held.writes).toEqual([{
      provider: 'r',
      revision: 0,
      fields: {
        models: [
          { id: 'b' },
          { id: 'c' },
          { id: 'd', name: 'Model d', contextWindow: 64_000, input: ['text'], reasoningEfforts: false },
          { id: 'a' },
        ],
        // The route states the output limit of the models the installed catalog does not describe.
        defaultMaxTokens: 32_000,
      },
    }])
  })

  it('drops the removed models not kept and adds nothing not chosen', async () => {
    const { sync, store } = setup()
    const preview = await sync.preview('r', signal)
    await sync.apply(preview.id, { add: [], keep: [] })
    expect(store.held.providers['r']).toEqual({ models: [{ id: 'b' }, { id: 'c' }] })
  })

  it('writes nothing when the choice leaves the route as it is', async () => {
    const { sync, store } = setup()
    const preview = await sync.preview('r', signal)
    await expect(sync.apply(preview.id, { add: [], keep: ['a'] })).resolves.toEqual({ status: 'unchanged' })
    expect(store.held.writes).toEqual([])
  })

  it('keeps the route\'s own entries as they are, and sizes the route by the smallest new model', async () => {
    const own = { id: 'b', name: 'My b', contextWindow: 9_000 }
    const newest = remote({ models: [model('b'), model('x', { maxTokens: 16_000 }), model('y', { maxTokens: 12_000 })], invalid: [] })
    const { sync, store } = setup({ providers: { r: { apiKeyEnv: 'R_KEY', models: [own, { id: 'x', name: 'Hand x' }] } }, newest })
    const preview = await sync.preview('r', signal)
    await sync.apply(preview.id, { add: ['y'], keep: [] })
    expect(store.held.providers['r']).toEqual({
      apiKeyEnv: 'R_KEY',
      models: [own, { id: 'x', name: 'Hand x' }, { id: 'y', name: 'Model y', contextWindow: 64_000, input: ['text'], reasoningEfforts: false }],
      defaultMaxTokens: 12_000,
    })
  })

  it('folds the route\'s overrides into its list, which cannot stand beside them', async () => {
    const { sync, store } = setup({ providers: { r: { modelOverrides: { b: { name: 'Renamed b' } } } } })
    const preview = await sync.preview('r', signal)
    await sync.apply(preview.id, { add: [], keep: [] })
    expect(store.held.writes[0]?.fields).toEqual({ modelOverrides: null, models: [{ id: 'b', name: 'Renamed b' }, { id: 'c' }] })
    expect(store.held.providers['r']).toEqual({ models: [{ id: 'b', name: 'Renamed b' }, { id: 'c' }] })
  })

  it('applies after another route changed, at the settings\' new revision', async () => {
    const { sync, store } = setup({ providers: { r: {}, other: {} } })
    const preview = await sync.preview('r', signal)
    store.edit('other', { apiKeyEnv: 'OTHER_KEY' })
    await expect(sync.apply(preview.id, { add: ['d'], keep: [] })).resolves.toEqual({ status: 'applied' })
    expect(store.held.writes.map(write => write.revision)).toEqual([1])
  })

  it('asks for a new preview when the route changed since, or changes while writing', async () => {
    const changed = setup({ providers: { r: {} } })
    const first = await changed.sync.preview('r', signal)
    changed.store.edit('r', { apiKeyEnv: 'R_KEY' })
    await expect(changed.sync.apply(first.id, { add: ['d'], keep: [] })).resolves.toEqual({ status: 'stale' })
    expect(changed.store.held.writes).toEqual([])
    // That preview is gone.
    await expect(changed.sync.apply(first.id, { add: ['d'], keep: [] })).resolves.toEqual({ status: 'expired' })

    const racing = setup()
    const second = await racing.sync.preview('r', signal)
    racing.store.refuse(new WriteFailure('conflict'))
    await expect(racing.sync.apply(second.id, { add: ['d'], keep: [] })).resolves.toEqual({ status: 'stale' })
  })

  it('applies a preview once, and not after ten minutes', async () => {
    const { sync, advance } = setup()
    const once = await sync.preview('r', signal)
    await sync.apply(once.id, { add: ['d'], keep: [] })
    await expect(sync.apply(once.id, { add: ['d'], keep: [] })).resolves.toEqual({ status: 'expired' })

    const late = await sync.preview('r', signal)
    advance(10 * 60_000 + 1)
    await expect(sync.apply(late.id, { add: [], keep: [] })).resolves.toEqual({ status: 'expired' })
    await expect(sync.apply('00000000-0000-4000-8000-00000000ffff', { add: [], keep: [] })).resolves.toEqual({ status: 'expired' })
  })

  it('holds the eight newest previews', async () => {
    const { sync } = setup()
    const previews: CatalogPreview[] = []
    for (let i = 0; i < 9; i += 1) previews.push(await sync.preview('r', signal))
    await expect(sync.apply(previews[0]!.id, { add: [], keep: [] })).resolves.toEqual({ status: 'expired' })
    await expect(sync.apply(previews[1]!.id, { add: [], keep: [] })).resolves.toEqual({ status: 'applied' })
  })

  it('reports a route it cannot write, and keeps the preview for after it is fixed', async () => {
    const blocked = setup({ state: { blocked: 'expression' } })
    const preview = await blocked.sync.preview('r', signal)
    await expect(blocked.sync.apply(preview.id, { add: ['d'], keep: [] })).resolves.toEqual({ status: 'blocked', reason: 'expression' })
    expect(blocked.store.held.writes).toEqual([])

    const overridden = setup()
    const next = await overridden.sync.preview('r', signal)
    overridden.store.refuse(new WriteFailure('overridden'))
    await expect(overridden.sync.apply(next.id, { add: ['d'], keep: [] })).resolves.toEqual({ status: 'blocked', reason: 'overridden' })
    await expect(overridden.sync.apply(next.id, { add: ['d'], keep: [] })).resolves.toEqual({ status: 'applied' })
  })

  it('passes on why dsh refused the settings', async () => {
    const { sync, store } = setup()
    const preview = await sync.preview('r', signal)
    store.refuse(new WriteFailure('rejected', 'llm-pi-ai: provider "r" model "d" is wrong'))
    await expect(sync.apply(preview.id, { add: ['d'], keep: [] })).resolves.toEqual({ status: 'rejected', detail: 'llm-pi-ai: provider "r" model "d" is wrong' })
  })

  it('refuses a choice naming models the preview does not offer there', async () => {
    const { sync, store } = setup()
    const preview = await sync.preview('r', signal)
    for (const choice of [{ add: ['a'], keep: [] }, { add: [], keep: ['d'] }, { add: ['d', 'd'], keep: [] }]) {
      await expect(sync.apply(preview.id, choice)).rejects.toEqual(new Refusal('bad-choice'))
    }
    expect(store.held.writes).toEqual([])
  })
})
