/** The Antigravity Adapter against a scripted ACP agent built with the official SDK, connected in process. */
import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  agent,
  RequestError,
  type AgentContext,
  type ContentBlock,
  type PromptResponse,
  type RequestPermissionResponse,
  type SessionConfigOption,
  type SessionUpdate,
} from '@agentclientprotocol/sdk'
import { AntigravityHarness } from '../src/host/harness/antigravity/index.ts'
import { link, type AcpLink, type Connector } from '../src/host/harness/antigravity/connection.ts'
import type {
  ApprovalDecision,
  ApprovalRequest,
  Interactions,
  NativeEvent,
  NativeSession,
  OpenRequest,
  Question,
  QuestionAnswer,
} from '../src/host/harness/types.ts'

const MODELS: Record<string, { name: string; levels: string[]; level?: string }> = {
  neon: { name: 'Neon', levels: ['low', 'high'], level: 'high' },
  flash: { name: 'Flash', levels: ['low', 'medium'], level: 'medium' },
  orchestrator: { name: 'Orchestrator', levels: [] },
}
const MODES = ['default', 'auto', 'plan']
const COMMANDS = [
  { name: 'plan', description: 'Plan carefully' },
  { name: 'goal', description: 'Run until done', input: { hint: 'objective' } },
]

interface State {
  model: string
  level?: string
  mode: string
}
function configOptions(state: State): SessionConfigOption[] {
  const levels = MODELS[state.model]!.levels
  return [
    {
      id: 'model',
      name: 'Model',
      category: 'model',
      type: 'select',
      currentValue: state.model,
      options: Object.entries(MODELS).map(([value, model]) => ({ value, name: model.name })),
    },
    ...(levels.length
      ? [
          {
            id: 'thought_level',
            name: 'Thinking Level',
            category: 'thought_level',
            type: 'select' as const,
            currentValue: state.level ?? levels[0]!,
            options: levels.map((value) => ({ value, name: value })),
          },
        ]
      : []),
    {
      id: 'mode',
      name: 'Mode',
      category: 'mode',
      type: 'select',
      currentValue: state.mode,
      options: MODES.map((value) => ({ value, name: value[0]!.toUpperCase() + value.slice(1), description: `${value} mode` })),
    },
  ]
}

interface PromptRun {
  sessionId: string
  prompt: ContentBlock[]
  client: AgentContext
  cancelled: Promise<void>
  update(update: SessionUpdate): Promise<void>
  permission(toolCallId: string, options: { optionId: string; name: string; kind: string }[], title?: string): Promise<RequestPermissionResponse>
}
type Script = (run: PromptRun) => Promise<PromptResponse>

