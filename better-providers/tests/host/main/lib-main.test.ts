/** The built rows (lib/) in a real cordis context: the main row is the plugin's master switch. */

import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'

// The built rows; run `pnpm build` first. Typed by their sources.
const { default: Main } = await import('../../../lib/host/main/index.js' as string) as typeof import('../../../src/host/main/index.ts')
const { default: Oauth } = await import('../../../lib/host/oauth/index.js' as string) as typeof import('../../../src/host/oauth/index.ts')
const { default: Quota } = await import('../../../lib/host/quota/index.js' as string) as typeof import('../../../src/host/quota/index.ts')

const cleanup: (() => unknown)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })

async function settle(): Promise<void> { for (let i = 0; i < 20; i += 1) await new Promise(resolve => setImmediate(resolve)) }

function host(): { ctx: Context; registered: string[] } {
  const ctx = new Context()
  cleanup.push(() => ctx.fiber.dispose())
  const registered: string[] = []
  ctx.reflect.provide('typert', { register: (contribution: { package: string }) => { registered.push(contribution.package); return () => {} } })
  // The oauth row only needs these services to exist; its behaviour is tested through its relay.
  ctx.reflect.provide('authorization', {})
  ctx.reflect.provide('credentials', {})
  return { ctx, registered }
}

async function first<T>(iterable: AsyncIterable<T>): Promise<T> {
  for await (const item of iterable) return item
  throw new Error('stream ended')
}

describe('main row', () => {
  it('registers its Remote contract and reports running parts', async () => {
    const { ctx, registered } = host()
    await ctx.plugin(Main)
    await ctx.plugin(Oauth)
    await settle()
    expect(registered).toEqual(expect.arrayContaining(['dsh-better-providers', 'dsh-better-providers/oauth']))
    const presence = await first(ctx.betterProviders.watchParts(new AbortController().signal))
    expect(presence).toEqual({ oauth: true, quota: false, models: false, codexFast: false })
  })

  it('stops every part when it stops, and restarts them when it returns', async () => {
    const { ctx } = host()
    const main = await ctx.plugin(Main)
    ctx.plugin(Oauth)
    ctx.plugin(Quota)
    await settle()
    expect(ctx.get('betterProvidersOauth')).toBeDefined()
    await main.dispose()
    await settle()
    expect(ctx.get('betterProvidersOauth')).toBeUndefined()
    expect(ctx.get('betterProvidersQuota')).toBeUndefined()
    await ctx.plugin(Main)
    await settle()
    expect(ctx.get('betterProvidersQuota')).toBeDefined()
  })
})
