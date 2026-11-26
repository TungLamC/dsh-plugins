import assert from 'node:assert/strict'
import { test } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { NativeEvent } from '../src/host/harness/types.ts'
import { ACTIVITY_TOOL } from '../src/shared/activity.ts'
import { emptyRecord } from '../src/host/store.ts'
import { world } from './support.ts'

const activity = { name: 'commandExecution', kind: 'shell' as const, title: 'Shell', summary: 'ls', command: 'ls' }
const cut = (at: string) => ({ ref: { harness: 'codex' as const, id: 'thread-1' }, at })

function assistantTurns(events: SessionEvent[]) {
  return events.flatMap((event) =>
    event.type === 'assistant/message'
      ? [{ step: event.data.step, content: event.data.message.content.map((block) => block.type), usage: event.data.usage }]
      : [],
  )
}

test('one native turn with a tool becomes ordered dsh steps with per-call usage', async () => {
  const w = await world((session, input) => {
    session.emit(
      { type: 'turn-start', turn: 't1', origin: 'user', inputIds: [input.id] },
      { type: 'call-start', call: 'c1' },
      { type: 'delta', call: 'c1', block: 'reasoning', key: 'r', text: 'thinking' },
      { type: 'delta', call: 'c1', block: 'text', key: 'm', text: 'before' },
      { type: 'tool-start', call: 'c1', tool: 'item-1', activity },
      { type: 'call-end', call: 'c1', usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 50 } },
    )
    setTimeout(
      () =>
        session.emit(
          { type: 'tool-end', tool: 'item-1', outcome: { status: 'completed', output: 'a.txt', exitCode: 0 } },
          { type: 'call-start', call: 'c2' },
          { type: 'delta', call: 'c2', block: 'text', key: 'm2', text: 'after' },
          { type: 'call-end', call: 'c2', usage: { inputTokens: 30, outputTokens: 5, cacheReadTokens: 160 } },
          { type: 'turn-end', turn: 't1', outcome: 'completed', cut: cut('t1') },
        ),
      10,
    )
  })
  try {
    w.send('list files')
    await w.idle()
    const session = w.fake.sessions[0]!
    assert.equal(session.sent.length, 1)
    assert.equal(session.sent[0]!.input.text, 'list files')
    assert.deepEqual(
      assistantTurns(w.events).map(({ step, content }) => ({ step, content })),
      [
        { step: 1, content: ['reasoning', 'text', 'tool-call'] },
        { step: 2, content: ['text'] },
      ],
    )
    const [first, second] = assistantTurns(w.events)
    assert.equal(first!.usage?.inputTokens, 100)
    assert.equal(second!.usage?.cacheReadTokens, 160)
    const call = w.events.find((event) => event.type === 'tool/call')
    assert.equal(call?.type === 'tool/call' && call.data.name, ACTIVITY_TOOL)
    const result = w.events.find((event) => event.type === 'tool/result')
    assert.ok(result)
    assert.deepEqual(assistantTurns(w.events).map(({ usage }) => usage?.inputTokens), [100, 30])
    assert.equal(w.ctx.tokenMeter.contextPressure(w.agent.session).pressureTokens, 190)
    assert.equal(w.committed.length, 1)
    assert.equal(w.committed[0]!.at, 't1')
    const final = w.events.findLast((event) => event.type === 'assistant/message')
    assert.equal(w.committed[0]!.seq, final?.seq)
    assert.deepEqual(w.store.records.get(w.agent.id)?.checkpoints.map((checkpoint) => checkpoint.cut.at), ['t1'])
  } finally {
    await w.close()
  }
})

test('a notice-only step does not reach the native harness', async () => {
  const w = await world((session, input) => {
    session.emit(
      { type: 'turn-start', turn: 't1', origin: 'user', inputIds: [input.id] },
      { type: 'call-start', call: 'c1' },
      { type: 'delta', call: 'c1', block: 'text', key: 'm', text: 'ok' },
      { type: 'call-end', call: 'c1' },
      { type: 'turn-end', turn: 't1', outcome: 'completed' },
    )
  })
  try {
    w.send('hi')
    await w.idle()
    w.agent.followup(
      (await import('@deepseek-ai/dsh-llm')).createUserMessage({
        content: [{ type: 'text', text: '[model changed]' }],
        source: { kind: 'model-selection', form: 'notice', summary: 'x → y' },
      }),
    )
    await w.idle()
    assert.equal(w.fake.sessions[0]!.sent.length, 1)
    const last = assistantTurns(w.events).at(-1)
    assert.deepEqual(last?.content, [])
  } finally {
    await w.close()
  }
})

