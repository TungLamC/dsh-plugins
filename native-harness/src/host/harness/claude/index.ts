/**
 * Claude Code Adapter: one long-lived streaming-input Agent SDK query per dsh
 * session, driving the locally installed `claude` executable.
 */
import { randomUUID } from 'node:crypto'
import { query, type Options, type PermissionMode, type Query, type SDKMessage, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import type { TokenUsage } from '@deepseek-ai/dsh-llm'
import { boundOutput } from '../../../shared/activity.ts'
import { count, list, object, text, type EndpointWait, type ModeOption, type NativeCommand } from '../../../shared/types.ts'
import type { ClaudeEndpoint } from '../../config.ts'
import { Channel } from '../channel.ts'
import { childEnvironment } from '../codex/rpc.ts'
import type {
  ApplyResult,
  BackgroundTask,
  Harness,
  HarnessCatalog,
  HarnessSettings,
  NativeEvent,
  NativeInput,
  NativeRef,
  NativeSession,
  OpenOrigin,
  OpenRequest,
  SendReceipt,
  SessionPorts,
  SettingsChange,
} from '../types.ts'
import { activityOf, outcomeOf } from './activity.ts'
import { ClaudeTaskTracker, ClaudeTasks } from './tasks.ts'

export interface ClaudeConfig {
  command: string
  /** `CLAUDE_CODE_ENTRYPOINT` for the processes this Adapter starts (the plugin defaults it to `native-harness`); empty keeps the Agent SDK's own `sdk-ts`. */
  entrypoint?: string
  /** Upstreams a session can run on; with none, `NATIVE_HARNESS_ANTHROPIC_*` when set, else the host environment's. */
  endpoints?: readonly ClaudeEndpoint[]
  /** Endpoint of the catalog process: the one new sessions start on. */
  catalogEndpoint?: string
  /** The value of a variable an endpoint's `$NAME` or `NATIVE_HARNESS_ANTHROPIC_*` names; undefined when it is set nowhere. */
  resolveVariable: (name: string) => Promise<string | undefined>
}

const MODES: ModeOption[] = [
  { id: 'default', name: 'Ask', description: 'Ask before edits and commands.' },
  { id: 'acceptEdits', name: 'Accept edits', description: 'Edit files without asking; ask before other actions.' },
  { id: 'plan', name: 'Plan', description: 'Explore and plan; no edits until the plan is approved.' },
  { id: 'auto', name: 'Auto', description: 'A classifier approves safe actions and asks about the rest.' },
  { id: 'bypassPermissions', name: 'Bypass permissions', description: 'Run every tool without asking.', risky: true },
]
const TASK_FRAMES = new Set(['task_started', 'task_progress', 'task_updated', 'task_notification', 'background_tasks_changed'])
/** Built-in commands that make sense without the terminal UI. */
const HEADLESS_BUILTINS = new Set(['compact', 'init', 'review', 'security-review'])

function uuidOf(sessionId: string): string | undefined {
  const uuid = sessionId.replace(/^session-/, '')
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid) ? uuid : undefined
}

