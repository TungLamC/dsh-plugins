/** The main row's Remote contract: which parts are running, so the browser shows exactly their UI. */
import { MODULE, PARTS, SERVICE } from "./ids.js";
import { defineRemote } from "./remote.js";
export const NO_PARTS = Object.freeze(Object.fromEntries(PARTS.map(part => [part, false])));
export function samePresence(a, b) {
    return PARTS.every(part => a[part] === b[part]);
}
export const MAIN_REMOTE = defineRemote(MODULE.main, SERVICE.main, {
    watchParts: { params: [], stream: true, signal: true },
});
