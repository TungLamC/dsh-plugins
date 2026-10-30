/** The built quota row (lib/) in a real cordis context. Run `pnpm build` first. */

import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { QuotaView } from '../../../src/shared/quota.wire.ts'

const { default: Main } = await import('../../../lib/host/main/index.js' as string) as typeof import('../../../src/host/main/index.ts')
const quota = await import('../../../lib/host/quota/index.js' as string) as typeof import('../../../src/host/quota/index.ts')

const cleanup: (() => unknown)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })

async function settle(): Promise<void> { for (let i = 0; i < 20; i += 1) await new Promise(resolve => setImmediate(resolve)) }

function host(): { ctx: Context; registered: string[] } {
  const ctx = new Context()
  cleanup.push(() => ctx.fiber.dispose())
  const registered: string[] = []
  ctx.reflect.provide('typert', { register: (contribution: { package: string }) => { registered.push(contribution.package); return () => {} } })
  // Nobody is signed in.
  ctx.reflect.provide('credentials', { readRecord: async () => undefined, modifyRecord: async () => undefined })
  return { ctx, registered }
}

describe('quota row', () => {
  it('reads its interval from a volatile setting of 15 to 3600 seconds, 60 by default', () => {
    expect(quota.Config({}).quotaRefreshSeconds.get()).toBe(60)
    expect(quota.Config({ quotaRefreshSeconds: 15 }).quotaRefreshSeconds.get()).toBe(15)
    expect(() => quota.Config({ quotaRefreshSeconds: 14 })).toThrow()
    expect(() => quota.Config({ quotaRefreshSeconds: 3601 })).toThrow()
  })

  it('registers its Remote contract and shows a route without a sign-in as signed out', async () => {
    const { ctx, registered } = host()
    await ctx.plugin(Main)
    await ctx.plugin(quota.default, {})
    await settle()
    expect(registered).toContain('dsh-better-providers/quota')
    const controller = new AbortController()
    let view: QuotaView | undefined
    for await (const next of ctx.betterProvidersQuota.watch('openai-codex', controller.signal)) {
      view = next
      if (next.status !== 'loading') break
    }
    expect(view).toEqual({ status: 'signed-out', reading: false, redeeming: false })
  })

  it('refuses a route without usage as a bad request', async () => {
    const { ctx } = host()
    await ctx.plugin(Main)
    await ctx.plugin(quota.default, {})
    await settle()
    const stream = ctx.betterProvidersQuota.watch('anthropic', new AbortController().signal)[Symbol.asyncIterator]()
    await expect(stream.next()).rejects.toMatchObject({ code: 'gateway/bad-request', message: 'unsupported' })
  })
})