test('steering forwards once; a later step does not resend it', async () => {
  let release!: () => void
  const w = await world((session, input, mode) => {
    if (mode === 'steer') return
    session.emit(
      { type: 'turn-start', turn: 't1', origin: 'user', inputIds: [input.id] },
      { type: 'call-start', call: 'c1' },
      { type: 'tool-start', call: 'c1', tool: 'item-1', activity },
      { type: 'call-end', call: 'c1' },
    )
    release = () =>
      session.emit(
        { type: 'tool-end', tool: 'item-1', outcome: { status: 'completed' } },
        { type: 'call-start', call: 'c2' },
        { type: 'delta', call: 'c2', block: 'text', key: 'm', text: 'done' },
        { type: 'call-end', call: 'c2' },
        { type: 'turn-end', turn: 't1', outcome: 'completed' },
      )
  })
  try {
    w.send('start')
    await new Promise((resolve) => setTimeout(resolve, 30))
    const { createUserMessage } = await import('@deepseek-ai/dsh-llm')
    w.agent.steer(createUserMessage({ content: [{ type: 'text', text: 'also this' }], source: { kind: 'user' } }))
    await new Promise((resolve) => setTimeout(resolve, 30))
    release()
    await w.idle()
    const sent = w.fake.sessions[0]!.sent
    assert.deepEqual(
      sent.map((entry) => [entry.mode, entry.input.text]),
      [
        ['turn', 'start'],
        ['steer', 'also this'],
      ],
    )
  } finally {
    await w.close()
  }
})

test('cancelling during a native tool interrupts the native turn and drops its remaining output', async () => {
  const w = await world((session, input) => {
    session.onInterrupt = () =>
      setTimeout(
        () =>
          session.emit(
            { type: 'delta', call: 'c1', block: 'text', key: 'late', text: 'late output' },
            { type: 'turn-end', turn: 't1', outcome: 'interrupted' },
          ),
        5,
      )
    session.emit(
      { type: 'turn-start', turn: 't1', origin: 'user', inputIds: [input.id] },
      { type: 'call-start', call: 'c1' },
      { type: 'tool-start', call: 'c1', tool: 'item-1', activity },
      { type: 'call-end', call: 'c1' },
    )
  })
  try {
    w.send('long job')
    await new Promise((resolve) => setTimeout(resolve, 30))
    w.agent.cancel({ kind: 'user' })
    await w.idle()
    assert.equal(w.fake.sessions[0]!.interrupts, 1)
    const texts = w.events.flatMap((event) =>
      event.type === 'assistant/message'
        ? event.data.message.content.flatMap((block) => (block.type === 'text' ? [block.text] : []))
        : [],
    )
    assert.ok(!texts.some((value) => value.includes('late output')))
    const result = w.events.find((event) => event.type === 'tool/result')
    assert.ok(result)
  } finally {
    await w.close()
  }
})

test('a native turn nobody asked for opens a dsh turn that shows it', async () => {
  const w = await world((session, input) => {
    session.emit(
      { type: 'turn-start', turn: 't1', origin: 'user', inputIds: [input.id] },
      { type: 'call-start', call: 'c1' },
      { type: 'delta', call: 'c1', block: 'text', key: 'm', text: 'started a background job' },
      { type: 'call-end', call: 'c1' },
      { type: 'turn-end', turn: 't1', outcome: 'completed' },
    )
  })
  try {
    w.send('run in background')
    await w.idle()
    const session = w.fake.sessions[0]!
    const background: NativeEvent[] = [
      { type: 'turn-start', turn: 't2', origin: 'native', inputIds: [] },
      { type: 'call-start', call: 'c2' },
      { type: 'delta', call: 'c2', block: 'text', key: 'm', text: 'background job finished' },
      { type: 'call-end', call: 'c2' },
      { type: 'turn-end', turn: 't2', outcome: 'completed' },
    ]
    session.emit(...background)
    await new Promise((resolve) => setTimeout(resolve, 30))
    await w.idle()
    assert.equal(session.sent.length, 1)
    const texts = w.events.flatMap((event) =>
      event.type === 'assistant/message'
        ? event.data.message.content.flatMap((block) => (block.type === 'text' ? [block.text] : []))
        : [],
    )
    assert.ok(texts.includes('background job finished'))
  } finally {
    await w.close()
  }
})

