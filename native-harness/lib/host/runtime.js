import { HARNESS_NAMES } from "../shared/types.js";
import { emptyRecord } from "./store.js";
const FORK_SCAN_LIMIT = 512;
/** A record written for another harness (the blank session switched presets) starts over. */
function baseFor(record, harness) {
    return record?.harness === harness ? record : { ...emptyRecord(harness), forwarded: record?.forwarded ?? [] };
}
const CONVERSATIONAL = new Set(['user/message', 'assistant/message', 'tool/call', 'tool/result']);
/** Shown before the first output of a session that took over a terminal conversation. */
function takeOverNotice({ title, fork }) {
    const name = title.length > 60 ? `${title.slice(0, 59)}…` : title;
    return fork
        ? `在副本上接着终端里的 Claude Code 会话「${name}」继续，终端里的原会话不变。之前的对话 dsh 里不显示，Claude 记得。\nContinuing the terminal Claude Code session "${name}" on a copy; the terminal's session stays as it was. dsh does not show the earlier conversation; Claude has it.`
        : `接着终端里的 Claude Code 会话「${name}」继续。之前的对话 dsh 里不显示，Claude 记得。\nContinuing the terminal Claude Code session "${name}". dsh does not show the earlier conversation; Claude has it.`;
}
export class SessionRuntime {
    sessions = new Map();
    locks = new Map();
    opened = new Map();
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    /** Open, resume or fork the native session of one dsh session; concurrent callers share one open. */
    session(agent, harness, signal) {
        const existing = this.sessions.get(agent.id);
        if (existing)
            return existing;
        // Opening reads the settings under the same lock as settings changes, so neither misses the other.
        const opening = this.exclusive(agent.id, () => this.open(agent, harness, signal));
        this.sessions.set(agent.id, opening);
        opening.then((result) => {
            if (this.sessions.get(agent.id) === opening)
                this.opened.set(agent.id, result.native);
        }, () => {
            if (this.sessions.get(agent.id) === opening)
                this.sessions.delete(agent.id);
        });
        return opening;
    }
    /** Run `task` alone for this session: opening and settings changes never interleave. */
    exclusive(sessionId, task) {
        const previous = this.locks.get(sessionId) ?? Promise.resolve();
        const run = previous.catch(() => undefined).then(task);
        const settled = run.then(() => undefined, () => undefined);
        this.locks.set(sessionId, settled);
        void settled.then(() => {
            if (this.locks.get(sessionId) === settled)
                this.locks.delete(sessionId);
        });
        return run;
    }
    /** The native session if it has finished opening; never waits (callers may hold the session lock). */
    async live(sessionId) {
        return this.opened.get(sessionId);
    }
    async close(sessionId) {
        const opening = this.sessions.get(sessionId);
        if (!opening)
            return;
        this.sessions.delete(sessionId);
        this.opened.delete(sessionId);
        await (await opening.catch(() => undefined))?.native.close();
    }
    async closeAll() {
        await Promise.allSettled([...this.sessions.keys()].map((id) => this.close(id)));
    }
    async saveRef(sessionId, harness, ref) {
        await this.deps.store.update(sessionId, (record) => ({ ...baseFor(record, harness), ref }));
    }
    async saveEndpoint(sessionId, harness, endpoint) {
        await this.deps.store.update(sessionId, (record) => ({ ...baseFor(record, harness), lastEndpoint: endpoint }));
    }
    async saveMode(sessionId, harness, mode) {
        await this.deps.store.update(sessionId, (record) => {
            const base = baseFor(record, harness);
            return { ...base, settings: { ...base.settings, mode } };
        });
    }
    async markForwarded(sessionId, harness, ids) {
        if (!ids.length)
            return;
        await this.deps.store.update(sessionId, (record) => {
            const base = baseFor(record, harness);
            return { ...base, forwarded: [...base.forwarded.filter((id) => !ids.includes(id)), ...ids] };
        });
    }
    /** Record a cut both sides have committed: the native turn ended and dsh logged its final assistant event. */
    async committed(sessionId, harness, seq, cut) {
        await this.deps.store.update(sessionId, (record) => {
            // The first committed turn ends a take-over: the session has its own conversation now.
            const { adopted: _, ...base } = baseFor(record, harness);
            return {
                ...base,
                ref: cut.ref,
                checkpoints: [...base.checkpoints.filter((checkpoint) => checkpoint.seq !== seq), { seq, cut }],
            };
        });
    }
    /**
     * Make a blank session take over a terminal conversation with its first turn,
     * or (null) cancel that. Continuing points `ref` at the conversation; a fork
     * starts from a copy when the session first opens. Refused once the session
     * has a native conversation of its own, or is open.
     */
    async adopt(sessionId, harness, adoption) {
        if (this.sessions.has(sessionId))
            throw new Error('This session has already started');
        await this.deps.store.update(sessionId, (record) => {
            const { adopted, ref, ...base } = baseFor(record, harness);
            // A ref only an earlier take-over set leaves with it.
            const own = adopted && !adopted.fork && ref?.id === adopted.id ? undefined : ref;
            if (own || base.checkpoints.length)
                throw new Error('This session already runs its own native conversation');
            if (!adoption)
                return base;
            return { ...base, adopted: adoption, ...(adoption.fork ? {} : { ref: { harness, id: adoption.id } }) };
        });
    }
    async open(agent, harness, signal) {
        const record = await this.deps.store.read(agent.id);
        const plan = await this.origin(agent, harness, record, signal);
        const cwd = await this.deps.cwd(agent, signal);
        // The resume command shown later must start where the native session actually ran.
        if (record?.harness !== harness || record.cwd !== cwd)
            await this.deps.store.update(agent.id, (current) => ({ ...baseFor(current, harness), cwd }));
        const native = await this.deps.harness(harness).open({
            dshSessionId: agent.id,
            cwd,
            origin: plan.origin,
            settings: this.deps.settings(harness, cwd, record?.harness === harness ? record.settings : {}),
            ...(record?.harness === harness && record.lastEndpoint ? { lastEndpoint: record.lastEndpoint } : {}),
        }, this.deps.ports(agent));
        return { native, forwarded: record?.forwarded ?? [], ...(plan.notice ? { notice: plan.notice } : {}) };
    }
    async origin(agent, harness, record, signal) {
        const ref = record?.ref;
        const adopted = record?.harness === harness ? record.adopted : undefined;
        const notice = adopted ? { notice: takeOverNotice(adopted) } : {};
        if (ref?.harness === harness)
            return { origin: { kind: 'resume', ref }, ...notice };
        if (adopted?.fork)
            return { origin: { kind: 'copy', ref: { harness, id: adopted.id } }, ...notice };
        const header = agent.session.header;
        if (!header.isSeeded || !header.parentSession)
            return { origin: { kind: 'new' } };
        const fresh = {
            origin: { kind: 'new' },
            notice: `这是新的 ${HARNESS_NAMES[harness]} 上下文，没有继承父会话的上下文。\nThis is a new ${HARNESS_NAMES[harness]} context; the parent context was not inherited.`,
        };
        const boundary = agent.session.inheritedEventCount;
        const parent = await this.deps.store.read(header.parentSession);
        const checkpoint = parent?.checkpoints
            .filter((candidate) => candidate.seq < boundary && candidate.cut.ref.harness === harness)
            .reduce((latest, candidate) => (!latest || candidate.seq > latest.seq ? candidate : latest), undefined);
        if (!checkpoint || boundary - checkpoint.seq > FORK_SCAN_LIMIT)
            return fresh;
        // The child inherits the parent's log prefix: the checkpoint must be the same final answer there,
        // and nothing the native side would have seen may follow it inside the inherited prefix.
        const events = await this.deps.readEvents(agent.id, checkpoint.seq, boundary, signal);
        if (events.length !== boundary - checkpoint.seq || events[0]?.type !== 'assistant/message')
            return fresh;
        if (events.slice(1).some((event) => CONVERSATIONAL.has(event.type)))
            return fresh;
        return { origin: { kind: 'fork', cut: checkpoint.cut } };
    }
}
