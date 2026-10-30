import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineRemote } from '../../src/shared/remote.ts'
import { providerId } from '../../src/shared/ids.ts'

describe('defineRemote', () => {
  const remote = defineRemote('pkg/part', 'ns', {
    watch: { params: [['provider', providerId]], stream: true, signal: true },
    set: { params: [['provider', providerId], ['enabled', z.boolean()]] },
  })

  it('describes each method under the package and namespace', () => {
    expect(remote.package).toBe('pkg/part')
    const [watch, set] = remote.descriptors
    expect(watch).toMatchObject({ id: 'pkg/part#ns/watch', service: 'ns', namespace: 'ns', method: 'watch', mode: 'stream', cancellation: { parameter: 'signal' }, result: { mode: 'src-json' } })
    expect(set).not.toHaveProperty('mode')
    expect(set).not.toHaveProperty('cancellation')
    expect(set?.parameters.map(parameter => parameter.name)).toEqual(['provider', 'enabled'])
  })

  it('validates parameters with the given schemas', () => {
    const codec = remote.descriptors[0]?.parameters[0]?.codec
    if (codec?.mode !== 'strict') throw new Error('expected a strict codec')
    expect(codec.typeSymbol).toBe('pkg/part#ns/watch:provider')
    expect(() => codec.create().parse('openai-codex')).not.toThrow()
    expect(() => codec.create().parse('OpenAI/x')).toThrow()
  })
})
