/** Builds one dsh step's raw stream from native content, in native order. */
import { ToolCallId, type StreamChunk, type TokenUsage } from '@deepseek-ai/dsh-llm'
import { ACTIVITY_TOOL } from '../../shared/activity.ts'
import type { NativeTodo } from '../harness/types.ts'

export const TODO_TOOL = 'todo_write'

export class StepWriter {
  private next = 0
  private open?: { index: number; key: string; type: 'text' | 'reasoning'; text: string }
  tools = 0
  usage?: TokenUsage

  *text(key: string, type: 'text' | 'reasoning', delta: string): Generator<StreamChunk> {
    if (!delta) return
    if (!this.open || this.open.key !== key || this.open.type !== type) {
      yield* this.close()
      this.open = { index: this.next++, key, type, text: '' }
      yield { type: 'block-start', index: this.open.index, blockType: type }
    }
    this.open.text += delta
    yield type === 'text'
      ? { type: 'text-delta', index: this.open.index, text: delta }
      : { type: 'reasoning-delta', index: this.open.index, text: delta }
  }

  /** A dsh tool call; the observation tool unless `name` says otherwise. */
  *tool(id: string, args: string, name = ACTIVITY_TOOL): Generator<StreamChunk> {
    yield* this.close()
    const index = this.next++
    const callId = ToolCallId(id)
    this.tools++
    yield { type: 'block-start', index, blockType: 'tool-call' }
    yield { type: 'tool-call-delta', index, id: callId, name, argumentsDelta: args }
    yield {
      type: 'block-end',
      index,
      block: { type: 'tool-call', id: callId, name, arguments: args },
    }
  }

  *close(): Generator<StreamChunk> {
    const open = this.open
    if (!open) return
    this.open = undefined
    yield { type: 'block-end', index: open.index, block: { type: open.type, text: open.text } }
  }

  *finish(): Generator<StreamChunk> {
    yield* this.close()
    if (this.usage) yield { type: 'usage', usage: this.usage }
    yield { type: 'finish', reason: { kind: this.tools ? 'tool-calls' : 'stop' } }
  }
}

/** dsh's own todo tool writes the list; it rejects blank and repeated items, so the first of each is kept. */
export function todoArgs(todos: readonly NativeTodo[]): string {
  const seen = new Set<string>()
  const kept = todos.flatMap((todo) => {
    const content = todo.content.trim()
    if (!content || seen.has(content)) return []
    seen.add(content)
    return [{ content, status: todo.status }]
  })
  return JSON.stringify({ todos: kept })
}

/** dsh call ids for native tool ids; stable so replays and approvals line up. */
export function callIdOf(tool: string): string {
  return `nh_${tool.replace(/[^A-Za-z0-9_-]/g, '_')}`
}
