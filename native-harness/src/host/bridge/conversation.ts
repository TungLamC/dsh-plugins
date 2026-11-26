/**
 * One live native session seen from dsh: a pump drains native events, routes
 * tool outcomes to observation waits, and queues step content for the dsh
 * step that will display it.
 */
import type { ActivityOutcome } from '../../shared/activity.ts'
import { Deferred } from '../harness/channel.ts'
import type { NativeCut, NativeEvent, NativeRef, NativeSession } from '../harness/types.ts'

export interface ConversationHooks {
  /** A native turn started while no dsh turn is consuming events. */
  nativeTurn(origin: 'user' | 'native'): void
  /** A native turn ended with no dsh turn consuming it (e.g. after an interrupt). */
  quiet(): void
  ref(ref: NativeRef): void
  /** The harness switched its permission mode by itself. */
  mode(mode: string): void
  /** A native process started on this endpoint. */
  endpoint?(endpoint: string): void
  log(message: string): void
}

interface ToolState {
  done: Deferred<ActivityOutcome>
  output?: string
}
const TOOL_LIMIT = 512

export class Conversation {
  readonly tools = new Map<string, ToolState>()
  readonly forwarded: Set<string>
  /** A native turn is running. */
  turnActive = false
  /** A dsh turn is open and will consume queued step content. */
  consuming = false
  /** A dsh step stream is reading right now. */
  streaming = false
  /** A notice to show before the next output. */
  notice?: string
  /** Final cut of the latest completed native turn, waiting for dsh to commit it. */
  pendingCut?: NativeCut
  finalSeq?: { seq: number; turn: number }
  closed = false
  failure?: Error
  private queue: NativeEvent[] = []
  private waiters = new Set<() => void>()
  private discarding = false
  private interrupting?: Promise<void>
  private idle?: NodeJS.Timeout
  private readonly sends = new Set<AbortController>()

  readonly native: NativeSession
  private readonly hooks: ConversationHooks
  constructor(native: NativeSession, forwarded: readonly string[], hooks: ConversationHooks) {
    this.native = native
    this.hooks = hooks
    this.forwarded = new Set(forwarded)
    void this.pump()
  }

  /** Next queued step event; rejects when the signal aborts or the native session ends. */
  async next(signal: AbortSignal): Promise<NativeEvent> {
    while (true) {
      signal.throwIfAborted()
      const event = this.queue.shift()
      if (event) return event
      if (this.closed) throw this.failure ?? new Error('The native session closed')
      await this.wait(signal)
    }
  }

  /** Put back an event the current step will not display. */
  unshift(event: NativeEvent): void {
    this.queue.unshift(event)
  }

  get hasQueued(): boolean {
    return this.queue.length > 0
  }

  /** Origin of the native turn waiting at the head of the queue, if one is. */
  get queuedOrigin(): 'user' | 'native' | undefined {
    const head = this.queue[0]
    return head?.type === 'turn-start' ? head.origin : undefined
  }

  /** An interrupted turn is still winding down; new input must wait for it. */
  get draining(): boolean {
    return this.discarding
  }

  /** Resolve once the interrupted turn has ended. */
  async drained(signal: AbortSignal): Promise<void> {
    while (this.discarding && !this.closed) {
      signal.throwIfAborted()
      await this.wait(signal)
    }
    signal.throwIfAborted()
  }

  /** Pending sends (steers) belong to the running turn; an interrupt withdraws them. */
  track(controller: AbortController): () => void {
    this.sends.add(controller)
    return () => this.sends.delete(controller)
  }

  /** Interrupt the running native turn once and drop its remaining step content. */
  interrupt(): Promise<void> {
    if (this.interrupting) return this.interrupting
    this.consuming = false
    if (this.turnActive) this.discarding = true
    for (const controller of this.sends) controller.abort()
    this.sends.clear()
    for (const event of this.queue) if (event.type === 'tool-start') this.tools.delete(event.tool)
    this.queue = []
    this.interrupting = this.native
      .interrupt()
      .catch((error) => this.hooks.log(`interrupt failed: ${String(error)}`))
      .finally(() => {
        this.interrupting = undefined
      })
    return this.interrupting
  }

  /** Close the native session after a quiet period with no running turn and no background work. */
  scheduleIdle(ms: number, close: () => void): void {
    clearTimeout(this.idle)
    this.idle = setTimeout(() => {
      // Closing would kill subagents and background tasks; check again once the period has passed.
      if (this.native.tasks().some((task) => task.background)) this.scheduleIdle(ms, close)
      else if (!this.turnActive && !this.consuming && !this.streaming) close()
    }, ms)
    this.idle.unref()
  }
  cancelIdle(): void {
    clearTimeout(this.idle)
  }

  private wait(signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.resolve()
    return new Promise<void>((resolve) => {
      const done = () => {
        signal.removeEventListener('abort', done)
        this.waiters.delete(done)
        resolve()
      }
      signal.addEventListener('abort', done, { once: true })
      this.waiters.add(done)
    })
  }

  private async pump(): Promise<void> {
    try {
      while (true) {
        const result = await this.native.events.next()
        if (result.done) break
        this.route(result.value)
      }
    } catch (error) {
      this.failure = error instanceof Error ? error : new Error(String(error))
      this.hooks.log(`native session failed: ${this.failure.message}`)
    } finally {
      this.closed = true
      this.discarding = false
      for (const controller of this.sends) controller.abort()
      this.sends.clear()
      clearTimeout(this.idle)
      this.settleOpenTools('unknown')
      this.wake()
    }
  }

  private route(event: NativeEvent): void {
    switch (event.type) {
      case 'ref':
        this.hooks.ref(event.ref)
        return
      case 'mode':
        this.hooks.mode(event.mode)
        return
      case 'endpoint':
        this.hooks.endpoint?.(event.endpoint)
        return
      case 'tool-progress': {
        const state = this.tools.get(event.tool)
        if (state && event.output !== undefined) state.output = event.output
        return
      }
      case 'tool-end':
        this.tools.get(event.tool)?.done.resolve(event.outcome)
        return
      case 'turn-start':
        this.turnActive = true
        if (!this.consuming && !this.discarding) this.hooks.nativeTurn(event.origin)
        break
      case 'turn-end':
        this.turnActive = false
        this.settleOpenTools(event.outcome === 'interrupted' ? 'interrupted' : 'unknown')
        if (this.discarding) {
          this.discarding = false
          for (const event of this.queue) if (event.type === 'tool-start') this.tools.delete(event.tool)
          this.queue = []
          this.wake()
          this.hooks.quiet()
          return
        }
        if (!this.consuming) this.hooks.quiet()
        break
      case 'tool-start':
        if (!this.discarding && !this.tools.has(event.tool)) {
          // Results are removed when observed; cap what a dsh turn cancelled before dispatch leaves behind.
          if (this.tools.size >= TOOL_LIMIT)
            for (const [id, state] of this.tools) if (state.done.settled) {
              this.tools.delete(id)
              if (this.tools.size < TOOL_LIMIT) break
            }
          this.tools.set(event.tool, { done: new Deferred() })
        }
        break
    }
    if (this.discarding) return
    this.queue.push(event)
    this.wake()
  }

  private settleOpenTools(status: 'unknown' | 'interrupted'): void {
    for (const state of this.tools.values()) {
      if (!state.done.settled)
        state.done.resolve({ status, ...(state.output !== undefined ? { output: state.output } : {}) })
    }
  }

  private wake(): void {
    const waiters = [...this.waiters]
    this.waiters.clear()
    for (const waiter of waiters) waiter()
  }
}
