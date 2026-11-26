/** Which dsh messages are user input for the native harness, and how they become one NativeInput. */
import type { ContentBlock, ImageBlock, RequestMessage } from '@deepseek-ai/dsh-llm'
import { object, text } from '../../shared/types.ts'
import type { NativeCommand } from '../../shared/types.ts'
import type { NativeImage, NativeInput } from '../harness/types.ts'

export interface PendingInput {
  /** dsh MessageId; request-only inputs without one are never deduplicated. */
  id: string | undefined
  content: readonly ContentBlock[]
}

/**
 * User input is what a person or a peer session typed, plus the snapshot of
 * sessions the user `@`-referenced, which dsh attaches right behind the
 * message as background for the model. Other producer-owned context
 * (notices, approvals, skill catalogs, model-switch markers, runtime context)
 * is never an instruction to the native harness.
 */
export function isForwardable(source: unknown): boolean {
  const value = object(source)
  if (value.kind === undefined || value.kind === 'user' || value.kind === 'user-rpc') return true
  if (value.kind === 'session-reference') return true
  return value.kind === 'agent-message' && value.form === 'relay'
}

/** User messages after the latest assistant message, in order. */
export function pendingInputs(messages: readonly RequestMessage[]): PendingInput[] {
  const after = messages.findLastIndex((message) => message.role === 'assistant')
  const result: PendingInput[] = []
  for (const message of messages.slice(after + 1)) {
    if (message.role !== 'user' || !isForwardable(message.source)) continue
    const id = 'id' in message && typeof message.id === 'string' ? message.id : undefined
    result.push({ id, content: message.content })
  }
  return result
}

export interface InputParts {
  image(block: ImageBlock): NativeImage
  /** Resolve a leading `/token` against the native catalog. */
  command(token: string): Promise<NativeCommand | undefined>
}

/** Join pending messages into one native input; a leading `/token` of the first text may pick a native command. */
export async function composeInput(
  id: string,
  inputs: readonly PendingInput[],
  parts: InputParts,
): Promise<NativeInput> {
  const texts: string[] = []
  const images: NativeImage[] = []
  for (const input of inputs) {
    const chunks: string[] = []
    for (const block of input.content) {
      if (block.type === 'text') chunks.push(block.text)
      else if (block.type === 'image') images.push(parts.image(block))
      else if (block.type === 'file') chunks.push(text(object(block.attachment).path))
    }
    const joined = chunks.join('')
    if (joined) texts.push(joined)
  }
  let body = texts.join('\n\n')
  let command: NativeCommand | undefined
  const match = /^\/(\S+)(?:[ \t]+|\n|$)([\s\S]*)$/.exec(body)
  if (match) {
    command = await parts.command(match[1]!)
    if (command) body = match[2]!
  }
  return { id, text: body, images, ...(command ? { command } : {}) }
}
