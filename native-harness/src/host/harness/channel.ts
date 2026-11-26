/** Single-consumer async channel. `close(error)` lets buffered values drain, then rejects. */
export class Channel<T> implements AsyncIterator<T> {
  private values: T[] = []
  private waiter?: () => void
  private ended = false
  private failure?: Error

  get closed(): boolean {
    return this.ended
  }
  push(value: T): void {
    if (this.ended) return
    this.values.push(value)
    this.wake()
  }
  close(error?: Error): void {
    if (this.ended) return
    this.ended = true
    this.failure = error
    this.wake()
  }
  async next(): Promise<IteratorResult<T>> {
    while (true) {
      if (this.values.length) return { value: this.values.shift()!, done: false }
      if (this.failure) throw this.failure
      if (this.ended) return { value: undefined, done: true }
      await new Promise<void>((resolve) => {
        this.waiter = resolve
      })
    }
  }
  [Symbol.asyncIterator](): AsyncIterator<T> {
    return this
  }
  private wake(): void {
    const waiter = this.waiter
    this.waiter = undefined
    waiter?.()
  }
}

/** A promise with its settle functions, settled at most once. */
export class Deferred<T> {
  readonly promise: Promise<T>
  settled = false
  private resolveFn!: (value: T) => void
  constructor() {
    this.promise = new Promise<T>((resolve) => {
      this.resolveFn = resolve
    })
  }
  resolve(value: T): void {
    if (this.settled) return
    this.settled = true
    this.resolveFn(value)
  }
}
