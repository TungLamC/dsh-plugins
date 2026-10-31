/**
 * The settings of pi-ai routes over dsh's settings service, which writes them into
 * the profile through the configuration editor. The editor writes the entry's
 * whole configuration, so the first write copies every route the profile inherits;
 * llm-pi-ai checks every changed route before anything is written.
 *
 * A route's profile is read as configured, every layer composed but nothing
 * resolved: that is what a write merges into, and the resolved form fills in
 * defaults (empty modalities and compat on every model) that would then be
 * written back.
 *
 * Two things make a write go wrong rather than fail: an `!!js` expression where a
 * field is written would get the field merged into the expression, so such a
 * route is refused before trying; and a home patch that overrides the entry makes
 * the editor refuse, which is reported as such.
 */
import { PI_AI } from "../../shared/ids.js";
import { Refusal } from "../kit/refusal.js";
import { WriteFailure } from "./sync.js";
const FIELDS = ['modelOverrides', 'models', 'defaultMaxTokens'];
function member(node, key) {
    return node !== null && typeof node === 'object' && !Array.isArray(node) && Object.hasOwn(node, key) ? node[key] : undefined;
}
/** How the loader keeps an unevaluated `!!js` value. */
function isExpression(node) {
    return node !== null && typeof node === 'object' && Object.keys(node).length === 1 && typeof member(node, '__jsExpr') === 'string';
}
export function routeSettings(deps) {
    /** The llm-pi-ai entry's configuration as composed from the profile's layers. */
    function configured() {
        return deps.editor.entries().find(entry => entry.options.id === PI_AI)?.options.config;
    }
    /** Whether an expression stands where a write to the route lands. */
    function expressionAt(root, provider) {
        const providers = member(root, 'providers');
        const profile = member(providers, provider);
        return [root, providers, profile, ...FIELDS.map(field => member(profile, field))].some(isExpression);
    }
    function descriptor() {
        const found = deps.settings.describe().find(entry => entry.ns === PI_AI);
        // llm-pi-ai is not running, so nothing serves the route.
        if (found === undefined)
            throw new Refusal('unsupported');
        return found;
    }
    return {
        async read(provider) {
            const { user, revision } = descriptor();
            const root = configured();
            const profile = member(member(root, 'providers'), provider);
            return {
                ...profile === undefined ? {} : { profile: structuredClone(profile) },
                revision,
                firstWrite: member(user, 'providers') === undefined,
                ...expressionAt(root, provider) ? { blocked: 'expression' } : {},
            };
        },
        async write(provider, fields, revision) {
            if (expressionAt(configured(), provider))
                throw new WriteFailure('expression');
            const ops = FIELDS.flatMap((field) => {
                const value = fields[field];
                if (value === undefined)
                    return [];
                const path = ['providers', provider, field];
                return [value === null ? { op: 'unset', path } : { op: 'set', path, value }];
            });
            try {
                await deps.settings.mutate(PI_AI, ops, revision);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                // The settings service's own class may be another copy's: match its stable code.
                if (error?.code === 'SETTINGS_CONFLICT')
                    throw new WriteFailure('conflict', message);
                if (message.includes('overridden by a home patch'))
                    throw new WriteFailure('overridden', message);
                throw new WriteFailure('rejected', message);
            }
        },
    };
}
