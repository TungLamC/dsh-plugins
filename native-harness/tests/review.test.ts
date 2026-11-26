import assert from 'node:assert/strict'
import { test } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { tokensOf } from '../src/host/catalog.ts'
import { FakeHarness } from '../src/host/harness/fake.ts'
import { SessionRuntime } from '../src/host/runtime.ts'
import { emptyRecord, memoryStore } from '../src/host/store.ts'
import { world } from './support.ts'

const texts = (events: SessionEvent[]) =>
  events.flatMap((event) =>
    event.type === 'assistant/message'
      ? event.data.message.content.flatMap((block) => (block.type === 'text' ? [block.text] : []))
      : [],
  )
const settle = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms))

test('a step cancelled while the session is being prepared sends nothing', async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const w = await world(undefined, { prepare: () => gate })
  try {
    w.send('hello')
    await settle()
    w.agent.cancel({ kind: 'user' })
    release()
    await w.idle()
    assert.equal(w.fake.sessions[0]?.sent.length ?? 0, 0)
  } finally {
    await w.close()
  }
})

test('a native turn right behind the previous one still gets shown', async () => {
  const w = await world((session, input) => {
    session.emit(
      { type: 'turn-start', turn: 't1', origin: 'user', inputIds: [input.id] },
      { type: 'call-start', call: 'c1' },
      { type: 'delta', call: 'c1', block: 'text', key: 'm', text: 'first' },
      { type: 'call-end', call: 'c1' },
      { type: 'turn-end', turn: 't1', outcome: 'completed' },
      { type: 'turn-start', turn: 't2', origin: 'native', inputIds: [] },
      { type: 'call-start', call: 'c2' },
      { type: 'delta', call: 'c2', block: 'text', key: 'm', text: 'second' },
      { type: 'call-end', call: 'c2' },
      { type: 'turn-end', turn: 't2', outcome: 'completed' },
    )
  })
  try {
    w.send('go')
    await settle(60)
    await w.idle()
    assert.deepEqual(texts(w.events).filter((value) => value === 'first' || value === 'second'), ['first', 'second'])
  } finally {
    await w.close()
  }
})

test('consecutive calls without tool use keep their own usage', async () => {
  const w = await world((session, input) => {
    session.emit(
      { type: 'turn-start', turn: 't1', origin: 'user', inputIds: [input.id] },
      { type: 'call-start', call: 'c1' },
      { type: 'delta', call: 'c1', block: 'text', key: 'm', text: 'part one' },
      { type: 'call-end', call: 'c1', usage: { inputTokens: 10, outputTokens: 1 } },
      { type: 'call-start', call: 'c2' },
      { type: 'delta', call: 'c2', block: 'text', key: 'm', text: 'part two' },
      { type: 'call-end', call: 'c2', usage: { inputTokens: 20, outputTokens: 2 } },
      { type: 'turn-end', turn: 't1', outcome: 'completed' },
    )
  })
  try {
    w.send('go')
    await settle(60)
    await w.idle()
    const usage = w.events.flatMap((event) => (event.type === 'assistant/message' ? [event.data.usage?.inputTokens] : []))
    assert.deepEqual(usage, [10, 20])
    assert.ok(texts(w.events).includes('part one') && texts(w.events).includes('part two'))
  } finally {
    await w.close()
  }
})

test('input sent right after a stop waits for the interrupted turn and starts a new one', async () => {
  const w = await world((session, input, mode) => {
    if (input.text !== 'long job') {
      session.emit(
        { type: 'turn-start', turn: 't2', origin: 'user', inputIds: [input.id] },
        { type: 'call-start', call: 'c2' },
        { type: 'delta', call: 'c2', block: 'text', key: 'm', text: `answer (${mode})` },
        { type: 'call-end', call: 'c2' },
        { type: 'turn-end', turn: 't2', outcome: 'completed' },
      )
      return
    }
    session.onInterrupt = () =>
      setTimeout(() => session.emit({ type: 'turn-end', turn: 't1', outcome: 'interrupted' }), 40)
    session.emit(
      { type: 'turn-start', turn: 't1', origin: 'user', inputIds: [input.id] },
      { type: 'call-start', call: 'c1' },
      { type: 'delta', call: 'c1', block: 'text', key: 'm', text: 'working' },
    )
  })
  try {
    w.send('long job')
    await settle()
    w.agent.cancel({ kind: 'user' }, { keepInbox: true })
    w.send('next question')
    await settle(120)
    await w.idle()
    const sent = w.fake.sessions[0]!.sent.map((entry) => [entry.input.text, entry.mode])
    assert.deepEqual(sent, [
      ['long job', 'turn'],
      ['next question', 'turn'],
    ])
    assert.ok(texts(w.events).includes('answer (turn)'))
  } finally {
    await w.close()
  }
})

