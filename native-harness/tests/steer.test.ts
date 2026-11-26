import assert from 'node:assert/strict'
import { test } from 'vitest'
import { SteerLedger } from '../src/host/harness/codex/events.ts'

test('steers Codex never took into the turn are what an interrupt drops', () => {
  const ledger = new SteerLedger()
  ledger.add('a', [{ type: 'text', text: 'first' }])
  ledger.add('b', [{ type: 'text', text: 'second' }])
  ledger.add('c', [{ type: 'text', text: 'third' }])
  ledger.taken('b')
  ledger.taken('turn-input')
  assert.deepEqual(ledger.drain(), {
    ids: ['a', 'c'],
    items: [
      { type: 'text', text: 'first' },
      { type: 'text', text: 'third' },
    ],
  })
  assert.deepEqual(ledger.drain(), { ids: [], items: [] })
})

test('a steer the harness still runs after a stop is shown once and never sent twice', async () => {
  const { world } = await import('./support.ts')
  const { createUserMessage } = await import('@deepseek-ai/dsh-llm')
  let steerId = ''
  const w = await world((session, input, mode) => {
    if (mode === 'steer') {
      steerId = input.id
      return
    }
    if (input.text !== 'long job') return
    // Like Claude's queue or the Codex adapter's resend: the dropped steer runs as the next native turn.
    session.onInterrupt = () =>
      setTimeout(() => {
        session.emit({ type: 'turn-end', turn: 't1', outcome: 'interrupted' })
        session.emit(
          { type: 'turn-start', turn: 't2', origin: 'user', inputIds: [steerId] },
          { type: 'call-start', call: 'c2' },
          { type: 'delta', call: 'c2', block: 'text', key: 'm', text: 'handled the steer' },
          { type: 'call-end', call: 'c2' },
          { type: 'turn-end', turn: 't2', outcome: 'completed' },
        )
      }, 20)
    session.emit(
      { type: 'turn-start', turn: 't1', origin: 'user', inputIds: [input.id] },
      { type: 'call-start', call: 'c1' },
      { type: 'delta', call: 'c1', block: 'text', key: 'm', text: 'working' },
    )
  })
  try {
    w.send('long job')
    await new Promise((resolve) => setTimeout(resolve, 30))
    w.agent.steer(createUserMessage({ content: [{ type: 'text', text: 'also this' }], source: { kind: 'user' } }))
    await new Promise((resolve) => setTimeout(resolve, 30))
    w.agent.cancel({ kind: 'user' }, { keepInbox: true })
    await new Promise((resolve) => setTimeout(resolve, 150))
    await w.idle()
    const sent = w.fake.sessions[0]!.sent.map((entry) => [entry.mode, entry.input.text])
    assert.deepEqual(sent, [
      ['turn', 'long job'],
      ['steer', 'also this'],
    ])
    const shown = w.events.flatMap((event) =>
      event.type === 'assistant/message'
        ? event.data.message.content.flatMap((block) => (block.type === 'text' ? [block.text] : []))
        : [],
    )
    assert.equal(shown.filter((text) => text.includes('handled the steer')).length, 1)
  } finally {
    await w.close()
  }
})