/** Where a process talks to the API; on an endpoint, the host's own choice of upstream must not leak through. */
const UPSTREAM_KEYS = ['ANTHROPIC_BASE_URL', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN']
const REFERENCE = /^\$([A-Za-z_][A-Za-z0-9_]*)$/
/**
 * The upstream of a process with no endpoint, by the variable it is read from.
 * Only native-harness reads these names; under the bare `ANTHROPIC_*` names a
 * stored value would also be picked up by dsh's own Anthropic provider.
 */
const OWN_UPSTREAM = {
  ANTHROPIC_BASE_URL: 'NATIVE_HARNESS_ANTHROPIC_BASE_URL',
  ANTHROPIC_AUTH_TOKEN: 'NATIVE_HARNESS_ANTHROPIC_AUTH_TOKEN',
  ANTHROPIC_API_KEY: 'NATIVE_HARNESS_ANTHROPIC_API_KEY',
} as const

/**
 * No inherited harness identity; the configured entrypoint label, else whatever
 * the Agent SDK fills in. On an endpoint, its variables replace the host's
 * upstream; `$NAME` values come from `config.resolveVariable` and must be set.
 * With no endpoint, `NATIVE_HARNESS_ANTHROPIC_*` replace it when any is set.
 */
export async function claudeEnvironment(config: ClaudeConfig, sessionId: string, endpoint?: ClaudeEndpoint): Promise<NodeJS.ProcessEnv> {
  const env = childEnvironment(sessionId)
  if (config.entrypoint) env.CLAUDE_CODE_ENTRYPOINT = config.entrypoint
  const upstream = endpoint ? await endpointVariables(config, endpoint) : await ownUpstream(config)
  if (!upstream) return env
  for (const key of UPSTREAM_KEYS) delete env[key]
  return Object.assign(env, upstream)
}

async function endpointVariables(config: ClaudeConfig, endpoint: ClaudeEndpoint): Promise<Record<string, string>> {
  const variables: Record<string, string> = {}
  for (const [key, value] of Object.entries(endpoint.env)) {
    const name = REFERENCE.exec(value)?.[1]
    if (!name) {
      variables[key] = value
      continue
    }
    const resolved = await config.resolveVariable(name)
    if (!resolved)
      throw new Error(
        `Endpoint ${endpoint.name || endpoint.id}: ${key} reads $${name}, which neither dsh's credential store nor the dsh host environment sets`,
      )
    variables[key] = resolved
  }
  return variables
}

/** `NATIVE_HARNESS_ANTHROPIC_*` as the variables Claude Code reads; undefined when none is set, leaving the host's upstream. */
async function ownUpstream(config: ClaudeConfig): Promise<Record<string, string> | undefined> {
  const variables: Record<string, string> = {}
  for (const [key, name] of Object.entries(OWN_UPSTREAM)) {
    const value = await config.resolveVariable(name)
    if (value) variables[key] = value
  }
  if (!Object.keys(variables).length) return undefined
  if (variables.ANTHROPIC_BASE_URL && !variables.ANTHROPIC_AUTH_TOKEN && !variables.ANTHROPIC_API_KEY)
    throw new Error(
      `Claude Code: ANTHROPIC_BASE_URL reads $${OWN_UPSTREAM.ANTHROPIC_BASE_URL}, but neither dsh's credential store nor the dsh host environment sets $${OWN_UPSTREAM.ANTHROPIC_AUTH_TOKEN} or $${OWN_UPSTREAM.ANTHROPIC_API_KEY}; set one of them`,
    )
  return variables
}

function endpointOf(config: ClaudeConfig, id: string | undefined): ClaudeEndpoint | undefined {
  return id ? config.endpoints?.find((endpoint) => endpoint.id === id) : undefined
}

/**
 * Which conversation a process starts on: its own once it has one; else a fork
 * of the cut, a full copy of the conversation it takes over, or a new one. A
 * new conversation or a copy takes the UUID of the dsh session as its id.
 */
export function startOptions(ref: NativeRef | undefined, origin: OpenOrigin, uuid: string | undefined): Partial<Options> {
  const own = uuid ? { sessionId: uuid } : {}
  if (ref) return { resume: ref.id }
  if (origin.kind === 'fork') return { resume: origin.cut.ref.id, forkSession: true, resumeSessionAt: origin.cut.at, ...own }
  if (origin.kind === 'copy') return { resume: origin.ref.id, forkSession: true, ...own }
  return own
}

async function baseOptions(config: ClaudeConfig, cwd: string, sessionId: string, endpoint?: ClaudeEndpoint): Promise<Options> {
  return {
    cwd,
    pathToClaudeCodeExecutable: config.command,
    env: await claudeEnvironment(config, sessionId, endpoint),
    includePartialMessages: true,
  }
}

/** The `default` alias is listed only when no other entry names the model it resolves to. */
export function catalogOf(init: Record<string, unknown>): HarnessCatalog {
  const entries = list(init.models).map(object)
  const resolved = (model: Record<string, unknown>) => text(model.resolvedModel) || text(model.value)
  const recommended = entries.find((model) => text(model.value) === 'default')
  const alias = recommended && entries.find((model) => model !== recommended && resolved(model) === resolved(recommended))
  const models = entries.flatMap((model) => {
    const id = text(model.value)
    if (!id || (alias && model === recommended)) return []
    return [
      {
        id,
        name: text(model.displayName) || id,
        ...(text(model.description) ? { description: text(model.description) } : {}),
        efforts: list(model.supportedEffortLevels).map((effort) => ({ id: text(effort), name: text(effort) })),
        image: true,
      },
    ]
  })
  const commands: NativeCommand[] = list(init.commands).flatMap((value) => {
    const command = object(value)
    const name = text(command.name)
    if (!name || (command.builtin === true && !HEADLESS_BUILTINS.has(name))) return []
    return [
      {
        name,
        description: text(command.description) || name,
        kind: command.builtin === true ? 'command' : 'skill',
        ...(text(command.argumentHint) ? { argumentHint: text(command.argumentHint) } : {}),
      } satisfies NativeCommand,
    ]
  })
  const defaultModel = alias ? text(alias.value) : recommended ? 'default' : undefined
  return { models, ...(defaultModel ? { defaultModel } : {}), modes: MODES, commands }
}

const WINDOW_PROBE_MS = 60_000

export class ClaudeHarness implements Harness {
  readonly id = 'claude-code' as const
  private readonly config: ClaudeConfig
  private readonly sessions = new Set<ClaudeSession>()
  /** Context windows by model alias, learned once per process. */
  private readonly windows = new Map<string, number>()
  private probing = false
  private probed = false
  constructor(config: ClaudeConfig) {
    this.config = config
  }

  contextWindow(model: string): number | undefined {
    return this.windows.get(model)
  }

  async catalog(cwd: string, signal: AbortSignal): Promise<HarnessCatalog> {
    const base = await baseOptions(this.config, cwd, 'catalog', endpointOf(this.config, this.config.catalogEndpoint))
    signal.throwIfAborted()
    const input = new Channel<SDKUserMessage>()
    const abortController = new AbortController()
    const abort = () => abortController.abort()
    signal.addEventListener('abort', abort, { once: true })
    const q = query({ prompt: input, options: { ...base, abortController } })
    let keep = false
    try {
      const init = object(await q.initializationResult())
      keep = this.probeWindow(q, init, () => {
        input.close()
        q.close()
      })
      return catalogOf(init)
    } finally {
      signal.removeEventListener('abort', abort)
      if (!keep) {
        input.close()
        q.close()
      }
    }
  }

  /**
   * The SDK reports a context window only with a turn's result, so the first
   * turn would show no context ring. Ask the catalog process once instead. Only
   * the window is used, so `summary` keeps the per-category counts local instead
   * of calling the token-count API; it still runs after the catalog returns.
   */
  private probeWindow(q: Query, init: Record<string, unknown>, done: () => void): boolean {
    const resolved = new Map(list(init.models).map(object).map((model) => [text(model.value), text(model.resolvedModel)]))
    if (this.probing || this.probed) return false
    this.probing = true
    const timer = setTimeout(done, WINDOW_PROBE_MS)
    q.getContextUsage({ detail: 'summary' })
      .then((usage) => {
        const window = count(usage.rawMaxTokens) || count(usage.maxTokens)
        if (!window) return
        this.probed = true
        for (const [alias, model] of resolved) if (model === usage.model) this.windows.set(alias, window)
        this.windows.set(usage.model, window)
      })
      .catch(() => undefined)
      .finally(() => {
        this.probing = false
        clearTimeout(timer)
        done()
      })
    return true
  }

  async open(request: OpenRequest, ports: SessionPorts): Promise<NativeSession> {
    const session = new ClaudeSession(this.config, request, ports, () => this.sessions.delete(session))
    this.sessions.add(session)
    return session
  }

  async close(): Promise<void> {
    await Promise.allSettled([...this.sessions].map((session) => session.close()))
  }
}

interface OpenCall {
  id: string
  usage: Record<string, unknown>
  tools: boolean
}

class ClaudeSession implements NativeSession {
  readonly events = new Channel<NativeEvent>()
  ref: NativeRef | undefined
  private q?: Query
  private input?: Channel<SDKUserMessage>
  private settings: HarnessSettings
  private bypassAllowed = false
  private restartPending = false
  /** Endpoint the live process runs on. */
  private running?: string
  /** Endpoint the previous process of this dsh session started on. */
  private lastEndpoint?: string
  private turnOpen = false
  private interrupted = false
  private turns = 0
  private turn = ''
  private call?: OpenCall
  private heldEnd?: NativeEvent
  private lastAssistant?: string
  /** Steers the CLI has queued but not consumed, by message uuid; they run as the next turn if the current one ends first. */
  private queuedSteers = new Map<string, string>()
  private readonly toolBlocks = new Map<number, { id: string; name: string; json: string; input: unknown }>()
  private readonly startedTools = new Set<string>()
  private readonly todo = new ClaudeTasks()
  /** Subagents and background tasks; the process keeps them alive. */
  private readonly work = new ClaudeTaskTracker()
  /** Task tools in flight: shown as dsh's todo list, so they get no tool card. */
  private readonly taskTools = new Set<string>()
  /** Plans shown for review, by tool id, until the tool's result carries them to the card. */
  private readonly plans = new Map<string, string>()
  private closed = false
  /** A process start waiting for its environment; sends that arrive meanwhile share it. */
  private starting?: Promise<Channel<SDKUserMessage>>
  /** Bumped on every (re)start; a stale reader may not touch session state. */
  private generation = 0
  private readonly config: ClaudeConfig
  private readonly request: OpenRequest
  private readonly ports: SessionPorts
  private readonly forget: () => void

  constructor(config: ClaudeConfig, request: OpenRequest, ports: SessionPorts, forget: () => void) {
    this.config = config
    this.request = request
    this.ports = ports
    this.forget = forget
    this.settings = { ...request.settings }
    this.lastEndpoint = request.lastEndpoint
    if (request.origin.kind === 'resume') this.ref = request.origin.ref
  }

  async send(input: NativeInput, mode: 'turn' | 'steer', signal?: AbortSignal): Promise<SendReceipt> {
    const content: unknown[] = []
    const body = input.command ? `/${input.command.name}${input.text ? ` ${input.text}` : ''}` : input.text
    if (body) content.push({ type: 'text', text: body })
    for (const image of input.images) {
      const data = Buffer.from(await image.read(this.ports.signal)).toString('base64')
      content.push({ type: 'image', source: { type: 'base64', media_type: image.mediaType, data } })
    }
    signal?.throwIfAborted()
    const channel = await this.start()
    signal?.throwIfAborted()
    const steering = mode === 'steer' && this.turnOpen
    const uuid = randomUUID()
    if (!steering) this.beginTurn('user', [input.id])
    else this.queuedSteers.set(uuid, input.id)
    // `next`, like Enter in the TUI: folded into the running turn after its current tool calls.
    channel.push({
      type: 'user',
      message: { role: 'user', content: content as never },
      parent_tool_use_id: null,
      origin: { kind: 'human' },
      priority: 'next',
      uuid: uuid as never,
    })
    return { inputId: input.id, disposition: steering ? 'steer' : 'turn' }
  }

  async apply(change: SettingsChange): Promise<ApplyResult> {
    if (change.mode && !MODES.some((mode) => mode.id === change.mode))
      return { status: 'unsupported', detail: `Unknown Claude Code mode ${change.mode}` }
    if (change.endpoint && !endpointOf(this.config, change.endpoint))
      return { status: 'unsupported', detail: `Unknown Claude Code endpoint ${change.endpoint}` }
    const commit = () => {
      for (const key of ['model', 'effort', 'mode', 'endpoint'] as const) {
        if (!(key in change)) continue
        const value = change[key]
        if (value === null || value === undefined) delete this.settings[key]
        else this.settings[key] = value
      }
    }
    const q = this.q
    if (!q) {
      commit()
      return { status: 'applied' }
    }
    // Another upstream needs another process; the restart resumes with every committed setting.
    if ('endpoint' in change && (change.endpoint ?? undefined) !== this.running) {
      commit()
      this.restartPending = true
      this.restartIfIdle()
      return { status: this.q ? 'next-turn' : 'applied' }
    }
    // Apply field by field; on failure put back what already changed so the live
    // query matches the committed settings, or rebuild the query from them.
    const before = { ...this.settings }
    const undo: (() => Promise<void>)[] = []
    try {
      if ('model' in change) {
        await q.setModel(change.model ?? undefined)
        undo.push(() => q.setModel(before.model))
      }
      if ('effort' in change) {
        await q.applyFlagSettings({ effortLevel: (change.effort ?? null) as never })
        undo.push(() => q.applyFlagSettings({ effortLevel: (before.effort ?? null) as never }))
      }
      if ('mode' in change) {
        const mode = (change.mode ?? 'default') as PermissionMode
        if (mode === 'bypassPermissions' && !this.bypassAllowed) {
          // The CLI only allows bypass when it started with it; restart with resume once idle.
          commit()
          this.restartPending = true
          this.restartIfIdle()
          return { status: 'next-turn' }
        }
        await q.setPermissionMode(mode)
      }
      commit()
      return { status: 'applied' }
    } catch (error) {
      try {
        for (const step of undo.reverse()) await step()
      } catch {
        // Unknown live state: start over from the committed settings on the next turn.
        this.restartPending = true
        this.restartIfIdle()
      }
      return { status: 'rejected', detail: String(error) }
    }
  }

  /** Stops the main turn only: the query declares `perTaskStopAffordance`, so background work keeps running. */
  async interrupt(): Promise<void> {
    if (!this.q || !this.turnOpen) return
    this.interrupted = true
    await this.q.interrupt()
  }

  tasks(): BackgroundTask[] {
    return this.work.list()
  }

  async stopTask(id: string): Promise<void> {
    await this.q?.stopTask(id)
  }

  endpoint(): { running?: string; waiting?: EndpointWait } {
    if (!this.q) return {}
    const behind = this.settings.endpoint !== undefined && this.settings.endpoint !== this.running
    const waiting = behind ? (this.turnOpen ? 'turn' : this.work.background ? 'tasks' : undefined) : undefined
    return { ...(this.running ? { running: this.running } : {}), ...(waiting ? { waiting } : {}) }
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.forget()
    this.stop()
    this.events.close()
  }

  private async start(): Promise<Channel<SDKUserMessage>> {
    if (this.closed) throw new Error('Claude Code session is closed')
    if (this.input && this.q) return this.input
    this.starting ??= this.launch().finally(() => (this.starting = undefined))
    return this.starting
  }

  private async launch(): Promise<Channel<SDKUserMessage>> {
    let endpoint: ClaudeEndpoint | undefined
    let base: Options
    // An endpoint switch while the variables resolve starts on the new endpoint.
    do {
      endpoint = endpointOf(this.config, this.settings.endpoint)
      base = await baseOptions(this.config, this.request.cwd, this.request.dshSessionId, endpoint)
      if (this.closed) throw new Error('Claude Code session is closed')
    } while (endpointOf(this.config, this.settings.endpoint) !== endpoint)
    const input = new Channel<SDKUserMessage>()
    const uuid = uuidOf(this.request.dshSessionId)
    this.bypassAllowed = this.settings.mode === 'bypassPermissions'
    const options: Options = {
      ...base,
      ...(this.settings.model ? { model: this.settings.model } : {}),
      ...(this.settings.effort ? { effort: this.settings.effort as never } : {}),
      ...(this.settings.mode ? { permissionMode: this.settings.mode as PermissionMode } : {}),
      ...(this.bypassAllowed ? { allowDangerouslySkipPermissions: true } : {}),
      // dsh lists background work with a stop control per task, so Stop spares it.
      perTaskStopAffordance: true,
      canUseTool: (name, value, context) => this.permission(name, value, context),
      stderr: (data) => {
        if (/error/i.test(data)) this.ports.log(`claude: ${data.trim().slice(0, 400)}`)
      },
      ...startOptions(this.ref, this.request.origin, uuid),
    }
    const q = query({ prompt: input, options })
    this.input = input
    this.q = q
    this.restartPending = false
    this.running = endpoint?.id
    if (endpoint) this.started(endpoint)
    void this.read(q, ++this.generation)
    return input
  }

  /** Report the endpoint once per change, and say so in the conversation when it replaces an earlier one. */
  private started(endpoint: ClaudeEndpoint): void {
    if (this.lastEndpoint === endpoint.id) return
    const name = endpoint.name || endpoint.id
    if (this.lastEndpoint) this.push({ type: 'notice', text: `Now running on ${name}. / 已切换到 ${name}。` })
    this.lastEndpoint = endpoint.id
    this.push({ type: 'endpoint', endpoint: endpoint.id })
  }

  /** Stop the process; the next send starts again with `resume`. */
  private stop(): void {
    this.generation++
    this.work.reset()
    this.input?.close()
    this.q?.close()
    this.input = undefined
    this.q = undefined
    this.running = undefined
  }

  private async read(q: Query, generation: number): Promise<void> {
    let failure: string | undefined
    try {
      for await (const message of q) {
        if (generation !== this.generation) break
        this.message(message)
      }
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error)
    }
    if (generation !== this.generation) return
    this.input = undefined
    this.q = undefined
    this.running = undefined
    if (this.turnOpen) this.endTurn('failed', failure ?? 'Claude Code exited during the turn')
    else if (failure && !this.closed) this.ports.log(`Claude Code exited: ${failure}`)
  }

  private push(event: NativeEvent): void {
    this.events.push(event)
  }

  private beginTurn(origin: 'user' | 'native', inputIds: string[]): void {
    if (this.turnOpen) return
    this.turnOpen = true
    this.interrupted = false
    this.turn = `turn-${++this.turns}`
    this.push({ type: 'turn-start', turn: this.turn, origin, inputIds })
  }

  /** Output with no turn open: a queued steer or a finished background task woke the model. */
  private ensureTurn(): void {
    if (this.turnOpen) return
    const ids = [...this.queuedSteers.values()]
    this.queuedSteers.clear()
    this.beginTurn(ids.length ? 'user' : 'native', ids)
  }

  /** Steers a reply frame says this turn has consumed are no longer queued. */
  private consumed(value: Record<string, unknown>): void {
    for (const uuid of list(value.user_message_uuids).map(text)) this.queuedSteers.delete(uuid)
  }

  private openCall(id: string, usage: Record<string, unknown>): void {
    this.flushHeld()
    this.closeCall()
    this.call = { id, usage: { ...usage }, tools: false }
    this.push({ type: 'call-start', call: id })
  }

  /** End the open call. Calls without tool use wait for the next call or the turn's result, which carries the context window. */
  private closeCall(hold = false): void {
    const call = this.call
    if (!call) return
    this.call = undefined
    const usage = usageOf(call.usage)
    const event: NativeEvent = { type: 'call-end', call: call.id, ...(usage ? { usage } : {}) }
    if (hold && !call.tools) this.heldEnd = event
    else this.push(event)
  }

  private flushHeld(window?: number): void {
    const held = this.heldEnd
    if (!held) return
    this.heldEnd = undefined
    this.push(held.type === 'call-end' && window ? { ...held, contextWindow: window } : held)
  }

  private endTurn(outcome: 'completed' | 'interrupted' | 'failed', error?: string, window?: number): void {
    this.closeCall(true)
    this.flushHeld(window)
    for (const id of this.startedTools) this.push({ type: 'tool-end', tool: id, outcome: { status: outcome === 'interrupted' ? 'interrupted' : 'unknown' } })
    this.startedTools.clear()
    this.taskTools.clear()
    this.turnOpen = false
    const cut = this.ref && this.lastAssistant && outcome === 'completed' ? { ref: this.ref, at: this.lastAssistant } : undefined
    this.push({ type: 'turn-end', turn: this.turn, outcome, ...(cut ? { cut } : {}), ...(error ? { error } : {}) })
    if (this.restartPending) this.restartIfIdle()
  }

  /** A pending restart waits for the turn and for background work, which the restart would kill. */
  private restartIfIdle(): void {
    if (!this.turnOpen && !this.work.background) this.stop()
  }

  private message(message: SDKMessage): void {
    const value = message as unknown as Record<string, unknown>
    const top = value.parent_tool_use_id === null || value.parent_tool_use_id === undefined
    switch (value.type) {
      case 'system':
        if (TASK_FRAMES.has(text(value.subtype))) {
          this.work.accept(value)
          if (this.restartPending) this.restartIfIdle()
          return
        }
        // Claude leaves plan mode on its own once a plan is approved; follow whatever it reports.
        if ((value.subtype === 'init' || value.subtype === 'status') && text(value.permissionMode)) {
          const mode = text(value.permissionMode)
          if (mode !== this.settings.mode && MODES.some((candidate) => candidate.id === mode)) {
            this.settings.mode = mode
            this.push({ type: 'mode', mode })
          }
        }
        if (value.subtype === 'init' && text(value.session_id) && this.ref?.id !== text(value.session_id)) {
          this.ref = { harness: 'claude-code', id: text(value.session_id) }
          this.push({ type: 'ref', ref: this.ref })
        }
        if (value.subtype === 'compact_boundary') {
          this.ensureTurn()
          this.push({ type: 'notice', text: 'Context compacted. / 上下文已压缩。' })
        }
        return
      // A queued steer that starts a turn of its own names it before it counts as consumed.
      case 'stream_event':
        if (!top) return
        this.stream(object(value.event))
        this.consumed(value)
        return
      case 'assistant':
        if (!top) return
        this.ensureTurn()
        this.consumed(value)
        this.lastAssistant = text(value.uuid) || this.lastAssistant
        // Fill gaps when a tool_use block never streamed.
        for (const block of list(object(value.message).content).map(object))
          if (block.type === 'tool_use') this.startTool(text(block.id), text(block.name), block.input)
        return
      case 'user':
        if (!top) return
        const blocks = list(object(value.message).content).map(object)
        for (const block of blocks) {
          if (block.type !== 'tool_result') continue
          const id = text(block.tool_use_id)
          if (this.taskTools.delete(id)) {
            // The structured result belongs to this block only when it is the message's sole result.
            if (blocks.filter((other) => other.type === 'tool_result').length === 1) this.todo.created(id, value.tool_use_result)
            continue
          }
          if (!this.startedTools.delete(id)) continue
          const plan = this.plans.get(id)
          this.plans.delete(id)
          this.push({ type: 'tool-end', tool: id, outcome: { ...outcomeOf(block), ...(plan ? { plan: boundOutput(plan)! } : {}) } })
        }
        return
      case 'result': {
        this.consumed(value)
        if (!this.turnOpen) return
        const subtype = text(value.subtype)
        const modelUsage = Object.values(object(value.modelUsage)).map(object)
        const window = modelUsage.map((usage) => count(usage.contextWindow)).find(Boolean)
        const succeeded = subtype === 'success' && value.is_error !== true
        const outcome = this.interrupted ? 'interrupted' : succeeded ? 'completed' : 'failed'
        const detail = [text(value.result), ...list(value.errors).map(text)].filter(Boolean).join('\n') || subtype
        this.endTurn(outcome, outcome === 'failed' ? detail : undefined, window)
        return
      }
    }
  }

  private stream(event: Record<string, unknown>): void {
    const index = count(event.index)
    switch (event.type) {
      case 'message_start': {
        this.ensureTurn()
        const message = object(event.message)
        this.openCall(text(message.id) || `call-${Date.now()}`, object(message.usage))
        return
      }
      case 'content_block_start': {
        const block = object(event.content_block)
        if (block.type === 'tool_use')
          this.toolBlocks.set(index, { id: text(block.id), name: text(block.name), json: '', input: block.input })
        else if (block.type === 'text') this.delta('text', index, text(block.text))
        else if (block.type === 'thinking') this.delta('reasoning', index, text(block.thinking))
        return
      }
      case 'content_block_delta': {
        const delta = object(event.delta)
        if (delta.type === 'text_delta') this.delta('text', index, text(delta.text))
        else if (delta.type === 'thinking_delta') this.delta('reasoning', index, text(delta.thinking))
        else if (delta.type === 'input_json_delta') {
          const block = this.toolBlocks.get(index)
          if (block) block.json += text(delta.partial_json)
        }
        return
      }
      case 'content_block_stop': {
        const block = this.toolBlocks.get(index)
        if (!block) return
        this.toolBlocks.delete(index)
        let input = block.input
        try {
          if (block.json) input = JSON.parse(block.json) as unknown
        } catch {
          // Keep the start-frame input.
        }
        this.startTool(block.id, block.name, input)
        return
      }
      case 'message_delta':
        if (this.call) Object.assign(this.call.usage, object(event.usage))
        return
      case 'message_stop':
        this.closeCall(true)
        return
    }
  }

  private delta(block: 'text' | 'reasoning', index: number, value: string): void {
    if (!value || !this.call) return
    this.push({ type: 'delta', call: this.call.id, block, key: String(index), text: value })
  }

  private startTool(id: string, name: string, input: unknown): void {
    if (!id || this.startedTools.has(id) || this.taskTools.has(id)) return
    this.ensureTurn()
    const todos = this.todo.start(name, id, input)
    if (todos) {
      this.taskTools.add(id)
      if (this.call) this.call.tools = true
      this.push({ type: 'todos', id, todos })
      return
    }
    this.startedTools.add(id)
    if (this.call) this.call.tools = true
    this.push({ type: 'tool-start', call: this.call?.id ?? 'late', tool: id, activity: activityOf(name, input) })
  }

  private async permission(
    name: string,
    input: Record<string, unknown>,
    context: { signal: AbortSignal; toolUseID: string; title?: string; description?: string; decisionReason?: string },
  ) {
    const signal = AbortSignal.any([context.signal, this.ports.signal])
    if (name === 'AskUserQuestion') {
      const raw = list(input.questions).map(object)
      const answer = await this.ports.interactions.ask(
        raw.map((question, index) => ({
          id: String(index),
          header: text(question.header),
          question: text(question.question),
          multiSelect: question.multiSelect === true,
          options: list(question.options).map((option) => ({
            label: text(object(option).label),
            ...(text(object(option).description) ? { description: text(object(option).description) } : {}),
          })),
        })),
        signal,
      )
      if (answer.dismissed) return { behavior: 'deny' as const, message: 'The user dismissed the question without answering.' }
      const answers = Object.fromEntries(
        raw.map((question, index) => {
          const response = answer.answers.find((item) => item.id === String(index))
          return [text(question.question), [...(response?.selected ?? []), ...(response?.custom ? [response.custom] : [])].join(', ')]
        }),
      )
      return { behavior: 'allow' as const, updatedInput: { ...input, answers } }
    }
    if (name === 'ExitPlanMode') {
      // Claude reads the plan from its plan file into `input.plan`; the streamed tool input lacks it.
      const plan = text(input.plan)
      if (plan) this.plans.set(context.toolUseID, plan)
      if ((await this.ports.interactions.reviewPlan(plan, signal)) === 'approve')
        return { behavior: 'allow' as const, updatedInput: input }
      // The user writes what to change in the composer; stop here and wait for it, like dsh's own plan review.
      this.interrupted = true
      return {
        behavior: 'deny' as const,
        message: 'The user wants changes to the plan and will describe them in their next message. Stop and wait for it.',
        interrupt: true,
      }
    }
    const decision = await this.ports.interactions.approve(
      {
        tool: context.toolUseID,
        title: context.title || name,
        reason: [context.description, context.decisionReason].filter(Boolean).join('\n'),
      },
      signal,
    )
    if (decision.kind === 'allow') return { behavior: 'allow' as const, updatedInput: input }
    return {
      behavior: 'deny' as const,
      message: (decision.kind === 'deny' && decision.message) || 'The user denied this action.',
    }
  }
}

function usageOf(usage: Record<string, unknown>): TokenUsage | undefined {
  if (!Object.keys(usage).length) return
  const input = count(usage.input_tokens)
  const output = count(usage.output_tokens)
  const cacheRead = count(usage.cache_read_input_tokens)
  const cacheWrite = count(usage.cache_creation_input_tokens)
  return {
    inputTokens: input,
    outputTokens: output,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
    totalTokens: input + output + cacheRead + cacheWrite,
  }
}