test('slash tokens are unique and keep dsh-owned names free', () => {
  const tokens = tokensOf([
    { name: 'tdd', description: 'a', kind: 'skill', path: '/a/SKILL.md' },
    { name: 'tdd', description: 'b', kind: 'skill', path: '/b/SKILL.md' },
    { name: 'model', description: 'c', kind: 'command' },
    { name: 'native-model', description: 'd', kind: 'skill' },
  ]).map((entry) => entry.token)
  assert.equal(new Set(tokens).size, tokens.length)
  assert.ok(!tokens.includes('model'))
})

test('a fork cut inside an unfinished turn does not reuse an earlier checkpoint', async () => {
  const store = memoryStore()
  const fake = new FakeHarness('codex', { models: [], modes: [], commands: [] })
  const ref = { harness: 'codex' as const, id: 'thread-parent' }
  await store.update('session-parent', () => ({ ...emptyRecord('codex'), checkpoints: [{ seq: 10, cut: { ref, at: 'turn-1' } }] }))
  const log = (types: string[]) => types.map((type, index) => ({ seq: 10 + index, type }) as unknown as SessionEvent)
  const runtime = (events: SessionEvent[]) =>
    new SessionRuntime({
      harness: () => fake,
      store,
      settings: (_harness, _cwd, stored) => stored,
      ports: () => ({ interactions: { approve: async () => ({ kind: 'allow' }), ask: async () => ({ answers: [] }), reviewPlan: async () => 'approve' as const }, signal: new AbortController().signal, log: () => {} }),
      readEvents: async (_id, from, to) => events.filter((event) => event.seq >= from && event.seq < to),
      cwd: async () => '/tmp',
    })
  const child = (boundary: number) =>
    ({
      id: `session-child-${boundary}`,
      session: { header: { isSeeded: true, parentSession: 'session-parent', cwd: '/tmp' }, inheritedEventCount: boundary },
    }) as unknown as Agent
  const clean = await runtime(log(['assistant/message', 'step/end', 'turn/end'])).session(child(13), 'codex', new AbortController().signal)
  assert.equal((clean.native as unknown as { request: { origin: { kind: string } } }).request.origin.kind, 'fork')
  const partial = await runtime(log(['assistant/message', 'step/end', 'turn/end', 'turn/start', 'user/message'])).session(
    child(15),
    'codex',
    new AbortController().signal,
  )
  assert.equal((partial.native as unknown as { request: { origin: { kind: string } } }).request.origin.kind, 'new')
  assert.ok(partial.notice)
})

test('cancelling while waiting for an interrupted turn to drain returns promptly', async () => {
  const { Conversation } = await import('../src/host/bridge/conversation.ts')
  const fake = new FakeHarness('codex', { models: [], modes: [], commands: [] })
  const native = await fake.open({ dshSessionId: 's', cwd: '/tmp', origin: { kind: 'new' }, settings: {} }, {
    interactions: { approve: async () => ({ kind: 'allow' }), ask: async () => ({ answers: [] }), reviewPlan: async () => 'approve' as const },
    signal: new AbortController().signal,
    log: () => {},
  })
  const conv = new Conversation(native, [], { nativeTurn: () => {}, quiet: () => {}, ref: () => {}, mode: () => {}, log: () => {} })
  native.emit({ type: 'turn-start', turn: 't1', origin: 'user', inputIds: [] })
  await settle(5)
  void conv.interrupt()
  const controller = new AbortController()
  const waiting = conv.drained(controller.signal)
  controller.abort()
  await assert.rejects(Promise.race([waiting, settle(50).then(() => 'still waiting')]).then((value) => {
    if (value === 'still waiting') throw new Error('drained did not observe the abort')
  }), /abort/i)
  await native.close()
})