test('a permission mode the harness switched to by itself becomes the session pick', async () => {
  const w = await world((session, input) => {
    session.emit(
      { type: 'turn-start', turn: 't1', origin: 'user', inputIds: [input.id] },
      { type: 'mode', mode: 'auto' },
      { type: 'call-start', call: 'c1' },
      { type: 'delta', call: 'c1', block: 'text', key: 'm', text: 'planned' },
      { type: 'call-end', call: 'c1' },
      { type: 'turn-end', turn: 't1', outcome: 'completed' },
    )
  })
  try {
    await w.store.update(w.agent.id, () => ({ ...emptyRecord('codex'), settings: { mode: 'plan' } }))
    w.send('go')
    await new Promise((resolve) => setTimeout(resolve, 60))
    await w.idle()
    assert.equal((await w.store.read(w.agent.id))?.settings.mode, 'auto')
  } finally {
    await w.close()
  }
})

test("the harness's task list lands in dsh's todo list without a tool card of its own", async () => {
  const todos = [
    { content: 'Read the code', status: 'completed' as const },
    { content: 'Change it', status: 'in_progress' as const },
    { content: '  ', status: 'pending' as const },
    { content: 'Change it', status: 'pending' as const },
  ]
  const w = await world((session, input) => {
    session.emit(
      { type: 'turn-start', turn: 't1', origin: 'user', inputIds: [input.id] },
      { type: 'call-start', call: 'c1' },
      { type: 'todos', id: 'todo-1', todos },
      { type: 'call-end', call: 'c1' },
      { type: 'call-start', call: 'c2' },
      { type: 'delta', call: 'c2', block: 'text', key: 'm', text: 'on it' },
      { type: 'call-end', call: 'c2' },
      { type: 'turn-end', turn: 't1', outcome: 'completed' },
    )
  })
  try {
    w.send('go')
    await new Promise((resolve) => setTimeout(resolve, 60))
    await w.idle()
    const written = w.events.filter((event) => event.type === 'todo/write')
    assert.equal(written.length, 1)
    assert.deepEqual((written[0]!.data as { todos: unknown }).todos, [
      { content: 'Read the code', status: 'completed' },
      { content: 'Change it', status: 'in_progress' },
    ])
    assert.ok(!w.events.some((event) => event.type === 'tool/call' && event.data.name === ACTIVITY_TOOL))
  } finally {
    await w.close()
  }
})

test('a referenced session snapshot dsh attached to a message reaches the harness with it', async () => {
  const w = await world((session, input) => {
    session.emit(
      { type: 'turn-start', turn: 't1', origin: 'user', inputIds: [input.id] },
      { type: 'call-start', call: 'c1' },
      { type: 'delta', call: 'c1', block: 'text', key: 'm', text: 'ok' },
      { type: 'call-end', call: 'c1' },
      { type: 'turn-end', turn: 't1', outcome: 'completed' },
    )
  })
  try {
    const { createUserMessage } = await import('@deepseek-ai/dsh-llm')
    // Like dsh-session-reference: the snapshot enters the step right behind the message citing it.
    w.ctx.on(
      'agent/pre-step',
      async (_event, next) => {
        const decision = await next()
        if (decision.kind === 'reject') return decision
        return {
          ...decision,
          messages: decision.messages.flatMap((message) =>
            message.source.kind === 'user'
              ? [
                  message,
                  createUserMessage({
                    content: [{ type: 'text', text: '## Referenced sessions\nuser: login 500s' }],
                    source: { kind: 'session-reference', form: 'recall', version: 1, references: [] } as never,
                  }),
                ]
              : [message],
          ),
        }
      },
      { prepend: true },
    )
    w.send('see @fix-login')
    await new Promise((resolve) => setTimeout(resolve, 60))
    await w.idle()
    const sent = w.fake.sessions[0]!.sent.map((entry) => entry.input.text)
    assert.equal(sent.length, 1)
    assert.match(sent[0]!, /see @fix-login/)
    assert.match(sent[0]!, /## Referenced sessions/)
  } finally {
    await w.close()
  }
})
