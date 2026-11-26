/**
 * The observation tool's wire shape. Each native tool call is shown in dsh as
 * one call of this tool; Host adapters normalize native arguments into an
 * Activity, and the browser renders only this shape.
 */
import type { HarnessId } from './types.ts'

export const ACTIVITY_TOOL = 'native_activity'

export type ActivityKind = 'shell' | 'edit' | 'read' | 'search' | 'web' | 'task' | 'question' | 'plan' | 'other'

export interface ActivityDiff {
  path: string
  /** Null when the native tool gives no before-image (e.g. a whole-file write). */
  oldText: string | null
  newText: string
}
export interface ActivityPatch {
  path: string
  diff: string
}
export interface Activity {
  /** Native tool name, e.g. `Bash`, `Edit`, `commandExecution`. */
  name: string
  kind: ActivityKind
  title: string
  summary: string
  command?: string
  cwd?: string
  diffs?: ActivityDiff[]
  patches?: ActivityPatch[]
  /** Bounded copy of the native input for generic display. */
  input?: unknown
}
export interface ActivityArgs {
  harness: HarnessId
  /** Native tool call id. */
  tool: string
  activity: Activity
}
export interface ActivityOutcome {
  status: 'completed' | 'failed' | 'declined' | 'interrupted' | 'unknown'
  output?: string
  exitCode?: number
  patches?: ActivityPatch[]
  /** Edits the native tool reported only with its result; shown instead of the Activity's own diffs. */
  diffs?: ActivityDiff[]
  /** Markdown of a plan the user reviewed; the native tool input may not carry it. */
  plan?: string
  error?: string
}

const OUTPUT_LIMIT = 32 * 1024
const DIFF_LIMIT = 96 * 1024
const INPUT_LIMIT = 8 * 1024
/** What the dsh-side history keeps; the native model never reads it. */
export const CONTENT_LIMIT = 2 * 1024

export function clip(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit)}\n… (${value.length - limit} more characters)`
}
export function boundOutput(value: string | undefined): string | undefined {
  return value === undefined ? undefined : clip(value, OUTPUT_LIMIT)
}
export function boundInput(value: unknown): unknown {
  if (value === undefined) return undefined
  const json = JSON.stringify(value) ?? 'null'
  return json.length <= INPUT_LIMIT ? (JSON.parse(json) as unknown) : clip(json, INPUT_LIMIT)
}
/** Keep diffs while their total stays displayable; otherwise keep paths only. */
export function boundDiffs(diffs: ActivityDiff[]): ActivityDiff[] {
  let total = 0
  return diffs.map((diff) => {
    total += (diff.oldText?.length ?? 0) + diff.newText.length
    return total <= DIFF_LIMIT ? diff : { path: diff.path, oldText: null, newText: '' }
  })
}
export function boundPatches(patches: ActivityPatch[]): ActivityPatch[] {
  let total = 0
  return patches.map((patch) => {
    total += patch.diff.length
    return total <= DIFF_LIMIT ? patch : { path: patch.path, diff: '' }
  })
}
