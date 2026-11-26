/** Plugin configuration: native executables, Claude Code endpoints, idle shutdown, and the settings new sessions start with. */
import Schema from '@deepseek-ai/schemastery';
import { ICON_NAMES, ICON_URL } from "../shared/icons.js";
/** A profile patch replaces the whole config, so every field keeps its own default. */
const settingsFields = (model, effort, mode, harness) => ({
    model: Schema.string().default(model).description(`Model of a new ${harness} session.`),
    effort: Schema.string().default(effort).description(`Reasoning effort of a new ${harness} session.`),
    mode: Schema.string().default(mode).description(`Permission mode id of a new ${harness} session.`),
});
export const Config = Schema.object({
    claudeCommand: Schema.string().default('claude').description('Claude Code executable (name on PATH or absolute path).'),
    claudeEntrypoint: Schema.string()
        .default('native-harness')
        .description("CLAUDE_CODE_ENTRYPOINT for Claude Code processes: a label that names this plugin as the caller. Empty keeps the Agent SDK's sdk-ts."),
    claudeEndpoints: Schema.array(Schema.object({
        id: Schema.string().pattern(/^[A-Za-z0-9_.-]{1,64}$/).required().description('Stable id, stored with each session that picks it.'),
        name: Schema.string().default('').description('Name in the model menu; empty uses the id.'),
        command: Schema.string().default('').description('Command shown to resume a session in the terminal, e.g. a shell alias; empty uses claudeCommand.'),
        env: Schema.dict(Schema.string())
            .default({})
            .description('Environment of Claude Code processes on this endpoint. A value that is exactly $NAME is read from the dsh credential store, else the dsh host environment and .env files. ANTHROPIC_BASE_URL, ANTHROPIC_API_KEY and ANTHROPIC_AUTH_TOKEN inherited from the host are dropped first. The env of Claude Code settings files still wins over them (see Known limitations in the README).'),
    }))
        .default([])
        .description("Upstreams a Claude Code session can switch between in the model menu. Empty runs on NATIVE_HARNESS_ANTHROPIC_BASE_URL, NATIVE_HARNESS_ANTHROPIC_AUTH_TOKEN and NATIVE_HARNESS_ANTHROPIC_API_KEY, set on the process as ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN and ANTHROPIC_API_KEY. They are read from the dsh credential store, else the dsh host environment and .env files, when a process starts. One of the token and the key is enough; without the URL, Claude Code uses its default one. Once any of them is set, ANTHROPIC_BASE_URL, ANTHROPIC_API_KEY and ANTHROPIC_AUTH_TOKEN inherited from the host are dropped first; with none set, processes run on whatever the dsh host environment points at. The names carry the NATIVE_HARNESS_ prefix because dsh's own Anthropic provider reads the bare ANTHROPIC_* names from the credential store as well. Either way, ANTHROPIC_* in the env of ~/.claude/settings.json, or of .claude/settings.json or .claude/settings.local.json in the session directory, win over what the plugin passes; the conversation says so when that happens."),
    codexCommand: Schema.string().default('codex').description('Codex executable (name on PATH or absolute path).'),
    antigravityCommand: Schema.string()
        .default('agy')
        .description('Antigravity CLI executable (name on PATH or absolute path), started as `agy acp`.'),
    idleMinutes: Schema.number().min(1).max(1440).default(15).description('Close an idle native process after this many minutes.'),
    defaults: Schema.object({
        'claude-code': Schema.object({
            ...settingsFields('opus', 'xhigh', 'auto', 'Claude Code'),
            endpoint: Schema.string().default('').description('Endpoint id of a new Claude Code session; empty uses the first endpoint.'),
        }).default({}),
        codex: Schema.object({
            ...settingsFields('gpt-6-astra', 'xhigh', 'auto-review', 'Codex'),
            fast: Schema.boolean()
                .default(false)
                .description('Fast mode of a new Codex session, for models that offer it. Uses more of your limits.'),
        }).default({}),
        antigravity: Schema.object(settingsFields('gemini-4-neon', 'high', 'auto', 'Antigravity')).default({}),
    })
        .default({})
        .description('What a session runs with until it picks otherwise in the composer.'),
    providerIcons: Schema.dict(Schema.union([...ICON_NAMES.map((name) => Schema.const(name)), Schema.const(''), Schema.string().pattern(ICON_URL)]))
        .default({})
        .description(`Model menu icon by provider id: a built-in mark (${ICON_NAMES.join(', ')}), an https:// or data:image/ URL, or empty for none. dsh's and pi-ai's built-in providers have marks already; other providers have none unless listed here.`),
});
/** Endpoint ids must be unique and the default must name one of them; the schema cannot say either. */
export function checkEndpoints(config) {
    const seen = new Set();
    for (const endpoint of config.claudeEndpoints) {
        if (seen.has(endpoint.id))
            throw new Error(`native-harness: claudeEndpoints lists id "${endpoint.id}" twice`);
        seen.add(endpoint.id);
    }
    const picked = config.defaults['claude-code'].endpoint;
    if (picked && !seen.has(picked))
        throw new Error(`native-harness: defaults.claude-code.endpoint "${picked}" is not an id in claudeEndpoints`);
}
