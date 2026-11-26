/** Plugin-owned Remote methods shared by the Host service and the browser bundle. */
import { z } from 'zod'
import type {
  InvocationParameterDescriptor,
  RemoteResult,
  TypertRemoteContribution,
  TypertRemoteNamespace,
} from '@deepseek-ai/dsh-typert-protocol'
import type {
  AdoptChoice,
  Adoption,
  BackgroundTask,
  CommandEntry,
  SelectOutcome,
  SessionView,
  SettingsChange,
  TerminalSessions,
} from './types.ts'

export const PACKAGE = 'dsh-native-harness'
export const SERVICE = 'nativeHarness'

const parameter = (name: string, schema: z.ZodType): InvocationParameterDescriptor => ({
  name,
  wire: name,
  source: 'json',
  codec: { mode: 'strict', typeSymbol: `${PACKAGE}:${name}`, create: () => schema },
})
const session = parameter('sessionId', z.string().regex(/^session-[A-Za-z0-9_-]{1,180}$/))
const optionalId = z.string().min(1).max(200).nullable().optional()
const task = parameter('taskId', z.string().min(1).max(200))
const change = parameter(
  'change',
  z
    .object({ model: optionalId, effort: optionalId, mode: optionalId, fast: z.boolean().nullable().optional(), endpoint: optionalId })
    .strict(),
)
/** Claude session ids are UUIDs; a pick names one and how to take it over, null cancels. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const choice = parameter('choice', z.object({ id: z.string().regex(UUID), fork: z.boolean() }).strict().nullable())

export const REMOTE: TypertRemoteContribution = {
  package: PACKAGE,
  descriptors: [
    { method: 'view', parameters: [session] },
    { method: 'select', parameters: [session, change] },
    { method: 'commands', parameters: [session] },
    { method: 'tasks', parameters: [session] },
    { method: 'stopTask', parameters: [session, task] },
    { method: 'icons', parameters: [] },
    { method: 'terminalSessions', parameters: [session] },
    { method: 'adopt', parameters: [session, choice] },
  ].map(({ method, ...rest }) => ({
    id: `${PACKAGE}#${SERVICE}/${method}`,
    service: SERVICE,
    namespace: SERVICE,
    method,
    invocation: { kind: 'direct' },
    result: { mode: 'src-json' },
    cancellation: { parameter: 'signal' },
    ...rest,
  })),
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteMap {
    /** Harness, settings and catalog of one session; null for sessions not run by a native harness. */
    'nativeHarness/view': (
      sessionId: string,
      signal?: AbortSignal,
    ) => Promise<RemoteResult<SessionView | null>>
    /** Persist a settings change and apply it to the live native session when there is one. */
    'nativeHarness/select': (
      sessionId: string,
      change: SettingsChange,
      signal?: AbortSignal,
    ) => Promise<RemoteResult<SelectOutcome>>
    /** Native slash commands and skills offered in this session's `/` menu. */
    'nativeHarness/commands': (
      sessionId: string,
      signal?: AbortSignal,
    ) => Promise<RemoteResult<CommandEntry[]>>
    /** Subagents and background tasks the session's native process is running; empty when it runs none. */
    'nativeHarness/tasks': (sessionId: string, signal?: AbortSignal) => Promise<RemoteResult<BackgroundTask[]>>
    /** Stop one of them without interrupting the main turn. */
    'nativeHarness/stopTask': (sessionId: string, taskId: string, signal?: AbortSignal) => Promise<RemoteResult<void>>
    /** The configured `providerIcons`: model menu icon by provider id. */
    'nativeHarness/icons': (signal?: AbortSignal) => Promise<RemoteResult<Record<string, string>>>
    /** Claude Code conversations started in a terminal in this session's directory, newest first. */
    'nativeHarness/terminalSessions': (sessionId: string, signal?: AbortSignal) => Promise<RemoteResult<TerminalSessions>>
    /** Make a blank Claude session take over a terminal conversation with its first turn; null cancels. */
    'nativeHarness/adopt': (
      sessionId: string,
      choice: AdoptChoice | null,
      signal?: AbortSignal,
    ) => Promise<RemoteResult<Adoption | null>>
  }
  interface TypertRemoteNamespaceMap {
    nativeHarness: TypertRemoteNamespace<'nativeHarness'>
  }
}
