import { describe, expect, it } from 'vitest'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { guard, guardStream, Refusal } from '../../../src/host/kit/refusal.ts'

async function failure(promise: Promise<unknown>): Promise<RemoteError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof RemoteError) return error
    throw error
  }
  throw new Error('expected a failure')
}

describe('guard', () => {
  it('returns the call result', async () => {
    expect(await guard(() => 42)).toBe(42)
  })

  it('reports a refusal as a bad request carrying the reason', async () => {
    const error = await failure(guard(() => { throw new Refusal('in-flight', 'llm-pi-ai/xai') }))
    expect(error.code).toBe('gateway/bad-request')
    expect(error.message).toBe('in-flight')
  })

  it('reports anything else as internal', async () => {
    const error = await failure(guard(async () => { throw new Error('boom') }))
    expect(error.code).toBe('gateway/internal')
    expect(error.message).toBe('boom')
  })
})

describe('guardStream', () => {
  it('maps a failure raised while the stream runs', async () => {
    async function* broken(): AsyncIterable<number> {
      yield 1
      throw new Refusal('no-prompt')
    }
    const seen: number[] = []
    const error = await failure((async () => { for await (const item of guardStream(broken)) seen.push(item) })())
    expect(seen).toEqual([1])
    expect(error.code).toBe('gateway/bad-request')
    expect(error.message).toBe('no-prompt')
  })
})