/** A scripted ACP agent. Every request is recorded; prompts run `script`. */
class FakeAgy {
  readonly calls: { method: string; params: Record<string, unknown> }[] = []
  readonly sessions = new Map<string, State>()
  readonly links: AcpLink[] = []
  script: Script = async (run) => {
    await run.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'ok' } })
    await run.update({ sessionUpdate: 'usage_update', used: 10, size: 1_000_000 })
    return { stopReason: 'end_turn' }
  }
  capabilities: Record<string, unknown> = {
    loadSession: true,
    promptCapabilities: { image: true },
    sessionCapabilities: { resume: {}, close: {}, load: {} },
  }
  initError?: Error
  client?: AgentContext
  private ids = 0
  private cancels = new Map<string, () => void>()

  connector(): Connector {
    return async (_cwd, _purpose, handlers) => {
      const opened = await link(this.app(), handlers)
      this.links.push(opened)
      return opened
    }
  }

  methods(): string[] {
    return this.calls.map((call) => call.method)
  }

  private record(method: string, params: unknown) {
    this.calls.push({ method, params: params as Record<string, unknown> })
  }

  private app() {
    const notifyLater = (client: AgentContext, sessionId: string, update: SessionUpdate) =>
      setTimeout(() => void client.notify('session/update', { sessionId, update }).catch(() => undefined), 1)
    return agent({ name: 'fake-agy' })
      .onRequest('initialize', ({ params }) => {
        this.record('initialize', params)
        if (this.initError) throw this.initError
        return { protocolVersion: 1, agentCapabilities: this.capabilities }
      })
      .onRequest('session/new', ({ params, client }) => {
        this.record('session/new', params)
        this.client = client
        const sessionId = `s${++this.ids}`
        const state = { model: 'neon', level: 'high', mode: 'default' }
        this.sessions.set(sessionId, state)
        notifyLater(client, sessionId, { sessionUpdate: 'available_commands_update', availableCommands: COMMANDS })
        return { sessionId, configOptions: configOptions(state) }
      })
      .onRequest('session/resume', ({ params, client }) => {
        this.record('session/resume', params)
        this.client = client
        const state = this.sessions.get(params.sessionId) ?? { model: 'neon', level: 'high', mode: 'default' }
        this.sessions.set(params.sessionId, state)
        return { configOptions: configOptions(state) }
      })
      .onRequest('session/load', async ({ params, client }) => {
        this.record('session/load', params)
        this.client = client
        const state = this.sessions.get(params.sessionId) ?? { model: 'neon', level: 'high', mode: 'default' }
        this.sessions.set(params.sessionId, state)
        // The replay of the earlier conversation.
        await client.notify('session/update', {
          sessionId: params.sessionId,
          update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'replayed' } },
        })
        return { configOptions: configOptions(state) }
      })
      .onRequest('session/set_config_option', ({ params }) => {
        this.record('session/set_config_option', params)
        const state = this.sessions.get(params.sessionId)!
        const value = String((params as { value: unknown }).value)
        if (params.configId === 'model') {
          if (!MODELS[value]) throw RequestError.invalidParams(undefined, `Unknown model ID: ${value}`)
          state.model = value
          state.level = MODELS[value]!.level
        } else if (params.configId === 'thought_level') state.level = value
        else if (params.configId === 'mode') state.mode = value
        return { configOptions: configOptions(state) }
      })
      .onRequest('session/close', ({ params }) => {
        this.record('session/close', params)
        return {}
      })
      .onNotification('session/cancel', ({ params }) => {
        this.record('session/cancel', params)
        this.cancels.get(params.sessionId)?.()
      })
      .onRequest('session/prompt', async ({ params, client }) => {
        this.record('session/prompt', params)
        let cancel!: () => void
        const cancelled = new Promise<void>((resolve) => {
          cancel = resolve
        })
        this.cancels.set(params.sessionId, cancel)
        try {
          return await this.script({
            sessionId: params.sessionId,
            prompt: params.prompt,
            client,
            cancelled,
            update: (update) => client.notify('session/update', { sessionId: params.sessionId, update }),
            permission: (toolCallId, options, title) =>
              client.request('session/request_permission', {
                sessionId: params.sessionId,
                toolCall: { toolCallId, ...(title ? { title } : {}) },
                options: options as never,
              }),
          })
        } finally {
          this.cancels.delete(params.sessionId)
        }
      })
  }
}

class Asked implements Interactions {
  readonly approvals: ApprovalRequest[] = []
  readonly questions: Question[][] = []
  decide: (request: ApprovalRequest, signal: AbortSignal) => Promise<ApprovalDecision> = async () => ({ kind: 'allow' })
  answer: (questions: Question[], signal: AbortSignal) => Promise<QuestionAnswer> = async (questions) => ({
    answers: [{ id: questions[0]!.id, selected: [questions[0]!.options[0]!.label] }],
  })
  approve(request: ApprovalRequest, signal: AbortSignal) {
    this.approvals.push(request)
    return this.decide(request, signal)
  }
  ask(questions: Question[], signal: AbortSignal) {
    this.questions.push(questions)
    return this.answer(questions, signal)
  }
  async reviewPlan(): Promise<'approve' | 'revise'> {
    return 'approve'
  }
}

function setup(options: { nativeQuietMs?: number } = {}) {
  const agy = new FakeAgy()
  const harness = new AntigravityHarness({ connect: agy.connector(), nativeQuietMs: options.nativeQuietMs ?? 30 })
  const asked = new Asked()
  const logs: string[] = []
  const lifetime = new AbortController()
  const open = (overrides: Partial<OpenRequest> = {}) =>
    harness.open(
      { dshSessionId: 'dsh-1', cwd: '/work', origin: { kind: 'new' }, settings: {}, ...overrides },
      { interactions: asked, signal: lifetime.signal, log: (message) => logs.push(message) },
    )
  return { agy, harness, asked, logs, open, close: () => harness.close() }
}

