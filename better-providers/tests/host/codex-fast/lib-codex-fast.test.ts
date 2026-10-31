/** The built codex-fast row (lib/) in a real cordis context. Run `pnpm build` first. */

import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createModels } from '@earendil-works/pi-ai/models'

const { default: Main } = await import('../../../lib/host/main/index.js' as string) as typeof import('../../../src/host/main/index.ts')
const codexFast = await import('../../../lib/host/codex-fast/index.js' as string) as typeof import('../../../src/host/codex-fast/index.ts')

const cleanup: (() => unknown)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })

/** dsh's storage domain over memory: one table per name, closed once. */
function memoryDomains(options: { fail?: boolean } = {}) {
  const records = new Map<string, unknown>()
  const state = { opened: 0, closed: 0 }
  return {
    records,
    state,
    async open() {
      if (options.fail === true) throw new Error('backend-not-found')
      state.opened += 1
      return {
        table: () => ({
          get: (key: string) => records.get(key),
          put: async (key: string, value: unknown) => { records.set(key, value) },
        }),
        close: async () => { state.closed += 1 },
      }
    },
  }
}

async function host(domains = memoryDomains(), config: Record<string, unknown> = {}): Promise<{ ctx: Context; registered: string[] }> {
  const ctx = new Context()
  cleanup.push(() => ctx.fiber.dispose())
  const registered: string[] = []
  ctx.reflect.provide('typert', { register: (contribution: { package: string }) => { registered.push(contribution.package); return () => {} } })
  ctx.reflect.provide('llm', {})
  ctx.reflect.provide('storageDomain', domains)
  await ctx.plugin(Main)
  await ctx.plugin(codexFast.default, config)
  return { ctx, registered }
}

async function first<T>(stream: AsyncIterable<T>): Promise<T> {
  const controller = new AbortController()
  for await (const value of stream) {
    controller.abort()
    return value
  }
  throw new Error('the stream ended without a value')
}

describe('codex-fast row', () => {
  it('reads its default from a volatile setting, off unless set', () => {
    expect(codexFast.Config({}).defaultEnabled.get()).toBe(false)
    expect(codexFast.Config({ defaultEnabled: true }).defaultEnabled.get()).toBe(true)
  })

  it('registers its Remote contract and reports priority as supported on the shared pi-ai', async () => {
    const { ctx, registered } = await host()
    expect(registered).toContain('dsh-better-providers/codex-fast')
    expect(await first(ctx.betterProvidersCodexFast.watchSupport(new AbortController().signal))).toBe(true)
  })

  it('records the default for a session it sees first and stores a change', async () => {
    const domains = memoryDomains()
    const { ctx } = await host(domains, { defaultEnabled: true })
    expect(await first(ctx.betterProvidersCodexFast.watch('s1', new AbortController().signal))).toBe(true)
    await expect(ctx.betterProvidersCodexFast.set('s1', false)).resolves.toBe(false)
    expect(Object.fromEntries(domains.records)).toEqual({ s1: { enabled: false } })
  })

  it('shows every session off and refuses changes when its storage cannot be opened', async () => {
    const { ctx } = await host(memoryDomains({ fail: true }), { defaultEnabled: true })
    expect(await first(ctx.betterProvidersCodexFast.watch('s1', new AbortController().signal))).toBe(false)
    await expect(ctx.betterProvidersCodexFast.set('s1', true)).rejects.toMatchObject({ code: 'gateway/bad-request', message: 'storage-unavailable' })
  })

  it('gives pi-ai its own method back and closes its storage when stopped', async () => {
    const prototype = Object.getPrototypeOf(createModels()) as object
    const original = Object.getOwnPropertyDescriptor(prototype, 'streamSimple')
    const domains = memoryDomains()
    const { ctx } = await host(domains)
    expect(Object.getOwnPropertyDescriptor(prototype, 'streamSimple')).not.toEqual(original)
    await ctx.fiber.dispose()
    expect(Object.getOwnPropertyDescriptor(prototype, 'streamSimple')).toEqual(original)
    expect(domains.state).toEqual({ opened: 1, closed: 1 })
  })
})
