/**
 * The settings a native session runs with: the session's own picks over the
 * defaults configured for its harness. Native configuration files are never
 * consulted; every value reaches the harness explicitly.
 */
import { SETTING_KEYS, type HarnessSettings, type ModeOption, type ModelOption, type SettingsChange } from '../shared/types.ts'

export interface SettingsCatalog {
  models: readonly ModelOption[]
  modes: readonly ModeOption[]
}

/**
 * A picked model keeps the configured effort when it supports it, else its own
 * default. Without a catalog the values pass through unchecked; a configured
 * mode the harness does not offer is dropped. The endpoint is the session's
 * pick, else the configured default, else the first of `endpoints`; one no
 * longer configured is skipped, and without endpoints there is none.
 */
export function resolveSettings(
  stored: HarnessSettings,
  defaults: HarnessSettings,
  catalog: SettingsCatalog | undefined,
  endpoints: readonly string[] = [],
): HarnessSettings {
  const model = stored.model ?? defaults.model
  const option = catalog?.models.find((candidate) => candidate.id === model)
  const supports = (effort: string | undefined) =>
    effort !== undefined && (!option || !option.efforts.length || option.efforts.some((candidate) => candidate.id === effort))
  const effort = stored.effort ?? (supports(defaults.effort) ? defaults.effort : option?.defaultEffort)
  const mode = stored.mode ?? defaults.mode
  const offered = !catalog || catalog.modes.some((candidate) => candidate.id === mode)
  const fast = stored.fast ?? defaults.fast
  const endpoint = [stored.endpoint, defaults.endpoint, endpoints[0]].find((id) => id && endpoints.includes(id))
  return {
    ...(model ? { model } : {}),
    ...(effort ? { effort } : {}),
    ...(mode && offered ? { mode } : {}),
    ...(fast !== undefined ? { fast } : {}),
    ...(endpoint ? { endpoint } : {}),
  }
}

/** The fields a live session must change to go from `before` to `after`, as concrete values. */
export function liveChange(before: HarnessSettings, after: HarnessSettings): SettingsChange {
  const change: Record<string, unknown> = {}
  for (const key of SETTING_KEYS) if (before[key] !== after[key]) change[key] = after[key] ?? null
  return change as SettingsChange
}
