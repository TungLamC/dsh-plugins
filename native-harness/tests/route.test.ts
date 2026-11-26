import assert from 'node:assert/strict'
import { test } from 'vitest'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { FakeScript } from '../src/host/harness/fake.ts'
import { PROVIDERS } from '../src/shared/types.ts'
import { DEFAULT_ROUTE, world, type World } from './support.ts'

const settle = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms))

/** One native turn answering each input with plain text. */
const reply: FakeScript = (session, input) =>
  session.emit(
    { type: 'turn-start', turn: input.id, origin: 'user', inputIds: [input.id] },
    { type: 'call-start', call: `c-${input.id}` },
    { type: 'delta', call: `c-${input.id}`, block: 'text', key: 'm', text: `re: ${input.text}` },
    { type: 'call-end', call: `c-${input.id}` },
    { type: 'turn-end', turn: input.id, outcome: 'completed' },
  )

function failures(events: SessionEvent[]): string[] {
  return events.flatMap((event) =>
    event.type === 'turn/end' && event.data.reason.kind === 'error' ? [event.data.reason.error.message] : [],
  )
}
function routes(events: SessionEvent[]) {
  return events.flatMap((event) => {
    if (event.type !== 'request/header') return []
    const { provider, model, reasoningEffort } = event.data.header.config
    return [{ provider, model, ...(reasoningEffort ? { reasoningEffort } : {}) }]
  })
}
const sent = (w: World) => w.fake.sessions[0]?.sent.map(({ input }) => input.text) ?? []

const settled = () => new Promise((resolve) => setTimeout(resolve, 0))
const NORMAL_PICK = { provider: 'other-provider', model: 'gpt', reasoningEffort: ReasoningEffortId('xhigh') }

test('a harness session is routed to the harness as soon as it exists, without an effort', async () => {
  const w = await world(reply)
  try {
    assert.deepEqual(w.agent.model.current(), { provider: PROVIDERS.codex, model: 'fixture' })
    w.send('hello')
    await w.idle()
    assert.deepEqual(failures(w.events), [])
    assert.equal(w.defaultCalls(), 0)
    assert.deepEqual(sent(w), ['hello'])
    assert.deepEqual(routes(w.events), [{ provider: PROVIDERS.codex, model: 'fixture' }])
  } finally {
    await w.close()
  }
})

test('a blank session switched to a native preset is routed at once; switching back restores its own pick', async () => {
  const w = await world(reply, {}, { preset: 'default' })
  try {
    w.agent.model.select(NORMAL_PICK)
    w.selectPreset('codex-native')
    await settled()
    assert.deepEqual(w.agent.model.current(), { provider: PROVIDERS.codex, model: 'fixture' })
    w.selectPreset('default')
    await settled()
    assert.deepEqual(w.agent.model.current(), NORMAL_PICK)
    w.selectPreset('codex-native')
    await settled()
    assert.deepEqual(w.agent.model.current(), { provider: PROVIDERS.codex, model: 'fixture' })
  } finally {
    await w.close()
  }
})

test('a native model picked before switching harness presets does not follow to the other harness', async () => {
  const w = await world(reply)
  try {
    w.route.select(w.agent, 'codex', 'gpt-native')
    w.selectPreset('claude-code-native')
    await settled()
    assert.deepEqual(w.agent.model.current(), { provider: PROVIDERS['claude-code'], model: 'fixture' })
    w.selectPreset('default')
    await settled()
    assert.deepEqual(w.agent.model.current(), DEFAULT_ROUTE)
  } finally {
    await w.close()
  }
})

test('input sent after switching back to a normal preset runs on the normal model', async () => {
  const w = await world(reply)
  try {
    w.selectPreset('default')
    await settled()
    w.send('hello')
    await w.idle()
    assert.deepEqual(failures(w.events), [])
    assert.equal(w.defaultCalls(), 1)
    assert.equal(w.fake.sessions.length, 0)
    assert.deepEqual(routes(w.events), [DEFAULT_ROUTE])
  } finally {
    await w.close()
  }
})

test('without a remembered pick, switching back falls back to the model the session was created with', async () => {
  const w = await world(reply, {}, { preset: 'default' })
  try {
    // Routed by an earlier host process: this one never saw the pick before it.
    w.agent.model.select({ provider: PROVIDERS.codex, model: 'fixture' })
    w.selectPreset('default')
    await settled()
    assert.deepEqual(w.agent.model.current(), DEFAULT_ROUTE)
  } finally {
    await w.close()
  }
})

