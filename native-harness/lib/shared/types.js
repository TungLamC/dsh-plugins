/** Vocabulary shared by the Host and the browser bundle. */
/** dsh agent presets that run a native harness. */
export const PRESETS = {
    'claude-code-native': 'claude-code',
    'codex-native': 'codex',
    'antigravity-native': 'antigravity',
};
export const HARNESS_NAMES = {
    'claude-code': 'Claude Code',
    codex: 'Codex',
    antigravity: 'Antigravity',
};
/** Hidden provider routes; they list no models, so the global model catalog never shows them. */
export const PROVIDERS = {
    'claude-code': 'native-harness.claude-code',
    codex: 'native-harness.codex',
    antigravity: 'native-harness.antigravity',
};
export function harnessOfPreset(preset) {
    return typeof preset === 'string' ? PRESETS[preset] : undefined;
}
export function harnessOfProvider(provider) {
    return Object.keys(PROVIDERS).find((id) => PROVIDERS[id] === provider);
}
export const SETTING_KEYS = ['model', 'effort', 'mode', 'fast', 'endpoint'];
export function withChange(settings, change) {
    const next = { ...settings };
    for (const key of SETTING_KEYS) {
        if (!(key in change))
            continue;
        const value = change[key];
        if (value === null || value === undefined)
            delete next[key];
        else
            next[key] = value;
    }
    return next;
}
export const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
export const text = (value) => (typeof value === 'string' ? value : '');
export const list = (value) => (Array.isArray(value) ? value : []);
export const count = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
