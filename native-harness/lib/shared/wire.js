/** Plugin-owned Remote methods shared by the Host service and the browser bundle. */
import { z } from 'zod';
export const PACKAGE = 'dsh-native-harness';
export const SERVICE = 'nativeHarness';
const parameter = (name, schema) => ({
    name,
    wire: name,
    source: 'json',
    codec: { mode: 'strict', typeSymbol: `${PACKAGE}:${name}`, create: () => schema },
});
const session = parameter('sessionId', z.string().regex(/^session-[A-Za-z0-9_-]{1,180}$/));
const optionalId = z.string().min(1).max(200).nullable().optional();
const task = parameter('taskId', z.string().min(1).max(200));
const change = parameter('change', z
    .object({ model: optionalId, effort: optionalId, mode: optionalId, fast: z.boolean().nullable().optional(), endpoint: optionalId })
    .strict());
/** Claude session ids are UUIDs; a pick names one and how to take it over, null cancels. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const choice = parameter('choice', z.object({ id: z.string().regex(UUID), fork: z.boolean() }).strict().nullable());
export const REMOTE = {
    package: PACKAGE,
    descriptors: [
        { method: 'view', parameters: [session] },
        { method: 'select', parameters: [session, change] },
        { method: 'commands', parameters: [session] },
        { method: 'tasks', parameters: [session] },
        { method: 'stopTask', parameters: [session, task] },
        { method: 'icons', parameters: [] },
        { method: 'terminalSessions', parameters: [session] },
        { method: 'adopt', parameters: [session, choice] },
    ].map(({ method, ...rest }) => ({
        id: `${PACKAGE}#${SERVICE}/${method}`,
        service: SERVICE,
        namespace: SERVICE,
        method,
        invocation: { kind: 'direct' },
        result: { mode: 'src-json' },
        cancellation: { parameter: 'signal' },
        ...rest,
    })),
};
