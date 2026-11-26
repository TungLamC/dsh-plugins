/** Codex app-server notifications → NativeEvents. Model-call boundaries are inferred from token usage reports. */
import type { TokenUsage } from '@deepseek-ai/dsh-llm'
import {
  boundInput,
  boundOutput,
  boundPatches,
  type Activity,
  type ActivityOutcome,
} from '../../../shared/activity.ts'
import { count, list, object, text } from '../../../shared/types.ts'
import type { BackgroundTask, NativeEvent } from '../types.ts'

const TOOL_TYPES = new Set([
  'commandExecution',
  'fileChange',
  'mcpToolCall',
  'dynamicToolCall',
  'collabAgentToolCall',
  'webSearch',
  'imageView',
  'imageGeneration',
  'sleep',
])

export function codexUsage(value: unknown): TokenUsage | undefined {
  const usage = object(value)
  if (!Object.keys(usage).length) return
  const cached = count(usage.cachedInputTokens)
  const written = count(usage.cacheWriteInputTokens)
  return {
    inputTokens: Math.max(0, count(usage.inputTokens) - cached - written),
    outputTokens: count(usage.outputTokens),
    cacheReadTokens: cached,
    cacheWriteTokens: written,
    reasoningTokens: count(usage.reasoningOutputTokens),
    ...(count(usage.totalTokens) ? { totalTokens: count(usage.totalTokens) } : {}),
  }
}

/** Codex runs commands as `<shell> -lc '<script>'`; show the script. */
export function displayCommand(command: string): string {
  const match = /^\S*?(?:ba|z)?sh -lc '([\s\S]*)'$/.exec(command)
  return match ? match[1]!.replaceAll(`'\\''`, `'`) : command
}

export function activityOf(item: Record<string, unknown>): Activity {
  const type = text(item.type)
  switch (type) {
    case 'commandExecution':
      return {
        name: type,
        kind: 'shell',
        title: 'Shell',
        summary: displayCommand(text(item.command)),
        command: displayCommand(text(item.command)),
        ...(text(item.cwd) ? { cwd: text(item.cwd) } : {}),
      }
    case 'fileChange': {
      const patches = list(item.changes).map((value) => ({ path: text(object(value).path), diff: text(object(value).diff) }))
      return {
        name: type,
        kind: 'edit',
        title: 'Edit files',
        summary: patches.map((patch) => patch.path).join(', '),
        patches: boundPatches(patches),
      }
    }
    case 'mcpToolCall':
      return {
        name: type,
        kind: 'other',
        title: `${text(item.server)} · ${text(item.tool)}`,
        summary: '',
        input: boundInput(item.arguments),
      }
    case 'dynamicToolCall':
      return { name: type, kind: 'other', title: text(item.tool) || 'Tool', summary: '', input: boundInput(item.arguments) }
    case 'webSearch':
      return { name: type, kind: 'web', title: 'Web search', summary: text(item.query) || text(object(item.action).query) }
    case 'imageView':
      return { name: type, kind: 'read', title: 'View image', summary: text(item.path) }
    case 'collabAgentToolCall':
      return { name: type, kind: 'task', title: 'Subagent', summary: text(item.prompt) || text(item.tool), input: boundInput(item) }
    default:
      return { name: type, kind: 'other', title: type || 'Tool', summary: '' }
  }
}

export function outcomeOf(item: Record<string, unknown>): ActivityOutcome {
  const status = text(item.status)
  const failed = status === 'failed' || item.success === false
  const declined = status === 'declined'
  const exitCode = typeof item.exitCode === 'number' ? item.exitCode : undefined
  let output: string | undefined
  if (item.type === 'commandExecution') output = text(item.aggregatedOutput)
  else if (item.type === 'mcpToolCall')
    output = JSON.stringify(item.error ?? item.result ?? null, null, 2)
  else if (item.type === 'dynamicToolCall') output = JSON.stringify(item.contentItems ?? item.result ?? null, null, 2)
  const patches =
    item.type === 'fileChange'
      ? boundPatches(list(item.changes).map((value) => ({ path: text(object(value).path), diff: text(object(value).diff) })))
      : undefined
  return {
    status: declined ? 'declined' : failed || (exitCode !== undefined && exitCode !== 0) ? 'failed' : 'completed',
    ...(output ? { output: boundOutput(output)! } : {}),
    ...(exitCode !== undefined ? { exitCode } : {}),
    ...(patches ? { patches } : {}),
  }
}