/** Read events until one matches `until` (inclusive). */
async function until(session: NativeSession, match: (event: NativeEvent) => boolean, ms = 2000): Promise<NativeEvent[]> {
  const out: NativeEvent[] = []
  const deadline = Date.now() + ms
  while (true) {
    const next = await Promise.race([
      session.events.next(),
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), Math.max(1, deadline - Date.now()))),
    ])
    if (next === 'timeout') throw new Error(`timed out; got ${JSON.stringify(out.map((event) => event.type))}`)
    if (next.done) throw new Error(`events ended; got ${JSON.stringify(out.map((event) => event.type))}`)
    out.push(next.value)
    if (match(next.value)) return out
  }
}
const turnEnd = (event: NativeEvent) => event.type === 'turn-end'
const input = (id: string, text: string, extra: Partial<Parameters<NativeSession['send']>[0]> = {}) => ({ id, text, images: [], ...extra })
const types = (events: NativeEvent[]) => events.map((event) => event.type)

test('the catalog lists model families with their levels, the modes and the commands, then closes its conversation', async () => {
  const { agy, harness, close } = setup()
  const catalog = await harness.catalog('/work', AbortSignal.timeout(5000))
  assert.deepEqual(
    catalog.models.map((model) => [model.id, model.efforts.map((effort) => effort.id), model.defaultEffort]),
    [
      ['neon', ['low', 'high'], 'high'],
      ['flash', ['low', 'medium'], 'medium'],
      ['orchestrator', [], undefined],
    ],
  )
  assert.equal(catalog.defaultModel, 'neon')
  assert.ok(catalog.models.every((model) => model.image))
  assert.deepEqual(catalog.modes.map((mode) => mode.id), MODES)
  assert.deepEqual(catalog.commands, [
    { name: 'plan', description: 'Plan carefully', kind: 'command' },
    { name: 'goal', description: 'Run until done', kind: 'command', argumentHint: 'objective' },
  ])
  assert.ok(agy.methods().includes('session/close'))
  assert.equal(agy.links[0]!.alive, false)
  // A fresh catalog is served from the cache without another conversation.
  await harness.catalog('/work', AbortSignal.timeout(5000))
  assert.equal(agy.methods().filter((method) => method === 'session/new').length, 1)
  await close()
})

test('a new session sends every setting explicitly, reports its id, and streams one call with its usage', async () => {
  const { agy, open, close } = setup()
  agy.script = async (run) => {
    await run.update({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: '' } })
    await run.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Hello' } })
    await run.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: ' there' } })
    await run.update({ sessionUpdate: 'usage_update', used: 157, size: 1_000_000 })
    return { stopReason: 'end_turn', usage: { inputTokens: 100, outputTokens: 7, cachedReadTokens: 50, cachedWriteTokens: 0, thoughtTokens: 3, totalTokens: 157 } } as PromptResponse
  }
  const session = await open({ settings: { model: 'flash', effort: 'low', mode: 'auto' } })
  const receipt = await session.send(input('u1', 'hi'), 'turn')
  assert.deepEqual(receipt, { inputId: 'u1', disposition: 'turn' })
  const events = await until(session, turnEnd)
  assert.deepEqual(types(events), ['ref', 'turn-start', 'call-start', 'delta', 'delta', 'call-end', 'turn-end'])
  assert.deepEqual(events[0], { type: 'ref', ref: { harness: 'antigravity', id: 's1' } })
  assert.deepEqual(events[1], { type: 'turn-start', turn: 'turn-1', origin: 'user', inputIds: ['u1'] })
  const end = events.find((event) => event.type === 'call-end')!
  assert.deepEqual(end, {
    type: 'call-end',
    call: 'turn-1:call-1',
    usage: { inputTokens: 100, outputTokens: 7, cacheReadTokens: 50, cacheWriteTokens: 0, reasoningTokens: 3, totalTokens: 157 },
    contextWindow: 1_000_000,
  })
  assert.deepEqual(events.at(-1), { type: 'turn-end', turn: 'turn-1', outcome: 'completed' })
  const sets = agy.calls.filter((call) => call.method === 'session/set_config_option').map((call) => [call.params.configId, call.params.value])
  assert.deepEqual(sets, [
    ['model', 'flash'],
    ['thought_level', 'low'],
    ['mode', 'auto'],
  ])
  assert.deepEqual(agy.sessions.get('s1'), { model: 'flash', level: 'low', mode: 'auto' })
  assert.equal(session.ref?.id, 's1')
  await close()
})

