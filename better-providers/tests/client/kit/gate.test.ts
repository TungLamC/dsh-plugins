import { describe, expect, it } from 'vitest'
import type { Followed } from '../../../src/client/kit/follow.ts'
import { gateParts } from '../../../src/client/kit/gate.ts'

type Parts = Record<'a' | 'b', boolean>

function source(): Followed<Parts> & { set(value: Parts | undefined): void } {
  let value: Parts | undefined
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    lost: () => false,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() { listeners.clear() },
    set(next) { value = next; for (const listener of listeners) listener() },
  }
}

function recorder(log: string[], name: string): () => () => void {
  return () => { log.push(`+${name}`); return () => { log.push(`-${name}`) } }
}

describe('gateParts', () => {
  it('treats an unknown presence as nothing running', () => {
    const log: string[] = []
    const presence = source()
    gateParts(presence, { a: recorder(log, 'a'), b: recorder(log, 'b') })
    expect(log).toEqual([])
  })

  it('registers once on a rising edge and disposes once on a falling edge', () => {
    const log: string[] = []
    const presence = source()
    gateParts(presence, { a: recorder(log, 'a'), b: recorder(log, 'b') })
    presence.set({ a: true, b: false })
    presence.set({ a: true, b: false })
    presence.set({ a: false, b: true })
    expect(log).toEqual(['+a', '-a', '+b'])
  })

  it('keeps a composite registered while any of its parts runs, around the parts', () => {
    const log: string[] = []
    const presence = source()
    gateParts(presence, { a: recorder(log, 'a'), b: recorder(log, 'b') }, [
      { when: p => p.a || p.b, register: recorder(log, 'host') },
    ])
    presence.set({ a: true, b: false })
    presence.set({ a: true, b: true })
    presence.set({ a: false, b: true })
    presence.set({ a: false, b: false })
    expect(log).toEqual(['+host', '+a', '+b', '-a', '-b', '-host'])
  })

  it('isolates a failing registrar and retries it on the next rising edge', () => {
    const log: string[] = []
    const errors: unknown[] = []
    let fail = true
    const presence = source()
    gateParts(presence, {
      a: () => { if (fail) throw new Error('slot missing'); log.push('+a'); return () => { log.push('-a') } },
      b: recorder(log, 'b'),
    }, [], error => { errors.push(error) })
    presence.set({ a: true, b: true })
    expect(errors).toHaveLength(1)
    expect(log).toEqual(['+b'])
    fail = false
    presence.set({ a: false, b: true })
    presence.set({ a: true, b: true })
    expect(log).toEqual(['+b', '+a'])
  })

  it('disposes everything when stopped', () => {
    const log: string[] = []
    const presence = source()
    const stop = gateParts(presence, { a: recorder(log, 'a'), b: recorder(log, 'b') }, [
      { when: p => p.a, register: recorder(log, 'host') },
    ])
    presence.set({ a: true, b: true })
    stop()
    expect(log).toEqual(['+host', '+a', '+b', '-a', '-b', '-host'])
    presence.set({ a: false, b: false })
    expect(log).toHaveLength(6)
  })
})
