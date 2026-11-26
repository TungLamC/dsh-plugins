/** Vocabulary shared by the Host and the browser bundle. */

export type HarnessId = 'claude-code' | 'codex' | 'antigravity'

/** dsh agent presets that run a native harness. */
export const PRESETS: Readonly<Record<string, HarnessId>> = {
  'claude-code-native': 'claude-code',
  'codex-native': 'codex',
  'antigravity-native': 'antigravity',
}
export const HARNESS_NAMES: Readonly<Record<HarnessId, string>> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  antigravity: 'Antigravity',
}
/** Hidden provider routes; they list no models, so the global model catalog never shows them. */
export const PROVIDERS: Readonly<Record<HarnessId, string>> = {
  'claude-code': 'native-harness.claude-code',
  codex: 'native-harness.codex',
  antigravity: 'native-harness.antigravity',
}

export function harnessOfPreset(preset: unknown): HarnessId | undefined {
  return typeof preset === 'string' ? PRESETS[preset] : undefined
}
export function harnessOfProvider(provider: string): HarnessId | undefined {
  return (Object.keys(PROVIDERS) as HarnessId[]).find((id) => PROVIDERS[id] === provider)
}

/** Native opaque ids. Stored settings hold a session's own picks; the configured defaults fill the rest. */
export interface HarnessSettings {
  model?: string
  effort?: string
  mode?: string
  /** Codex fast mode (the `priority` service tier); it applies only to models that offer it. */
  fast?: boolean
  /** Claude Code endpoint id from the `claudeEndpoints` option. */
  endpoint?: string
}
/** A value sets the field, null clears it (back to the default), an absent key keeps it. */
export type SettingsChange = { [K in keyof HarnessSettings]?: HarnessSettings[K] | null }
export const SETTING_KEYS = ['model', 'effort', 'mode', 'fast', 'endpoint'] as const satisfies readonly (keyof HarnessSettings)[]

export function withChange(settings: HarnessSettings, change: SettingsChange): HarnessSettings {
  const next: Record<string, unknown> = { ...settings }
  for (const key of SETTING_KEYS) {
    if (!(key in change)) continue
    const value = change[key]
    if (value === null || value === undefined) delete next[key]
    else next[key] = value
  }
  return next as HarnessSettings
}

export interface ApplyResult {
  status: 'applied' | 'next-turn' | 'unsupported' | 'rejected'
  detail?: string
}

export interface EffortOption {
  id: string
  name: string
}
export interface ModelOption {
  id: string
  name: string
  description?: string
  efforts: EffortOption[]
  defaultEffort?: string
  contextWindow?: number
  image: boolean
  /** Codex's name and description of the model's `priority` tier, when it has one. */
  fast?: { name: string; description: string }
}
export interface ModeOption {
  id: string
  name: string
  description?: string
  /** Requires an explicit confirmation before switching to it. */
  risky?: boolean
}
export interface NativeCommand {
  /** Exact native invocation name, e.g. `tdd` or `my-plugin:my-skill`. */
  name: string
  description: string
  kind: 'skill' | 'command'
  /** Codex skill identity; Claude resolves names itself. */
  path?: string
  argumentHint?: string
}

/** A configured Claude Code endpoint, as the model menu and the resume command need it. */
export interface EndpointView {
  id: string
  name: string
  /** Command that resumes a session in the terminal on this endpoint, e.g. a shell alias; empty for the configured executable. */
  command: string
}
/** What a picked endpoint the native process does not run on yet waits for. */
export type EndpointWait = 'turn' | 'tasks'

/** A Claude Code conversation started in a terminal, which a blank session can take over. */
export interface TerminalSession {
  /** Claude session UUID. */
  id: string
  title: string
  /** Epoch ms of the last change. */
  modified: number
  branch?: string
  /** A terminal Claude Code process has it open now, so it can only be forked. */
  open: boolean
}
export interface TerminalSessions {
  /** The directory listed: the one the dsh session runs in. */
  cwd: string
  sessions: TerminalSession[]
}
/** The terminal conversation a blank Claude session takes over with its first turn. */
export interface Adoption {
  id: string
  title: string
  /** Continue on a copy, leaving the terminal's conversation as it is. */
  fork: boolean
}
export type AdoptChoice = Pick<Adoption, 'id' | 'fork'>

export interface CatalogView {
  models: ModelOption[]
  modes: ModeOption[]
}
/** The native conversation behind a dsh session, for resuming it in the harness's own terminal UI. */
export interface NativeView {
  /** Claude session UUID, Codex thread id or Antigravity conversation id. */
  id: string
  cwd: string
  /** dsh holds the native process; it lets go after `idleMinutes` without a turn. */
  live: boolean
  idleMinutes: number
}
/** Native work running beside or after the main turn: subagents and background shells. */
export interface BackgroundTask {
  id: string
  kind: 'agent' | 'shell' | 'other'
  title: string
  /** Runs on its own (a background task); false for a subagent the current turn waits for. */
  background: boolean
  /** Epoch ms the plugin first saw it. */
  startedAt: number
  tokens?: number
  toolUses?: number
  lastTool?: string
  /** False when the harness cannot stop this one alone (Antigravity); absent means it can. */
  stoppable?: false
}

export interface SessionView {
  harness: HarnessId
  /** What the session runs with: its own picks over the configured defaults. */
  settings: HarnessSettings
  catalog: CatalogView | null
  native?: NativeView
  /** Configured Claude Code endpoints; absent for Codex and when none are configured. */
  endpoints?: EndpointView[]
  /** The picked endpoint is not the one the live native process runs on yet. */
  switching?: EndpointWait
  /** A terminal conversation this session takes over, until its first turn completes. */
  adopted?: Adoption
  error?: string
}
export interface SelectOutcome {
  settings: HarnessSettings
  result: ApplyResult
}
export interface CommandEntry {
  /** Token inserted after `/`. Equals the native name unless it collides with a dsh command. */
  token: string
  name: string
  description: string
  kind: NativeCommand['kind']
  argumentHint?: string
}

export const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
export const text = (value: unknown): string => (typeof value === 'string' ? value : '')
export const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
export const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