test('a level the model does not offer is left to agy; a model without levels gets none', async () => {
  const { agy, open, logs, close } = setup()
  const session = await open({ settings: { model: 'orchestrator', effort: 'high' } })
  await session.send(input('u1', 'hi'), 'turn')
  await until(session, turnEnd)
  assert.deepEqual(
    agy.calls.filter((call) => call.method === 'session/set_config_option').map((call) => call.params.configId),
    ['model'],
  )
  assert.deepEqual(logs, [])
  const other = await open({ settings: { model: 'flash', effort: 'xhigh' } })
  await other.send(input('u2', 'hi'), 'turn')
  await until(other, turnEnd)
  assert.ok(logs.some((line) => /offers no level xhigh/.test(line)))
  await close()
})

test('resuming uses session/resume; without it, session/load and its replay are not new content', async () => {
  const { agy, open, close } = setup()
  agy.sessions.set('old', { model: 'neon', level: 'high', mode: 'default' })
  const resumed = await open({ origin: { kind: 'resume', ref: { harness: 'antigravity', id: 'old' } } })
  await resumed.send(input('u1', 'again'), 'turn')
  const first = await until(resumed, turnEnd)
  assert.ok(agy.methods().includes('session/resume'))
  assert.ok(!agy.methods().includes('session/new'))
  assert.ok(!types(first).includes('ref'))
  assert.equal(agy.calls.find((call) => call.method === 'session/prompt')!.params.sessionId, 'old')

  agy.capabilities = { loadSession: true, promptCapabilities: { image: true }, sessionCapabilities: {} }
  const loaded = await open({ origin: { kind: 'resume', ref: { harness: 'antigravity', id: 'old' } } })
  await loaded.send(input('u2', 'more'), 'turn')
  const second = await until(loaded, turnEnd)
  assert.ok(agy.methods().includes('session/load'))
  assert.ok(!second.some((event) => event.type === 'delta' && event.text === 'replayed'))
  assert.deepEqual(second[0], { type: 'turn-start', turn: 'turn-1', origin: 'user', inputIds: ['u2'] })
  await close()
})

test('a fork starts a new conversation with a notice; a copy is refused', async () => {
  const { agy, open, close } = setup()
  const forked = await open({ origin: { kind: 'fork', cut: { ref: { harness: 'antigravity', id: 'parent' }, at: 'turn-3' } } })
  await forked.send(input('u1', 'hi'), 'turn')
  const events = await until(forked, turnEnd)
  assert.equal(events[0]!.type, 'notice')
  assert.ok(agy.methods().includes('session/new'))
  const copied = await open({ origin: { kind: 'copy', ref: { harness: 'antigravity', id: 'parent' } } })
  await assert.rejects(copied.send(input('u2', 'hi'), 'turn'), /cannot take over/)
  await close()
})

test('text, images and a picked command reach agy as one prompt', async () => {
  const { agy, open, close } = setup()
  const session = await open()
  await session.send(
    input('u1', 'review the diff', {
      images: [{ mediaType: 'image/png', read: async () => new Uint8Array([1, 2, 3]) }],
      command: { name: 'goal', description: 'Run until done', kind: 'command' },
    }),
    'turn',
  )
  await until(session, turnEnd)
  assert.deepEqual(agy.calls.find((call) => call.method === 'session/prompt')!.params.prompt, [
    { type: 'text', text: '/goal review the diff' },
    { type: 'image', mimeType: 'image/png', data: Buffer.from([1, 2, 3]).toString('base64') },
  ])
  await close()
})

