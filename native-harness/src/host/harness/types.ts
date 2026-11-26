/**
 * The Harness seam. Claude Code and Codex Adapters (and the test Fake) sit
 * behind it; dsh-side Modules depend only on this file.
 *
 * Interface invariants every Adapter guarantees:
 * 1. `events` is one totally ordered stream with a single consumer.
 *    `call-start … call-end` bracket the deltas and tool starts of exactly one
 *    main-loop model call. Subagent, auxiliary and compaction calls never
 *    produce `call-*` events.
 * 2. Every `tool-start` gets exactly one `tool-end`; tools still open when a
 *    turn ends are closed with `status: 'unknown'` or `'interrupted'` first.
 *    A tool's `tool-start` precedes any approval request about it.
 * 3. `call-end.usage` is that call's final usage in dsh's disjoint buckets
 *    (input excludes cache traffic). It is omitted when unknown, never guessed.
 * 4. Approvals and questions never travel through `events`; Adapters call
 *    `SessionPorts.interactions` directly and settle each request once.
 * 5. Every `send` receipt's input id later appears in some `turn-start.inputIds`
 *    unless the turn it joined was already running (steer).
 * 6. `turn-start.origin === 'native'` marks a turn no new user input started.
 * 7. `apply` reports `next-turn`, `unsupported` or `rejected` honestly.
 * 8. `mode` reports a permission mode the harness switched to by itself
 *    (e.g. leaving plan mode); the Adapter has already adopted it.
 * 9. `todos` carries the harness's whole task list after each change. A
 *    native tool that only edits that list produces `todos` instead of
 *    `tool-start` / `tool-end`.
 * 10. `tasks()` lists running subagents and background tasks. While any is
 *    `background`, closing the session would kill it; `stopTask` stops one
 *    without interrupting the main turn, and `interrupt` spares them.
 * 11. `endpoint` reports the endpoint id each native process starts on, once
 *    per start, before that start's output.
 */
import type { TokenUsage } from '@deepseek-ai/dsh-llm'
import type { Activity, ActivityOutcome } from '../../shared/activity.ts'
import type {
  ApplyResult,
  BackgroundTask,
  EndpointWait,
  HarnessId,
  HarnessSettings,
  ModeOption,
  ModelOption,
  NativeCommand,
  SettingsChange,
} from '../../shared/types.ts'

export type { ApplyResult, BackgroundTask, HarnessId, HarnessSettings, SettingsChange }

export interface Harness {
  readonly id: HarnessId
  /** Models, efforts, modes and slash commands for one cwd. The Adapter caches. */
  catalog(cwd: string, signal: AbortSignal): Promise<HarnessCatalog>
  /** Start, resume or fork the native conversation of one dsh session. */
  open(request: OpenRequest, ports: SessionPorts): Promise<NativeSession>
  /** Context window of a model, when the Adapter has learned it; never starts a native process. */
  contextWindow?(model: string): number | undefined
  /** Release shared resources (catalog processes). */
  close(): Promise<void>
}

export interface HarnessCatalog {
  models: ModelOption[]
  /** The harness's own recommended model, used only when no model is configured. */
  defaultModel?: string
  modes: ModeOption[]
  commands: NativeCommand[]
}

export interface NativeRef {
  harness: HarnessId
  /** Claude session UUID, Codex thread id or Antigravity conversation id. */
  id: string
}
export interface NativeCut {
  ref: NativeRef
  /** Claude: last assistant message UUID kept. Codex: last turn id kept. */
  at: string
}
export type OpenOrigin =
  | { kind: 'new' }
  | { kind: 'resume'; ref: NativeRef }
  | { kind: 'fork'; cut: NativeCut }
  /** Start on a full copy of another native conversation, e.g. a terminal one taken over; Claude only. */
  | { kind: 'copy'; ref: NativeRef }
export interface OpenRequest {
  dshSessionId: string
  cwd: string
  origin: OpenOrigin
  settings: HarnessSettings
  /** Endpoint an earlier native process of this session started on, if any. */
  lastEndpoint?: string
}

export interface SessionPorts {
  readonly interactions: Interactions
  /** Aborted when the plugin unloads. */
  readonly signal: AbortSignal
  readonly log: (message: string) => void
}

