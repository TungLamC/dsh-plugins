/**
 * The latest value of a Remote stream, kept across reconnects: when the stream
 * ends or fails it is reopened after a backoff, and the last value stays visible
 * meanwhile. Shaped for React's useSyncExternalStore.
 */

export interface Followed<T> {
  /** The latest value, or undefined before the first one arrives. */
  get(): T | undefined
  /** Whether the stream is currently disconnected (it is being reopened). */
  lost(): boolean
  subscribe(listener: () => void): () => void
  dispose(): void
}

export interface Timers {
  set(fn: () => void, ms: number): unknown
  clear(handle: unknown): void
}

export interface FollowOptions {
  /** Delay before reopening after the n-th consecutive failure (n starts at 0). */
  backoff?(attempt: number): number
  timers?: Timers
}

const defaultBackoff = (attempt: number): number => Math.min(30_000, 500 * 2 ** attempt)
const defaultTimers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: handle => { clearTimeout(handle as ReturnType<typeof setTimeout>) } }

export function follow<T>(open: (signal: AbortSignal) => AsyncIterable<T>, options: FollowOptions = {}): Followed<T> {
  const backoff = options.backoff ?? defaultBackoff
  const timers = options.timers ?? defaultTimers
  const listeners = new Set<() => void>()
  const lifetime = new AbortController()
  let value: T | undefined
  let disconnected = false
  let timer: unknown

  const notify = (): void => { for (const listener of [...listeners]) listener() }

  async function run(attempt: number): Promise<void> {
    if (lifetime.signal.aborted) return
    let next = attempt
    try {
      for await (const item of open(lifetime.signal)) {
        value = item
        disconnected = false
        next = 0
        notify()
      }
    } catch {
      // The reason is not shown; the stream is simply reopened.
    }
    if (lifetime.signal.aborted) return
    if (!disconnected) {
      disconnected = true
      notify()
    }
    timer = timers.set(() => { void run(next + 1) }, backoff(next))
  }

  void run(0)
  return {
    get: () => value,
    lost: () => disconnected,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    dispose() {
      lifetime.abort()
      if (timer !== undefined) timers.clear(timer)
      listeners.clear()
    },
  }
}
