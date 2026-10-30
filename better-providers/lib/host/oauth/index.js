/**
 * The oauth row: the `betterProvidersOauth` Remote service the Models page calls
 * to sign in to pi-ai provider routes with an account (relay.ts).
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
import { randomUUID } from 'node:crypto';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { SERVICE } from "../../shared/ids.js";
import { OAUTH_REMOTE } from "../../shared/oauth.wire.js";
import { grantsOf, planOf, providerOf } from "../kit/pi-ai-record.js";
import { guard, guardStream } from "../kit/refusal.js";
import { registerHost } from "../kit/typert.js";
import { createSignInRelay } from "./relay.js";
/** Record keys reach the services only after `recordKey` checked their grammar. */
const asKey = (key) => key;
let BetterProvidersOauth = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _watch_decorators;
    let _begin_decorators;
    let _answer_decorators;
    let _cancel_decorators;
    let _signOut_decorators;
    return class BetterProvidersOauth extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _watch_decorators = [Remote({ mode: 'stream' })];
            _begin_decorators = [Remote];
            _answer_decorators = [Remote];
            _cancel_decorators = [Remote];
            _signOut_decorators = [Remote];
            __esDecorate(this, null, _watch_decorators, { kind: "method", name: "watch", static: false, private: false, access: { has: obj => "watch" in obj, get: obj => obj.watch }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _begin_decorators, { kind: "method", name: "begin", static: false, private: false, access: { has: obj => "begin" in obj, get: obj => obj.begin }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _answer_decorators, { kind: "method", name: "answer", static: false, private: false, access: { has: obj => "answer" in obj, get: obj => obj.answer }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _cancel_decorators, { kind: "method", name: "cancel", static: false, private: false, access: { has: obj => "cancel" in obj, get: obj => obj.cancel }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _signOut_decorators, { kind: "method", name: "signOut", static: false, private: false, access: { has: obj => "signOut" in obj, get: obj => obj.signOut }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        static inject = [SERVICE.main, 'typert', 'authorization', 'credentials'];
        relay = __runInitializers(this, _instanceExtraInitializers);
        constructor(ctx) {
            super(ctx, SERVICE.oauth);
            registerHost(ctx, OAUTH_REMOTE);
            const grants = grantsOf(ctx.credentials);
            this.relay = createSignInRelay({
                flows: {
                    describe: key => ctx.authorization.describe(asKey(key)),
                    begin: request => ctx.authorization.begin({ ...request, key: asKey(request.key) }),
                    cancel: (key) => { ctx.authorization.cancel(asKey(key)); },
                },
                records: {
                    describe: key => ctx.credentials.describeRecord(asKey(key)),
                    plan: async (key) => {
                        const provider = providerOf(key);
                        return provider === undefined ? undefined : planOf(await grants.read(provider));
                    },
                    remove: key => ctx.credentials.deleteRecord(asKey(key)),
                },
                changes(listener) {
                    const settled = ctx.on('authorization/settled', (key) => { listener(String(key)); });
                    const updated = ctx.on('credentials/record-updated', (key) => { listener(String(key)); });
                    return () => { settled(); updated(); };
                },
                newId: () => randomUUID(),
            });
        }
        async *watch(provider, signal) {
            yield* guardStream(() => this.relay.watch(provider, signal));
        }
        async begin(provider, method, signal) {
            return guard(() => this.relay.begin(provider, method, signal));
        }
        async answer(provider, promptId, value) {
            return guard(() => { this.relay.answer(provider, promptId, value); });
        }
        async cancel(provider) {
            return guard(() => { this.relay.cancel(provider); });
        }
        async signOut(provider) {
            return guard(() => this.relay.signOut(provider));
        }
    };
})();
export default BetterProvidersOauth;
