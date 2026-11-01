/** Turning what a service returns into dsh's citeable sources. */
/** Longest snippet a source keeps. */
const SNIPPET_LENGTH = 300;
/** A string with its whitespace collapsed, or undefined when nothing is left. */
function text(value) {
    if (typeof value !== 'string')
        return undefined;
    const collapsed = value.replace(/\s+/g, ' ').trim();
    return collapsed === '' ? undefined : collapsed;
}
/**
 * A source from the fields a service named, or undefined without an http(s) URL.
 * Snippets are page text the service extracted; text a model wrote about the page is not one.
 */
export function toSource(fields) {
    const url = text(fields.url);
    if (url === undefined || !/^https?:\/\//i.test(url))
        return undefined;
    const title = text(fields.title);
    const full = text(fields.snippet);
    const snippet = full !== undefined && full.length > SNIPPET_LENGTH ? `${full.slice(0, SNIPPET_LENGTH - 1)}…` : full;
    // Some services write "N/A" for an unknown date.
    const publishedAt = text(fields.publishedAt);
    return {
        url,
        ...title === undefined ? {} : { title },
        ...snippet === undefined ? {} : { snippet },
        ...publishedAt === undefined || publishedAt === 'N/A' ? {} : { publishedAt },
    };
}
/** The sources in their first order, without missing entries or a second source for the same URL. */
export function uniqueSources(sources) {
    const byUrl = new Map();
    for (const source of sources) {
        if (source !== undefined && !byUrl.has(source.url))
            byUrl.set(source.url, source);
    }
    return [...byUrl.values()];
}
