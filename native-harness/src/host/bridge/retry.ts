/**
 * A native harness retrying a model request, shown as dsh's own retry card:
 * the `llm/retry` and `llm/retry-started` events dsh-llm-retry records for
 * dsh's providers (dsh 0.2.2-rc.5 and later), which dsh's chat view draws as
 * one card per retry chain, updated in place, with a countdown and the failure.
 * A retry still waiting when its step closes is shown as cancelled.
 */
import { randomUUID } from 'node:crypto'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { RetryId } from '@deepseek-ai/dsh-llm-retry/types'
import type { NativeRetry } from '../harness/types.ts'

/** Keeps these events apart from dsh-llm-retry's own count for the same provider. */
export const RETRY_POLICY_KEY = 'native-harness'

export interface StepPosition {
  turn: number
  step: number
}

export class RetryCard {
  private chain?: RetryId
  private waiting?: StepPosition & { retry: number; timer: ReturnType<typeof setTimeout> }
  private readonly agent: Agent
  private readonly provider: string
  private readonly position: () => StepPosition | undefined
  private readonly log: (message: string) => void

  constructor(agent: Agent, provider: string, position: () => StepPosition | undefined, log: (message: string) => void) {
    this.agent = agent
    this.provider = provider
    this.position = position
    this.log = log
  }

  /** The native harness waits `retry.delayMs`, then tries again. */
  scheduled(retry: NativeRetry): void {
    const at = this.position()
    if (!at) return
    // A further retry means the previous attempt was made and failed.
    this.started()
    const retryId = (this.chain ??= randomUUID() as RetryId)
    const failure = { code: retry.code, message: retry.reason, ...(retry.status !== undefined ? { status: retry.status } : {}) }
    const appended = this.append(() =>
      this.agent.session.append('llm/retry', {
        retryId,
        turn: at.turn,
        step: at.step,
        provider: this.provider,
        mode: 'normal',
        policyKey: RETRY_POLICY_KEY,
        retry: retry.attempt,
        maxRetries: retry.maxRetries,
        delayMs: retry.delayMs,
        failure,
      }),
    )
    if (!appended) return
    const timer = setTimeout(() => this.started(), retry.delayMs)
    timer.unref?.()
    this.waiting = { ...at, retry: retry.attempt, timer }
  }

  /** A response came back: the chain is over, and a later failure starts a new card. */
  answered(): void {
    this.started()
    this.chain = undefined
  }

  /** The step is over. A retry still waiting stays scheduled, which dsh shows as cancelled. */
  close(): void {
    if (this.waiting) clearTimeout(this.waiting.timer)
    this.waiting = undefined
    this.chain = undefined
  }

  private started(): void {
    const waiting = this.waiting
    const retryId = this.chain
    if (!waiting || !retryId) return
    clearTimeout(waiting.timer)
    this.waiting = undefined
    this.append(() =>
      this.agent.session.append('llm/retry-started', { retryId, turn: waiting.turn, step: waiting.step, retry: waiting.retry }),
    )
  }

  /** The card is a display aid: a session that refuses the event must not fail the step. */
  private append(write: () => unknown): boolean {
    try {
      write()
      return true
    } catch (error) {
      this.log(`retry card: ${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  }
}
