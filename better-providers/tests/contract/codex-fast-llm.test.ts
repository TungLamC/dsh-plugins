/**
 * The built codex-fast row in dsh's model-call path: dsh's LlmRuntime and the
 * real llm-pi-ai send a Codex request through pi-ai, and the request that
 * reaches the network asks for priority exactly when the row says so. The
 * sign-in and the network are fake. Run `pnpm build` first.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { markAgentLoopRequest, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import * as llmPiAi from '@deepseek-ai/dsh-llm-pi-ai'
import { getBuiltinModels } from '@earendil-works/pi-ai/providers/all'
import { codexEndpoint, codexGrant } from './codex-wire.ts'

const { default: Main } = await import('../../lib/host/main/index.js' as string) as typeof import('../../src/host/main/index.ts')
const { default: CodexFast } = await import('../../lib/host/codex-fast/index.js' as string) as typeof import('../../src/host/codex-fast/index.ts')

const cleanup: (() => unknown)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
  vi.unstubAllGlobals()
})

const MODEL = getBuiltinModels('openai-codex')[0]!.id

/** dsh's storage domain over memory. */
function memoryDomains() {
  const records = new Map<string, unknown>()
  return {
    async open() {
      return {
        table: () => ({ get: (key: string) => records.get(key), put: async (key: string, value: unknown) => { records.set(key, value) } }),
        close: async () => {},
      }
    },
  }
}

/** A Codex sign-in stored the way llm-pi-ai keeps one. */
function signedIn() {
  const record = { kind: 'grant', payload: codexGrant() }
  return {
    readRecord: async (key: string) => key === 'llm-pi-ai/openai-codex' ? record : undefined,
    listRecords: async () => [{ key: 'llm-pi-ai/openai-codex', kind: 'grant' }],
    modifyRecord: async (_key: string, fn: (current: unknown) => Promise<unknown>) => await fn(record) ?? record,
    resolve: async () => undefined,
  }
}

async function dsh(defaultEnabled = false): Promise<{ ctx: Context; bodies: Record<string, unknown>[] }> {
  const endpoint = codexEndpoint()
  vi.stubGlobal('fetch', endpoint.fetch)
  const ctx = new Context()
  cleanup.push(() => ctx.fiber.dispose())
  ctx.reflect.provide('typert', { register: () => () => {} })
  ctx.reflect.provide('credentials', signedIn())
  ctx.reflect.provide('storageDomain', memoryDomains())
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(llmPiAi, { providers: { 'openai-codex': { transport: 'sse' } } })
  await ctx.plugin(Main)
  await ctx.plugin(CodexFast, { defaultEnabled })
  return { ctx, bodies: endpoint.bodies }
}

function request(overrides: Partial<GenerateOptions> = {}): GenerateOptions {
  return {
    provider: 'openai-codex',
    model: MODEL,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] as GenerateOptions['messages'],
    sessionId: 'session-test' as GenerateOptions['sessionId'],
    ...overrides,
  }
}

async function send(ctx: Context, options: GenerateOptions): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of ctx.llm.stream(options)) chunks.push(chunk)
  return chunks
}

describe('codex-fast in dsh\'s model calls', () => {
  it('asks for priority on an agent-loop request of a session that is on', async () => {
    const { ctx, bodies } = await dsh()
    await ctx.betterProvidersCodexFast.set('session-test', true)
    const chunks = await send(ctx, markAgentLoopRequest(request()))
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
    expect(bodies).toHaveLength(1)
    expect(bodies[0]).toMatchObject({ model: MODEL, service_tier: 'priority' })
  })

  it('records the default for a session first seen in a request', async () => {
    const { ctx, bodies } = await dsh(true)
    await send(ctx, markAgentLoopRequest(request()))
    expect(bodies[0]).toMatchObject({ service_tier: 'priority' })
    await ctx.betterProvidersCodexFast.set('session-test', false)
    await send(ctx, markAgentLoopRequest(request()))
    expect(bodies[1]).not.toHaveProperty('service_tier')
  })

  it('leaves a request alone that the agent loop did not build', async () => {
    const { ctx, bodies } = await dsh(true)
    await send(ctx, request({ purpose: 'compaction' }))
    expect(bodies[0]).not.toHaveProperty('service_tier')
  })

  it('keeps reporting priority as supported after requests that took it', async () => {
    const { ctx } = await dsh(true)
    await send(ctx, markAgentLoopRequest(request()))
    const controller = new AbortController()
    for await (const supported of ctx.betterProvidersCodexFast.watchSupport(controller.signal)) {
      expect(supported).toBe(true)
      controller.abort()
    }
  })
})
