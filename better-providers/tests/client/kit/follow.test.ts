import { describe, expect, it } from 'vitest'
import { follow, type Timers } from '../../../src/client/kit/follow.ts'

/** Timers that run only when the test says so. */
function manualTimers(): Timers & { run(): void; pending(): number } {
  const queue = new Map<number, () => void>()
  let next = 0
  return {
    set(fn) { next += 1; queue.set(next, fn); return next },
    clear(handle) { queue.delete(handle as number) },
    run() { const fns = [...queue.values()]; queue.clear(); for (const fn of fns) fn() },
    pending: () => queue.size,
  }
}

const tick = async (): Promise<void> => { for (let i = 0; i < 5; i += 1) await Promise.resolve() }

describe('follow', () => {
  it('has no value before the first item, then the latest one', async () => {
    let push: ((value: number) => void) | undefined
    const followed = follow<number>(async function* () {
      while (true) yield await new Promise<number>((resolve) => { push = resolve })
    }, { timers: manualTimers() })
    expect(followed.get()).toBeUndefined()
    await tick()
    push?.(1)
    await tick()
    expect(followed.get()).toBe(1)
    followed.dispose()
  })

  it('keeps the last value and reopens after the stream fails', async () => {
    const timers = manualTimers()
    let opened = 0
    const followed = follow<number>(async function* () {
      opened += 1
      yield opened
      throw new Error('dropped')
    }, { timers, backoff: () => 10 })
    await tick()
    expect(followed.get()).toBe(1)
    expect(followed.lost()).toBe(true)
    expect(timers.pending()).toBe(1)
    timers.run()
    await tick()
    expect(opened).toBe(2)
    expect(followed.get()).toBe(2)
    followed.dispose()
  })

  it('backs off longer after consecutive failures', async () => {
    const timers = manualTimers()
    const delays: number[] = []
    const followed = follow<number>(async function* () { throw new Error('down') }, {
      timers, backoff: (attempt) => { delays.push(attempt); return 1 },
    })
    await tick()
    timers.run()
    await tick()
    timers.run()
    await tick()
    expect(delays).toEqual([0, 1, 2])
    followed.dispose()
  })

  it('notifies subscribers and stops after dispose', async () => {
    const timers = manualTimers()
    let seen = 0
    const followed = follow<number>(async function* () { yield 1 }, { timers })
    followed.subscribe(() => { seen += 1 })
    await tick()
    expect(seen).toBeGreaterThan(0)
    followed.dispose()
    expect(timers.pending()).toBe(0)
  })
})
