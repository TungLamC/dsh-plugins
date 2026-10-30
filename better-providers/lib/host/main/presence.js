/**
 * Which parts are running. A part counts as present exactly while its service is
 * provided by an active row, which is when its Remote namespace is callable: a
 * disabled row, one waiting on a missing dependency, and one that failed to start
 * all count as absent.
 */
import { PARTS, SERVICE } from "../../shared/ids.js";
import { NO_PARTS, samePresence } from "../../shared/main.wire.js";
import { cell } from "../kit/cell.js";
export function trackParts(ctx) {
    const presence = cell(NO_PARTS, samePresence);
    for (const part of PARTS) {
        ctx.inject([SERVICE[part]], (child) => {
            presence.set({ ...presence.get(), [part]: true });
            child.effect(() => () => { presence.set({ ...presence.get(), [part]: false }); }, `presence of ${part}`);
        });
    }
    return presence;
}
