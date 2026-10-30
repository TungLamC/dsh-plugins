import { describe, expect, it } from 'vitest'
import { cell } from '../../../src/host/kit/cell.ts'

async function take<T>(iterator: AsyncIterator<T>): Promise<T> {
  const result = await iterator.next()
  if (result.done === true) throw new Error('stream ended')
  return result.value
}

describe('cell', () => {
  it('yields the current value at once', async () => {
    const value = cell(1)
    const watch = value.watch(new AbortController().signal)[Symbol.asyncIterator]()
    expect(await take(watch)).toBe(1)
  })

  it('collapses a burst of changes to the latest value', async () => {
    const value = cell(1)
    const watch = value.watch(new AbortController().signal)[Symbol.asyncIterator]()
    await take(watch)
    value.set(2)
    value.set(3)
    expect(await take(watch)).toBe(3)
  })

  it('wakes a waiting watcher on change', async () => {
    const value = cell('a')
    const watch = value.watch(new AbortController().signal)[Symbol.asyncIterator]()
    await take(watch)
    const next = take(watch)
    value.set('b')
    expect(await next).toBe('b')
  })

  it('does not wake watchers for an equal value', async () => {
    const value = cell({ n: 1 }, (a, b) => a.n === b.n)
    const controller = new AbortController()
    const watch = value.watch(controller.signal)[Symbol.asyncIterator]()
    await take(watch)
    const next = watch.next()
    value.set({ n: 1 })
    controller.abort()
    expect((await next).done).toBe(true)
  })

  it('keeps watchers independent', async () => {
    const value = cell(0)
    const a = value.watch(new AbortController().signal)[Symbol.asyncIterator]()
    const b = value.watch(new AbortController().signal)[Symbol.asyncIterator]()
    await take(a)
    value.set(1)
    expect(await take(b)).toBe(1)
    expect(await take(a)).toBe(1)
  })

  it('ends a waiting watch when its signal aborts', async () => {
    const value = cell(0)
    const controller = new AbortController()
    const watch = value.watch(controller.signal)[Symbol.asyncIterator]()
    await take(watch)
    const next = watch.next()
    controller.abort()
    expect((await next).done).toBe(true)
  })
})
