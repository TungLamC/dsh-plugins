/**
 * A search through the Responses API's built-in `web_search` tool, as the
 * Codex backend and the OpenAI API both serve it: the model searches, then
 * writes a short answer citing what it found.
 *
 * The request and the reading of replies follow pi-web-access 0.46.0
 * (`openai-search.ts`), Copyright (c) 2025 Nico Bailon, MIT License; see THIRD_PARTY_NOTICES.md.
 */
import { describeError, httpFailure, isObject, parseJson, postJson, redact, sseData } from "../kit/http.js";
import { toSource, uniqueSources } from "../kit/sources.js";
const INSTRUCTIONS = 'Search the web for the query, then answer concisely using only what the results say. '
    + 'Cite the sources you use as markdown links.';
/** Most sources the instructions ask for. */
const MAX_SOURCES = 20;
export async function searchResponses(target, request, signal) {
    try {
        const wanted = request.maxResults === undefined ? '' : ` Draw on about ${Math.min(request.maxResults, MAX_SOURCES)} distinct sources.`;
        const response = await postJson(target.url, {
            model: target.model,
            instructions: INSTRUCTIONS + wanted,
            input: [{ role: 'user', content: [{ type: 'input_text', text: request.query }] }],
            tools: [{ type: 'web_search' }],
            tool_choice: 'required',
            include: ['web_search_call.action.sources'],
            ...target.effort === undefined ? {} : { reasoning: { effort: target.effort } },
            store: false,
            stream: true,
        }, { accept: 'text/event-stream', ...target.headers }, signal);
        if (!response.ok)
            throw await httpFailure(response, target.secrets);
        const output = outputOf(await response.text());
        if (!output.some(item => item['type'] === 'web_search_call'))
            throw new Error('the model answered without searching');
        const answer = answerOf(output);
        return { ...answer === undefined ? {} : { content: answer }, sources: sourcesOf(output), truncated: false };
    }
    catch (error) {
        signal.throwIfAborted();
        throw new Error(redact(describeError(error), target.secrets));
    }
}
/** The failure a reply reports, as `type/code: message`. */
function failure(error) {
    const fields = isObject(error) ? error : {};
    const kind = [fields['type'], fields['code']].filter(part => typeof part === 'string' && part !== '').join('/');
    const message = typeof fields['message'] === 'string' && fields['message'] !== '' ? fields['message'] : 'the response failed';
    return new Error(kind === '' ? message : `${kind}: ${message}`);
}
/** A final response's output; throws when it failed. */
function settled(response) {
    if (isObject(response['error']))
        throw failure(response['error']);
    if (response['status'] === 'failed' || response['status'] === 'cancelled')
        throw failure(undefined);
    return Array.isArray(response['output']) ? response['output'].filter(isObject) : [];
}
/** The response's output items, from an event stream, or from a JSON body when the endpoint answers without one. */
function outputOf(body) {
    const json = body.trimStart().startsWith('{') ? parseJson(body) : undefined;
    if (isObject(json))
        return settled(isObject(json['response']) ? json['response'] : json);
    const done = [];
    let final;
    for (const data of sseData(body)) {
        const event = parseJson(data);
        if (!isObject(event))
            continue;
        switch (event['type']) {
            case 'error':
                throw failure(isObject(event['error']) ? event['error'] : event);
            case 'response.failed':
                throw failure(isObject(event['response']) ? event['response']['error'] : undefined);
            case 'response.output_item.done':
                if (isObject(event['item']))
                    done.push(event['item']);
                break;
            case 'response.completed':
            case 'response.incomplete':
            case 'response.done':
                if (isObject(event['response']))
                    final = settled(event['response']);
                break;
        }
    }
    // A stream cut short, by a proxy say, may hold only the start of a search.
    if (final === undefined)
        throw new Error('the response ended before it completed');
    return final.length > 0 ? final : done;
}
function textParts(item) {
    return Array.isArray(item['content']) ? item['content'].filter(isObject).filter(part => part['type'] === 'output_text') : [];
}
/** The last message's text: earlier ones only announce a search. */
function answerOf(output) {
    const last = output.filter(item => item['type'] === 'message' && textParts(item).length > 0).at(-1);
    const text = last === undefined ? '' : textParts(last).map(part => typeof part['text'] === 'string' ? part['text'] : '').join('').trim();
    return text === '' ? undefined : text;
}
/** The URL without the `utm_source=openai` the tool appends. */
function cleanUrl(url) {
    if (typeof url !== 'string')
        return url;
    try {
        const parsed = new URL(url);
        if (parsed.searchParams.get('utm_source') !== 'openai')
            return url;
        parsed.searchParams.delete('utm_source');
        return parsed.toString();
    }
    catch {
        return url;
    }
}
/**
 * The sources the answer cites, then the others the searches read. The text
 * around a citation is the model's own writing, not the page's, so it is left
 * in the answer rather than given as a snippet.
 */
function sourcesOf(output) {
    const cited = output.filter(item => item['type'] === 'message').flatMap(textParts).flatMap((part) => {
        const annotations = Array.isArray(part['annotations']) ? part['annotations'].filter(isObject) : [];
        return annotations.filter(note => note['type'] === 'url_citation').map(note => toSource({ url: cleanUrl(note['url']), title: note['title'] }));
    });
    const read = output.filter(item => item['type'] === 'web_search_call').flatMap((item) => {
        const action = isObject(item['action']) ? item['action'] : {};
        const listed = [action['sources'], item['sources'], item['results']].flatMap(list => Array.isArray(list) ? list.filter(isObject) : []);
        return listed.map(entry => toSource({ url: cleanUrl(entry['url'] ?? entry['source_website_url']), title: entry['title'] ?? entry['caption'] }));
    });
    return uniqueSources([...cited, ...read]);
}
