import assert from 'node:assert/strict'
import { test } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { RETRY_POLICY_KEY } from '../src/host/bridge/retry.ts'
import { retryOf, retrySummary, retryCause } from '../src/host/harness/claude/retry.ts'
import type { NativeEvent, NativeRetry } from '../src/host/harness/types.ts'
import { world } from './support.ts'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** An SDK `api_retry` frame as Claude Code 2.1.328 sends it. */
function frame(attempt: number, status: number | null, error = 'unknown', extra: Record<string, unknown> = {}) {
  return { type: 'system', subtype: 'api_retry', attempt, max_retries: 10, retry_delay_ms: 520, error_status: status, error, uuid: 'u', session_id: 's', ...extra }
}

const retry = (attempt: number, delayMs: number): NativeRetry => ({
  attempt,
  maxRetries: 10,
  delayMs,
  code: 'TRANSPORT',
  reason: 'connection error, no HTTP response / 连接出错，没有收到 HTTP 响应',
})

function retryEvents(events: SessionEvent[]): Record<string, unknown>[] {
  return events.flatMap((event): Record<string, unknown>[] => {
    if (event.type === 'llm/retry') {
      const { retryId, turn, step, retry, delayMs, failure, policyKey, mode } = event.data
      const maxRetries = event.data.mode === 'normal' ? event.data.maxRetries : undefined
      return [{ type: 'retry', retryId, turn, step, retry, maxRetries, delayMs, failure, policyKey, mode }]
    }
    if (event.type === 'llm/retry-started') return [{ type: 'started', ...event.data }]
    return []
  })
}

function replyText(events: SessionEvent[]): string {
  return events
    .flatMap((event) => (event.type === 'assistant/message' ? event.data.message.content : []))
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join('')
}

test('api_retry frames map to dsh failure codes and a reason in both languages', () => {
  assert.deepEqual(retryOf(frame(1, null)), retry(1, 520))
  assert.deepEqual(retryOf(frame(2, 529, 'overloaded')), {
    attempt: 2,
    maxRetries: 10,
    delayMs: 520,
    status: 529,
    code: 'SERVER',
    reason: 'HTTP 529 (overloaded) / HTTP 529（服务过载）',
  })
  assert.equal(retryOf(frame(1, 429, 'rate_limit')).code, 'RATE_LIMIT')
  assert.equal(retryOf(frame(1, 503)).code, 'SERVER')
  assert.equal(retryOf(frame(1, 418)).code, 'HTTP_418')
  assert.deepEqual(retryOf(frame(1, null, 'unknown', { no_response: { waited_ms: 30_000, retry_wait_ms: 60_000 } })), {
    ...retry(1, 520),
    code: 'TIMEOUT',
    reason: 'no response within 30s / 30 秒内没有响应',
  })
  assert.equal(
    retrySummary(10, 252_000, retryCause(frame(10, null))),
    'Claude Code retried the request 10 times over 4m 12s; the last failure was connection error, no HTTP response. / ' +
      'Claude Code 重试了 10 次，历时 4 分 12 秒，最后一次失败：连接出错，没有收到 HTTP 响应。',
  )
})

