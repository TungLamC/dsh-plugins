/** Durable per-session state: harness settings, native identity, fork checkpoints. */
import { z } from 'zod';
export const CHECKPOINT_LIMIT = 64;
export const FORWARDED_LIMIT = 64;
const harness = z.enum(['claude-code', 'codex', 'antigravity']);
const ref = z.object({ harness, id: z.string().min(1) });
const recordSchema = z.object({
    harness,
    settings: z.object({
        model: z.string().optional(),
        effort: z.string().optional(),
        mode: z.string().optional(),
        fast: z.boolean().optional(),
        endpoint: z.string().optional(),
    }),
    ref: ref.optional(),
    adopted: z.object({ id: z.string().min(1), title: z.string(), fork: z.boolean() }).optional(),
    lastEndpoint: z.string().optional(),
    cwd: z.string().min(1).optional(),
    checkpoints: z
        .array(z.object({ seq: z.number().int().nonnegative(), cut: z.object({ ref, at: z.string().min(1) }) }))
        .max(CHECKPOINT_LIMIT),
    forwarded: z.array(z.string()).max(FORWARDED_LIMIT),
});
const DOMAIN = {
    name: 'native_harness',
    version: 1,
    layout: 'per-record',
    tables: { sessions: { valueSchema: recordSchema } },
};
/** Keep bounded lists bounded before every write. */
export function normalize(record) {
    return {
        ...record,
        checkpoints: record.checkpoints.slice(-CHECKPOINT_LIMIT),
        forwarded: record.forwarded.slice(-FORWARDED_LIMIT),
    };
}
function serialized(read, write) {
    const chains = new Map();
    return {
        update(id, change) {
            const task = (chains.get(id) ?? Promise.resolve())
                .catch(() => undefined)
                .then(async () => {
                const next = normalize(change(await read(id)));
                await write(id, next);
                return next;
            });
            chains.set(id, task);
            void task.finally(() => {
                if (chains.get(id) === task)
                    chains.delete(id);
            }).catch(() => undefined);
            return task;
        },
        async settle() {
            await Promise.allSettled(chains.values());
        },
    };
}
export function openSessionStore(domains) {
    const opening = domains.open(DOMAIN);
    const table = async () => (await opening).table('sessions');
    const read = async (id) => (await (await table()).get(id));
    const updates = serialized(read, async (id, record) => {
        await (await table()).put(id, JSON.parse(JSON.stringify(record)));
    });
    return {
        read,
        update: updates.update,
        async close() {
            await updates.settle();
            await (await opening.catch(() => undefined))?.close();
        },
    };
}
/** In-memory store with the same serialization contract, for tests. */
export function memoryStore() {
    const records = new Map();
    const read = async (id) => structuredClone(records.get(id));
    const updates = serialized(read, async (id, record) => {
        records.set(id, structuredClone(record));
    });
    return { records, read, update: updates.update, close: updates.settle };
}
export function emptyRecord(harness) {
    return { harness, settings: {}, checkpoints: [], forwarded: [] };
}
