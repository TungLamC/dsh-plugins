import { withChange } from "../../../shared/types.js";
import { Channel } from "../channel.js";
import { acpError } from "./connection.js";
import { AcpTurn, isContent, turnUsage } from "./events.js";
import { answerOf, approvalOf, CANCELLED, isQuestion, questionOf } from "./permission.js";
const NATIVE_QUIET_MS = 8_000;
/** A native turn whose tools never end (e.g. a server) ends after this much silence. */
const NATIVE_SILENT_MS = 60_000;
const CATALOG_MS = 30 * 60_000;
const COMMANDS_WAIT_MS = 3_000;
const CLOSE_WAIT_MS = 3_000;
const SETTLED_LIMIT = 2_048;
/** ACP config option categories; agy names its options the same, which is the fallback when no category is given. */
const CATEGORY = { model: 'model', effort: 'thought_level', mode: 'mode' };
function optionOf(options, setting) {
    const category = CATEGORY[setting];
    return options.find((option) => option.category === category) ?? options.find((option) => option.id === category);
}
function choicesOf(option) {
    if (!option || option.type !== 'select')
        return [];
    return option.options.flatMap((entry) => ('group' in entry ? entry.options : [entry])).map((entry) => ({
        value: entry.value,
        name: entry.name || entry.value,
        ...(entry.description ? { description: entry.description } : {}),
    }));
}
function currentOf(options, setting) {
    const option = optionOf(options, setting);
    return option?.type === 'select' ? option.currentValue : undefined;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms).unref());
