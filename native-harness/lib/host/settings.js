/**
 * The settings a native session runs with: the session's own picks over the
 * defaults configured for its harness. Native configuration files are never
 * consulted; every value reaches the harness explicitly.
 */
import { SETTING_KEYS } from "../shared/types.js";
/**
 * A picked model keeps the configured effort when it supports it, else its own
 * default. Without a catalog the values pass through unchecked; a configured
 * mode the harness does not offer is dropped. The endpoint is the session's
 * pick, else the configured default, else the first of `endpoints`; one no
 * longer configured is skipped, and without endpoints there is none.
 */
export function resolveSettings(stored, defaults, catalog, endpoints = []) {
    const model = stored.model ?? defaults.model;
    const option = catalog?.models.find((candidate) => candidate.id === model);
    const supports = (effort) => effort !== undefined && (!option || !option.efforts.length || option.efforts.some((candidate) => candidate.id === effort));
    const effort = stored.effort ?? (supports(defaults.effort) ? defaults.effort : option?.defaultEffort);
    const mode = stored.mode ?? defaults.mode;
    const offered = !catalog || catalog.modes.some((candidate) => candidate.id === mode);
    const fast = stored.fast ?? defaults.fast;
    const endpoint = [stored.endpoint, defaults.endpoint, endpoints[0]].find((id) => id && endpoints.includes(id));
    return {
        ...(model ? { model } : {}),
        ...(effort ? { effort } : {}),
        ...(mode && offered ? { mode } : {}),
        ...(fast !== undefined ? { fast } : {}),
        ...(endpoint ? { endpoint } : {}),
    };
}
/** The fields a live session must change to go from `before` to `after`, as concrete values. */
export function liveChange(before, after) {
    const change = {};
    for (const key of SETTING_KEYS)
        if (before[key] !== after[key])
            change[key] = after[key] ?? null;
    return change;
}
