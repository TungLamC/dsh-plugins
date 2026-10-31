/**
 * The committed browser bundle (lib/client.js) as the dsh web shell loads it: a
 * factory registered with the module loader, requiring only shared modules, whose
 * `apply` shows UI for exactly the running parts. Run `pnpm build` first.
 */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import * as zod from 'zod'

interface Registration { name: string; key?: string; id?: string; children?: Record<string, unknown>; inject?: (...args: unknown[]) => Record<string, unknown> }

/** Stands in for the shared settings form model a row's page stages edits with. */
class FakeFormModel {
  disposed = false
  bind() { return { getSnapshot: () => ({}), subscribe: () => () => {} } }
  shell() { return {} }
  field() { return { text: '', overridden: false, invalid: false } }
  actions() { return {} }
  dispose() { this.disposed = true }
}

function loadBundle(): { id: string; exports: { inject: string[]; apply(ctx: unknown): Promise<void> }; requires: string[]; styles: string[] } {
  const code = readFileSync(new URL('../../lib/client.js', import.meta.url), 'utf8')
  const styles: string[] = []
  const document = {
    querySelector: () => null,
    createElement: () => ({ dataset: {} as Record<string, string>, textContent: '' }),
    head: { appendChild: (style: { dataset: Record<string, string> }) => { styles.push(`${style.dataset['plugin'] ?? ''} ${style.dataset['pluginCss'] ?? ''}`) } },
  }
  let entry: { id: string; factory(require: (id: string) => unknown): unknown } | undefined
  // The browser globals the bundle uses, plus the module loader it registers with.
  runInNewContext(code, {
    window: { __ModuleLoader__: { load: (value: typeof entry) => { entry = value } } },
    AbortController, setTimeout, clearTimeout, console, queueMicrotask, document,
  })
  if (entry === undefined) throw new Error('the bundle registered nothing')
  const requires: string[] = []
  const local = createRequire(import.meta.url)
  // UI components only render in a real page; the bundle just needs their bindings.
  const primitives = new Proxy({}, { get: (_target, name) => name === 'SettingsFormModel' ? FakeFormModel : () => null })
  const exports = entry.factory((id) => {
    requires.push(id)
    if (id === 'zod') return zod
    if (id === 'react' || id === 'react/jsx-runtime') return local(id)
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return primitives
    throw new Error(`unexpected require("${id}")`)
  }) as { inject: string[]; apply(ctx: unknown): Promise<void> }
  return { id: entry.id, exports, requires, styles }
}

/** A presence stream the test drives. */
function channel<T>(): { push(value: T): void; iterable(signal: AbortSignal): AsyncIterable<T> } {
  const queue: T[] = []
  let wake: (() => void) | undefined
  return {
    push(value) { queue.push(value); wake?.() },
    async *iterable(signal) {
      while (!signal.aborted) {
        const next = queue.shift()
        if (next !== undefined) { yield next; continue }
        await new Promise<void>((resolve) => { wake = resolve; signal.addEventListener('abort', () => { resolve() }, { once: true }) })
      }
    },
  }
}

function fakeContext() {
  const presence = channel<Record<string, boolean>>()
  const mounted: string[] = []
  const live = new Map<Registration, true>()
  const disposers: (() => void)[] = []
  const directories: string[] = []
  const shared = {
    remote: {
      $mount: async (contribution: { package: string }) => { mounted.push(contribution.package); return async () => {} },
      betterProviders: { watchParts: (signal: AbortSignal) => presence.iterable(signal) },
      betterProvidersOauth: {},
      betterProvidersQuota: {},
      betterProvidersModels: {},
      betterProvidersCodexFast: { watchSupport: (signal: AbortSignal) => channel<boolean>().iterable(signal) },
    },
    locale: { register: () => () => {} },
    configForms: { get: () => ({ getSnapshot: () => ({ status: 'ready', value: {} }), subscribe: () => () => {} }) },
    modelDirectories: { directoryFor: (sessionId: string) => { directories.push(sessionId); return { store: {} } } },
    slots: {
      inject: (_slot: string, callback: () => () => void) => callback(),
      register: (options: Registration) => { live.set(options, true); return () => { live.delete(options) } },
    },
  }
  /** A context whose effects end with `owned`, and whose injected children end with it too, as cordis fibers do. */
  const scope = (owned: (() => void)[]): object => ({
    ...shared,
    effect: (execute: () => (() => void) | void) => { const dispose = execute(); if (dispose !== undefined) owned.push(dispose) },
    inject: (_keys: string[], callback: (child: unknown) => void) => {
      const own: (() => void)[] = []
      const dispose = (): void => { for (const each of own.splice(0).reverse()) each() }
      owned.push(dispose)
      callback(scope(own))
      return { dispose }
    },
  })
  const ctx = scope(disposers)
  return { ctx, presence, mounted, directories, live: () => [...live.keys()], stop: () => { for (const dispose of disposers.splice(0).reverse()) dispose() } }
}

const settle = async (): Promise<void> => { for (let i = 0; i < 10; i += 1) await Promise.resolve() }
const parts = (on: Partial<Record<'oauth' | 'quota' | 'models' | 'codexFast', boolean>>) => ({ oauth: false, quota: false, models: false, codexFast: false, ...on })