/**
 * Steers Codex accepted but has not yet taken into the running turn. Codex
 * echoes each input it takes as a `userMessage` item carrying the client id
 * it was sent with, and drops the rest when the turn is interrupted.
 */
export class SteerLedger {
  private readonly pending = new Map<string, unknown[]>()
  add(id: string, items: unknown[]): void {
    this.pending.set(id, items)
  }
  taken(clientId: string): void {
    this.pending.delete(clientId)
  }
  /** Everything still pending, in send order; the ledger is empty afterwards. */
  drain(): { ids: string[]; items: unknown[] } {
    const ids = [...this.pending.keys()]
    const items = [...this.pending.values()].flat()
    this.pending.clear()
    return { ids, items }
  }
}

/** Per-turn mapper; one instance per native turn keeps call and text state. */
export class CodexEvents {
  private call?: string
  private calls = 0
  private plans = 0
  private readonly texts = new Map<string, string>()
  private readonly started = new Set<string>()
  private readonly outputs = new Map<string, string>()

  /** Open the current model call if none is open. */
  private open(out: NativeEvent[]): string {
    if (!this.call) {
      this.call = `call-${++this.calls}`
      out.push({ type: 'call-start', call: this.call })
    }
    return this.call
  }

  private delta(out: NativeEvent[], block: 'text' | 'reasoning', key: string, value: string): void {
    if (!value) return
    const call = this.open(out)
    this.texts.set(`${block}:${key}`, (this.texts.get(`${block}:${key}`) ?? '') + value)
    out.push({ type: 'delta', call, block, key, text: value })
  }

  /** Emit text the completed item has but the deltas missed. */
  private snapshot(out: NativeEvent[], block: 'text' | 'reasoning', key: string, value: string): void {
    const seen = this.texts.get(`${block}:${key}`) ?? ''
    if (value.startsWith(seen)) this.delta(out, block, key, value.slice(seen.length))
  }

  /** Make sure a tool's start precedes anything about it (approvals included). */
  startTool(item: Record<string, unknown>, out: NativeEvent[] = []): NativeEvent[] {
    const id = text(item.id)
    if (!id || this.started.has(id)) return out
    this.started.add(id)
    const call = this.open(out)
    out.push({ type: 'tool-start', call, tool: id, activity: activityOf(item) })
    return out
  }

  accept(method: string, params: Record<string, unknown>): NativeEvent[] {
    const out: NativeEvent[] = []
    switch (method) {
      case 'item/agentMessage/delta':
        this.delta(out, 'text', text(params.itemId), text(params.delta))
        break
      case 'item/reasoning/summaryTextDelta':
        this.delta(out, 'reasoning', `${text(params.itemId)}:s${count(params.summaryIndex)}`, text(params.delta))
        break
      case 'item/reasoning/textDelta':
        this.delta(out, 'reasoning', `${text(params.itemId)}:c${count(params.contentIndex)}`, text(params.delta))
        break
      case 'item/commandExecution/outputDelta': {
        const id = text(params.itemId)
        const output = (this.outputs.get(id) ?? '') + text(params.delta)
        this.outputs.set(id, output)
        out.push({ type: 'tool-progress', tool: id, output: boundOutput(output)! })
        break
      }
      case 'item/started': {
        const item = object(params.item)
        if (TOOL_TYPES.has(text(item.type))) this.startTool(item, out)
        break
      }
      case 'item/completed': {
        const item = object(params.item)
        const type = text(item.type)
        if (type === 'agentMessage') this.snapshot(out, 'text', text(item.id), text(item.text))
        else if (type === 'reasoning') {
          for (const [index, value] of list(item.summary).entries())
            this.snapshot(out, 'reasoning', `${text(item.id)}:s${index}`, text(value))
        } else if (type === 'contextCompaction') out.push({ type: 'notice', text: 'Context compacted. / 上下文已压缩。' })
        else if (TOOL_TYPES.has(type)) {
          this.startTool(item, out)
          if (!this.ended.has(text(item.id))) {
            this.ended.add(text(item.id))
            out.push({ type: 'tool-end', tool: text(item.id), outcome: outcomeOf(item) })
          }
        }
        break
      }
      // update_plan reaches clients only as this notification; it is the turn's whole task list.
      case 'turn/plan/updated':
        out.push({
          type: 'todos',
          id: `plan-${text(params.turnId)}-${++this.plans}`,
          todos: list(params.plan).map((raw) => {
            const step = object(raw)
            const status = text(step.status)
            return {
              content: text(step.step),
              status: status === 'completed' ? 'completed' : status === 'inProgress' ? 'in_progress' : 'pending',
            }
          }),
        })
        break
      case 'thread/tokenUsage/updated': {
        const usage = object(params.tokenUsage)
        const window = count(usage.modelContextWindow)
        if (this.call) {
          const last = codexUsage(usage.last)
          out.push({
            type: 'call-end',
            call: this.call,
            ...(last ? { usage: last } : {}),
            ...(window ? { contextWindow: window } : {}),
          })
          this.call = undefined
        }
        break
      }
    }
    return out
  }

