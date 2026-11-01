/** What the tiers share about HTTP: posting JSON, reading event streams, and failures that never carry a secret. */
/** Longest stretch of a response body an error quotes. */
const QUOTED_BODY = 300;
export function isObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function describeError(error) {
    return error instanceof Error ? error.message : String(error);
}
/** The text with every secret in it masked, for errors and logs. */
export function redact(text, secrets) {
    let masked = text;
    for (const secret of secrets) {
        if (secret !== '')
            masked = masked.replaceAll(secret, '***');
    }
    return masked;
}
/**
 * POST a JSON body. A request carrying a credential never follows a redirect,
 * so the credential cannot reach another host; the services here answer in place.
 */
export function postJson(url, body, headers, signal) {
    return fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
        redirect: 'error',
        signal,
    });
}
/** The failure a non-2xx response stands for, quoting the start of its body with the request's secrets masked. */
export async function httpFailure(response, secrets = []) {
    const text = await response.text().catch(() => '');
    const body = redact(text, secrets).replace(/\s+/g, ' ').trim().slice(0, QUOTED_BODY);
    return new Error(body === '' ? `HTTP ${response.status}` : `HTTP ${response.status}: ${body}`);
}
/** The data of each event in a server-sent event stream, an event's `data:` lines joined; events without data are left out. */
export function sseData(stream) {
    const events = [];
    for (const block of stream.split(/\r?\n\r?\n/)) {
        const lines = block.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(line.startsWith('data: ') ? 6 : 5));
        const data = lines.join('\n').trim();
        if (data !== '')
            events.push(data);
    }
    return events;
}
/** JSON text parsed, or undefined when it is not JSON. */
export function parseJson(text) {
    try {
        return JSON.parse(text);
    }
    catch {
        return undefined;
    }
}
