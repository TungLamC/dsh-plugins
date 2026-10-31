/**
 * The pi-ai catalog dsh serves, read from the pi-ai this plugin loads, which the
 * row checks is dsh's own (kit/pi-ai-identity.ts). A route is one llm-pi-ai
 * serves from the catalog: a provider with chat models.
 */
import { builtinProviders, getBuiltinModels } from '@earendil-works/pi-ai/providers/all';
export function installedCatalog() {
    let providers;
    return {
        route(provider) {
            providers ??= new Map(builtinProviders().map(entry => [entry.id, entry]));
            const entry = providers.get(provider);
            const models = entry === undefined ? [] : getBuiltinModels(entry.id);
            if (entry === undefined || models.length === 0)
                return undefined;
            const apis = new Set(models.map(model => model.api));
            const route = {
                models: new Map(models.map(model => [model.id, { name: model.name }])),
                ...apis.size === 1 ? { api: [...apis][0] } : {},
                ...entry.baseUrl === undefined ? {} : { baseUrl: entry.baseUrl },
            };
            return route;
        },
    };
}
