/**
 * Refreshing a built-in pi-ai route's model list from the newest pi-ai catalog.
 * A preview compares the models the route serves with the newest catalog; applying
 * it writes the chosen list as the route's `models`, so the route keeps serving it
 * whatever pi-ai version dsh installs. A model the installed catalog describes is
 * listed by id alone and keeps everything the catalog knows of it; a model only the
 * newest catalog has is described by what a profile can state (entry.ts). A preview
 * applies only while the route's settings are as they were when it was made.
 *
 * The ports are declared here: the newest catalog, the installed one, and the
 * route's settings.
 */
import { isDeepStrictEqual } from 'node:util';
import { randomUUID } from 'node:crypto';
import { Refusal } from "../kit/refusal.js";
import { toModelEntry } from "./entry.js";
/** A failed read of the newest catalog. */
export class CatalogFailure extends Error {
    code;
    constructor(code) {
        super(code);
        this.code = code;
    }
}
/** A refused write. */
export class WriteFailure extends Error {
    kind;
    constructor(kind, detail) {
        super(detail ?? kind);
        this.kind = kind;
    }
}
/** How long a preview can be applied. */
const PREVIEW_TTL_MS = 10 * 60_000;
/** Previews kept at once; the oldest goes first. */
const PREVIEW_LIMIT = 8;
function overridesOf(profile) {
    return profile?.modelOverrides ?? {};
}
/** The models a route serves: its own list, or the installed catalog with its overrides. */
function currentModels(profile, installed) {
    if (profile?.models !== undefined && profile.models.length > 0)
        return profile.models;
    const overrides = overridesOf(profile);
    return [...installed.models.keys()].map(id => ({ id, ...Object.hasOwn(overrides, id) ? overrides[id] : {} }));
}
/** Whether the route can serve a model the installed catalog does not describe; why not otherwise. */
function misfit(model, installed) {
    if (installed.api === undefined || model.api !== installed.api)
        return 'api';
    if (installed.baseUrl === undefined || model.baseUrl !== installed.baseUrl)
        return 'endpoint';
    return undefined;
}
function unique(values) {
    return new Set(values).size === values.length;
}
export function createCatalogSync(deps) {
    const now = deps.now ?? Date.now;
    const newId = deps.newId ?? randomUUID;
    const previews = new Map();
    function remember(id, snapshot) {
        for (const [key, held] of previews)
            if (now() - held.createdAt > PREVIEW_TTL_MS)
                previews.delete(key);
        previews.set(id, snapshot);
        while (previews.size > PREVIEW_LIMIT)
            previews.delete(previews.keys().next().value);
    }
    async function readCatalog(provider, signal) {
        try {
            return await deps.remote.models(provider, signal);
        }
        catch (error) {
            signal.throwIfAborted();
            throw new Refusal(error instanceof CatalogFailure ? `catalog-${error.code}` : 'catalog-unreachable', provider);
        }
    }
    /** The route's new model list, or undefined when the choice changes nothing. */
    function listOf(snapshot, add, keep) {
        const dropped = snapshot.removed.filter(model => !keep.has(model.id));
        if (add.size === 0 && dropped.length === 0)
            return undefined;
        const current = new Map(snapshot.current.map(entry => [entry.id, entry]));
        const listed = [];
        for (const model of snapshot.remote) {
            const entry = current.get(model.id);
            if (entry !== undefined)
                listed.push(entry);
            else if (add.has(model.id))
                listed.push(snapshot.installed.models.has(model.id) ? { id: model.id } : toModelEntry(model));
        }
        const gone = new Set(snapshot.removed.map(model => model.id));
        for (const entry of snapshot.current)
            if (gone.has(entry.id) && keep.has(entry.id))
                listed.push(entry);
        return listed;
    }
    /**
     * The output capability of the listed models the installed catalog does not describe: the smallest
     * the newest catalog gives any of them, since the route states one for all (a model's own would
     * become its request default).
     */
    function capabilityOf(snapshot, listed) {
        const remote = new Map(snapshot.remote.map(model => [model.id, model]));
        const sizes = listed.flatMap(entry => {
            const model = remote.get(entry.id);
            return model === undefined || snapshot.installed.models.has(entry.id) ? [] : [model.maxTokens];
        });
        return sizes.length === 0 ? undefined : Math.min(...sizes);
    }
    return {
        async preview(provider, signal) {
            const installed = deps.installed.route(provider);
            if (installed === undefined)
                throw new Refusal('unsupported', provider);
            const catalog = await readCatalog(provider, signal);
            const state = await deps.settings.read(provider);
            const current = currentModels(state.profile, installed);
            const listed = new Map(current.map(entry => [entry.id, entry]));
            const nameOf = (id) => listed.get(id)?.name ?? installed.models.get(id)?.name ?? id;
            const remote = [];
            const added = [];
            const unchanged = [];
            const skipped = [];
            const seen = new Set();
            for (const model of catalog.models) {
                if (seen.has(model.id))
                    continue;
                seen.add(model.id);
                if (listed.has(model.id)) {
                    remote.push(model);
                    unchanged.push({ id: model.id, name: model.name });
                    continue;
                }
                const known = installed.models.has(model.id);
                const reason = known ? undefined : misfit(model, installed);
                if (reason !== undefined) {
                    skipped.push({ id: model.id, name: model.name, reason });
                    continue;
                }
                remote.push(model);
                added.push({ id: model.id, name: model.name, inherited: known });
            }
            for (const model of catalog.invalid) {
                if (seen.has(model.id))
                    continue;
                seen.add(model.id);
                // A malformed entry cannot be added, but it says the model is still offered.
                if (listed.has(model.id))
                    unchanged.push({ id: model.id, name: nameOf(model.id) });
                else
                    skipped.push({ id: model.id, ...model.name === undefined ? {} : { name: model.name }, reason: 'invalid' });
            }
            const removed = current.filter(entry => !seen.has(entry.id)).map(entry => ({ id: entry.id, name: nameOf(entry.id) }));
            const id = newId();
            remember(id, {
                provider, createdAt: now(), current, remote, installed, added, removed,
                ...state.profile === undefined ? {} : { profile: structuredClone(state.profile) },
            });
            return {
                id, provider, added, removed, unchanged, skipped, firstWrite: state.firstWrite,
                ...state.blocked === undefined ? {} : { blocked: state.blocked },
            };
        },
        async apply(previewId, choice) {
            const snapshot = previews.get(previewId);
            if (snapshot === undefined || now() - snapshot.createdAt > PREVIEW_TTL_MS) {
                previews.delete(previewId);
                return { status: 'expired' };
            }
            const addable = new Set(snapshot.added.map(model => model.id));
            const keepable = new Set(snapshot.removed.map(model => model.id));
            if (!unique(choice.add) || !unique(choice.keep) || !choice.add.every(id => addable.has(id)) || !choice.keep.every(id => keepable.has(id))) {
                throw new Refusal('bad-choice');
            }
            const listed = listOf(snapshot, new Set(choice.add), new Set(choice.keep));
            if (listed === undefined)
                return { status: 'unchanged' };
            const state = await deps.settings.read(snapshot.provider);
            if (!isDeepStrictEqual(state.profile, snapshot.profile)) {
                previews.delete(previewId);
                return { status: 'stale' };
            }
            if (state.blocked !== undefined)
                return { status: 'blocked', reason: state.blocked };
            const capability = capabilityOf(snapshot, listed);
            const fields = {
                // A models list cannot stand beside overrides; the overrides are already folded into its entries.
                ...Object.keys(overridesOf(snapshot.profile)).length > 0 ? { modelOverrides: null } : {},
                models: listed,
                ...capability === undefined ? {} : { defaultMaxTokens: capability },
            };
            try {
                await deps.settings.write(snapshot.provider, fields, state.revision);
            }
            catch (error) {
                if (!(error instanceof WriteFailure))
                    throw error;
                switch (error.kind) {
                    case 'conflict':
                        previews.delete(previewId);
                        return { status: 'stale' };
                    case 'expression':
                    case 'overridden':
                        return { status: 'blocked', reason: error.kind };
                    case 'rejected':
                        return { status: 'rejected', detail: error.message };
                }
            }
            previews.delete(previewId);
            return { status: 'applied' };
        },
    };
}
