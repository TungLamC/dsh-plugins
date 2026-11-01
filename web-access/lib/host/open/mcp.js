/**
 * One `tools/call` to a public MCP search endpoint over HTTP, as Exa and
 * Parallel serve them without a key: the JSON-RPC reply comes as a JSON body or
 * inside a server-sent event.
 *
 * The request and the reading of replies follow pi-web-access 0.46.0
 * (`exa.ts`, `parallel-mcp.ts`), Copyright (c) 2025 Nico Bailon, MIT License;
 * see THIRD_PARTY_NOTICES.md.
 */
import { httpFailure, isObject, parseJson, postJson, sseData } from "../kit/http.js";
import { toSource, uniqueSources } from "../kit/sources.js";
/** The JSON-RPC reply in a body: the body itself, or the first event carrying one. */
function replyIn(body) {
    for (const candidate of [body.trim(), ...sseData(body)]) {
        const parsed = parseJson(candidate);
        if (isObject(parsed) && ('result' in parsed || 'error' in parsed))
            return parsed;
    }
    return undefined;
}
export async function callTool(endpoint, tool, args, headers, signal) {
    const response = await postJson(endpoint, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: tool, arguments: args } }, {
        accept: 'application/json, text/event-stream',
        ...headers,
    }, signal);
    if (!response.ok)
        throw await httpFailure(response);
    const reply = replyIn(await response.text());
    if (reply === undefined)
        throw new Error('the reply is not a JSON-RPC response');
    if (isObject(reply['error'])) {
        const { code, message } = reply['error'];
        throw new Error(`MCP error${typeof code === 'number' ? ` ${code}` : ''}: ${typeof message === 'string' ? message : 'unknown'}`);
    }
    const result = isObject(reply['result']) ? reply['result'] : {};
    const content = Array.isArray(result['content']) ? result['content'] : [];
    const text = content.filter(isObject).map(item => item['type'] === 'text' && typeof item['text'] === 'string' ? item['text'].trim() : '').find(item => item !== '');
    if (result['isError'] === true)
        throw new Error(text ?? 'the tool reported an error');
    const data = isObject(result['structuredContent']) ? result['structuredContent'] : text === undefined ? undefined : parseJson(text);
    return { data, text, meta: isObject(result['_meta']) ? result['_meta'] : {} };
}
/**
 * Sources from the plain-text result format: one block per result, starting
 * with a `Title:` line, with `URL:` and optional `Published:` lines, then the
 * page text after `Text:` or `Highlights:`. Only the lines before the page
 * text are read as fields, so a quoted "URL:" inside a page is not taken for one.
 */
export function textResults(text) {
    return uniqueSources(text.split(/^(?=Title: )/m).map((block) => {
        const body = /^(?:Text: |Highlights:\s*$)/m.exec(block);
        const header = body === null ? block : block.slice(0, body.index);
        const field = (name) => new RegExp(`^${name}: (.*)$`, 'm').exec(header)?.[1];
        const excerpt = body === null ? undefined : block.slice(body.index + body[0].length).replace(/\n-{3,}\s*$/, '');
        return toSource({ url: field('URL'), title: field('Title'), snippet: excerpt, publishedAt: field('Published') });
    }));
}
/** The result count to ask a service for: the request's, within what the services accept. */
export function resultCount(maxResults) {
    return Math.min(20, Math.max(1, Math.floor(maxResults ?? 8)));
}