test('retries that end in a response show as one dsh retry card, nothing in the reply text', async () => {
  const w = await world((session, input) => {
    session.emit({ type: 'turn-start', turn: 't1', origin: 'user', inputIds: [input.id] }, { type: 'retry', retry: retry(1, 20) })
    setTimeout(() => session.emit({ type: 'retry', retry: { ...retry(2, 20), status: 529, code: 'SERVER', reason: 'HTTP 529 (overloaded) / HTTP 529（服务过载）' } }), 40)
    setTimeout(
      () =>
        session.emit(
          { type: 'call-start', call: 'c1' },
          { type: 'delta', call: 'c1', block: 'text', key: 'm', text: 'hello' },
          { type: 'call-end', call: 'c1' },
          { type: 'turn-end', turn: 't1', outcome: 'completed' },
        ),
      50,
    )
  })
  try {
    w.send('hi')
    await sleep(150)
    await w.idle()
    const step = w.events.find((event) => event.type === 'step/start')!.data as { turn: number; step: number }
    const card = retryEvents(w.events)
    const id = card[0]!.retryId
    assert.equal(typeof id, 'string')
    assert.deepEqual(card, [
      { type: 'retry', retryId: id, ...step, retry: 1, maxRetries: 10, delayMs: 20, policyKey: RETRY_POLICY_KEY, mode: 'normal', failure: { code: 'TRANSPORT', message: retry(1, 20).reason } },
      { type: 'started', retryId: id, ...step, retry: 1 },
      { type: 'retry', retryId: id, ...step, retry: 2, maxRetries: 10, delayMs: 20, policyKey: RETRY_POLICY_KEY, mode: 'normal', failure: { code: 'SERVER', message: 'HTTP 529 (overloaded) / HTTP 529（服务过载）', status: 529 } },
      // The response came before the timer: the wait is over all the same.
      { type: 'started', retryId: id, ...step, retry: 2 },
    ])
    assert.equal(replyText(w.events), 'hello')
  } finally {
    await w.close()
  }
})

test('a turn stopped while a retry waits leaves it scheduled, which dsh shows as cancelled', async () => {
  const w = await world((session, input) => {
    session.emit({ type: 'turn-start', turn: 't1', origin: 'user', inputIds: [input.id] }, { type: 'retry', retry: retry(1, 60) })
    setTimeout(() => session.emit({ type: 'turn-end', turn: 't1', outcome: 'interrupted' }), 10)
  })
  try {
    w.send('hi')
    await w.idle()
    // Well past the delay: the closed step's timer must not mark the retry as made.
    await sleep(150)
    assert.deepEqual(
      retryEvents(w.events).map((event) => `${event.type} ${event.retry}`),
      ['retry 1'],
    )
  } finally {
    await w.close()
  }
})

test('a retry that comes before the previous wait has run out on this side still marks that one as made', async () => {
  const w = await world((session, input) => {
    session.emit(
      { type: 'turn-start', turn: 't1', origin: 'user', inputIds: [input.id] },
      { type: 'retry', retry: retry(1, 60_000) },
      { type: 'retry', retry: retry(2, 60_000) },
    )
    setTimeout(() => session.emit({ type: 'turn-end', turn: 't1', outcome: 'interrupted' }), 20)
  })
  try {
    w.send('hi')
    await w.idle()
    assert.deepEqual(
      retryEvents(w.events).map((event) => `${event.type} ${event.retry}`),
      ['retry 1', 'started 1', 'retry 2'],
    )
  } finally {
    await w.close()
  }
})

test('a request retried again after its response broke off starts a new card in the same step', async () => {
  const w = await world((session, input) => {
    session.emit(
      { type: 'turn-start', turn: 't1', origin: 'user', inputIds: [input.id] },
      { type: 'retry', retry: retry(1, 1) },
      { type: 'call-start', call: 'c1' },
      { type: 'delta', call: 'c1', block: 'text', key: 'm1', text: 'hel' },
      { type: 'retry', retry: retry(1, 1) },
      { type: 'call-start', call: 'c2' },
      { type: 'delta', call: 'c2', block: 'text', key: 'm2', text: 'hello' },
      { type: 'call-end', call: 'c2' },
      { type: 'turn-end', turn: 't1', outcome: 'completed' },
    )
  })
  try {
    w.send('hi')
    await w.idle()
    const cards = retryEvents(w.events).filter((event) => event.type === 'retry')
    assert.equal(cards.length, 2)
    assert.notEqual(cards[0]!.retryId, cards[1]!.retryId)
    assert.equal(cards[0]!.step, cards[1]!.step)
  } finally {
    await w.close()
  }
})

