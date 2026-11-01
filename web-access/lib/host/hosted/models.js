/**
 * Which model a hosted tier searches with when none is chosen on the settings
 * page. It searches and writes a short cited answer, so a fast, low-cost model
 * does: within the preferred kind, the newest version, a stable release before
 * a preview.
 *
 * The preference for OpenAI models follows pi-web-access 0.46.0
 * (`openai-search.ts`), Copyright (c) 2025 Nico Bailon, MIT License; see THIRD_PARTY_NOTICES.md.
 */
function versionAfter(prefix) {
    const pattern = new RegExp(`^${prefix}-(\\d+(?:\\.\\d+)?)(?:-|$)`);
    return (id) => {
        const match = pattern.exec(id);
        return match === null ? undefined : Number(match[1]);
    };
}
function pick(models, preference) {
    const rank = (id) => {
        const kind = preference.kinds.findIndex(matches => matches(id));
        return kind === -1 ? preference.kinds.length : kind;
    };
    const preview = (id) => /(?:^|-)(?:preview|exp|experimental)(?:-|$)/.test(id) ? 1 : 0;
    return models
        .filter(model => preference.version(model.id) !== undefined && !model.id.split('-').some(segment => preference.excluded.has(segment)))
        .sort((a, b) => rank(a.id) - rank(b.id)
        || preference.version(b.id) - preference.version(a.id)
        || preview(a.id) - preview(b.id)
        || a.id.length - b.id.length
        || a.id.localeCompare(b.id))[0];
}
const GPT = {
    version: versionAfter('gpt'),
    excluded: new Set(['pro', 'ultra', 'image', 'audio', 'realtime', 'search', 'transcribe', 'tts']),
    // The low-cost luna line, then a mainline model such as `gpt-5.5`.
    kinds: [id => id.split('-').includes('luna'), id => /^gpt-\d+(?:\.\d+)?$/.test(id)],
};
const GEMINI = {
    version: versionAfter('gemini'),
    excluded: new Set(['image', 'tts', 'audio', 'live', 'native', 'embedding', 'robotics', 'computer']),
    kinds: [id => id.includes('-flash') && !id.includes('-lite'), id => id.includes('-flash'), id => id.includes('-pro')],
};
/** The model for the Codex and OpenAI tiers. */
export function pickGptModel(models) {
    return pick(models, GPT);
}
/** The model for the Gemini tier. */
export function pickGeminiModel(models) {
    return pick(models, GEMINI);
}