test('a tool result is not lost while dsh lags behind several native turns', async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const activity = { name: 'Bash', kind: 'shell' as const, title: 'Bash', summary: 'ls', command: 'ls' }
  const w = await world(
    (session, input) => {
      session.emit(
        { type: 'turn-start', turn: 't1', origin: 'user', inputIds: [input.id] },
        { type: 'call-start', call: 'c1' },
        { type: 'tool-start', call: 'c1', tool: 'tool-1', activity },
        { type: 'call-end', call: 'c1' },
        { type: 'tool-end', tool: 'tool-1', outcome: { status: 'completed', output: 'known output' } },
        { type: 'call-start', call: 'c2' },
        { type: 'delta', call: 'c2', block: 'text', key: 'm', text: 'done' },
        { type: 'call-end', call: 'c2' },
        { type: 'turn-end', turn: 't1', outcome: 'completed' },
        { type: 'turn-start', turn: 't2', origin: 'native', inputIds: [] },
        { type: 'turn-end', turn: 't2', outcome: 'completed' },
        { type: 'turn-start', turn: 't3', origin: 'native', inputIds: [] },
        { type: 'turn-end', turn: 't3', outcome: 'completed' },
      )
    },
    { markForwarded: () => gate },
  )
  try {
    w.send('go')
    await settle(40)
    release()
    await settle(80)
    await w.idle()
    const result = w.events.find((event) => event.type === 'tool/result')
    assert.equal(JSON.stringify(result?.type === 'tool/result' ? result.data : {}).includes('known output'), true)
  } finally {
    await w.close()
  }
})

test('a steer still being prepared is withdrawn when the turn is stopped', async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const w = await world(
    (session, input, mode) => {
      if (mode === 'steer') return
      session.onInterrupt = () => setTimeout(() => session.emit({ type: 'turn-end', turn: 't1', outcome: 'interrupted' }), 5)
      session.emit(
        { type: 'turn-start', turn: 't1', origin: 'user', inputIds: [input.id] },
        { type: 'call-start', call: 'c1' },
        { type: 'delta', call: 'c1', block: 'text', key: 'm', text: 'working' },
      )
    },
    { command: async () => (await gate, undefined) },
  )
  try {
    w.send('start')
    await settle()
    const { createUserMessage } = await import('@deepseek-ai/dsh-llm')
    w.agent.steer(createUserMessage({ content: [{ type: 'text', text: '/fixture do something' }], source: { kind: 'user' } }))
    await settle()
    w.agent.cancel({ kind: 'user' })
    await w.idle()
    release()
    await settle(40)
    assert.deepEqual(w.fake.sessions[0]!.sent.map((entry) => entry.mode), ['turn'])
  } finally {
    await w.close()
  }
})

test('slash tokens follow native identity across reordering and removal', () => {
  const a = { name: 'tdd', description: 'a', kind: 'skill' as const, path: '/a/SKILL.md' }
  const b = { name: 'tdd', description: 'b', kind: 'skill' as const, path: '/b/SKILL.md' }
  const forward = new Map(tokensOf([a, b]).map((entry) => [entry.command.path, entry.token]))
  const reversed = new Map(tokensOf([b, a]).map((entry) => [entry.command.path, entry.token]))
  assert.deepEqual(forward, reversed)
  assert.ok(![...forward.values()].includes('tdd'))
  assert.equal(tokensOf([b])[0]!.token, 'tdd')
})

test('a settings change made while the session opens is not lost', async () => {
  const store = memoryStore()
  const fake = new FakeHarness('codex', { models: [], modes: [], commands: [] })
  const runtime = new SessionRuntime({
    harness: () => fake,
    store,
    settings: (_harness, _cwd, stored) => stored,
    ports: () => ({ interactions: { approve: async () => ({ kind: 'allow' }), ask: async () => ({ answers: [] }), reviewPlan: async () => 'approve' as const }, signal: new AbortController().signal, log: () => {} }),
    readEvents: async () => [],
    cwd: async () => '/tmp',
  })
  const agent = { id: 'session-x', session: { header: { cwd: '/tmp', isSeeded: false }, inheritedEventCount: 0 } } as unknown as Agent
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const change = runtime.exclusive(agent.id, async () => {
    await held
    await store.update(agent.id, () => ({ ...emptyRecord('codex'), settings: { model: 'new' } }))
  })
  const opening = runtime.session(agent, 'codex', new AbortController().signal)
  release()
  await change
  const opened = await opening
  assert.equal((opened.native as unknown as { request: { settings: { model?: string } } }).request.settings.model, 'new')
})

test('a step with nothing to send does not open a native session that is not open', async () => {
  let opens = 0
  const w = await world(undefined, {})
  const { createUserMessage } = await import('@deepseek-ai/dsh-llm')
  const open = w.runtime.session.bind(w.runtime)
  w.runtime.session = (...args: Parameters<typeof open>) => {
    opens++
    return open(...args)
  }
  try {
    w.agent.followup(
      createUserMessage({
        content: [{ type: 'text', text: 'permission changed' }],
        source: { kind: 'permission-notice' } as never,
      }),
    )
    await settle(60)
    await w.idle()
    assert.equal(opens, 0)
    assert.equal(w.fake.sessions.length, 0)
  } finally {
    await w.close()
  }
})