test('a failure in a later step starts a new retry card on that step', async () => {
  const w = await world((session, input) => {
    session.emit(
      { type: 'turn-start', turn: 't1', origin: 'user', inputIds: [input.id] },
      { type: 'retry', retry: retry(1, 1) },
    )
    setTimeout(
      () =>
        session.emit(
          { type: 'call-start', call: 'c1' },
          { type: 'tool-start', call: 'c1', tool: 'item-1', activity: { name: 'Bash', kind: 'shell', title: 'Shell', summary: 'ls', command: 'ls' } },
          { type: 'call-end', call: 'c1' },
          { type: 'tool-end', tool: 'item-1', outcome: { status: 'completed', output: '' } },
          { type: 'retry', retry: retry(1, 1) },
        ),
      20,
    )
    setTimeout(
      () =>
        session.emit(
          { type: 'call-start', call: 'c2' },
          { type: 'delta', call: 'c2', block: 'text', key: 'm', text: 'done' },
          { type: 'call-end', call: 'c2' },
          { type: 'turn-end', turn: 't1', outcome: 'completed' },
        ),
      60,
    )
  })
  try {
    w.send('hi')
    await sleep(200)
    await w.idle()
    const cards = retryEvents(w.events).filter((event) => event.type === 'retry')
    assert.equal(cards.length, 2)
    assert.notEqual(cards[0]!.retryId, cards[1]!.retryId)
    assert.notEqual(cards[0]!.step, cards[1]!.step)
  } finally {
    await w.close()
  }
})

/** A Claude session fed SDK frames directly, without a process. */
async function claudeSession() {
  const { ClaudeHarness } = await import('../src/host/harness/claude/index.ts')
  const harness = new ClaudeHarness({ command: 'claude', resolveVariable: async () => undefined })
  const ports = {
    interactions: { approve: async () => ({ kind: 'allow' as const }), ask: async () => ({ answers: [] }), reviewPlan: async () => 'approve' as const },
    signal: new AbortController().signal,
    log: () => {},
  }
  const session = await harness.open({ dshSessionId: 'session-retry', cwd: '/tmp', origin: { kind: 'new' }, settings: {} }, ports)
  const internal = session as unknown as { message(message: unknown): void }
  const events: NativeEvent[] = []
  const drain = async () => {
    while (true) {
      const next = await Promise.race([session.events.next(), sleep(20).then(() => undefined)])
      if (!next || next.done) return events
      events.push(next.value)
    }
  }
  return { feed: (...frames: unknown[]) => frames.forEach((value) => internal.message(value)), drain, close: () => session.close() }
}

const failedResult = { type: 'result', subtype: 'success', is_error: true, result: 'API Error: Connection dropped (ECONNRESET)', modelUsage: {} }

test('a Claude turn that fails while retrying says how many retries it took and the last failure', async () => {
  const s = await claudeSession()
  try {
    s.feed(frame(1, null), frame(2, 529, 'overloaded'), failedResult)
    const events = await s.drain()
    assert.deepEqual(
      events.filter((event) => event.type === 'retry').map((event) => (event.type === 'retry' ? `${event.retry.attempt} ${event.retry.code}` : '')),
      ['1 TRANSPORT', '2 SERVER'],
    )
    const end = events.find((event) => event.type === 'turn-end')
    assert.equal(end?.type === 'turn-end' && end.outcome, 'failed')
    const error = end?.type === 'turn-end' ? (end.error ?? '') : ''
    assert.match(error, /^API Error: Connection dropped \(ECONNRESET\)\nClaude Code retried the request 2 times over 1s; the last failure was HTTP 529 \(overloaded\)\. \/ Claude Code 重试了 2 次/)
  } finally {
    await s.close()
  }
})

test('retries a response ended are not added to a later failure', async () => {
  const s = await claudeSession()
  try {
    s.feed(
      frame(1, null),
      { type: 'stream_event', parent_tool_use_id: null, event: { type: 'message_start', message: { id: 'msg-1', usage: {} } } },
      failedResult,
    )
    const end = (await s.drain()).find((event) => event.type === 'turn-end')
    assert.equal(end?.type === 'turn-end' && end.error, 'API Error: Connection dropped (ECONNRESET)')
  } finally {
    await s.close()
  }
})
