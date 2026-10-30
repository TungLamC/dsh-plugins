/**
 * The quota row: the `betterProvidersQuota` Remote service the Models page calls
 * for subscription usage of signed-in routes (tracker.ts), read through the
 * provider adapters (codex.ts, xai.ts) with the stored sign-ins (accounts.ts).
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
import Schema from '@deepseek-ai/schemastery';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex';
import { xaiProvider } from '@earendil-works/pi-ai/providers/xai';
import { SERVICE } from "../../shared/ids.js";
import { hasQuota, QUOTA_PROVIDERS, QUOTA_REMOTE, REFRESH_SECONDS, } from "../../shared/quota.wire.js";
import { grantsOf, providerOf } from "../kit/pi-ai-record.js";
import { guard, guardStream } from "../kit/refusal.js";
import { registerHost } from "../kit/typert.js";
import { createAccounts } from "./accounts.js";
import { codexQuota } from "./codex.js";
import { createQuotaTracker } from "./tracker.js";
import { xaiQuota } from "./xai.js";
export const Config = Schema.object({
    quotaRefreshSeconds: Schema.natural().min(REFRESH_SECONDS.min).max(REFRESH_SECONDS.max).default(REFRESH_SECONDS.initial).volatile(),
});
/** Every route the browser shows usage for: how its usage is read, and the pi-ai provider that refreshes its sign-in. */
const ROUTES = {
    'openai-codex': { adapter: codexQuota, signIn: openaiCodexProvider },
    xai: { adapter: xaiQuota, signIn: xaiProvider },
};
let BetterProvidersQuota = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _watch_decorators;
    let _redeem_decorators;
    return class BetterProvidersQuota extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _watch_decorators = [Remote({ mode: 'stream' })];
            _redeem_decorators = [Remote];
            __esDecorate(this, null, _watch_decorators, { kind: "method", name: "watch", static: false, private: false, access: { has: obj => "watch" in obj, get: obj => obj.watch }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _redeem_decorators, { kind: "method", name: "redeem", static: false, private: false, access: { has: obj => "redeem" in obj, get: obj => obj.redeem }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        static inject = [SERVICE.main, 'typert', 'credentials'];
        static Config = Config;
        tracker = __runInitializers(this, _instanceExtraInitializers);
        constructor(ctx, config) {
            super(ctx, SERVICE.quota);
            registerHost(ctx, QUOTA_REMOTE);
            // The global fetch, so dsh's NODE_USE_ENV_PROXY applies.
            const http = { fetch: (input, init) => globalThis.fetch(input, init), now: () => Date.now() };
            this.tracker = createQuotaTracker({
                accounts: createAccounts({
                    grants: grantsOf(ctx.credentials),
                    provider: id => hasQuota(id) ? ROUTES[id].signIn() : undefined,
                }),
                adapters: Object.fromEntries(QUOTA_PROVIDERS.map(provider => [provider, ROUTES[provider].adapter(http)])),
                interval: () => config.quotaRefreshSeconds.get(),
            });
            ctx.on('credentials/record-updated', (key) => {
                const provider = providerOf(String(key));
                if (provider !== undefined)
                    this.tracker.credentialsChanged(provider);
            });
            ctx.on('loader/volatile-update', () => { this.tracker.intervalChanged(); });
            ctx.effect(() => () => { this.tracker.dispose(); }, 'better-providers-quota: usage reads');
        }
        async *watch(provider, signal) {
            yield* guardStream(() => this.tracker.watch(provider, signal));
        }
        async redeem(provider, redemption) {
            return guard(() => this.tracker.redeem(provider, redemption));
        }
    };
})();
export default BetterProvidersQuota;
