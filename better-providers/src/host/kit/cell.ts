/**
 * A value whose latest state can be streamed to any number of watchers. A slow
 * watcher never queues changes: it gets the current value when it next asks.
 */

export interface Cell<T> {
  get(): T
  /** Replace the value; watchers wake only when it differs from the current one. */
  set(next: T): void
  /** The current value at once, then the latest value after each change, until `signal` aborts. */
  watch(signal: AbortSignal): AsyncIterable<T>
}

export function cell<T>(initial: T, equal: (a: T, b: T) => boolean = Object.is): Cell<T> {
  let value = initial
  let version = 0
  const wakers = new Set<() => void>()

  return {
    get: () => value,
    set(next) {
      if (equal(value, next)) return
      value = next
      version += 1
      for (const wake of [...wakers]) wake()
    },
    async *watch(signal) {
      let seen = -1
      while (!signal.aborted) {
        if (seen !== version) {
          seen = version
          yield value
          continue
        }
        const { promise, resolve } = Promise.withResolvers<void>()
        const wake = (): void => { resolve() }
        wakers.add(wake)
        signal.addEventListener('abort', wake, { once: true })
        try {
          await promise
        } finally {
          wakers.delete(wake)
          signal.removeEventListener('abort', wake)
        }
      }
    },
  }
}
