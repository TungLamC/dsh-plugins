/** In-memory dsh composition (installed 0.2.2-rc.1 packages) around a TurnBridge, its Route and a Fake harness. */
import { Context } from '@deepseek-ai/cordis'
import Llm, { createUserMessage, LlmAdapter, ReasoningEffortId, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import Session, { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import Projection from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import Agents, { installModelSelection, type Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import TokenMeter from '@deepseek-ai/dsh-token-meter'
import * as TodoTool from '@deepseek-ai/dsh-tool-todo'
import * as NativeExecutor from '@deepseek-ai/dsh-tool-executor-native'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import { createTurnBridge, type BridgeDeps, type TurnBridge } from '../src/host/bridge/index.ts'
import { observationTool } from '../src/host/bridge/observation.ts'
import { FakeHarness, type FakeScript } from '../src/host/harness/fake.ts'
import type { Harness } from '../src/host/harness/types.ts'
import { installRoute, type Route } from '../src/host/route.ts'
import { SessionRuntime } from '../src/host/runtime.ts'
import { memoryStore } from '../src/host/store.ts'
import { harnessOfPreset, PRESETS, PROVIDERS } from '../src/shared/types.ts'

class TestAdapter extends LlmAdapter {
  bridge?: TurnBridge
  override async resolveModel(provider: string, model: string) {
    return { provider, id: model, name: model, context: { contextWindow: 200_000 }, inputModalities: ['text' as const, 'image' as const] }
  }
  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    yield* this.bridge!.stream(options)
  }
}

/** The global default model a new dsh session starts on; a harness session must never call it. */
export const DEFAULT_ROUTE = { provider: 'default-provider', model: 'default-model', reasoningEffort: ReasoningEffortId('high') }
class DefaultAdapter extends LlmAdapter {
  calls = 0
  override async resolveModel(provider: string, model: string) {
    const high = { id: ReasoningEffortId('high'), name: 'high' }
    return { provider, id: model, name: model, reasoning: { efforts: [high], defaultEffort: high.id } }
  }
  async *stream(): AsyncIterable<StreamChunk> {
    this.calls++
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export interface World {
  ctx: Context
  agent: Agent
  fake: FakeHarness
  bridge: TurnBridge
  events: SessionEvent[]
  committed: { seq: number; at: string }[]
  approvals: string[]
  runtime: SessionRuntime
  store: ReturnType<typeof memoryStore>
  route: Route
  /** Switch the blank session's agent preset, as dsh's preset picker does. */
  selectPreset(preset: string): void
  /** Steps that reached the global default model instead of the harness. */
  defaultCalls(): number
  send(text: string): void
  idle(): Promise<void>
  close(): Promise<void>
}

export async function world(
  script?: FakeScript,
  overrides: Partial<BridgeDeps> = {},
  /** `preset`: what the session is created with; the harness's native preset by default. */
  options: { harness?: Harness; cwd?: string; preset?: string } = {},
): Promise<World> {
  const ctx = new Context()
  for (const plugin of [Llm, Session, Projection, SystemPrompt, Tools, Agents, TokenMeter]) await ctx.plugin(plugin)
  await ctx.plugin(NativeExecutor)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(TodoTool, { allowParallelInProgress: true })
  const fake = new FakeHarness('codex', { models: [], modes: [], commands: [] }, script)
  const harness = options.harness ?? fake
  let preset = options.preset ?? Object.keys(PRESETS).find((id) => PRESETS[id] === harness.id)!
  const harnessOf = () => harnessOfPreset(preset)
  const store = memoryStore()
  const committed: World['committed'] = []
  const approvals: string[] = []
  const runtime = new SessionRuntime({
    harness: () => harness,
    store,
    settings: (_harness, _cwd, stored) => stored,
    ports: () => ({
      interactions: {
        approve: async (request) => {
          approvals.push(`${request.title}: ${request.reason.split('\n')[0]}`)
          return { kind: 'allow' }
        },
        ask: async () => ({ answers: [] }),
        reviewPlan: async () => 'approve' as const,
      },
      signal: new AbortController().signal,
      log: () => {},
    }),
    readEvents: async () => [],
    cwd: async (agent) => agent.session.header.cwd ?? process.cwd(),
  })
  const deps: BridgeDeps = {
    agent: (id) => ctx.agents.get(SessionId(id)),
    harnessOf,
    open: (agent, harness, signal) => runtime.session(agent, harness, signal),
    closeSession: (id) => runtime.close(id),
    saveRef: (id, harness, ref) => runtime.saveRef(id, harness, ref),
    saveMode: (id, harness, mode) => runtime.saveMode(id, harness, mode),
    saveEndpoint: (id, harness, endpoint) => runtime.saveEndpoint(id, harness, endpoint),
    markForwarded: (id, harness, ids) => runtime.markForwarded(id, harness, ids),
    committed: async (id, harness, seq, cut) => {
      committed.push({ seq, at: cut.at })
      await runtime.committed(id, harness, seq, cut)
    },
    command: async () => undefined,
    image: () => {
      throw new Error('no images in tests')
    },
    contextWindow: () => {},
    startTurn: (agent) =>
      agent.followup(
        createUserMessage({
          content: [{ type: 'text', text: 'native turn' }],
          source: { kind: 'native-harness', form: 'notice', summary: 'native turn' } as never,
        }),
      ),
    prepare: async () => {},
    idleMs: 60_000,
    log: () => {},
    ...overrides,
  }
  const bridge = createTurnBridge(deps)
  const adapter = new TestAdapter()
  adapter.bridge = bridge
  ctx.llm.registerAdapter(Object.values(PROVIDERS), adapter)
  const fallback = new DefaultAdapter()
  ctx.llm.registerAdapter([DEFAULT_ROUTE.provider], fallback)
  // dsh's session controller installs this for every session it composes.
  installModelSelection(ctx)
  const route = installRoute(ctx, {
    agent: (id) => ctx.agents.get(SessionId(id)),
    harnessOf,
    model: async (agent) => (await store.read(agent.id))?.settings.model ?? 'fixture',
    fallback: () => 'fixture',
  })
  ctx.tools.register(observationTool(bridge))
  const events: SessionEvent[] = []
  ctx.on('session/event', (session, event) => {
    events.push(event)
    bridge.sessionEvent(session.id, event)
  })
  ctx.on('agent/inbox/inserted', ({ agent, message }) => bridge.inboxInserted(agent, message))
  const agent = await ctx.agentLoop.create(
    SessionId(`session-${crypto.randomUUID()}`),
    DEFAULT_ROUTE,
    options.cwd ? { cwd: options.cwd } : undefined,
  )
  return {
    ctx,
    agent,
    fake,
    bridge,
    events,
    committed,
    approvals,
    runtime,
    store,
    route,
    selectPreset(id) {
      preset = id
      agent.session.append('agent-preset/selected', { agentPreset: id })
    },
    defaultCalls: () => fallback.calls,
    send(text) {
      agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
    },
    async idle() {
      await new Promise((resolve) => setTimeout(resolve, 20))
      await agent.whenIdle()
    },
    async close() {
      await runtime.closeAll()
    },
  }
}
