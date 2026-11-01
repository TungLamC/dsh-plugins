/**
 * The hosted tiers: each runs one route of the Models page, with the model
 * chosen on the settings page or else the one `models.ts` picks.
 *
 * - codex: the ChatGPT Codex backend, signed in with a ChatGPT account (route `openai-codex`).
 * - openai: the OpenAI API, with an API key or a ChatGPT sign-in (route `openai`).
 * - gemini: the Gemini API, with an API key (route `google`).
 */
import { searchGemini } from "./gemini.js";
import { pickGeminiModel, pickGptModel } from "./models.js";
import { searchResponses } from "./responses.js";
/** The route each hosted tier runs. */
export const ROUTE = {
    codex: 'openai-codex',
    openai: 'openai',
    gemini: 'google',
};
/** The reasoning effort the Responses tiers ask for when the model offers it: the lowest `web_search` accepts (it refuses `minimal`). */
const SEARCH_EFFORT = 'low';
/** The JWT claim holding the ChatGPT account, as pi-ai reads it. */
const AUTH_CLAIM = 'https://api.openai.com/auth';
/** The ChatGPT account a Codex access token acts for. */
function accountOf(token) {
    try {
        const claims = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'));
        const auth = typeof claims === 'object' && claims !== null ? claims[AUTH_CLAIM] : undefined;
        const id = typeof auth === 'object' && auth !== null ? auth['chatgpt_account_id'] : undefined;
        return typeof id === 'string' && id !== '' ? id : undefined;
    }
    catch {
        return undefined;
    }
}
async function searchEffort(route, model, signal) {
    return (await route.efforts(model, signal)).includes(SEARCH_EFFORT) ? SEARCH_EFFORT : undefined;
}
const SPECS = {
    codex: {
        pick: pickGptModel,
        async connect(route, model, signal) {
            const account = accountOf(route.token);
            if (account === undefined)
                throw new Error('the ChatGPT sign-in names no account');
            const effort = await searchEffort(route, model, signal);
            const target = {
                url: `${route.baseUrl}/codex/responses`,
                // As pi-ai sends Codex requests; Codex expects an originator on every request.
                headers: { ...route.headers, authorization: `Bearer ${route.token}`, 'chatgpt-account-id': account, originator: 'pi', 'openai-beta': 'responses=experimental' },
                model,
                ...effort === undefined ? {} : { effort },
                secrets: [route.token],
            };
            return (request, searchSignal) => searchResponses(target, request, searchSignal);
        },
    },
    openai: {
        pick: pickGptModel,
        async connect(route, model, signal) {
            const effort = await searchEffort(route, model, signal);
            const target = {
                url: `${route.baseUrl}/responses`,
                headers: { ...route.headers, authorization: `Bearer ${route.token}` },
                model,
                ...effort === undefined ? {} : { effort },
                secrets: [route.token],
            };
            return (request, searchSignal) => searchResponses(target, request, searchSignal);
        },
    },
    gemini: {
        pick: pickGeminiModel,
        async connect(route, model) {
            const target = {
                url: `${route.baseUrl}/models/${encodeURIComponent(model)}:generateContent`,
                headers: { ...route.headers, 'x-goog-api-key': route.token },
                secrets: [route.token],
            };
            return (request, searchSignal) => searchGemini(target, request, searchSignal);
        },
    },
};
export function hostedTiers(options) {
    const tier = (id) => ({
        hosted: true,
        async prepare(signal) {
            const route = await options.routes.open(ROUTE[id], signal);
            if (route === undefined)
                return undefined;
            const chosen = options.chosenModel(id);
            const listed = chosen === undefined ? undefined : route.models.find(model => model.id === chosen);
            if (chosen !== undefined && listed === undefined) {
                options.log.info(`web search: ${id} model ${chosen} is not on route ${ROUTE[id]} any more; picking one`);
            }
            const model = listed ?? SPECS[id].pick(route.models);
            if (model === undefined)
                throw new Error(`route ${ROUTE[id]} has no model to search with; choose one on the plugin's page`);
            return SPECS[id].connect(route, model.id, signal);
        },
    });
    return { codex: tier('codex'), openai: tier('openai'), gemini: tier('gemini') };
}