test('a tool ends its call when it runs; text after it opens the next call; no usage is guessed for such a turn', async () => {
  const { agy, open, close } = setup()
  agy.script = async (run) => {
    await run.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Editing.' } })
    await run.update({ sessionUpdate: 'tool_call', toolCallId: 't1', title: 'a.txt', kind: 'edit', status: 'pending', rawInput: { Path: 'a.txt' } })
    await run.update({ sessionUpdate: 'tool_call', toolCallId: 't2', title: 'ls', kind: 'execute', status: 'pending' })
    await run.update({ sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'in_progress' })
    await run.update({
      sessionUpdate: 'tool_call_update',
      toolCallId: 't1',
      status: 'completed',
      content: [{ type: 'diff', path: '/work/a.txt', oldText: 'a', newText: 'b' }],
    })
    await run.update({ sessionUpdate: 'tool_call_update', toolCallId: 't2', status: 'in_progress', content: [{ type: 'content', content: { type: 'text', text: 'partial' } }] })
    await run.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Done.' } })
    return { stopReason: 'end_turn', usage: { inputTokens: 1, outputTokens: 1 } } as PromptResponse
  }
  const session = await open()
  await session.send(input('u1', 'edit'), 'turn')
  const events = await until(session, turnEnd)
  assert.deepEqual(types(events), [
    'ref',
    'turn-start',
    'call-start',
    'delta',
    'tool-start',
    'tool-start',
    'call-end',
    'tool-end',
    'tool-progress',
    'call-start',
    'delta',
    'call-end',
    'tool-end',
    'turn-end',
  ])
  const starts = events.filter((event) => event.type === 'tool-start')
  assert.deepEqual(
    starts.map((event) => [event.tool, event.call, event.activity.kind, event.activity.title, event.activity.summary]),
    [
      ['t1', 'turn-1:call-1', 'edit', 'Edit', 'a.txt'],
      ['t2', 'turn-1:call-1', 'shell', 'Shell', 'ls'],
    ],
  )
  const ends = events.filter((event) => event.type === 'tool-end')
  assert.deepEqual(ends[0], {
    type: 'tool-end',
    tool: 't1',
    outcome: { status: 'completed', diffs: [{ path: '/work/a.txt', oldText: 'a', newText: 'b' }] },
  })
  // Still open when the turn ended.
  assert.deepEqual(ends[1], { type: 'tool-end', tool: 't2', outcome: { status: 'unknown' } })
  assert.ok(events.filter((event) => event.type === 'call-end').every((event) => !('usage' in event)))
  await close()
})

test('an approval shows the tool first and maps agy options by kind', async () => {
  const { agy, asked, open, close } = setup()
  const answers: RequestPermissionResponse[] = []
  const options = [
    { optionId: 'yes', name: 'Allow', kind: 'allow_once' },
    { optionId: 'always', name: 'Yes, grant permission for rm in this conversation', kind: 'allow_always' },
    { optionId: 'no', name: 'Deny', kind: 'reject_once' },
  ]
  agy.script = async (run) => {
    await run.update({ sessionUpdate: 'tool_call', toolCallId: 'c1', title: 'rm x', kind: 'execute', status: 'pending' })
    for (let index = 0; index < 3; index++) answers.push(await run.permission('c1', options))
    answers.push(await run.permission('c2', [options[1]!, options[2]!], 'mkdir y'))
    return { stopReason: 'end_turn' }
  }
  const decisions: ApprovalDecision[] = [{ kind: 'allow' }, { kind: 'choice', id: '0' }, { kind: 'deny' }, { kind: 'choice', id: '0' }]
  const session = await open()
  asked.decide = async () => decisions.shift()!
  await session.send(input('u1', 'clean'), 'turn')
  const events = await until(session, turnEnd)
  assert.deepEqual(asked.approvals[0], {
    tool: 'c1',
    title: 'Shell',
    reason: 'rm x',
    choices: [{ id: '0', label: 'Yes, grant permission for rm in this conversation' }],
  })
  assert.deepEqual(asked.approvals[3], {
    tool: 'c2',
    title: 'Tool',
    reason: 'mkdir y',
    choices: [{ id: '0', label: 'Yes, grant permission for rm in this conversation' }],
    allowOnce: false,
  })
  assert.deepEqual(
    answers.map((answer) => (answer.outcome.outcome === 'selected' ? answer.outcome.optionId : 'cancelled')),
    ['yes', 'always', 'no', 'always'],
  )
  // c2 was unknown until its approval: its card comes first, in a call of its own.
  const order = types(events)
  assert.ok(order.indexOf('tool-start') < order.indexOf('call-end'))
  assert.equal(events.filter((event) => event.type === 'tool-start').length, 2)
  await close()
})

test('agy questions become question cards; a dismissed card or an unknown answer cancels', async () => {
  const { agy, asked, open, close } = setup()
  const answers: RequestPermissionResponse[] = []
  const choices = [
    { optionId: 'a', name: 'Postgres', kind: 'allow_once' },
    { optionId: 'b', name: 'SQLite', kind: 'allow_once' },
  ]
  agy.script = async (run) => {
    answers.push(await run.permission('interaction_1', choices, 'Which database?'))
    answers.push(await run.permission('interaction_2', choices, 'Again?'))
    return { stopReason: 'end_turn' }
  }
  const replies: QuestionAnswer[] = [{ answers: [{ id: 'interaction_1', selected: ['SQLite'] }] }, { answers: [], dismissed: true }]
  asked.answer = async () => replies.shift()!
  const session = await open()
  await session.send(input('u1', 'set up'), 'turn')
  const events = await until(session, turnEnd)
  assert.deepEqual(asked.questions[0], [
    { id: 'interaction_1', header: 'Antigravity', question: 'Which database?', options: [{ label: 'Postgres' }, { label: 'SQLite' }] },
  ])
  assert.equal(asked.approvals.length, 0)
  assert.ok(!types(events).includes('tool-start'))
  assert.deepEqual(
    answers.map((answer) => (answer.outcome.outcome === 'selected' ? answer.outcome.optionId : 'cancelled')),
    ['b', 'cancelled'],
  )
  await close()
})