test("dsh's /model on a harness session is routed back before the next step, even mid-turn", async () => {
  let w!: World
  w = await world((session, input) => {
    if (input.text !== 'work') return reply(session, input, 'turn')
    session.emit(
      { type: 'turn-start', turn: 't1', origin: 'user', inputIds: [input.id] },
      { type: 'call-start', call: 'c1' },
      { type: 'tool-start', call: 'c1', tool: 'item-1', activity: { name: 'x', kind: 'other', title: 'X', summary: '' } },
      { type: 'call-end', call: 'c1' },
    )
    setTimeout(() => {
      // What the composer's model picker and `/model` do through sessionController.selectModel.
      w.agent.model.select(DEFAULT_ROUTE)
      setTimeout(
        () =>
          session.emit(
            { type: 'tool-end', tool: 'item-1', outcome: { status: 'completed' } },
            { type: 'call-start', call: 'c2' },
            { type: 'delta', call: 'c2', block: 'text', key: 'm', text: 'done' },
            { type: 'call-end', call: 'c2' },
            { type: 'turn-end', turn: 't1', outcome: 'completed' },
          ),
        10,
      )
    }, 10)
  })
  try {
    w.send('work')
    await settle(60)
    await w.idle()
    w.agent.model.select(DEFAULT_ROUTE)
    w.send('more')
    await w.idle()
    assert.deepEqual(failures(w.events), [])
    assert.equal(w.defaultCalls(), 0)
    assert.deepEqual(sent(w), ['work', 'more'])
    assert.ok(routes(w.events).every(({ provider }) => provider === PROVIDERS.codex))
  } finally {
    await w.close()
  }
})

test("a model picked on a live session routes the next step; dsh's switch notice never reaches the harness", async () => {
  const w = await world(reply)
  try {
    w.send('first')
    await w.idle()
    w.route.select(w.agent, 'codex', 'other')
    w.send('second')
    await w.idle()
    assert.deepEqual(failures(w.events), [])
    assert.deepEqual(sent(w), ['first', 'second'])
    assert.deepEqual(routes(w.events).map(({ model }) => model), ['fixture', 'other'])
    assert.ok(w.events.some((event) => event.type === 'user/message' && event.data.source.kind === 'model-selection'))
  } finally {
    await w.close()
  }
})

test('a pick made while the session was cold routes the input that wakes it', async () => {
  const w = await world(reply)
  try {
    w.route.note(w.agent.id, 'codex', 'picked')
    w.send('hello')
    await w.idle()
    assert.deepEqual(routes(w.events).map(({ model }) => model), ['picked'])
  } finally {
    await w.close()
  }
})

test('a stored model nothing routed yet takes over from the next step', async () => {
  const w = await world((session, input) => {
    session.emit(
      { type: 'turn-start', turn: 't1', origin: 'user', inputIds: [input.id] },
      { type: 'call-start', call: 'c1' },
      { type: 'tool-start', call: 'c1', tool: 'item-1', activity: { name: 'x', kind: 'other', title: 'X', summary: '' } },
      { type: 'call-end', call: 'c1' },
    )
    setTimeout(
      () =>
        session.emit(
          { type: 'tool-end', tool: 'item-1', outcome: { status: 'completed' } },
          { type: 'call-start', call: 'c2' },
          { type: 'delta', call: 'c2', block: 'text', key: 'm', text: 'done' },
          { type: 'call-end', call: 'c2' },
          { type: 'turn-end', turn: 't1', outcome: 'completed' },
        ),
      20,
    )
  })
  try {
    await w.store.update(w.agent.id, () => ({ harness: 'codex', settings: { model: 'stored' }, checkpoints: [], forwarded: [] }))
    w.send('hello')
    await settle(60)
    await w.idle()
    assert.deepEqual(failures(w.events), [])
    assert.deepEqual(routes(w.events).map(({ model }) => model), ['fixture', 'stored'])
  } finally {
    await w.close()
  }
})

test('a step that still carries a foreign route fails before reaching any model, and the next input is routed', async () => {
  const w = await world(reply)
  try {
    // A foreign pick in the same tick as the input, before the routing back can run.
    const hijack = w.ctx.on('agent/inbox/inserted', ({ agent }) => agent.model.select(DEFAULT_ROUTE))
    w.send('lost')
    await w.idle()
    hijack()
    assert.equal(w.defaultCalls(), 0)
    assert.deepEqual(sent(w), [])
    assert.match(failures(w.events)[0] ?? '', /cannot be switched from dsh/)
    w.send('again')
    await w.idle()
    assert.equal(w.defaultCalls(), 0)
    assert.deepEqual(sent(w), ['again'])
  } finally {
    await w.close()
  }
})
