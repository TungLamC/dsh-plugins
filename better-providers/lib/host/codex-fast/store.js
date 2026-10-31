/**
 * The switches kept in dsh's storage domain. The storage sits in dsh's home, so
 * every profile's dsh process shares it: each session's switch is a document of
 * its own, and two processes never rewrite each other's sessions.
 */
import { z } from 'zod';
export const SWITCHES = {
    name: 'better_providers_codex_fast',
    version: 1,
    layout: 'per-record',
    // A switch is cheap to lose: a record that no longer reads is set aside and the session starts from the default again.
    invalidRecords: 'backup-and-skip',
    tables: {
        sessions: { valueSchema: z.object({ enabled: z.boolean() }) },
    },
};
export function openSwitches(domains) {
    // The schema is this plugin's zod, typed apart from the copy dsh's storage names; storage only calls its parse.
    const opening = domains.open(SWITCHES);
    const store = opening.then((domain) => {
        const sessions = domain.table('sessions');
        return {
            get: sessionId => sessions.get(sessionId)?.enabled,
            put: (sessionId, enabled) => sessions.put(sessionId, { enabled }),
        };
    });
    return {
        store,
        async close() {
            const domain = await opening.catch(() => undefined);
            await domain?.close();
        },
    };
}
