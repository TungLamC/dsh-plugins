/**
 * The `web-access` row: registers the search provider `web-access`, which the
 * plugin's cordis.patch.yml makes `web.searchProvider`, and provides the
 * `webAccess` Remote service the settings page reads its model choices from.
 * The row's settings are its volatile Config fields, read at every search.
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
import { googleProvider } from '@earendil-works/pi-ai/providers/google';
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai';
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex';
import { HOSTED_TIERS, MODEL_FIELD, ON_BY_DEFAULT, ROW, SERVICE, TIERS } from "../shared/ids.js";
import { WEB_ACCESS_REMOTE } from "../shared/web-access.wire.js";
import { createSearchProvider } from "./chain.js";
import { hostedTiers, ROUTE } from "./hosted/tiers.js";
import { isObject } from "./kit/http.js";
import { registerHost } from "./kit/typert.js";
import { anysearchTier } from "./open/anysearch.js";
import { exaTier } from "./open/exa.js";
import { parallelTier } from "./open/parallel.js";
import { createRoutes, PI_AI } from "./routes.js";
export const Config = Schema.object({
    codex: Schema.boolean().default(ON_BY_DEFAULT.codex).volatile(),
    openai: Schema.boolean().default(ON_BY_DEFAULT.openai).volatile(),
    gemini: Schema.boolean().default(ON_BY_DEFAULT.gemini).volatile(),
    exa: Schema.boolean().default(ON_BY_DEFAULT.exa).volatile(),
    parallel: Schema.boolean().default(ON_BY_DEFAULT.parallel).volatile(),
    anysearch: Schema.boolean().default(ON_BY_DEFAULT.anysearch).volatile(),
    codexModel: Schema.string().volatile(),
    openaiModel: Schema.string().volatile(),
    geminiModel: Schema.string().volatile(),
});
/** The pi-ai providers behind the hosted tiers' routes, built once each. */
function piProviders() {
    const factories = {
        [ROUTE.codex]: openaiCodexProvider,
        [ROUTE.openai]: openaiProvider,
        [ROUTE.gemini]: googleProvider,
    };
    const built = new Map();
    return (route) => {
        if (!Object.hasOwn(factories, route))
            return undefined;
        let provider = built.get(route);
        if (provider === undefined)
            built.set(route, provider = factories[route]());
        return provider;
    };
}
let WebAccess = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _searchModels_decorators;
    return class WebAccess extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _searchModels_decorators = [Remote];
            __esDecorate(this, null, _searchModels_decorators, { kind: "method", name: "searchModels", static: false, private: false, access: { has: obj => "searchModels" in obj, get: obj => obj.searchModels }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        // Only the web service is required: without settings, credentials or llm the hosted tiers are simply not set up.
        static inject = ['web', 'typert'];
        static Config = Config;
        routes = __runInitializers(this, _instanceExtraInitializers);
        constructor(ctx, config) {
            super(ctx, SERVICE);
            registerHost(ctx, WEB_ACCESS_REMOTE);
            const log = {
                info: (message) => { ctx.logger.info(message); },
                warn: (message) => { ctx.logger.warn(message); },
            };
            this.routes = createRoutes({
                providers() {
                    const value = ctx.get('settings')?.describe().find(entry => entry.ns === PI_AI)?.value;
                    return isObject(value) && isObject(value['providers']) ? value['providers'] : undefined;
                },
                credentials: () => ctx.get('credentials'),
                llm: () => ctx.get('llm'),
                piProvider: piProviders(),
                env: name => process.env[name],
            });
            ctx.web.registerSearchProvider(createSearchProvider({
                id: ROW,
                enabled: () => TIERS.filter(tier => config[tier].get()),
                tiers: {
                    ...hostedTiers({
                        routes: this.routes,
                        chosenModel: (tier) => {
                            const model = config[MODEL_FIELD[tier]].get()?.trim();
                            return model === '' ? undefined : model;
                        },
                        log,
                    }),
                    exa: exaTier(),
                    parallel: parallelTier(),
                    anysearch: anysearchTier(),
                },
                log,
            }));
        }
        async searchModels() {
            const entries = await Promise.all(HOSTED_TIERS.map(async (tier) => [tier, await this.routes.models(ROUTE[tier]) ?? null]));
            return Object.fromEntries(entries);
        }
    };
})();
export default WebAccess;
