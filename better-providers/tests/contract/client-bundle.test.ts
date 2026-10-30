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

interface Registration { name: string; key?: string; id?: string; children?: Record<string, unknown> }

function loadBundle(): { id: string; exports: { inject: string[]; apply(ctx: unknown): Promise<void> }; requires: string[]; styles: string[] } {
  const code = readFileSync(new URL('../../lib/client.js', import.meta.url), 'utf8')
  const styles: string[] = []
  const document = {
    querySelector: () => null,
    createElement: () => ({ dataset: {} as Record<string, string>, textContent: '' }),
    head: { appendChild: (style: { dataset: Record<string, string> }) => { styles.push(style.dataset['pluginCss'] ?? '') } },
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
  const primitives = new Proxy({}, { get: () => () => null })
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
  const ctx = {
    remote: {
      $mount: async (contribution: { package: string }) => { mounted.push(contribution.package); return async () => {} },
      betterProviders: { watchParts: (signal: AbortSignal) => presence.iterable(signal) },
      betterProvidersOauth: {},
    },
    locale: { register: () => () => {} },
    configForms: { get: () => ({}) },
    inject: (_keys: string[], callback: (child: unknown) => void) => { callback(ctx) },
    effect: (execute: () => (() => void) | void) => { const dispose = execute(); if (dispose !== undefined) disposers.push(dispose) },
    slots: {
      inject: (_slot: string, callback: () => () => void) => callback(),
      register: (options: Registration) => { live.set(options, true); return () => { live.delete(options) } },
    },
  }
  return { ctx, presence, mounted, live: () => [...live.keys()], stop: () => { for (const dispose of disposers.splice(0).reverse()) dispose() } }
}

const settle = async (): Promise<void> => { for (let i = 0; i < 10; i += 1) await Promise.resolve() }
const parts = (on: Partial<Record<'oauth' | 'quota' | 'models' | 'codexFast', boolean>>) => ({ oauth: false, quota: false, models: false, codexFast: false, ...on })

describe('lib/client.js', () => {
  it('registers under the package name and requires only shared modules', () => {
    const bundle = loadBundle()
    expect(bundle.id).toBe('dsh-better-providers')
    expect(bundle.requires.every(id => ['zod', 'react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives'].includes(id))).toBe(true)
    expect(bundle.exports.inject).toEqual(expect.arrayContaining(['slots', 'remote']))
    expect(bundle.styles).toContain('dsh-better-providers/src/client/oauth/SignInSection.module.css')
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
    expect(host.live()).toEqual([])

    host.presence.push(parts({ models: true }))
    await settle()
    host.stop()
    expect(host.live()).toEqual([])
  })
})