test('settings changes apply at once; one agy rejects keeps the earlier settings', async () => {
  const { agy, open, close } = setup()
  const session = await open({ settings: { model: 'neon' } })
  // Before the first turn the session opens with whatever is current.
  assert.deepEqual(await session.apply({ mode: 'plan' }), { status: 'applied' })
  await session.send(input('u1', 'hi'), 'turn')
  await until(session, turnEnd)
  assert.equal(agy.sessions.get('s1')!.mode, 'plan')
  assert.deepEqual(await session.apply({ model: 'flash', effort: 'low' }), { status: 'applied' })
  assert.deepEqual(agy.sessions.get('s1'), { model: 'flash', level: 'low', mode: 'plan' })
  const rejected = await session.apply({ model: 'nope' })
  assert.equal(rejected.status, 'rejected')
  assert.match(rejected.detail ?? '', /Unknown model ID: nope/)
  assert.equal(agy.sessions.get('s1')!.model, 'flash')
  await close()
})

test('a mode agy switches to by itself is reported once; one dsh picked is not', async () => {
  const { agy, open, close } = setup()
  agy.script = async (run) => {
    await run.update({ sessionUpdate: 'current_mode_update', currentModeId: 'default' })
    await run.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'ok' } })
    return { stopReason: 'end_turn' }
  }
  const session = await open({ settings: { mode: 'plan' } })
  await session.send(input('u1', 'go'), 'turn')
  const events = await until(session, turnEnd)
  assert.deepEqual(events.filter((event) => event.type === 'mode'), [{ type: 'mode', mode: 'default' }])
  agy.script = async (run) => {
    await run.update({ sessionUpdate: 'current_mode_update', currentModeId: 'auto' })
    return { stopReason: 'end_turn' }
  }
  await session.apply({ mode: 'auto' })
  await session.send(input('u2', 'go'), 'turn')
  assert.ok(!(await until(session, turnEnd)).some((event) => event.type === 'mode'))
  await close()
})

test('an interrupt cancels the prompt, withdraws its approval and closes open tools; the session goes on', async () => {
  const { agy, asked, open, close } = setup()
  let answered: RequestPermissionResponse | undefined
  agy.script = async (run) => {
    await run.update({ sessionUpdate: 'tool_call', toolCallId: 'c1', title: 'sleep 30', kind: 'execute', status: 'pending' })
    void run.permission('c1', [{ optionId: 'yes', name: 'Allow', kind: 'allow_once' }]).then((answer) => {
      answered = answer
    })
    await run.cancelled
    await run.update({ sessionUpdate: 'tool_call_update', toolCallId: 'c1', status: 'failed' })
    return { stopReason: 'cancelled' }
  }
  asked.decide = (_request, signal) =>
    new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }))
  const session = await open()
  await session.send(input('u1', 'wait'), 'turn')
  await until(session, (event) => event.type === 'tool-start')
  while (!asked.approvals.length) await new Promise((resolve) => setTimeout(resolve, 5))
  await session.interrupt()
  const events = await until(session, turnEnd)
  assert.deepEqual(events.at(-1), { type: 'turn-end', turn: 'turn-1', outcome: 'interrupted' })
  assert.ok(agy.methods().includes('session/cancel'))
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.deepEqual(answered, { outcome: { outcome: 'cancelled' } })
  agy.script = async (run) => {
    await run.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'back' } })
    return { stopReason: 'end_turn' }
  }
  await session.send(input('u2', 'hello again'), 'turn')
  const next = await until(session, turnEnd)
  assert.deepEqual(next.at(-1), { type: 'turn-end', turn: 'turn-2', outcome: 'completed' })
  assert.equal(agy.links.length, 1)
  await close()
})