describe('lib/client.js', () => {
  it('loads without a document, like the bundles dsh ships', () => {
    const code = readFileSync(new URL('../../lib/client.js', import.meta.url), 'utf8')
    let entry: { factory(require: (id: string) => unknown): unknown } | undefined
    runInNewContext(code, { window: { __ModuleLoader__: { load: (value: typeof entry) => { entry = value } } }, AbortController, setTimeout, clearTimeout, console })
    const local = createRequire(import.meta.url)
    expect(() => entry?.factory(id => id === 'zod' ? zod : id.startsWith('react') ? local(id) : new Proxy({}, { get: () => () => null }))).not.toThrow()
  })

  it('registers under the package name and requires only shared modules', () => {
    const bundle = loadBundle()
    expect(bundle.id).toBe('dsh-better-providers')
    expect(bundle.requires.every(id => ['zod', 'react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives'].includes(id))).toBe(true)
    expect(bundle.exports.inject).toEqual(expect.arrayContaining(['slots', 'remote']))
    expect(bundle.styles).toContain('dsh-better-providers dsh-better-providers/oauth/SignInSection.module.css')
    expect(bundle.styles).toContain('dsh-better-providers dsh-better-providers/quota/QuotaSection.module.css')
    expect(bundle.styles).toContain('dsh-better-providers dsh-better-providers/models/RefreshSection.module.css')
    expect(bundle.styles).toContain('dsh-better-providers dsh-better-providers/codex-fast/FastToggle.module.css')
    expect(bundle.styles).toContain('dsh-better-providers dsh-better-providers/kit/row-config.module.css')
  })

  it('mounts the main contract and shows the card host only while a card part runs', async () => {
    const { exports } = loadBundle()
    const host = fakeContext()
    await exports.apply(host.ctx)
    expect(host.mounted).toContain('dsh-better-providers')
    await settle()
    expect(host.live()).toEqual([])

    host.presence.push(parts({ oauth: true }))
    await settle()
    expect(host.live()).toEqual([
      expect.objectContaining({ name: 'settings.models.provider-card', key: 'llm-pi-ai', children: { 'better-providers.provider-card': { kind: 'list', scope: 'root' } } }),
      expect.objectContaining({ name: 'better-providers.provider-card', id: 'better-providers-oauth', locale: 'better-providers-oauth' }),
    ])

    host.presence.push(parts({ codexFast: true }))
    await settle()
    expect(host.live().map(entry => entry.name)).toEqual(['conversation.input.right', 'plugins.row.config'])

    host.presence.push(parts({ models: true }))
    await settle()
    host.stop()
    expect(host.live()).toEqual([])
  })

  it('shows the usage section and the row\'s settings page while the quota part runs', async () => {
    const { exports } = loadBundle()
    const host = fakeContext()
    await exports.apply(host.ctx)
    expect(host.mounted).toContain('dsh-better-providers/quota')
    host.presence.push(parts({ quota: true }))
    await settle()
    expect(host.live()).toEqual([
      expect.objectContaining({ name: 'settings.models.provider-card', key: 'llm-pi-ai' }),
      expect.objectContaining({ name: 'better-providers.provider-card', id: 'better-providers-quota', locale: 'better-providers-quota' }),
      expect.objectContaining({ name: 'plugins.row.config', key: 'dsh-better-providers#better-providers-quota', locale: 'better-providers-quota' }),
    ])
    host.presence.push(parts({ oauth: true }))
    await settle()
    expect(host.live().map(entry => entry.id ?? entry.key)).toEqual(['llm-pi-ai', 'better-providers-oauth'])
    host.stop()
  })

  it('shows the refresh row while the models part runs', async () => {
    const { exports } = loadBundle()
    const host = fakeContext()
    await exports.apply(host.ctx)
    expect(host.mounted).toContain('dsh-better-providers/models')
    host.presence.push(parts({ models: true }))
    await settle()
    expect(host.live()).toEqual([
      expect.objectContaining({ name: 'settings.models.provider-card', key: 'llm-pi-ai' }),
      expect.objectContaining({ name: 'better-providers.provider-card', id: 'better-providers-models', order: 20, locale: 'better-providers-models' }),
    ])
    host.presence.push(parts({}))
    await settle()
    expect(host.live()).toEqual([])
    host.stop()
  })

  it('shows the priority switch in the composer and the row\'s settings page while the codex-fast part runs', async () => {
    const { exports } = loadBundle()
    const host = fakeContext()
    await exports.apply(host.ctx)
    expect(host.mounted).toContain('dsh-better-providers/codex-fast')
    host.presence.push(parts({ codexFast: true }))
    await settle()
    const [toggle, page] = host.live()
    expect([toggle, page]).toEqual([
      expect.objectContaining({ name: 'conversation.input.right', id: 'better-providers-codex-fast', locale: 'better-providers-codex-fast' }),
      expect.objectContaining({ name: 'plugins.row.config', key: 'dsh-better-providers#better-providers-codex-fast', locale: 'better-providers-codex-fast' }),
    ])
    // Each composer gets its session's id and model selection.
    expect(toggle?.inject?.('session-1')).toMatchObject({ sessionId: 'session-1', hooks: { directory: {}, support: expect.objectContaining({ getSnapshot: expect.any(Function) }) } })
    expect(host.directories).toEqual(['session-1'])
    host.presence.push(parts({}))
    await settle()
    expect(host.live()).toEqual([])
    host.stop()
  })
})