  private readonly ended = new Set<string>()

  /** At turn end: close the open call and every tool that never completed. */
  finish(status: 'unknown' | 'interrupted'): NativeEvent[] {
    const out: NativeEvent[] = []
    if (this.call) {
      out.push({ type: 'call-end', call: this.call })
      this.call = undefined
    }
    for (const id of this.started)
      if (!this.ended.has(id)) {
        this.ended.add(id)
        out.push({ type: 'tool-end', tool: id, outcome: { status } })
      }
    return out
  }
}

/**
 * Codex subagents: each runs its own thread on this connection, announced on
 * the parent thread (`subAgentActivity` in multi-agent v2, a spawn
 * `collabAgentToolCall` in v1). A child is listed while it runs a turn.
 */
export class CodexChildren {
  private readonly titles = new Map<string, string>()
  private readonly running = new Map<string, { task: BackgroundTask; turn: string }>()
  private readonly now: () => number
  constructor(now: () => number = Date.now) {
    this.now = now
  }

  list(): BackgroundTask[] {
    return [...this.running.values()].map(({ task }) => ({ ...task }))
  }

  turnOf(thread: string): string | undefined {
    return this.running.get(thread)?.turn
  }

  clear(): void {
    this.running.clear()
  }

  accept(main: string | undefined, method: string, params: Record<string, unknown>): void {
    const thread = text(params.threadId)
    const item = object(params.item)
    if (thread === main) {
      if (item.type === 'subAgentActivity' && text(item.agentThreadId))
        this.titles.set(text(item.agentThreadId), text(item.agentPath) || text(item.agentNickname) || 'Subagent')
      if (item.type === 'collabAgentToolCall' && item.tool === 'spawnAgent')
        for (const child of list(item.receiverThreadIds).map(text))
          if (child) this.titles.set(child, text(item.prompt).split('\n')[0]!.slice(0, 120) || 'Subagent')
      return
    }
    if (!thread) return
    const current = this.running.get(thread)
    switch (method) {
      case 'turn/started':
        this.running.set(thread, {
          turn: text(object(params.turn).id),
          task: {
            id: thread,
            kind: 'agent',
            title: this.titles.get(thread) ?? 'Subagent',
            background: true,
            startedAt: current?.task.startedAt ?? this.now(),
          },
        })
        return
      case 'turn/completed':
        this.running.delete(thread)
        return
      case 'item/started':
        if (current && TOOL_TYPES.has(text(item.type))) {
          current.task.toolUses = (current.task.toolUses ?? 0) + 1
          current.task.lastTool = text(item.type)
        }
        return
      case 'thread/tokenUsage/updated': {
        const total = count(object(object(params.tokenUsage).total).totalTokens)
        if (current && total) current.task.tokens = total
        return
      }
    }
  }
}