test('input sent while a prompt runs waits for it, then runs as the next prompt', async () => {
  const { agy, open, close } = setup()
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  agy.script = async (run) => {
    if (run.prompt.some((block) => block.type === 'text' && block.text === 'first')) await held
    await run.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'ok' } })
    return { stopReason: 'end_turn' }
  }
  const session = await open()
  await session.send(input('u1', 'first'), 'turn')
  assert.deepEqual(await session.send(input('u2', 'second'), 'steer'), { inputId: 'u2', disposition: 'queued' })
  assert.deepEqual(await session.send(input('u3', 'third'), 'steer'), { inputId: 'u3', disposition: 'queued' })
  release()
  await until(session, turnEnd)
  const next = await until(session, turnEnd)
  assert.deepEqual(next[0], { type: 'turn-start', turn: 'turn-2', origin: 'user', inputIds: ['u2', 'u3'] })
  assert.deepEqual(agy.calls.filter((call) => call.method === 'session/prompt').at(-1)!.params.prompt, [
    { type: 'text', text: 'second' },
    { type: 'text', text: 'third' },
  ])
  await close()
})

test('content agy sends by itself is a native turn that ends once quiet; a background tool ending shows no card', async () => {
  const { agy, open, close } = setup({ nativeQuietMs: 30 })
  agy.script = async (run) => {
    await run.update({ sessionUpdate: 'tool_call', toolCallId: 'bg', title: 'npm test', kind: 'execute', status: 'in_progress' })
    return { stopReason: 'end_turn' }
  }
  const session = await open()
  await session.send(input('u1', 'run tests in the background'), 'turn')
  await until(session, turnEnd)
  assert.deepEqual(session.tasks().map((task) => task.id), ['bg'])
  const notify = (update: SessionUpdate) => agy.client!.notify('session/update', { sessionId: 's1', update })
  await notify({ sessionUpdate: 'tool_call_update', toolCallId: 'bg', status: 'completed' })
  await notify({ sessionUpdate: 'usage_update', used: 10, size: 1_000_000 })
  await notify({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Tests passed.' } })
  const native = await until(session, turnEnd)
  assert.deepEqual(types(native), ['turn-start', 'call-start', 'delta', 'call-end', 'turn-end'])
  assert.deepEqual(native[0], { type: 'turn-start', turn: 'turn-2', origin: 'native', inputIds: [] })
  assert.deepEqual(native.at(-1), { type: 'turn-end', turn: 'turn-2', outcome: 'completed' })
  assert.deepEqual(session.tasks(), [])
  await close()
})

test('a tool a completed turn leaves running is a background task until agy reports it ended', async () => {
  const { agy, open, close } = setup()
  agy.script = async (run) => {
    await run.update({ sessionUpdate: 'tool_call', toolCallId: 'srv', title: 'python3 -m http.server', kind: 'execute', status: 'in_progress' })
    await run.update({ sessionUpdate: 'tool_call', toolCallId: 'sub', title: 'Review the diff', kind: 'other', status: 'in_progress' })
    await run.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Started.' } })
    return { stopReason: 'end_turn' }
  }
  const session = await open()
  await session.send(input('u1', 'serve'), 'turn')
  const events = await until(session, turnEnd)
  // The cards still end with the turn.
  assert.deepEqual(
    events.filter((event) => event.type === 'tool-end').map((event) => [event.tool, event.outcome.status]),
    [
      ['srv', 'unknown'],
      ['sub', 'unknown'],
    ],
  )
  const tasks = session.tasks()
  assert.deepEqual(
    tasks.map(({ startedAt: _, ...task }) => task),
    [
      { id: 'srv', kind: 'shell', title: 'python3 -m http.server', background: true, stoppable: false },
      { id: 'sub', kind: 'other', title: 'Review the diff', background: true, stoppable: false },
    ],
  )
  assert.ok(tasks.every((task) => task.startedAt <= Date.now()))
  await assert.rejects(session.stopTask('srv'), /does not report/)
  const notify = (update: SessionUpdate) => agy.client!.notify('session/update', { sessionId: 's1', update })
  // Progress keeps it listed and shows nothing; its end only leaves the list.
  await notify({ sessionUpdate: 'tool_call_update', toolCallId: 'srv', status: 'in_progress', content: [{ type: 'content', content: { type: 'text', text: 'GET /' } }] })
  await notify({ sessionUpdate: 'tool_call_update', toolCallId: 'sub', status: 'completed' })
  await new Promise((resolve) => setTimeout(resolve, 80))
  assert.deepEqual(session.tasks().map((task) => task.id), ['srv'])
  await notify({ sessionUpdate: 'tool_call_update', toolCallId: 'srv', status: 'failed' })
  await new Promise((resolve) => setTimeout(resolve, 80))
  assert.deepEqual(session.tasks(), [])
  await assert.rejects(until(session, () => true, 150), /timed out/)
  await close()
})

test('an interrupted turn and a lost connection leave no background tasks', async () => {
  const { agy, open, close } = setup()
  agy.script = async (run) => {
    const stopping = run.prompt.some((block) => block.type === 'text' && block.text === 'stop me')
    // agy gives every tool call its own id.
    await run.update({ sessionUpdate: 'tool_call', toolCallId: stopping ? 'srv-1' : 'srv-2', title: 'serve', kind: 'execute', status: 'in_progress' })
    if (stopping) {
      await run.cancelled
      return { stopReason: 'cancelled' }
    }
    return { stopReason: 'end_turn' }
  }
  const session = await open()
  await session.send(input('u1', 'stop me'), 'turn')
  await until(session, (event) => event.type === 'tool-start')
  await session.interrupt()
  await until(session, turnEnd)
  assert.deepEqual(session.tasks(), [])
  await session.send(input('u2', 'serve'), 'turn')
  await until(session, turnEnd)
  assert.equal(session.tasks().length, 1)
  await agy.links[0]!.close()
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.deepEqual(session.tasks(), [])
  await close()
})

test('a native turn yields to new input', async () => {
  const { agy, open, close } = setup({ nativeQuietMs: 10_000 })
  const session = await open()
  await session.send(input('u1', 'hi'), 'turn')
  await until(session, turnEnd)
  await agy.client!.notify('session/update', { sessionId: 's1', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'woke' } } })
  await until(session, (event) => event.type === 'delta')
  await session.send(input('u2', 'next'), 'turn')
  const events = await until(session, (event) => event.type === 'turn-start')
  assert.deepEqual(types(events), ['call-end', 'turn-end', 'turn-start'])
  assert.deepEqual(events[1], { type: 'turn-end', turn: 'turn-2', outcome: 'completed' })
  assert.deepEqual(events[2], { type: 'turn-start', turn: 'turn-3', origin: 'user', inputIds: ['u2'] })
  await close()
})