export interface ApprovalRequest {
  /** Native tool call id the request is about. */
  tool: string
  title: string
  reason: string
  /** Extra native choices beyond allow-once / deny, in display order. */
  choices?: { id: string; label: string; description?: string }[]
  /** False when the harness offers no plain allow-once, only the extra choices. */
  allowOnce?: boolean
}
/** `allow` / `deny`, or one of the request's extra choice ids. */
export type ApprovalDecision = { kind: 'allow' } | { kind: 'deny'; message?: string } | { kind: 'choice'; id: string }
export interface Question {
  id: string
  header: string
  question: string
  options: { label: string; description?: string }[]
  multiSelect?: boolean
}
export interface QuestionAnswer {
  answers: { id: string; selected: string[]; custom?: string }[]
  /** The user closed the questions without answering. */
  dismissed?: true
}
/**
 * Closing a card is an answer, never an error: an approval becomes a denial,
 * questions come back `dismissed`, a plan review asks for revisions. Only an
 * aborted signal rejects.
 */
export interface Interactions {
  approve(request: ApprovalRequest, signal: AbortSignal): Promise<ApprovalDecision>
  ask(questions: Question[], signal: AbortSignal): Promise<QuestionAnswer>
  /** Show a plan for approval; `revise` means the user will say what to change next. */
  reviewPlan(plan: string, signal: AbortSignal): Promise<'approve' | 'revise'>
}

export interface NativeImage {
  mediaType: string
  /** Host path of the normalized image, when the attachment store exposes one. */
  path?: string
  read(signal: AbortSignal): Promise<Uint8Array>
}
export interface NativeInput {
  id: string
  text: string
  images: NativeImage[]
  /** A leading `/name` the user picked from the native catalog; `text` holds the rest. */
  command?: NativeCommand
}
export interface SendReceipt {
  inputId: string
  disposition: 'turn' | 'steer' | 'queued'
}

export type NativeEvent =
  | { type: 'turn-start'; turn: string; origin: 'user' | 'native'; inputIds: string[] }
  | { type: 'call-start'; call: string }
  | { type: 'delta'; call: string; block: 'text' | 'reasoning'; key: string; text: string }
  | { type: 'tool-start'; call: string; tool: string; activity: Activity }
  | { type: 'tool-progress'; tool: string; output?: string }
  | { type: 'tool-end'; tool: string; outcome: ActivityOutcome }
  | { type: 'call-end'; call: string; usage?: TokenUsage; contextWindow?: number }
  | { type: 'ref'; ref: NativeRef }
  | { type: 'mode'; mode: string }
  | { type: 'todos'; id: string; todos: NativeTodo[] }
  | { type: 'notice'; text: string }
  /** A failed model request the native harness retries after `retry.delayMs`. */
  | { type: 'retry'; retry: NativeRetry }
  | { type: 'endpoint'; endpoint: string }
  | {
      type: 'turn-end'
      turn: string
      outcome: 'completed' | 'interrupted' | 'failed'
      cut?: NativeCut
      error?: string
    }

export interface NativeRetry {
  /** Which retry this is (from 1) and the most the request gets. */
  attempt: number
  maxRetries: number
  delayMs: number
  /** HTTP status of the failed attempt; absent when no response came back. */
  status?: number
  /** dsh's provider-neutral failure code: `TRANSPORT`, `TIMEOUT`, `RATE_LIMIT`, `SERVER`, `AUTH`, `HTTP_<status>` and the like. */
  code: string
  /** Why the attempt failed, in English and Chinese. */
  reason: string
}

export interface NativeTodo {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
}

export interface NativeSession {
  readonly ref: NativeRef | undefined
  /** `signal` cancels a send that has not reached the native harness yet. */
  send(input: NativeInput, mode: 'turn' | 'steer', signal?: AbortSignal): Promise<SendReceipt>
  readonly events: AsyncIterator<NativeEvent>
  apply(change: SettingsChange): Promise<ApplyResult>
  interrupt(): Promise<void>
  tasks(): BackgroundTask[]
  stopTask(id: string): Promise<void>
  /** Endpoint the live native process runs on, and what a pending switch to another waits for; Claude only. */
  endpoint?(): { running?: string; waiting?: EndpointWait }
  close(): Promise<void>
}