test('each dsh turn opened for native work says why it was opened', async () => {
  const { world } = await import('./support.ts')
  const { createUserMessage } = await import('@deepseek-ai/dsh-llm')
  const reasons: string[] = []
  const w = await world(
    (session, input) => {
      session.emit(
        { type: 'turn-start', turn: 't1', origin: 'user', inputIds: [input.id] },
        { type: 'call-start', call: 'c1' },
        { type: 'delta', call: 'c1', block: 'text', key: 'm', text: 'part one' },
        { type: 'call-end', call: 'c1' },
        { type: 'call-start', call: 'c2' },
        { type: 'delta', call: 'c2', block: 'text', key: 'm', text: 'part two' },
        { type: 'call-end', call: 'c2' },
        { type: 'turn-end', turn: 't1', outcome: 'completed' },
        { type: 'turn-start', turn: 't2', origin: 'user', inputIds: ['queued-slash'] },
        { type: 'call-start', call: 'c3' },
        { type: 'delta', call: 'c3', block: 'text', key: 'm', text: 'queued' },
        { type: 'call-end', call: 'c3' },
        { type: 'turn-end', turn: 't2', outcome: 'completed' },
      )
      setTimeout(
        () =>
          session.emit(
            { type: 'turn-start', turn: 't3', origin: 'native', inputIds: [] },
            { type: 'call-start', call: 'c4' },
            { type: 'delta', call: 'c4', block: 'text', key: 'm', text: 'background done' },
            { type: 'call-end', call: 'c4' },
            { type: 'turn-end', turn: 't3', outcome: 'completed' },
          ),
        200,
      )
    },
    {
      startTurn: (agent, reason) => {
        reasons.push(reason)
        agent.followup(
          createUserMessage({
            content: [{ type: 'text', text: reason }],
            source: { kind: 'native-harness', form: 'notice', summary: reason } as never,
          }),
        )
      },
    },
  )
  try {
    w.send('go')
    await new Promise((resolve) => setTimeout(resolve, 500))
    await w.idle()
    assert.deepEqual(reasons, ['continued', 'queued', 'native'])
  } finally {
    await w.close()
  }
})

test('a Codex turn ending withdraws only its own thread’s pending requests, not a subagent’s', async () => {
  const { mkdtempSync, writeFileSync, chmodSync } = await import('node:fs')
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')
  const { Rpc } = await import('../src/host/harness/codex/rpc.ts')
  const dir = mkdtempSync(join(tmpdir(), 'nh-fake-codex-'))
  const command = join(dir, 'codex')
  writeFileSync(
    command,
    `#!/usr/bin/env node
const out = (value) => process.stdout.write(JSON.stringify(value) + '\\n')
out({ id: 1, method: 'item/commandExecution/requestApproval', params: { threadId: 'main', itemId: 'a' } })
out({ id: 2, method: 'item/commandExecution/requestApproval', params: { threadId: 'child', itemId: 'b' } })
process.stdin.resume()
`,
  )
  chmodSync(command, 0o755)
  const rpc = new Rpc(command, dir, 'session-test')
  const signals = new Map<string, AbortSignal>()
  rpc.onRequest = (_method, params, signal) => {
    signals.set(String(params.threadId), signal)
    return new Promise(() => {})
  }
  try {
    for (let i = 0; i < 50 && signals.size < 2; i++) await new Promise((resolve) => setTimeout(resolve, 20))
    rpc.abortServing('main')
    assert.equal(signals.get('main')?.aborted, true)
    assert.equal(signals.get('child')?.aborted, false)
  } finally {
    await rpc.close()
  }
})

test('a Codex subagent approval asks the user without adding a tool to the parent’s transcript', async () => {
  const { CodexHarness } = await import('../src/host/harness/codex/index.ts')
  const titles: string[] = []
  const harness = new CodexHarness({ command: 'codex' })
  const session = (await harness.open(
    { dshSessionId: 'session-x', cwd: '/tmp', origin: { kind: 'new' }, settings: {} },
    {
      interactions: {
        approve: async (request) => {
          titles.push(request.title)
          return { kind: 'allow' }
        },
        ask: async () => ({ answers: [] }),
        reviewPlan: async () => 'approve',
      },
      signal: new AbortController().signal,
      log: () => {},
    },
  )) as unknown as {
    threadId: string
    serverRequest(method: string, params: Record<string, unknown>, signal: AbortSignal): Promise<unknown>
    events: { next(): Promise<IteratorResult<unknown>> }
    close(): Promise<void>
  }
  session.threadId = 'main'
  const reply = await session.serverRequest(
    'item/commandExecution/requestApproval',
    { threadId: 'child', itemId: 'b', command: 'ls' },
    new AbortController().signal,
  )
  assert.deepEqual(reply, { decision: 'accept' })
  assert.deepEqual(titles, ['Subagent · Shell'])
  const pending = await Promise.race([session.events.next(), new Promise((resolve) => setTimeout(() => resolve('none'), 30))])
  assert.equal(pending, 'none')
  await session.close()
})
