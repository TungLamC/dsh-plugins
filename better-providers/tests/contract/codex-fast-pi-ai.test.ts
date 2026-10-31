/**
 * The priority bridge on real pi-ai, at both ends of what dsh-llm-pi-ai accepts:
 * the replaced `Models.streamSimple` reaches pi-ai's own Codex protocol, whose
 * request body then carries `service_tier`. Only the network is fake.
 */

import { readFileSync } from 'node:fs'
import { findPackageJSON } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'
import { markAgentLoopRequest, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import * as latestModels from '@earendil-works/pi-ai/models'
import { openaiCodexProvider as latestCodex } from '@earendil-works/pi-ai/providers/openai-codex'
import * as oldestModels from 'pi-ai-1.1.0/models'
import { openaiCodexProvider as oldestCodex } from 'pi-ai-1.1.0/providers/openai-codex'
import { installPriorityBridge, TESTED_PI_AI, type BridgeFault } from '../../src/host/codex-fast/bridge.ts'
import { codexEndpoint, codexGrant } from './codex-wire.ts'

/** What a test uses of one pi-ai release; both releases' types are narrowed to it. */
interface Release {
  entry: string
  createModels(options: { credentials: object }): {
    setProvider(provider: unknown): void
    getModels(provider: string): { id: string; api: string; provider: string }[]
    streamSimple(model: unknown, context: unknown, options: object): AsyncIterable<{ type: string; delta?: string; reason?: string }>
  }
  codex(): unknown
}

const RELEASES: Record<string, Release> = {
  '1.1.0': { entry: import.meta.resolve('pi-ai-1.1.0/models'), createModels: oldestModels.createModels as never, codex: oldestCodex },
  '1.4.0': { entry: import.meta.resolve('@earendil-works/pi-ai/models'), createModels: latestModels.createModels as never, codex: latestCodex },
}

const cleanup: (() => unknown)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })

/** A Codex sign-in held the way pi-ai's credential store holds one. */
function signedIn(): object {
  const grant = codexGrant()
  return {
    read: async () => grant,
    list: async () => [{ providerId: 'openai-codex', type: 'oauth' }],
    modify: async (_id: string, fn: (current: unknown) => Promise<unknown>) => await fn(grant) ?? grant,
    delete: async () => {},
  }
}

function loop(model: string): GenerateOptions {
  return markAgentLoopRequest({ provider: 'openai-codex', model, messages: [], sessionId: 'session-test' as GenerateOptions['sessionId'] })
}

function setup(release: Release) {
  const endpoint = codexEndpoint()
  const models = release.createModels({ credentials: signedIn() })
  models.setProvider(release.codex())
  const model = models.getModels('openai-codex')[0]!
  const faults: BridgeFault[] = []
  const prototype = Object.getPrototypeOf(models) as object
  const original = Object.getOwnPropertyDescriptor(prototype, 'streamSimple')
  const bridge = installPriorityBridge(prototype, (fault) => { faults.push(fault) })
  cleanup.push(() => { bridge.dispose() })
  /** llm-pi-ai's part behind `next()`: one pi-ai call, its events as dsh chunks. */
  const call = (options: object = {}) => async function* (): AsyncIterable<StreamChunk> {
    const events = models.streamSimple(model, { messages: [{ role: 'user', content: 'hi', timestamp: Date.now() }] }, {
      transport: 'sse', fetch: endpoint.fetch, sessionId: 'session-test', ...options,
    })
    for await (const event of events) {
      if (event.type === 'text_delta') yield { type: 'text-delta', index: 0, text: event.delta ?? '' }
      if (event.type === 'done') yield { type: 'finish', reason: { kind: 'stop' } }
      if (event.type === 'error') throw new Error(`pi-ai answered with an error: ${JSON.stringify(event)}`)
    }
  }
  return { bridge, model, call, faults, bodies: endpoint.bodies, prototype, original }
}

async function drain(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

const on = async (): Promise<boolean> => true
const off = async (): Promise<boolean> => false

it('runs on exactly the pi-ai releases the bridge names as tested', () => {
  expect(Object.keys(RELEASES)).toEqual([...TESTED_PI_AI])
  for (const [version, release] of Object.entries(RELEASES)) {
    const manifest = JSON.parse(readFileSync(findPackageJSON(release.entry)!, 'utf8')) as { name: string; version: string }
    expect([manifest.name, manifest.version]).toEqual(['@earendil-works/pi-ai', version])
  }
})

describe.each(Object.entries(RELEASES))('pi-ai %s', (_, release) => {
  it('sends a session that is on with service_tier priority', async () => {
    const { bridge, model, call, faults, bodies } = setup(release)
    expect(model.api).toBe('openai-codex-responses')
    expect(await drain(bridge.stream(loop(model.id), call(), on))).toEqual([
      { type: 'text-delta', index: 0, text: 'ok' },
      { type: 'finish', reason: { kind: 'stop' } },
    ])
    expect(bodies).toHaveLength(1)
    expect(bodies[0]).toMatchObject({ model: model.id, service_tier: 'priority', prompt_cache_key: 'session-test' })
    expect(faults).toEqual([])
  })

  it('sends a session that is off as pi-ai builds it', async () => {
    const { bridge, model, call, bodies } = setup(release)
    await drain(bridge.stream(loop(model.id), call(), off))
    expect(bodies[0]).not.toHaveProperty('service_tier')
  })

  it('keeps a payload hook the caller passes', async () => {
    const { bridge, model, call, bodies } = setup(release)
    const onPayload = async (payload: unknown) => ({ ...payload as object, text: { verbosity: 'high' } })
    await drain(bridge.stream(loop(model.id), call({ onPayload }), on))
    expect(bodies[0]).toMatchObject({ text: { verbosity: 'high' }, service_tier: 'priority' })
  })

  it('gives pi-ai its own method back when disposed', async () => {
    const { bridge, model, call, bodies, prototype, original } = setup(release)
    bridge.dispose()
    expect(Object.getOwnPropertyDescriptor(prototype, 'streamSimple')).toEqual(original)
    await drain(call()())
    expect(bodies[0]).not.toHaveProperty('service_tier')
  })
})
