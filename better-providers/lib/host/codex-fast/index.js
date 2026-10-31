/**
 * The codex-fast row: the `betterProvidersCodexFast` Remote service behind the
 * composer's fast-mode switch. Codex runs a request fast when it asks for the
 * priority service tier. Each session's switch (toggles.ts, kept by store.ts)
 * decides whether its Codex requests ask for it, which the bridge (bridge.ts)
 * adds to the requests llm-pi-ai sends through pi-ai. That
 * needs this plugin to load dsh's own pi-ai: patching another copy would change
 * nothing.
 */
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { readFileSync } from 'node:fs';
import Schema from '@deepseek-ai/schemastery';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { createModels } from '@earendil-works/pi-ai/models';
import { SERVICE } from "../../shared/ids.js";
import { CODEX_FAST_REMOTE } from "../../shared/codex-fast.wire.js";
import { nodeLocator, piAiIdentity } from "../kit/pi-ai-identity.js";
import { guard, guardStream } from "../kit/refusal.js";
import { registerHost } from "../kit/typert.js";
import { installPriorityBridge, TESTED_PI_AI, untestedPiAi } from "./bridge.js";
import { openSwitches } from "./store.js";
import { createSessionToggles } from "./toggles.js";
export const Config = Schema.object({
    defaultEnabled: Schema.boolean().default(false).volatile(),
});
/** The version of the pi-ai whose package.json is at `path`, if it can be read. */
function versionAt(path) {
    try {
        const { version } = JSON.parse(readFileSync(path, 'utf8'));
        return typeof version === 'string' ? version : undefined;
    }
    catch {
        return undefined;
    }
}
let BetterProvidersCodexFast = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _watchSupport_decorators;
    let _watch_decorators;
    let _set_decorators;
    return class BetterProvidersCodexFast extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _watchSupport_decorators = [Remote({ mode: 'stream' })];
            _watch_decorators = [Remote({ mode: 'stream' })];
            _set_decorators = [Remote];
            __esDecorate(this, null, _watchSupport_decorators, { kind: "method", name: "watchSupport", static: false, private: false, access: { has: obj => "watchSupport" in obj, get: obj => obj.watchSupport }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _watch_decorators, { kind: "method", name: "watch", static: false, private: false, access: { has: obj => "watch" in obj, get: obj => obj.watch }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _set_decorators, { kind: "method", name: "set", static: false, private: false, access: { has: obj => "set" in obj, get: obj => obj.set }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        static inject = [SERVICE.main, 'typert', 'llm', 'storageDomain'];
        static Config = Config;
        bridge = __runInitializers(this, _instanceExtraInitializers);
        toggles;
        constructor(ctx, config) {
            super(ctx, SERVICE.codexFast);
            registerHost(ctx, CODEX_FAST_REMOTE);
            const identity = piAiIdentity(nodeLocator(specifier => import.meta.resolve(specifier)));
            if (identity.shared) {
                const version = versionAt(identity.path);
                if (version !== undefined && untestedPiAi(version)) {
                    ctx.logger.info('better-providers-codex-fast: pi-ai %s is outside the tested %s; fast mode is checked as requests run', version, TESTED_PI_AI.join(', '));
                }
            }
            else {
                ctx.logger.warn('better-providers-codex-fast: fast mode is off because this plugin does not load dsh\'s pi-ai (%s)', identity.detail);
            }
            this.bridge = installPriorityBridge(identity.shared ? Object.getPrototypeOf(createModels()) : undefined, (fault) => {
                ctx.logger.warn('better-providers-codex-fast: fast mode is off until dsh restarts: pi-ai no longer takes the priority service tier the way this plugin adds it (%s)', fault);
            });
            const switches = openSwitches(ctx.storageDomain);
            switches.store.catch((error) => {
                ctx.logger.warn('better-providers-codex-fast: the session switches cannot be stored, so every session is off: %s', error instanceof Error ? error.message : String(error));
            });
            this.toggles = createSessionToggles({
                store: switches.store,
                parentOf: sessionId => ctx.get('sessions')?.get(sessionId)?.header.parentSession,
                initial: () => config.defaultEnabled.get(),
            });
            // Global: the llm service filters listeners to its own isolation; requests of an isolated llm service count too.
            ctx.on('llm/stream', (request, next) => this.bridge.stream(request, next, sessionId => this.toggles.enabled(sessionId)), { global: true });
            ctx.effect(() => async () => {
                this.bridge.dispose();
                await switches.close();
            }, 'better-providers-codex-fast: priority bridge and switches');
        }
        async *watchSupport(signal) {
            yield* this.bridge.support(signal);
        }
        async *watch(sessionId, signal) {
            yield* guardStream(() => this.toggles.watch(sessionId, signal));
        }
        async set(sessionId, enabled) {
            return guard(() => this.toggles.set(sessionId, enabled));
        }
    };
})();
export default BetterProvidersCodexFast;