function raced(promise, signal) {
    if (!signal)
        return promise;
    return new Promise((resolve, reject) => {
        const abort = () => reject(signal.reason);
        if (signal.aborted)
            return abort();
        signal.addEventListener('abort', abort, { once: true });
        promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    });
}
export class AntigravityHarness {
    id = 'antigravity';
    config;
    sessions = new Set();
    catalogs = new Map();
    windows = new Map();
    constructor(config) {
        this.config = config;
    }
    async catalog(cwd, signal) {
        const entry = this.catalogs.get(cwd) ?? { at: 0 };
        this.catalogs.set(cwd, entry);
        if (entry.value && Date.now() - entry.at < (this.config.catalogMs ?? CATALOG_MS))
            return entry.value;
        entry.loading ??= this.readCatalog(cwd, signal)
            .then((value) => {
            entry.value = value;
            entry.at = Date.now();
            return value;
        })
            .finally(() => {
            entry.loading = undefined;
        });
        return entry.value ? entry.loading.catch(() => entry.value) : entry.loading;
    }
    contextWindow(model) {
        return this.windows.get(model);
    }
    async open(request, ports) {
        const session = new AntigravitySession(this.config, request, ports, {
            forget: () => this.sessions.delete(session),
            window: (model, size) => this.windows.set(model, size),
        });
        this.sessions.add(session);
        return session;
    }
    async close() {
        await Promise.allSettled([...this.sessions].map((session) => session.close()));
    }
    /**
     * One short-lived conversation: its config options name the models, their
     * levels (read by selecting each model) and the modes; its first commands
     * update names the slash commands. agy does not list such an empty
     * conversation among its sessions.
     */
    async readCatalog(cwd, signal) {
        let resolveCommands;
        const commands = new Promise((resolve) => {
            resolveCommands = resolve;
        });
        const link = await this.config.connect(cwd, 'catalog', {
            update: (notification) => {
                if (notification.update.sessionUpdate === 'available_commands_update')
                    resolveCommands(notification.update.availableCommands);
            },
            permission: async () => CANCELLED,
        });
        const abort = () => void link.close();
        signal.addEventListener('abort', abort, { once: true });
        let sessionId;
        try {
            const session = await link.agent.request('session/new', { cwd, mcpServers: [] });
            sessionId = session.sessionId;
            const options = session.configOptions ?? [];
            const defaultModel = currentOf(options, 'model');
            const image = link.capabilities.promptCapabilities?.image === true;
            const models = [];
            for (const model of choicesOf(optionOf(options, 'model'))) {
                signal.throwIfAborted();
                const switched = await link.agent.request('session/set_config_option', {
                    sessionId,
                    configId: optionOf(options, 'model').id,
                    value: model.value,
                });
                const levels = optionOf(switched.configOptions, 'effort');
                models.push({
                    id: model.value,
                    name: model.name,
                    ...(model.description ? { description: model.description } : {}),
                    efforts: choicesOf(levels).map((level) => ({ id: level.value, name: level.name })),
                    ...(levels?.type === 'select' ? { defaultEffort: levels.currentValue } : {}),
                    image,
                });
            }
            const modes = choicesOf(optionOf(options, 'mode')).map((mode) => ({
                id: mode.value,
                name: mode.name,
                ...(mode.description ? { description: mode.description } : {}),
            }));
            const listed = await Promise.race([commands, sleep(COMMANDS_WAIT_MS).then(() => [])]);
            return {
                models,
                ...(defaultModel ? { defaultModel } : {}),
                modes,
                commands: listed.map((command) => ({
                    name: command.name,
                    description: command.description || command.name,
                    kind: 'command',
                    ...(command.input?.hint ? { argumentHint: command.input.hint } : {}),
                })),
            };
        }
        catch (error) {
            throw acpError(error);
        }
        finally {
            signal.removeEventListener('abort', abort);
            if (sessionId && link.alive && link.capabilities.sessionCapabilities?.close)
                await Promise.race([link.agent.request('session/close', { sessionId }).catch(() => undefined), sleep(CLOSE_WAIT_MS)]);
            await link.close();
        }
    }
}
class AntigravitySession {
    events = new Channel();
    ref;
    link;
    ready;
    sessionId;
    options = [];
    settings;
    /** Settings an `apply` is sending to agy right now. */
    pending;
    window;
    turn;
    turns = 0;
    /** Inputs sent while a prompt ran; they become the next prompt. */
    queue = [];
    /** Tools of ended turns: a late update about one must not show it again. */
    settled = new Set();
    /** Tools a completed turn left running, until agy reports them ended. */
    background = new Map();
    asks = new Set();
    quiet;
    /** `session/load` replays the conversation; the replay is not new content. */
    loading = false;
    closed = false;
    config;
    request;
    ports;
    hooks;
    constructor(config, request, ports, hooks) {
        this.config = config;
        this.request = request;
        this.ports = ports;
        this.hooks = hooks;
        this.settings = { ...request.settings };
        if (request.origin.kind === 'resume')
            this.ref = request.origin.ref;
    }
    async send(input, _mode, signal) {
        const sessionId = await raced(this.connect(), signal);
        const blocks = await this.encode(input, signal);
        // Last point before agy receives the input: a cancelled step must not start native work.
        signal?.throwIfAborted();
        if (this.turn?.prompt) {
            this.queue.push({ id: input.id, blocks });
            return { inputId: input.id, disposition: 'queued' };
        }
        // A turn agy started by itself yields to new input.
        if (this.turn)
            this.endTurn('completed');
        this.prompt(sessionId, [input.id], blocks);
        return { inputId: input.id, disposition: 'turn' };
    }
    async apply(change) {
        const next = withChange(this.settings, change);
        const link = this.link;
        const sessionId = this.sessionId;
        // Not connected yet: the session opens with these settings.
        if (!sessionId || !link?.alive) {
            this.settings = next;
            return { status: 'applied' };
        }
        // agy echoes the change as a config update; `pending` keeps that echo from reading as agy's own switch.
        this.pending = next;
        try {
            for (const setting of ['model', 'effort', 'mode']) {
                const value = change[setting];
                if (typeof value === 'string')
                    await this.configure(link, sessionId, setting, value);
            }
            this.settings = next;
            return { status: 'applied' };
        }
        catch (error) {
            return { status: 'rejected', detail: acpError(error).message };
        }
        finally {
            this.pending = undefined;
        }
    }
    async interrupt() {
        this.withdrawAsks();
        const turn = this.turn;
        if (!turn || !this.sessionId || !this.link?.alive)
            return;
        // agy also stops the session's subagents and background tasks on cancel.
        await this.link.agent.notify('session/cancel', { sessionId: this.sessionId });
        if (!turn.prompt && this.turn === turn)
            this.endTurn('interrupted');
    }
    tasks() {
        return [...this.background.values()].map((task) => ({ ...task }));
    }
    async stopTask() {
        throw new Error('Antigravity does not report its subagents and background tasks separately');
    }
    async close() {
        if (this.closed)
            return;
        this.closed = true;
        this.hooks.forget();
        clearTimeout(this.quiet);
        this.withdrawAsks();
        this.background.clear();
        const link = this.link;
        const sessionId = this.sessionId;
        if (link?.alive && sessionId && link.capabilities.sessionCapabilities?.close)
            await Promise.race([link.agent.request('session/close', { sessionId }).catch(() => undefined), sleep(CLOSE_WAIT_MS)]);
        await link?.close();
        this.events.close();
    }
    connect() {
        if (this.closed)
            return Promise.reject(new Error('Antigravity session is closed'));
        if (this.link?.alive && this.ready)
            return this.ready;
        const ready = (async () => {
            const link = await this.config.connect(this.request.cwd, this.request.dshSessionId, {
                update: (notification) => this.update(notification),
                permission: (request, signal) => this.permission(request, signal),
            });
            if (this.closed) {
                await link.close();
                throw new Error('Antigravity session is closed');
            }
            this.link = link;
            void link.closed.then((error) => this.lost(link, error));
            try {
                return await this.establish(link);
            }
            catch (error) {
                await link.close();
                throw acpError(error);
            }
        })();
        this.ready = ready;
        ready.catch(() => {
            if (this.ready === ready)
                this.ready = undefined;
        });
        return ready;
    }
    async establish(link) {
        const { cwd, origin } = this.request;
        if (origin.kind === 'copy')
            throw new Error('Antigravity sessions cannot take over another conversation');
        let sessionId;
        if (this.ref) {
            sessionId = this.ref.id;
            if (link.capabilities.sessionCapabilities?.resume)
                this.options = (await link.agent.request('session/resume', { sessionId, cwd, mcpServers: [] })).configOptions ?? [];
            else if (link.capabilities.loadSession) {
                this.loading = true;
                try {
                    this.options = (await link.agent.request('session/load', { sessionId, cwd, mcpServers: [] }))?.configOptions ?? [];
                }
                finally {
                    this.loading = false;
                }
            }
            else
                throw new Error('This Antigravity version can neither resume nor load a conversation');
        }
        else {
            const created = await link.agent.request('session/new', { cwd, mcpServers: [] });
            sessionId = created.sessionId;
            this.options = created.configOptions ?? [];
            if (origin.kind === 'fork')
                this.events.push({
                    type: 'notice',
                    text: '这是新的 Antigravity 上下文，没有继承父会话的上下文。\nThis is a new Antigravity context; the parent context was not inherited.',
                });
        }
        this.sessionId = sessionId;
        // Every setting reaches agy explicitly; the model goes first, since it decides the levels on offer.
        for (const setting of ['model', 'effort', 'mode']) {
            const value = this.settings[setting];
            if (value)
                await this.configure(link, sessionId, setting, value);
        }
        if (this.ref?.id !== sessionId) {
            this.ref = { harness: 'antigravity', id: sessionId };
            this.events.push({ type: 'ref', ref: this.ref });
        }
        return sessionId;
    }
    /** Select one setting in agy. A level the model does not offer is left to agy, like a model without levels. */
    async configure(link, sessionId, setting, value) {
        const option = optionOf(this.options, setting);
        if (!option || option.type !== 'select') {
            if (setting === 'effort')
                return;
            throw new Error(`Antigravity offers no ${CATEGORY[setting]} setting`);
        }
        if (option.currentValue === value)
            return;
        if (setting === 'effort' && !choicesOf(option).some((choice) => choice.value === value)) {
            this.ports.log(`Antigravity model ${currentOf(this.options, 'model') ?? ''} offers no level ${value}; agy keeps its own`);
            return;
        }
        const result = await link.agent.request('session/set_config_option', { sessionId, configId: option.id, value });
        this.options = result.configOptions;
    }
    async encode(input, signal) {
        // agy runs a command named at the start of the prompt, as typed in its own UI.
        const body = input.command ? `/${input.command.name}${input.text ? ` ${input.text}` : ''}` : input.text;
        const blocks = body || !input.images.length ? [{ type: 'text', text: body }] : [];
        if (input.images.length && this.link?.capabilities.promptCapabilities?.image !== true)
            throw new Error('This Antigravity version takes no images. / 当前 Antigravity 版本不接受图片。');
        for (const image of input.images) {
            const bytes = await image.read(signal ?? this.ports.signal);
            blocks.push({ type: 'image', mimeType: image.mediaType, data: Buffer.from(bytes).toString('base64') });
        }
        return blocks;
    }
    prompt(sessionId, ids, blocks) {
        const link = this.link;
        const turn = this.begin(true);
        this.events.push({ type: 'turn-start', turn: turn.id, origin: 'user', inputIds: ids });
        link.agent.request('session/prompt', { sessionId, prompt: blocks }).then((response) => this.settle(turn, response), (error) => this.settle(turn, undefined, acpError(error)));
    }
    begin(prompt) {
        clearTimeout(this.quiet);
        const id = `turn-${++this.turns}`;
        const turn = { id, mapper: new AcpTurn(id), prompt, last: Date.now() };
        this.turn = turn;
        return turn;
    }
    settle(turn, response, error) {
        if (this.turn !== turn)
            return;
        const stop = response?.stopReason;
        // `usage` is ACP's draft turn usage; it is read when present.
        const usage = turnUsage(response?.usage);
        if (stop === 'max_tokens' || stop === 'max_turn_requests')
            this.events.push({
                type: 'notice',
                text: `Antigravity stopped this turn early (${stop}). / Antigravity 提前结束了本轮（${stop}）。`,
            });
        this.endTurn(error || stop === 'refusal' ? 'failed' : stop === 'cancelled' ? 'interrupted' : 'completed', usage, error?.message ?? (stop === 'refusal' ? 'Antigravity refused to continue. / Antigravity 拒绝继续。' : undefined));
        const queued = this.queue;
        this.queue = [];
        if (queued.length && this.sessionId && this.link?.alive)
            this.prompt(this.sessionId, queued.map((input) => input.id), queued.flatMap((input) => input.blocks));
    }
    endTurn(outcome, usage, error) {
        const turn = this.turn;
        if (!turn)
            return;
        clearTimeout(this.quiet);
        // A completed turn's running tools go on in the background; an interrupt or failure stopped them.
        if (outcome === 'completed')
            for (const tool of turn.mapper.unended()) {
                const activity = turn.mapper.activityOf(tool.id);
                this.background.set(tool.id, {
                    id: tool.id,
                    kind: tool.kind === 'execute' ? 'shell' : 'other',
                    title: tool.title || activity?.summary || tool.name || 'Tool',
                    background: true,
                    startedAt: tool.seen ?? Date.now(),
                    stoppable: false,
                });
            }
        for (const event of turn.mapper.finish(outcome === 'interrupted' ? 'interrupted' : 'unknown', this.window, usage))
            this.events.push(event);
        for (const id of turn.mapper.toolIds()) {
            this.settled.add(id);
            if (this.settled.size > SETTLED_LIMIT)
                this.settled.delete(this.settled.values().next().value);
        }
        this.turn = undefined;
        this.events.push({ type: 'turn-end', turn: turn.id, outcome, ...(error ? { error } : {}) });
    }
    update(notification) {
        if (this.sessionId && notification.sessionId !== this.sessionId)
            return;
        const update = notification.update;
        switch (update.sessionUpdate) {
            case 'usage_update': {
                if (update.size > 0)
                    this.window = update.size;
                const model = currentOf(this.options, 'model');
                if (model && update.size > 0)
                    this.hooks.window(model, update.size);
                return;
            }
            case 'config_option_update':
                this.options = update.configOptions;
                this.adoptMode(currentOf(this.options, 'mode'));
                return;
            case 'current_mode_update':
                this.adoptMode(update.currentModeId);
                return;
        }
        if (this.loading || !isContent(update))
            return;
        if (update.sessionUpdate === 'tool_call' || update.sessionUpdate === 'tool_call_update') {
            // A background tool's card already ended with its turn; its end only leaves the task list.
            if (this.background.has(update.toolCallId)) {
                if (update.status === 'completed' || update.status === 'failed')
                    this.background.delete(update.toolCallId);
                return;
            }
            if (this.settled.has(update.toolCallId))
                return;
        }
        const turn = this.turn ?? this.nativeTurn();
        turn.last = Date.now();
        for (const event of turn.mapper.accept(update, this.window))
            this.events.push(event);
        if (!turn.prompt)
            this.armQuiet();
    }
    /** agy went on by itself, e.g. after a background task finished. */
    nativeTurn() {
        const turn = this.begin(false);
        this.events.push({ type: 'turn-start', turn: turn.id, origin: 'native', inputIds: [] });
        return turn;
    }
    armQuiet() {
        clearTimeout(this.quiet);
        this.quiet = setTimeout(() => {
            const turn = this.turn;
            if (!turn || turn.prompt)
                return;
            const silent = Date.now() - turn.last;
            if (!this.asks.size && (!turn.mapper.unended().length || silent >= NATIVE_SILENT_MS))
                this.endTurn('completed');
            else
                this.armQuiet();
        }, this.config.nativeQuietMs ?? NATIVE_QUIET_MS);
        this.quiet.unref();
    }
    /** A mode agy switched to by itself (e.g. leaving plan mode); not one dsh has or is asking for. */
    adoptMode(mode) {
        if (!mode || mode === this.settings.mode || mode === this.pending?.mode)
            return;
        this.settings = { ...this.settings, mode };
        this.events.push({ type: 'mode', mode });
    }
    async permission(request, signal) {
        if (this.sessionId && request.sessionId !== this.sessionId)
            return CANCELLED;
        const controller = new AbortController();
        this.asks.add(controller);
        const combined = AbortSignal.any([signal, controller.signal, this.ports.signal]);
        try {
            if (isQuestion(request))
                return answerOf(request, await this.ports.interactions.ask([questionOf(request)], combined));
            // The tool's card comes first, and the response that proposed the tool is complete.
            const turn = this.turn ?? this.nativeTurn();
            const out = turn.mapper.startTool(request.toolCall);
            turn.mapper.running(out, this.window);
            for (const event of out)
                this.events.push(event);
            const tool = turn.mapper.toolOf(request.toolCall.toolCallId);
            const activity = turn.mapper.activityOf(request.toolCall.toolCallId);
            const offer = approvalOf(request, activity?.title ?? 'Tool', tool?.title ?? activity?.summary ?? '');
            return offer.decide(await this.ports.interactions.approve(offer.request, combined));
        }
        catch (error) {
            if (combined.aborted)
                return CANCELLED;
            throw error;
        }
        finally {
            this.asks.delete(controller);
        }
    }
    /** Requests still waiting on the user are answered `cancelled`, as ACP asks of a cancelled turn. */
    withdrawAsks() {
        for (const controller of this.asks)
            controller.abort();
        this.asks.clear();
    }
    /** The process exited or the stream broke: end what was running; the next send reconnects and resumes. */
    lost(link, error) {
        if (this.link !== link)
            return;
        this.link = undefined;
        this.ready = undefined;
        this.sessionId = undefined;
        this.background.clear();
        if (this.closed)
            return;
        this.withdrawAsks();
        if (this.turn)
            this.endTurn('failed', undefined, error.message);
        if (this.queue.length)
            this.ports.log(`Antigravity dropped ${this.queue.length} queued input(s): ${error.message}`);
        this.queue = [];
    }
}
