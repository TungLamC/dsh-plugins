/**
 * Ask Codex for priority processing without touching the requests dsh builds.
 *
 * dsh hands an agent-loop request to `llm/stream` deep-frozen, and llm-pi-ai
 * builds the provider call from it with pi-ai's `Models.streamSimple`, whose
 * options carry no service tier but do forward `onPayload`. So the decision
 * travels beside the request: the `llm/stream` listener runs the rest of the
 * call in an async scope of its own, and pi-ai's `streamSimple`, replaced on
 * the prototype, adds an `onPayload` that sets `service_tier` on the Codex
 * request body when the scope asks for it. pi-ai's own code still builds,
 * authenticates and sends every request.
 *
 * A request that asked for priority and was answered without passing through
 * the replaced method or its payload hook means pi-ai or llm-pi-ai changed
 * underneath: priority is then reported unsupported until dsh restarts.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { isAgentLoopRequest } from '@deepseek-ai/dsh-llm';
import { prioritizable } from "../../shared/codex-fast.wire.js";
import { cell } from "../kit/cell.js";
/** The wire protocol whose request body takes `service_tier`. */
const CODEX_API = 'openai-codex-responses';
/**
 * Where the replacement lives on the prototype, shared by every copy of this
 * plugin loaded in the process (after a reload, or a second install) so none
 * stacks another. The suffix versions the shape of {@link Shared}.
 */
const SHARED = Symbol.for('dsh-better-providers/codex-priority@1');
/** The pi-ai releases the contract tests run the bridge against: the oldest dsh-llm-pi-ai accepts, and the one dsh ships. */
export const TESTED_PI_AI = ['1.1.0', '1.4.0'];
function release(version) {
    const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
    return match === null ? undefined : match.slice(1, 4).map(Number);
}
function compare(a, b) {
    for (let i = 0; i < 3; i += 1) {
        const difference = (a[i] ?? 0) - (b[i] ?? 0);
        if (difference !== 0)
            return difference;
    }
    return 0;
}
/** Whether a pi-ai version lies outside the tested range; nothing is refused for it, the self-check still guards. */
export function untestedPiAi(version) {
    const ours = release(version);
    if (ours === undefined)
        return true;
    return compare(ours, release(TESTED_PI_AI[0])) < 0 || compare(ours, release(TESTED_PI_AI[TESTED_PI_AI.length - 1])) > 0;
}
function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function priorityPayload(previous, scope) {
    return async (payload, model) => {
        scope.offered = true;
        // The caller's own hook runs first and may replace the body.
        const replaced = previous === undefined ? undefined : await previous(payload, model);
        const body = replaced === undefined ? payload : replaced;
        if (!isRecord(body))
            return replaced;
        scope.applied = true;
        return { ...body, service_tier: 'priority' };
    };
}
function attach(target) {
    const existing = target[SHARED];
    if (existing !== undefined)
        return existing;
    const original = Object.getOwnPropertyDescriptor(target, 'streamSimple');
    if (typeof original?.value !== 'function')
        return undefined;
    const call = original.value;
    const scopes = new AsyncLocalStorage();
    const owners = new Set();
    const replacement = function (model, context, options) {
        const scope = scopes.getStore();
        if (scope === undefined || !scope.wanted || !owners.has(scope.owner) || model.api !== CODEX_API || model.provider !== scope.provider || model.id !== scope.model) {
            return call.call(this, model, context, options);
        }
        scope.reached = true;
        return call.call(this, model, context, { ...options, onPayload: priorityPayload(options?.onPayload, scope) });
    };
    const shared = { original: original, replacement, scopes, owners };
    Object.defineProperty(target, 'streamSimple', { ...original, value: replacement });
    Object.defineProperty(target, SHARED, { value: shared, configurable: true });
    return shared;
}
function detach(target, shared) {
    if (shared.owners.size > 0)
        return;
    // Something replaced the method after us: taking ours out would drop theirs. Ours stays, inert, for the next bridge to reuse.
    if (Object.getOwnPropertyDescriptor(target, 'streamSimple')?.value !== shared.replacement)
        return;
    Object.defineProperty(target, 'streamSimple', shared.original);
    delete target[SHARED];
}
function eligible(request) {
    return request.sessionId !== undefined && prioritizable(request.provider) && isAgentLoopRequest(request);
}
/**
 * Replace `streamSimple` on pi-ai's `Models` prototype.
 * @param target - the prototype of the `Models` llm-pi-ai streams with; undefined when it cannot be had, which leaves priority unsupported.
 * @param onFault - told once why priority stopped working.
 */
export function installPriorityBridge(target, onFault) {
    const shared = target === undefined ? undefined : attach(target);
    if (target !== undefined && shared === undefined)
        onFault('no-method');
    const owner = Symbol('codex-priority bridge');
    shared?.owners.add(owner);
    const supported = cell(shared !== undefined);
    const fault = (kind) => {
        if (!supported.get())
            return;
        supported.set(false);
        onFault(kind);
    };
    async function* scoped(scopes, request, next, enabled) {
        const outer = scopes.getStore();
        if (outer !== undefined)
            outer.nested = true;
        const scope = { owner, provider: request.provider, model: request.model, wanted: false, nested: false, reached: false, offered: false, applied: false };
        if (eligible(request))
            scope.wanted = await enabled(String(request.sessionId)).catch(() => false);
        const within = (step) => scopes.run(scope, step);
        // Binding only the creation is not enough: a generator resumes in the context of whoever calls next().
        const iterator = within(() => next()[Symbol.asyncIterator]());
        let judged = !scope.wanted;
        let open = true;
        try {
            while (true) {
                let step;
                try {
                    step = await within(() => iterator.next());
                }
                catch (error) {
                    open = false;
                    throw error;
                }
                if (step.done === true) {
                    open = false;
                    return;
                }
                // Anything but the closing chunk comes from the provider, which only answers a request whose body was built.
                if (!judged && step.value.type !== 'finish') {
                    judged = true;
                    if (!scope.nested) {
                        if (!scope.reached)
                            fault('not-reached');
                        else if (!scope.offered)
                            fault('payload-skipped');
                        else if (!scope.applied)
                            fault('payload-shape');
                    }
                }
                yield step.value;
            }
        }
        finally {
            if (open)
                await within(async () => { await iterator.return?.(); });
        }
    }
    return {
        support: signal => supported.watch(signal),
        stream(request, next, enabled) {
            if (shared === undefined || !supported.get())
                return next();
            return scoped(shared.scopes, request, next, enabled);
        },
        dispose() {
            if (target === undefined || shared === undefined || !shared.owners.delete(owner))
                return;
            detach(target, shared);
        },
    };
}
