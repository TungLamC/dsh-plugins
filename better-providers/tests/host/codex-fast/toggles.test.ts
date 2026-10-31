import { describe, expect, it, vi } from 'vitest'
import { createSessionToggles, type SwitchStore, type TogglesOptions } from '../../../src/host/codex-fast/toggles.ts'

/** Switches held in memory the way dsh's storage holds them: readable once a write is durable. */
function memory(initial: Record<string, boolean> = {}): SwitchStore & { records: Map<string, boolean>; fail: boolean; puts: number } {
  const records = new Map(Object.entries(initial))
  return {
    records,
    fail: false,
    puts: 0,
    get: sessionId => records.get(sessionId),
    async put(sessionId, enabled) {
      this.puts += 1
      await Promise.resolve()
      if (this.fail) throw new Error('disk full')
      records.set(sessionId, enabled)
    },
  }
}

function toggles(store: SwitchStore | Promise<SwitchStore>, options: Partial<TogglesOptions> = {}) {
  return createSessionToggles({ store: Promise.resolve(store), parentOf: () => undefined, initial: () => false, ...options })
}

async function* take<T>(stream: AsyncIterable<T>, count: number): AsyncIterable<T> {
  let left = count
  for await (const value of stream) {
    yield value
    left -= 1
    if (left === 0) return
  }
}

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = []
  for await (const value of stream) values.push(value)
  return values
}

describe('createSessionToggles', () => {
  it('records the default the first time a session is seen and keeps it when the default changes', async () => {
    const store = memory()
    let initial = true
    const sessions = toggles(store, { initial: () => initial })
    expect(await sessions.enabled('a')).toBe(true)
    initial = false
    expect(await sessions.enabled('a')).toBe(true)
    expect(await sessions.enabled('b')).toBe(false)
    expect(Object.fromEntries(store.records)).toEqual({ a: true, b: false })
  })

  it('reads a stored switch and stores a change', async () => {
    const store = memory({ a: true })
    const sessions = toggles(store)
    expect(await sessions.enabled('a')).toBe(true)
    expect(await sessions.set('a', false)).toBe(false)
    expect(await sessions.enabled('a')).toBe(false)
    expect(store.records.get('a')).toBe(false)
  })

  it('gives a forked or delegated session its parent\'s switch, recording the parent too', async () => {
    const store = memory({ parent: true })
    const parents: Record<string, string> = { child: 'parent', grandchild: 'child', orphan: 'unseen' }
    const sessions = toggles(store, { parentOf: id => parents[id], initial: () => false })
    expect(await sessions.enabled('grandchild')).toBe(true)
    expect(await sessions.enabled('orphan')).toBe(false)
    expect(Object.fromEntries(store.records)).toEqual({ parent: true, child: true, grandchild: true, unseen: false, orphan: false })
  })

  it('falls back to the default on a lineage it cannot read or that loops', async () => {
    const store = memory()
    const sessions = toggles(store, {
      parentOf: (id) => {
        if (id === 'broken') throw new Error('no session store')
        return id === 'a' ? 'b' : id === 'b' ? 'a' : undefined
      },
      initial: () => true,
    })
    expect(await sessions.enabled('broken')).toBe(true)
    expect(await sessions.enabled('a')).toBe(true)
    expect(store.records.get('b')).toBe(true)
  })

  it('records a session seen twice at once only once', async () => {
    const store = memory()
    const sessions = toggles(store, { initial: () => true })
    expect(await Promise.all([sessions.enabled('a'), sessions.enabled('a')])).toEqual([true, true])
    expect(store.puts).toBe(1)
  })

  it('keeps a session off while its first record cannot be written, and tries again on the next sight', async () => {
    const store = memory()
    const sessions = toggles(store, { initial: () => true })
    store.fail = true
    expect(await sessions.enabled('a')).toBe(false)
    expect(store.records.has('a')).toBe(false)
    store.fail = false
    expect(await sessions.enabled('a')).toBe(true)
  })

  it('treats every session as off and refuses changes when storage cannot be opened', async () => {
    const sessions = createSessionToggles({ store: Promise.reject(new Error('already open')), parentOf: () => undefined, initial: () => true })
    expect(await sessions.enabled('a')).toBe(false)
    expect(await collect(take(sessions.watch('a', new AbortController().signal), 1))).toEqual([false])
    await expect(sessions.set('a', true)).rejects.toMatchObject({ reason: 'storage-unavailable' })
  })

  it('passes on a failed write of a change', async () => {
    const store = memory({ a: false })
    const sessions = toggles(store)
    store.fail = true
    await expect(sessions.set('a', true)).rejects.toThrow('disk full')
    expect(await sessions.enabled('a')).toBe(false)
  })

  it('streams the session\'s switch at once and then each change of it, until aborted', async () => {
    const store = memory()
    const sessions = toggles(store, { initial: () => true })
    const controller = new AbortController()
    const seen: boolean[] = []
    const watching = (async () => {
      for await (const value of sessions.watch('a', controller.signal)) {
        seen.push(value)
        if (seen.length === 1) {
          // Another session's write wakes the watcher, which yields nothing new.
          await sessions.set('b', true)
          await sessions.set('a', false)
        }
        if (seen.length === 2) {
          await sessions.set('a', true)
        }
        if (seen.length === 3) controller.abort()
      }
    })()
    await watching
    expect(seen).toEqual([true, false, true])
  })

  it('does not wake watchers on a failed first record', async () => {
    const store = memory()
    const sessions = toggles(store, { initial: () => true })
    store.fail = true
    const put = vi.spyOn(store, 'put')
    const controller = new AbortController()
    const seen: boolean[] = []
    const watching = (async () => { for await (const value of sessions.watch('a', controller.signal)) seen.push(value) })()
    await new Promise(resolve => setTimeout(resolve, 20))
    controller.abort()
    await watching
    expect(seen).toEqual([false])
    expect(put).toHaveBeenCalledOnce()
  })
})
