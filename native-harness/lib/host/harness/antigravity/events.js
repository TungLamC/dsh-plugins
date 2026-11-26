import { boundDiffs, boundInput, boundOutput, } from "../../../shared/activity.js";
import { count, list, object, text } from "../../../shared/types.js";
const KINDS = {
    execute: { kind: 'shell', title: 'Shell' },
    read: { kind: 'read', title: 'Read' },
    edit: { kind: 'edit', title: 'Edit' },
    delete: { kind: 'edit', title: 'Delete' },
    move: { kind: 'edit', title: 'Move' },
    search: { kind: 'search', title: 'Search' },
    fetch: { kind: 'web', title: 'Fetch' },
    think: { kind: 'other', title: 'Think' },
    switch_mode: { kind: 'other', title: 'Switch mode' },
    other: { kind: 'other', title: 'Tool' },
};
/** Merge a `tool_call` or `tool_call_update` into what was known; absent and null fields keep their value. */
export function mergeTool(known, update) {
    const next = { ...(known ?? { id: text(update.toolCallId) }) };
    if (typeof update.title === 'string' && update.title)
        next.title = update.title;
    if (typeof update.name === 'string' && update.name)
        next.name = update.name;
    if (typeof update.kind === 'string' && update.kind in KINDS)
        next.kind = update.kind;
    if (typeof update.status === 'string')
        next.status = update.status;
    if (Array.isArray(update.content))
        next.content = update.content;
    if (Array.isArray(update.locations))
        next.locations = list(update.locations).map((value) => ({ path: text(object(value).path) }));
    if (update.rawInput !== undefined && update.rawInput !== null)
        next.rawInput = update.rawInput;
    if (update.rawOutput !== undefined && update.rawOutput !== null)
        next.rawOutput = update.rawOutput;
    return next;
}
function diffsOf(content) {
    return (content ?? []).flatMap((item) => item.type === 'diff' && item.path ? [{ path: item.path, oldText: item.oldText ?? null, newText: item.newText }] : []);
}
/** Text of `content` blocks; diffs and terminals are not text. */
function contentText(content) {
    return (content ?? [])
        .flatMap((item) => {
        if (item.type !== 'content')
            return [];
        const block = item.content;
        if (block.type === 'text')
            return [block.text];
        if (block.type === 'image')
            return ['[image]'];
        if (block.type === 'resource_link')
            return [block.uri];
        return [];
    })
        .join('\n');
}
export function activityOf(tool) {
    const shape = KINDS[tool.kind ?? 'other'];
    const paths = (tool.locations ?? []).map((location) => location.path).filter(Boolean);
    const diffs = diffsOf(tool.content);
    const summary = (tool.title || paths.join(', ')).split('\n')[0].slice(0, 240);
    return {
        name: tool.name || tool.kind || 'tool',
        kind: shape.kind,
        title: shape.title,
        summary,
        ...(diffs.length ? { diffs: boundDiffs(diffs) } : {}),
        ...(diffs.length || tool.rawInput === undefined ? {} : { input: boundInput(tool.rawInput) }),
    };
}
export function outcomeOf(tool) {
    const raw = tool.rawOutput;
    const output = contentText(tool.content) || (typeof raw === 'string' ? raw : raw === undefined ? '' : JSON.stringify(raw, null, 2));
    const diffs = diffsOf(tool.content);
    return {
        status: tool.status === 'failed' ? 'failed' : 'completed',
        ...(output ? { output: boundOutput(output) } : {}),
        ...(diffs.length ? { diffs: boundDiffs(diffs) } : {}),
    };
}
/** ACP's turn usage (`PromptResponse.usage`, a draft field) in dsh's disjoint buckets; undefined when absent. */
export function turnUsage(value) {
    const usage = object(value);
    if (typeof usage.inputTokens !== 'number' || typeof usage.outputTokens !== 'number')
        return undefined;
    return {
        inputTokens: count(usage.inputTokens),
        outputTokens: count(usage.outputTokens),
        cacheReadTokens: count(usage.cachedReadTokens),
        cacheWriteTokens: count(usage.cachedWriteTokens),
        reasoningTokens: count(usage.thoughtTokens),
        ...(count(usage.totalTokens) ? { totalTokens: count(usage.totalTokens) } : {}),
    };
}
function todoStatus(value) {
    return value === 'completed' ? 'completed' : value === 'in_progress' ? 'in_progress' : 'pending';
}
/** Updates that carry turn content; everything else is session state. */
export function isContent(update) {
    switch (update.sessionUpdate) {
        case 'agent_message_chunk':
        case 'agent_thought_chunk':
            return update.content.type === 'text' && update.content.text.length > 0;
        case 'tool_call':
        case 'tool_call_update':
        case 'plan':
            return true;
        default:
            return false;
    }
}
/** Per-turn mapper: one instance per native turn keeps call and tool state. */
export class AcpTurn {
    call;
    calls = 0;
    plans = 0;
    ran = false;
    turn;
    tools = new Map();
    ended = new Set();
    constructor(turn) {
        this.turn = turn;
    }
    /** Tools of this turn that have started and not ended. */
    unended() {
        return [...this.tools.values()].filter((tool) => !this.ended.has(tool.id));
    }
    /** Tools this turn started. */
    toolIds() {
        return [...this.tools.keys()];
    }
    toolOf(id) {
        return this.tools.get(id);
    }
    activityOf(id) {
        const tool = this.tools.get(id);
        return tool ? activityOf(tool) : undefined;
    }
    open(out) {
        if (!this.call) {
            this.call = `${this.turn}:call-${++this.calls}`;
            out.push({ type: 'call-start', call: this.call });
        }
        return this.call;
    }
    /** The model finished the open call's response; its tools run now. */
    endCall(out, window, usage) {
        if (!this.call)
            return;
        out.push({ type: 'call-end', call: this.call, ...(usage ? { usage } : {}), ...(window ? { contextWindow: window } : {}) });
        this.call = undefined;
    }
    /** Make sure a tool's start precedes anything about it (approvals included). */
    startTool(update, out = []) {
        const id = text(update.toolCallId);
        if (!id)
            return out;
        const known = this.tools.get(id);
        const merged = mergeTool(known, update);
        merged.seen ??= Date.now();
        this.tools.set(id, merged);
        if (known)
            return out;
        const call = this.open(out);
        out.push({ type: 'tool-start', call, tool: id, activity: activityOf(merged) });
        return out;
    }
    accept(update, window) {
        const out = [];
        switch (update.sessionUpdate) {
            case 'agent_message_chunk':
            case 'agent_thought_chunk': {
                if (update.content.type !== 'text' || !update.content.text)
                    break;
                const block = update.sessionUpdate === 'agent_message_chunk' ? 'text' : 'reasoning';
                const call = this.open(out);
                out.push({ type: 'delta', call, block, key: `${block}:${update.messageId ?? 'main'}`, text: update.content.text });
                break;
            }
            case 'tool_call':
            case 'tool_call_update': {
                const fields = update;
                const id = text(fields.toolCallId);
                if (!id || this.ended.has(id))
                    break;
                this.startTool(fields, out);
                const tool = this.tools.get(id);
                if (tool.status === 'in_progress' || tool.status === 'completed' || tool.status === 'failed')
                    this.running(out, window);
                if (tool.status === 'completed' || tool.status === 'failed') {
                    this.ended.add(id);
                    out.push({ type: 'tool-end', tool: id, outcome: outcomeOf(tool) });
                }
                else {
                    const output = contentText(tool.content);
                    if (output)
                        out.push({ type: 'tool-progress', tool: id, output: boundOutput(output) });
                }
                break;
            }
            case 'plan':
                out.push({
                    type: 'todos',
                    id: `${this.turn}:plan-${++this.plans}`,
                    todos: update.entries.map((entry) => ({ content: entry.content, status: todoStatus(entry.status) })),
                });
                break;
            default:
                break;
        }
        return out;
    }
    /** A tool of the open call runs or asks for approval: the call's response is complete. */
    running(out, window) {
        this.ran = true;
        this.endCall(out, window);
    }
    /**
     * At turn end: close the open call and every tool that never ended. The
     * turn's usage is a call's usage only when no tool ran, i.e. there was one
     * model call; otherwise it is omitted.
     */
    finish(status, window, usage) {
        const out = [];
        this.endCall(out, window, !this.ran && this.calls === 1 ? usage : undefined);
        for (const id of this.tools.keys())
            if (!this.ended.has(id)) {
                this.ended.add(id);
                out.push({ type: 'tool-end', tool: id, outcome: { status } });
            }
        return out;
    }
}
