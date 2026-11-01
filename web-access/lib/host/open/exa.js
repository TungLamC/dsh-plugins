/**
 * Exa, through its public MCP endpoint: no key, requests limited per IP.
 *
 * The request and the reading of replies follow pi-web-access 0.46.0
 * (`exa.ts`), Copyright (c) 2025 Nico Bailon, MIT License; see THIRD_PARTY_NOTICES.md.
 */
import { PACKAGE } from "../../shared/ids.js";
import { isObject } from "../kit/http.js";
import { toSource, uniqueSources } from "../kit/sources.js";
import { callTool, resultCount, textResults } from "./mcp.js";
const TOOL = 'web_search_exa';
const ENDPOINT = `https://mcp.exa.ai/mcp?tools=${TOOL}`;
export function exaTier() {
    return {
        hosted: false,
        prepare: async () => async (request, signal) => {
            const result = await callTool(ENDPOINT, TOOL, { query: request.query, numResults: resultCount(request.maxResults) }, { 'x-exa-source': PACKAGE }, signal);
            // A limited request still succeeds, with this flag and a notice in place of results.
            if (result.meta['ai.exa/rateLimited'] === true)
                throw new Error('rate limited: the keyless endpoint limits requests per IP');
            if (isObject(result.data) && Array.isArray(result.data['results'])) {
                const sources = result.data['results'].filter(isObject).map((item) => {
                    const highlights = Array.isArray(item['highlights']) ? item['highlights'].filter(entry => typeof entry === 'string') : [];
                    return toSource({ url: item['url'], title: item['title'], snippet: highlights.length > 0 ? highlights.join(' … ') : item['text'], publishedAt: item['publishedDate'] });
                });
                return { sources: uniqueSources(sources), truncated: false };
            }
            if (result.text === undefined)
                throw new Error('the reply has no results');
            const sources = textResults(result.text);
            if (sources.length === 0)
                throw new Error(`no results could be read from the reply: ${result.text.slice(0, 200)}`);
            return { sources, truncated: false };
        },
    };
}
