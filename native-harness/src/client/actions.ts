/** Browser-side calls of the plugin Remote, unwrapped to plain promises. */
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  AdoptChoice,
  Adoption,
  BackgroundTask,
  CommandEntry,
  SelectOutcome,
  SessionView,
  SettingsChange,
  TerminalSessions,
} from '../shared/types.ts'
import type {} from '../shared/wire.ts'

export interface NativeActions {
  view(sessionId: string): Promise<SessionView | null>
  select(sessionId: string, change: SettingsChange): Promise<SelectOutcome>
  commands(sessionId: string): Promise<CommandEntry[]>
  tasks(sessionId: string): Promise<BackgroundTask[]>
  stopTask(sessionId: string, taskId: string): Promise<void>
  icons(): Promise<Record<string, string>>
  terminalSessions(sessionId: string): Promise<TerminalSessions>
  adopt(sessionId: string, choice: AdoptChoice | null): Promise<Adoption | null>
}

interface RemoteFace {
  view(sessionId: string): Promise<RemoteResult<SessionView | null>>
  select(sessionId: string, change: SettingsChange): Promise<RemoteResult<SelectOutcome>>
  commands(sessionId: string): Promise<RemoteResult<CommandEntry[]>>
  tasks(sessionId: string): Promise<RemoteResult<BackgroundTask[]>>
  stopTask(sessionId: string, taskId: string): Promise<RemoteResult<void>>
  icons(): Promise<RemoteResult<Record<string, string>>>
  terminalSessions(sessionId: string): Promise<RemoteResult<TerminalSessions>>
  adopt(sessionId: string, choice: AdoptChoice | null): Promise<RemoteResult<Adoption | null>>
}

async function unwrap<T>(result: Promise<RemoteResult<T>>): Promise<T> {
  const value = await result
  if (!value.ok) throw new Error(value.error.message)
  return value.value
}

export function nativeActions(remote: RemoteFace): NativeActions {
  return {
    view: (sessionId) => unwrap(remote.view(sessionId)),
    select: (sessionId, change) => unwrap(remote.select(sessionId, change)),
    commands: (sessionId) => unwrap(remote.commands(sessionId)),
    tasks: (sessionId) => unwrap(remote.tasks(sessionId)),
    stopTask: (sessionId, taskId) => unwrap(remote.stopTask(sessionId, taskId)),
    icons: () => unwrap(remote.icons()),
    terminalSessions: (sessionId) => unwrap(remote.terminalSessions(sessionId)),
    adopt: (sessionId, choice) => unwrap(remote.adopt(sessionId, choice)),
  }
}
