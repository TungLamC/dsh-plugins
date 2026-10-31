/**
 * The models row: the `betterProvidersModels` Remote service the Models page calls
 * to refresh a built-in pi-ai route's model list (sync.ts) from pi.dev (pi-dev.ts)
 * against the catalog dsh serves (local.ts), writing the route's settings
 * (settings.ts). Refreshing needs this plugin to load dsh's own pi-ai: another copy
 * may ship another catalog.
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
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { SERVICE } from "../../shared/ids.js";
import { MODELS_REMOTE } from "../../shared/models.wire.js";
import { nodeLocator, piAiIdentity } from "../kit/pi-ai-identity.js";
import { guard, Refusal } from "../kit/refusal.js";
import { registerHost } from "../kit/typert.js";
import { installedCatalog } from "./local.js";
import { piDevCatalog } from "./pi-dev.js";
import { routeSettings } from "./settings.js";
import { createCatalogSync } from "./sync.js";
let BetterProvidersModels = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _preview_decorators;
    let _apply_decorators;
    return class BetterProvidersModels extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _preview_decorators = [Remote];
            _apply_decorators = [Remote];
            __esDecorate(this, null, _preview_decorators, { kind: "method", name: "preview", static: false, private: false, access: { has: obj => "preview" in obj, get: obj => obj.preview }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _apply_decorators, { kind: "method", name: "apply", static: false, private: false, access: { has: obj => "apply" in obj, get: obj => obj.apply }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        static inject = [SERVICE.main, 'typert', 'settings'];
        /** Undefined when this plugin loads another pi-ai than dsh does. */
        sync = __runInitializers(this, _instanceExtraInitializers);
        constructor(ctx) {
            super(ctx, SERVICE.models);
            registerHost(ctx, MODELS_REMOTE);
            const identity = piAiIdentity(nodeLocator(specifier => import.meta.resolve(specifier)));
            if (!identity.shared) {
                ctx.logger.warn('better-providers-models: model refresh is off because this plugin does not load dsh\'s pi-ai (%s)', identity.detail);
                this.sync = undefined;
                return;
            }
            this.sync = createCatalogSync({
                // The global fetch, so dsh's NODE_USE_ENV_PROXY applies.
                remote: piDevCatalog((input, init) => globalThis.fetch(input, init)),
                installed: installedCatalog(),
                // The settings service writes through the configuration editor, so it is there whenever settings is.
                settings: routeSettings({ settings: ctx.settings, editor: ctx.get('configEditor') }),
            });
        }
        running() {
            if (this.sync === undefined)
                throw new Refusal('pi-ai-mismatch');
            return this.sync;
        }
        async preview(provider, signal) {
            return guard(() => this.running().preview(provider, signal));
        }
        async apply(previewId, choice) {
            return guard(() => this.running().apply(previewId, choice));
        }
    };
})();
export default BetterProvidersModels;
