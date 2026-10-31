import { describe, expect, it, vi } from 'vitest'
import { markAgentLoopRequest, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { installPriorityBridge, untestedPiAi, type BridgeFault, type PriorityBridge } from '../../../src/host/codex-fast/bridge.ts'

interface FakeModel { provider: string; id: string; api: string }
type Hook = (payload: unknown, model: never) => unknown

const CODEX: FakeModel = { provider: 'openai-codex', id: 'gpt-5.5', api: 'openai-codex-responses' }

/**
 * A stand-in for pi-ai's Models: streamSimple builds a body, offers it to
 * onPayload, and records what it would send. A fresh class per test, since the
 * bridge keeps its replacement on the prototype.
 */
function piAi(options: { offer?: boolean; body?: () => unknown } = {}) {
  const sent: unknown[] = []
  class Models {
    streamSimple(model: FakeModel, _context: unknown, streamOptions?: { onPayload?: Hook }): Promise<void> {
      return (async () => {
        let body: unknown = options.body?.() ?? { model: model.id, input: [] }
        if (options.offer !== false) {
          const next = await streamOptions?.onPayload?.(body, model as never)
          if (next !== undefined) body = next
        }
        sent.push(body)
      })()
    }
  }
  return { models: new Models(), prototype: Models.prototype as object, sent }
}

const answer: StreamChunk[] = [
  { type: 'text-delta', index: 0, text: 'hi' },
  { type: 'finish', reason: { kind: 'stop' } },
]

/** What llm-pi-ai does behind `next()`: one pi-ai call, then the provider's chunks. */
function adapter(call: () => Promise<void>, chunks: StreamChunk[] = answer): () => AsyncIterable<StreamChunk> {
  return async function* () {
    await call()
    yield* chunks
  }
}

function loop(overrides: Partial<GenerateOptions> = {}): GenerateOptions {
  return markAgentLoopRequest({ provider: 'openai-codex', model: 'gpt-5.5', messages: [], sessionId: 's1' as GenerateOptions['sessionId'], ...overrides })
}

async function drain(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

const on = async (): Promise<boolean> => true
const off = async (): Promise<boolean> => false

function install(target: object | undefined): { bridge: PriorityBridge; faults: BridgeFault[] } {
  const faults: BridgeFault[] = []
  return { bridge: installPriorityBridge(target, (fault) => { faults.push(fault) }), faults }
}

async function supported(bridge: PriorityBridge): Promise<boolean> {
  const controller = new AbortController()
  for await (const value of bridge.support(controller.signal)) {
    controller.abort()
    return value
  }
  throw new Error('no support value')
}

describe('installPriorityBridge', () => {
  it('asks for priority on the Codex body of an agent-loop request whose session is on', async () => {
    const { models, prototype, sent } = piAi()
    const { bridge, faults } = install(prototype)
    const enabled = vi.fn(on)
    const chunks = await drain(bridge.stream(loop(), adapter(() => models.streamSimple(CODEX, {})), enabled))
    expect(chunks).toEqual(answer)
    expect(enabled).toHaveBeenCalledWith('s1')
    expect(sent).toEqual([{ model: 'gpt-5.5', input: [], service_tier: 'priority' }])
    expect(faults).toEqual([])
    expect(await supported(bridge)).toBe(true)
  })

  it('leaves the body alone when the session is off, the call is not the agent loop\'s, or not on the Codex route', async () => {
    const { models, prototype, sent } = piAi()
    const { bridge } = install(prototype)
    const enabled = vi.fn(on)
    const call = adapter(() => models.streamSimple(CODEX, {}))
    await drain(bridge.stream(loop(), call, off))
    await drain(bridge.stream({ provider: 'openai-codex', model: 'gpt-5.5', messages: [], sessionId: 's1' as GenerateOptions['sessionId'], purpose: 'compaction' }, call, enabled))
    await drain(bridge.stream(loop({ sessionId: undefined }), call, enabled))
    await drain(bridge.stream(loop({ provider: 'my-codex' }), adapter(() => models.streamSimple({ ...CODEX, provider: 'my-codex' }, {})), enabled))
    expect(enabled).not.toHaveBeenCalled()
    expect(sent).toEqual(Array.from({ length: 4 }, () => ({ model: 'gpt-5.5', input: [] })))
  })

  it('counts a switch that cannot be read as off', async () => {
    const { models, prototype, sent } = piAi()
    const { bridge, faults } = install(prototype)
    await drain(bridge.stream(loop(), adapter(() => models.streamSimple(CODEX, {})), () => Promise.reject(new Error('storage closed'))))
    expect(sent).toEqual([{ model: 'gpt-5.5', input: [] }])
    expect(faults).toEqual([])
  })

  it('touches only the call for the request\'s own model on the Codex protocol', async () => {
    const { models, prototype, sent } = piAi()
    const { bridge, faults } = install(prototype)
    await drain(bridge.stream(loop(), adapter(async () => {
      await models.streamSimple({ ...CODEX, id: 'gpt-5.4' }, {})
      await models.streamSimple({ ...CODEX, api: 'openai-responses' }, {})
      await models.streamSimple(CODEX, {})
    }), on))
    expect(sent).toEqual([
      { model: 'gpt-5.4', input: [] },
      { model: 'gpt-5.5', input: [] },
      { model: 'gpt-5.5', input: [], service_tier: 'priority' },
    ])
    expect(faults).toEqual([])
  })

  it('runs the caller\'s own payload hook first and keeps its body', async () => {
    const { models, prototype, sent } = piAi()
    const { bridge } = install(prototype)
    const hook = vi.fn(async (payload: unknown) => ({ ...payload as object, prompt_cache_key: 'k' }))
    await drain(bridge.stream(loop(), adapter(() => models.streamSimple(CODEX, {}, { onPayload: hook })), on))
    expect(hook).toHaveBeenCalledOnce()
    expect(sent).toEqual([{ model: 'gpt-5.5', input: [], prompt_cache_key: 'k', service_tier: 'priority' }])
  })

  it('gives a call nested inside a request a scope of its own', async () => {
    const { models, prototype, sent } = piAi()
    const { bridge } = install(prototype)
    const nested = (enabled: () => Promise<boolean>) => adapter(async () => {
      await drain(bridge.stream(loop({ sessionId: 's2' as GenerateOptions['sessionId'] }), adapter(() => models.streamSimple(CODEX, {})), enabled))
      await models.streamSimple(CODEX, {})
    })
    await drain(bridge.stream(loop(), nested(off), on))
    await drain(bridge.stream(loop(), nested(on), off))
    expect(sent).toEqual([
      { model: 'gpt-5.5', input: [] },
      { model: 'gpt-5.5', input: [], service_tier: 'priority' },
      { model: 'gpt-5.5', input: [], service_tier: 'priority' },
      { model: 'gpt-5.5', input: [] },
    ])
  })

  it('keeps the scope for every step, whoever iterates', async () => {
    const { models, prototype, sent } = piAi()
    const { bridge } = install(prototype)
    // The pi-ai call happens only on the second step.
    const late = async function* (): AsyncIterable<StreamChunk> {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      await models.streamSimple(CODEX, {})
      yield* answer
    }
    const iterator = bridge.stream(loop(), late, on)[Symbol.asyncIterator]()
    await iterator.next()
    await new Promise(resolve => setTimeout(resolve, 1))
    await iterator.next()
    await iterator.return?.()
    expect(sent).toEqual([{ model: 'gpt-5.5', input: [], service_tier: 'priority' }])
  })

  it('closes the inner stream inside the scope when the consumer stops early', async () => {
    const { models, prototype, sent } = piAi()
    const { bridge } = install(prototype)
    const closing = async function* (): AsyncIterable<StreamChunk> {
      try {
        yield answer[0]!
      } finally {
        await models.streamSimple(CODEX, {})
      }
    }
    for await (const _ of bridge.stream(loop(), closing, on)) break
    expect(sent).toEqual([{ model: 'gpt-5.5', input: [], service_tier: 'priority' }])
  })

  it.each<[string, BridgeFault, Parameters<typeof piAi>[0], boolean]>([
    ['the replaced method is never reached', 'not-reached', {}, false],
    ['pi-ai never offers the body', 'payload-skipped', { offer: false }, true],
    ['the body is not an object', 'payload-shape', { body: () => 'raw' }, true],
  ])('reports priority unsupported once when %s', async (_, fault, options, calls) => {
    const { models, prototype, sent } = piAi(options)
    const { bridge, faults } = install(prototype)
    const call = adapter(async () => { if (calls) await models.streamSimple(CODEX, {}) })
    expect(await drain(bridge.stream(loop(), call, on))).toEqual(answer)
    await drain(bridge.stream(loop(), call, on))
    expect(faults).toEqual([fault])
    expect(await supported(bridge)).toBe(false)
    // Unsupported, it no longer asks: the second request's body went out as built.
    if (calls) expect(sent.at(-1)).not.toHaveProperty('service_tier')
  })

  it('judges only requests the provider answered, and not one that started another model call', async () => {
    const { prototype } = piAi()
    const { bridge, faults } = install(prototype)
    const failed: StreamChunk[] = [{ type: 'finish', reason: { kind: 'error', failure: { code: 'AUTH', message: 'signed out' } } as never }]
    await drain(bridge.stream(loop(), adapter(async () => {}, failed), on))
    await drain(bridge.stream(loop(), adapter(async () => {
      await drain(bridge.stream(loop({ provider: 'deepseek' }), adapter(async () => {}), on))
    }), on))
    expect(faults).toEqual([])
  })

  it('passes requests through when there is nothing to replace', async () => {
    const { models, sent } = piAi()
    const none = install(undefined)
    const bare = install({})
    expect(none.faults).toEqual([])
    expect(bare.faults).toEqual(['no-method'])
    for (const { bridge } of [none, bare]) {
      const enabled = vi.fn(on)
      expect(await drain(bridge.stream(loop(), adapter(() => models.streamSimple(CODEX, {})), enabled))).toEqual(answer)
      expect(enabled).not.toHaveBeenCalled()
      expect(await supported(bridge)).toBe(false)
    }
    expect(sent).toEqual([{ model: 'gpt-5.5', input: [] }, { model: 'gpt-5.5', input: [] }])
  })

  it('shares one replacement between bridges and restores pi-ai\'s method when the last one leaves', async () => {
    const { models, prototype, sent } = piAi()
    const original = Object.getOwnPropertyDescriptor(prototype, 'streamSimple')
    const first = install(prototype)
    const replaced = Object.getOwnPropertyDescriptor(prototype, 'streamSimple')?.value as unknown
    const second = install(prototype)
    expect(Object.getOwnPropertyDescriptor(prototype, 'streamSimple')?.value).toBe(replaced)
    first.bridge.dispose()
    await drain(second.bridge.stream(loop(), adapter(() => models.streamSimple(CODEX, {})), on))
    expect(sent).toEqual([{ model: 'gpt-5.5', input: [], service_tier: 'priority' }])
    second.bridge.dispose()
    expect(Object.getOwnPropertyDescriptor(prototype, 'streamSimple')).toEqual(original)
    expect(Object.getOwnPropertySymbols(prototype)).toEqual([])
  })

  it('leaves a later replacement in place and reuses its own when installed again', async () => {
    const { models, prototype, sent } = piAi()
    const first = install(prototype)
    const ours = Object.getOwnPropertyDescriptor(prototype, 'streamSimple')!.value as (...args: unknown[]) => unknown
    const theirs = function (this: unknown, ...args: unknown[]): unknown { return ours.apply(this, args) }
    Object.defineProperty(prototype, 'streamSimple', { value: theirs, writable: true, configurable: true })
    first.bridge.dispose()
    expect(Object.getOwnPropertyDescriptor(prototype, 'streamSimple')?.value).toBe(theirs)
    // Ours stays under theirs, inert; the next bridge uses it rather than stacking another.
    await drain(first.bridge.stream(loop(), adapter(() => models.streamSimple(CODEX, {})), on))
    const again = install(prototype)
    expect(Object.getOwnPropertyDescriptor(prototype, 'streamSimple')?.value).toBe(theirs)
    await drain(again.bridge.stream(loop(), adapter(() => models.streamSimple(CODEX, {})), on))
    expect(sent).toEqual([{ model: 'gpt-5.5', input: [] }, { model: 'gpt-5.5', input: [], service_tier: 'priority' }])
  })
})

describe('untestedPiAi', () => {
  it('admits the tested releases and those between them', () => {
    expect(['1.1.0', '1.2.3', '1.4.0', '1.4.0-beta.1'].map(untestedPiAi)).toEqual([false, false, false, false])
  })

  it('flags releases outside them and versions it cannot read', () => {
    expect(['1.0.9', '1.4.1', '2.0.0', 'next'].map(untestedPiAi)).toEqual([true, true, true, true])
  })
})
