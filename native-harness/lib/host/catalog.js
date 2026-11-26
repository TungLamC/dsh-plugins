/** Names dsh claims before a prompt is sent: the client `/model` popup and Host commands of every session. */
const RESERVED = new Set(['model', 'permission', 'export', 'feedback']);
const FRESH_MS = 60_000;
export class Catalogs {
    cache = new Map();
    windows = new Map();
    harness;
    constructor(harness) {
        this.harness = harness;
    }
    /**
     * Cached catalog. Only the very first read for a harness and cwd waits for the
     * native process; later reads return the cached value at once and refresh it in
     * the background when it is older than a minute. A failed refresh keeps the last good value.
     */
    async get(harness, cwd, signal) {
        const key = `${harness}\0${cwd}`;
        const entry = this.cache.get(key) ?? { at: 0 };
        this.cache.set(key, entry);
        const stale = Date.now() - entry.at >= FRESH_MS;
        if (stale || !entry.value)
            entry.loading ??= this.harness(harness)
                // Background refreshes outlive the request that triggered them.
                .catalog(cwd, entry.value ? AbortSignal.timeout(120_000) : signal)
                .then((value) => {
                entry.value = value;
                entry.at = Date.now();
                return value;
            })
                .finally(() => {
                entry.loading = undefined;
            });
        if (entry.value) {
            entry.loading?.catch(() => undefined);
            return entry.value;
        }
        return entry.loading;
    }
    /** The cached catalog, if any; never starts a native process. */
    peek(harness, cwd) {
        return this.cache.get(`${harness}\0${cwd}`)?.value;
    }
    /** Slash entries for the `/` menu; every token names exactly one native command. */
    async entries(harness, cwd, signal) {
        const catalog = await this.get(harness, cwd, signal);
        return tokensOf(catalog.commands).map(({ token, command }) => ({
            token,
            name: command.name,
            description: command.description,
            kind: command.kind,
            ...(command.argumentHint ? { argumentHint: command.argumentHint } : {}),
        }));
    }
    /** The native command a leading `/token` names; a bare native name resolves only when unambiguous. */
    async resolve(harness, cwd, token, signal) {
        const catalog = await this.get(harness, cwd, signal).catch(() => undefined);
        if (!catalog)
            return undefined;
        const exact = tokensOf(catalog.commands).find((entry) => entry.token === token);
        if (exact)
            return exact.command;
        const named = catalog.commands.filter((command) => command.name === token);
        return named.length === 1 ? named[0] : undefined;
    }
    /** Synchronous model metadata from whatever is cached; never starts a native process. */
    model(harness, id) {
        let option;
        for (const [key, entry] of this.cache) {
            if (!key.startsWith(`${harness}\0`))
                continue;
            option ??= entry.value?.models.find((model) => model.id === id);
        }
        const contextWindow = this.windows.get(`${harness}\0${id}`) ?? this.harness(harness).contextWindow?.(id) ?? option?.contextWindow;
        return { ...(option ? { option } : {}), ...(contextWindow ? { contextWindow } : {}) };
    }
    defaultModel(harness, cwd) {
        return this.cache.get(`${harness}\0${cwd}`)?.value?.defaultModel;
    }
    /** Context windows learned from native usage reports. */
    noteWindow(harness, model, window) {
        this.windows.set(`${harness}\0${model}`, window);
    }
}
/**
 * Tokens tied to native identity, not catalog order: a unique name keeps its own
 * name; every entry of a repeated or dsh-owned name gets a suffix derived from
 * its path (or kind), so a refreshed or reordered catalog never re-points a
 * token at a different skill.
 */
export function tokensOf(commands) {
    const counts = new Map();
    for (const command of commands)
        counts.set(command.name, (counts.get(command.name) ?? 0) + 1);
    const taken = new Set(RESERVED);
    return commands.map((command) => {
        const shared = (counts.get(command.name) ?? 0) > 1 || RESERVED.has(command.name);
        const base = shared ? `${command.name}-${digest(command.path ?? `${command.kind}:${command.description}`)}` : command.name;
        let token = base;
        for (let suffix = 2; taken.has(token); suffix++)
            token = `${base}-${suffix}`;
        taken.add(token);
        return { token, command };
    });
}
/** Short stable digest (FNV-1a). */
function digest(value) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(36).slice(0, 5);
}
