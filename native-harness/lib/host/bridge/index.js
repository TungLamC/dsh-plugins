/**
 * TurnBridge: lets a dsh agent loop display and steer a native harness turn.
 *
 * Interface:
 * - `stream` serves the hidden provider; one call is one dsh step and shows one
 *   native main-loop model call (text, reasoning, tool calls, that call's usage).
 * - `observe` serves the observation tool; it waits for the native outcome of a
 *   tool the harness already ran and never executes anything.
 * - `inboxInserted` / `sessionEvent` are the dsh notifications it needs.
 *
 * Invariants: one dsh user message reaches the native harness at most once;
 * steps without forwardable input and without a running native turn end
 * immediately; cancelling a step or an observation interrupts the native turn.
 */
import { randomUUID } from 'node:crypto';
import { Conversation } from "./conversation.js";
import { composeInput, isForwardable, pendingInputs } from "./input.js";
import { RetryCard } from "./retry.js";
import { callIdOf, StepWriter, TODO_TOOL, todoArgs } from "./steps.js";
const reasonOf = (origin) => (origin === 'user' ? 'queued' : 'native');
export function createTurnBridge(deps) {
    const conversations = new Map();
    const opening = new Map();
    /** The step each session's model call belongs to, from its latest `step/start`. */
    const positions = new Map();
    async function conversation(agent, signal) {
        const current = conversations.get(agent.id);
        if (current && !current.conversation.closed)
            return current;
        const pending = opening.get(agent.id);
        if (pending)
            return pending;
        const harness = deps.harnessOf(agent);
        if (!harness)
            throw new Error('This session is not run by a native harness');
        const task = (async () => {
            await deps.prepare(agent);
            const opened = await deps.open(agent, harness, signal);
            const created = new Conversation(opened.native, opened.forwarded, {
                nativeTurn: (origin) => deps.startTurn(agent, reasonOf(origin)),
                quiet: () => created.scheduleIdle(deps.idleMs, () => void deps.closeSession(agent.id)),
                ref: (ref) => void deps.saveRef(agent.id, harness, ref).catch((error) => deps.log(String(error))),
                mode: (mode) => void deps.saveMode(agent.id, harness, mode).catch((error) => deps.log(String(error))),
                endpoint: (endpoint) => void deps.saveEndpoint(agent.id, harness, endpoint).catch((error) => deps.log(String(error))),
                log: deps.log,
            });
            if (opened.notice)
                created.notice = opened.notice;
            const entry = { harness, conversation: created };
            conversations.set(agent.id, entry);
            return entry;
        })();
        opening.set(agent.id, task);
        try {
            return await task;
        }
        finally {
            opening.delete(agent.id);
        }
    }
    async function forward(agent, harness, conv, inputs, mode, signal) {
        const ids = inputs.flatMap((input) => (input.id ? [input.id] : []));
        for (const id of ids)
            conv.forwarded.add(id);
        try {
            const input = await composeInput(ids[0] ?? randomUUID(), inputs, {
                image: deps.image,
                command: (token) => deps.command(agent, harness, token, signal),
            });
            // A step cancelled while its input was being prepared must not start native work.
            signal.throwIfAborted();
            await conv.native.send(input, mode, signal);
        }
        catch (error) {
            for (const id of ids)
                conv.forwarded.delete(id);
            throw error;
        }
        await deps.markForwarded(agent.id, harness, ids);
    }
    return {
        async *stream(options) {
            const signal = options.signal ?? new AbortController().signal;
            if (options.purpose)
                throw new Error(`Native harness sessions do not serve ${options.purpose} requests`);
            const agent = options.sessionId ? deps.agent(options.sessionId) : undefined;
            if (!agent)
                throw new Error('The native harness request has no live session');
            // Nothing to send and no native session running or opening: a dsh notice step (e.g. a permission change).
            const current = conversations.get(agent.id);
            if (!pendingInputs(options.messages).length && (!current || current.conversation.closed) && !opening.has(agent.id)) {
                yield* new StepWriter().finish();
                return;
            }
            const { harness, conversation: conv } = await conversation(agent, signal);
            signal.throwIfAborted();
            if (conv.streaming)
                throw new Error('A step of this session is already streaming');
            conv.streaming = true;
            conv.cancelIdle();
            const step = new StepWriter();
            const retries = new RetryCard(agent, options.provider, () => positions.get(agent.id), deps.log);
            try {
                const fresh = pendingInputs(options.messages).filter((input) => !input.id || !conv.forwarded.has(input.id));
                if (fresh.length) {
                    // After a stop, new input starts a new turn only once the interrupted one has ended.
                    if (conv.draining)
                        await conv.drained(signal);
                    conv.consuming = true;
                    await forward(agent, harness, conv, fresh, conv.turnActive ? 'steer' : 'turn', signal);
                }
                else if (!conv.turnActive && !conv.hasQueued) {
                    // A step opened by a dsh notice (permission or model change): nothing to run.
                    yield* step.finish();
                    return;
                }
                conv.consuming = true;
                if (conv.notice) {
                    yield* step.text('notice', 'text', `${conv.notice}\n\n`);
                    conv.notice = undefined;
                }
                while (true) {
                    const event = await conv.next(signal);
                    if (event.type === 'notice')
                        yield* step.text(`notice:${randomUUID()}`, 'text', `${event.text}\n\n`);
                    else if (event.type === 'retry')
                        retries.scheduled(event.retry);
                    else if (event.type === 'call-start')
                        retries.answered();
                    else if (event.type === 'delta')
                        yield* step.text(`${event.call}:${event.key}`, event.block, event.text);
                    // dsh's todo tool keeps the list; the preset mounts it and it executes at once.
                    else if (event.type === 'todos')
                        yield* step.tool(callIdOf(event.id), todoArgs(event.todos), TODO_TOOL);
                    else if (event.type === 'tool-start')
                        yield* step.tool(callIdOf(event.tool), JSON.stringify({ harness, tool: event.tool, activity: event.activity }));
                    else if (event.type === 'call-end') {
                        if (event.usage)
                            step.usage = event.usage;
                        if (event.contextWindow)
                            deps.contextWindow(options.provider, options.model, event.contextWindow);
                        if (step.tools)
                            break;
                        // A call without tool use ends the dsh turn; if the native turn continues with
                        // another call, show it in a new dsh turn so each step keeps one call's usage.
                        const following = await conv.next(signal);
                        if (following.type === 'turn-end') {
                            conv.unshift(following);
                            continue;
                        }
                        conv.unshift(following);
                        conv.consuming = false;
                        queueMicrotask(() => deps.startTurn(agent, 'continued'));
                        break;
                    }
                    else if (event.type === 'turn-end') {
                        conv.consuming = false;
                        if (event.outcome === 'failed')
                            yield* step.text('error', 'text', `\n\n⚠ ${event.error ?? 'The native turn failed.'}`);
                        if (event.outcome === 'completed' && event.cut) {
                            conv.pendingCut = event.cut;
                            conv.finalSeq = undefined;
                        }
                        // A native turn that started right behind this one needs its own dsh turn.
                        if (conv.hasQueued) {
                            const reason = reasonOf(conv.queuedOrigin);
                            queueMicrotask(() => deps.startTurn(agent, reason));
                        }
                        else
                            conv.scheduleIdle(deps.idleMs, () => void deps.closeSession(agent.id));
                        break;
                    }
                }
                yield* step.finish();
            }
            catch (error) {
                if (signal.aborted)
                    void conv.interrupt();
                throw error;
            }
            finally {
                retries.close();
                conv.streaming = false;
                // Covers cancels before any native turn began, which never produce a turn-end.
                if (!conv.turnActive && !conv.consuming)
                    conv.scheduleIdle(deps.idleMs, () => void deps.closeSession(agent.id));
            }
        },
        async observe(args, exec) {
            const entry = exec.agent ? conversations.get(exec.agent.id) : undefined;
            const state = entry?.conversation.tools.get(args.tool);
            if (!entry || !state)
                return { status: 'unknown' };
            entry.conversation.cancelIdle();
            let stop;
            const aborted = new Promise((resolve) => {
                stop = () => resolve(undefined);
                if (exec.signal.aborted)
                    resolve(undefined);
                else
                    exec.signal.addEventListener('abort', stop, { once: true });
            });
            try {
                const outcome = await Promise.race([state.done.promise, aborted]);
                if (outcome)
                    return outcome;
                void entry.conversation.interrupt();
                return { status: 'interrupted' };
            }
            finally {
                exec.signal.removeEventListener('abort', stop);
                entry.conversation.tools.delete(args.tool);
            }
        },
        inboxInserted(agent, message) {
            const entry = conversations.get(agent.id);
            if (!entry)
                return;
            const conv = entry.conversation;
            if (!conv.turnActive || !conv.consuming || conv.forwarded.has(message.id))
                return;
            if (!isForwardable(message.source))
                return;
            if (!agent.inbox.nextStep.some((pending) => pending.id === message.id))
                return;
            const controller = new AbortController();
            const untrack = conv.track(controller);
            void forward(agent, entry.harness, conv, [{ id: message.id, content: message.content }], 'steer', controller.signal)
                .catch((error) => {
                if (!controller.signal.aborted)
                    deps.log(`steer failed: ${String(error)}`);
            })
                .finally(untrack);
        },
        sessionEvent(sessionId, event) {
            if (event.type === 'step/start')
                positions.set(sessionId, { turn: event.data.turn, step: event.data.step });
            const entry = conversations.get(sessionId);
            const conv = entry?.conversation;
            if (!entry || !conv?.pendingCut)
                return;
            if (event.type === 'assistant/message' && !conv.finalSeq) {
                conv.finalSeq = { seq: event.seq, turn: event.data.turn };
                return;
            }
            if (event.type === 'turn/end' && conv.finalSeq && event.data.turn === conv.finalSeq.turn) {
                const cut = conv.pendingCut;
                const seq = conv.finalSeq.seq;
                conv.pendingCut = undefined;
                conv.finalSeq = undefined;
                if (event.data.reason.kind === 'completed')
                    void deps.committed(sessionId, entry.harness, seq, cut).catch((error) => deps.log(String(error)));
            }
        },
        async forget(sessionId) {
            const entry = conversations.get(sessionId);
            if (entry)
                void entry.conversation.interrupt();
            conversations.delete(sessionId);
            positions.delete(sessionId);
            await deps.closeSession(sessionId);
        },
    };
}
