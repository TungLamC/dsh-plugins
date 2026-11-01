/**
 * The committed browser bundle (lib/client.js) as the dsh web shell loads it: a
 * factory registered with the module loader, requiring only shared modules,
 * whose `apply` puts the settings on the plugin's page. Run `pnpm build` first.
 */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

interface Registration { name: string; key?: string; locale?: string; inject?: () => Record<string, unknown> }

/** Stands in for the shared settings form model the page stages edits with. */
class FakeFormModel {
  static fields: string[] = []
  disposed = false
  constructor(_scope: unknown, specs: { field: string }[]) { FakeFormModel.fields = specs.map(spec => spec.field) }
  bind() { return { getSnapshot: () => ({}), subscribe: () => () => {} } }
  shell() { return {} }
  field() { return { text: '', overridden: false, invalid: false } }
  actions() { return { edit() {}, resetField() {}, save() {}, discard() {} } }
  dispose() { this.disposed = true }
}

function loadBundle() {
  const code = readFileSync(new URL('../../lib/client.js', import.meta.url), 'utf8')
  const styles: string[] = []
  const document = {
    querySelector: () => null,
    createElement: () => ({ dataset: {} as Record<string, string>, textContent: '' }),
    head: { appendChild: (style: { dataset: Record<string, string> }) => { styles.push(`${style.dataset['plugin'] ?? ''} ${style.dataset['pluginCss'] ?? ''}`) } },
  }
  let entry: { id: string; factory(require: (id: string) => unknown): unknown } | undefined
  runInNewContext(code, {
    window: { __ModuleLoader__: { load: (value: typeof entry) => { entry = value } } },
    AbortController, setTimeout, clearTimeout, console, queueMicrotask, document,
  })
  if (entry === undefined) throw new Error('the bundle registered nothing')
  const requires: string[] = []
  const local = createRequire(import.meta.url)
  // UI components only render in a real page; the bundle just needs their bindings.
  const primitives = new Proxy({}, {
    get: (_target, name) => name === 'SettingsFormModel' ? FakeFormModel : name === 'settingsTextField' ? (field: string) => ({ field }) : () => null,
  })
  const exports = entry.factory((id) => {
    requires.push(id)
    if (id === 'react' || id === 'react/jsx-runtime') return local(id)
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return primitives
    throw new Error(`unexpected require("${id}")`)
  }) as { inject: string[]; apply(ctx: unknown): Promise<void> }
  return { id: entry.id, exports, requires, styles }
}

function fakeContext() {
  const mounted: string[] = []
  const locales: string[] = []
  const forms: string[] = []
  const live = new Map<Registration, true>()
  const disposers: (() => void)[] = []
  const remote = { searchModels: async () => ({ ok: true, value: { codex: [], openai: null, gemini: null } }) }
  const ctx = {
    remote: {
      $mount: async (contribution: { package: string }) => { mounted.push(contribution.package); return async () => {} },
      webAccess: remote,
    },
    locale: { register: (ns: string) => { locales.push(ns); return () => {} } },
    configForms: { get: (ns: string) => { forms.push(ns); return { getSnapshot: () => ({ status: 'ready', value: {} }), subscribe: () => () => {} } } },
    slots: {
      inject: (_slot: string, callback: () => () => void) => callback(),
      register: (options: Registration) => { live.set(options, true); return () => { live.delete(options) } },
    },
    effect: (execute: () => (() => void) | void) => { const dispose = execute(); if (dispose !== undefined) disposers.push(dispose) },
    inject: (_keys: string[], callback: (child: unknown) => void) => { callback(ctx) },
  }
  return { ctx, remote, mounted, locales, forms, live: () => [...live.keys()], stop: () => { for (const dispose of disposers.splice(0).reverse()) dispose() } }
}

describe('lib/client.js', () => {
  it('registers under the package name and requires only shared modules', () => {
    const bundle = loadBundle()
    expect(bundle.id).toBe('dsh-web-access')
    expect(new Set(bundle.requires)).toEqual(new Set(['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives']))
    expect(bundle.exports.inject).toEqual(['slots', 'remote', 'locale', 'configForms'])
    expect(bundle.styles).toContain('dsh-web-access dsh-web-access/settings.module.css')
  })

  it('puts the settings on the plugin\'s page over the row\'s settings', async () => {
    const { exports } = loadBundle()
    const host = fakeContext()
    await exports.apply(host.ctx)
    expect(host.mounted).toEqual(['dsh-web-access'])
    expect(host.locales).toEqual(['web-access'])
    expect(host.forms).toEqual(['web-access'])
    expect(FakeFormModel.fields).toEqual(['codex', 'openai', 'gemini', 'exa', 'parallel', 'anysearch', 'codexModel', 'openaiModel', 'geminiModel'])
    const [page] = host.live()
    expect(page).toMatchObject({ name: 'plugins.bundle.config', key: 'dsh-web-access', locale: 'web-access' })
    expect(page?.inject?.()).toMatchObject({ hooks: { form: expect.any(Object), choices: expect.any(Object) }, loadChoices: expect.any(Function) })
    host.stop()
    expect(host.live()).toEqual([])
  })
})
