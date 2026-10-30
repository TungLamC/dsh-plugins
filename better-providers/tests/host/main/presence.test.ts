import { afterEach, describe, expect, it } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import { trackParts } from '../../../src/host/main/presence.ts'
import { NO_PARTS } from '../../../src/shared/main.wire.ts'

const cleanup: (() => unknown)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })

function serviceFor(name: string, inject: string[] = []): { new (ctx: Context): Service; inject: string[] } {
  return class extends Service {
    static inject = inject
    constructor(ctx: Context) { super(ctx, name) }
  }
}

async function settle(): Promise<void> { for (let i = 0; i < 20; i += 1) await new Promise(resolve => setImmediate(resolve)) }

describe('trackParts', () => {
  it('reports nothing running at first', () => {
    const ctx = new Context()
    cleanup.push(() => ctx.fiber.dispose())
    expect(trackParts(ctx).get()).toEqual(NO_PARTS)
  })

  it('follows a part service appearing and going away', async () => {
    const ctx = new Context()
    cleanup.push(() => ctx.fiber.dispose())
    const presence = trackParts(ctx)
    const fiber = await ctx.plugin(serviceFor('betterProvidersOauth'))
    await settle()
    expect(presence.get()).toEqual({ ...NO_PARTS, oauth: true })
    await fiber.dispose()
    await settle()
    expect(presence.get()).toEqual(NO_PARTS)
  })

  it('counts a part waiting on a missing dependency as absent', async () => {
    const ctx = new Context()
    cleanup.push(() => ctx.fiber.dispose())
    const presence = trackParts(ctx)
    ctx.plugin(serviceFor('betterProvidersQuota', ['credentials']))
    await settle()
    expect(presence.get().quota).toBe(false)
    ctx.reflect.provide('credentials', {})
    await settle()
    expect(presence.get().quota).toBe(true)
  })

  it('streams the changes', async () => {
    const ctx = new Context()
    cleanup.push(() => ctx.fiber.dispose())
    const presence = trackParts(ctx)
    const controller = new AbortController()
    const watch = presence.watch(controller.signal)[Symbol.asyncIterator]()
    expect((await watch.next()).value).toEqual(NO_PARTS)
    const next = watch.next()
    await ctx.plugin(serviceFor('betterProvidersModels'))
    expect((await next).value).toEqual({ ...NO_PARTS, models: true })
    controller.abort()
  })
})