test('a lost connection fails the running turn; the next send reconnects and resumes the conversation', async () => {
  const { agy, open, close } = setup()
  let hold = true
  agy.script = async (run) => {
    if (hold) await new Promise(() => {})
    await run.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'resumed' } })
    return { stopReason: 'end_turn' }
  }
  const session = await open()
  await session.send(input('u1', 'hi'), 'turn')
  await until(session, (event) => event.type === 'turn-start')
  await agy.links[0]!.close()
  const failed = await until(session, turnEnd)
  assert.equal((failed.at(-1) as Extract<NativeEvent, { type: 'turn-end' }>).outcome, 'failed')
  hold = false
  await session.send(input('u2', 'again'), 'turn')
  const next = await until(session, turnEnd)
  assert.deepEqual(next.at(-1), { type: 'turn-end', turn: 'turn-2', outcome: 'completed' })
  assert.equal(agy.calls.filter((call) => call.method === 'session/resume').at(-1)!.params.sessionId, 's1')
  await close()
})

test('the context window agy reports is learned per model', async () => {
  const { harness, open, close } = setup()
  const session = await open({ settings: { model: 'flash' } })
  await session.send(input('u1', 'hi'), 'turn')
  await until(session, turnEnd)
  assert.equal(harness.contextWindow('flash'), 1_000_000)
  assert.equal(harness.contextWindow('orchestrator'), undefined)
  await close()
})

test('agy that is not signed in says how to sign in', async () => {
  const { agy, open, harness, close } = setup()
  agy.initError = RequestError.authRequired()
  const session = await open()
  await assert.rejects(session.send(input('u1', 'hi'), 'turn'), /not signed in.*agy/s)
  await assert.rejects(harness.catalog('/work', AbortSignal.timeout(5000)), /not signed in/)
  await close()
})

test('closing closes the agy conversation and the connection', async () => {
  const { agy, open, close } = setup()
  const session = await open()
  await session.send(input('u1', 'hi'), 'turn')
  await until(session, turnEnd)
  await session.close()
  assert.equal(agy.calls.at(-1)!.method, 'session/close')
  assert.equal(agy.links[0]!.alive, false)
  assert.equal((await session.events.next()).done, true)
  assert.deepEqual(session.tasks(), [])
  await close()
})
