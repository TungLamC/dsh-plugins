/** The built models row (lib/) in a real cordis context. Run `pnpm build` first. */

import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'

const { default: Main } = await import('../../../lib/host/main/index.js' as string) as typeof import('../../../src/host/main/index.ts')
const { default: Models } = await import('../../../lib/host/models/index.js' as string) as typeof import('../../../src/host/models/index.ts')

const cleanup: (() => unknown)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })

async function host(): Promise<{ ctx: Context; registered: string[] }> {
  const ctx = new Context()
  cleanup.push(() => ctx.fiber.dispose())
  const registered: string[] = []
  ctx.reflect.provide('typert', { register: (contribution: { package: string }) => { registered.push(contribution.package); return () => {} } })
  ctx.reflect.provide('settings', { describe: () => [], mutate: async () => {} })
  await ctx.plugin(Main)
  await ctx.plugin(Models)
  return { ctx, registered }
}

describe('models row', () => {
  it('registers its Remote contract', async () => {
    const { registered } = await host()
    expect(registered).toContain('dsh-better-providers/models')
  })

  it('refuses a route pi-ai ships no chat model for as a bad request', async () => {
    const { ctx } = await host()
    await expect(ctx.betterProvidersModels.preview('my-gateway', new AbortController().signal)).rejects.toMatchObject({ code: 'gateway/bad-request', message: 'unsupported' })
  })

  it('answers a preview it does not hold as expired', async () => {
    const { ctx } = await host()
    await expect(ctx.betterProvidersModels.apply('00000000-0000-4000-8000-000000000000', { add: [], keep: [] })).resolves.toEqual({ status: 'expired' })
  })
})
