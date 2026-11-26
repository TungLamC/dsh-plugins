var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
/** Composition root: builds the Modules, wires them to dsh, and serves the plugin Remote methods. */
import { delimiter, isAbsolute, join } from 'node:path';
import { accessSync, constants } from 'node:fs';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { boundContextSummary, createUserMessage, LlmAdapter, } from '@deepseek-ai/dsh-llm';
import { SessionId, SessionSeq } from '@deepseek-ai/dsh-session';
import { HARNESS_NAMES, PROVIDERS, harnessOfPreset, harnessOfProvider, withChange, } from "../shared/types.js";
import { REMOTE, SERVICE } from "../shared/wire.js";
import { createTurnBridge } from "./bridge/index.js";
import { callIdOf } from "./bridge/steps.js";
import { checkEndpoints, Config } from "./config.js";
import { liveChange, resolveSettings } from "./settings.js";
import { Catalogs } from "./catalog.js";
import { ClaudeHarness } from "./harness/claude/index.js";
import { CodexHarness } from "./harness/codex/index.js";
import { AntigravityHarness } from "./harness/antigravity/index.js";
import { agyConnector } from "./harness/antigravity/connection.js";
import { dshInteractions } from "./interactions.js";
import { installRoute } from "./route.js";
import { SessionRuntime } from "./runtime.js";
import { emptyRecord, openSessionStore } from "./store.js";
import { findTerminalSession, listTerminalSessions, localTerminalDeps } from "./terminal.js";
/** The SDK spawns the executable directly, so resolve bare names against PATH once. */
function executable(name) {
    if (isAbsolute(name))
        return name;
    for (const dir of (process.env.PATH ?? '').split(delimiter)) {
        if (!dir)
            continue;
        const candidate = join(dir, name);
        try {
            accessSync(candidate, constants.X_OK);
            return candidate;
        }
        catch {
            // Keep looking.
        }
    }
    return name;
}
class HiddenProvider extends LlmAdapter {
    bridge;
    catalogs;
    constructor(bridge, catalogs) {
        super();
        this.bridge = bridge;
        this.catalogs = catalogs;
    }
    async listModels() {
        return [];
    }
    async resolveModel(provider, model) {
        const harness = harnessOfProvider(provider);
        const known = harness ? this.catalogs.model(harness, model) : {};
        return {
            provider,
            id: model,
            name: known.option?.name ?? model,
            inputModalities: known.option?.image === false ? ['text'] : ['text', 'image'],
            ...(known.contextWindow ? { context: { contextWindow: known.contextWindow } } : {}),
        };
    }
    async *stream(options) {
        yield* this.bridge.stream(options);
    }
}
let NativeHarness = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _view_decorators;
    let _select_decorators;
    let _tasks_decorators;
    let _stopTask_decorators;
    let _icons_decorators;
    let _terminalSessions_decorators;
    let _adopt_decorators;
    let _commands_decorators;
    return class NativeHarness extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _view_decorators = [Remote];
            _select_decorators = [Remote];
            _tasks_decorators = [Remote];
            _stopTask_decorators = [Remote];
            _icons_decorators = [Remote];
            _terminalSessions_decorators = [Remote];
            _adopt_decorators = [Remote];
            _commands_decorators = [Remote];
            __esDecorate(this, null, _view_decorators, { kind: "method", name: "view", static: false, private: false, access: { has: obj => "view" in obj, get: obj => obj.view }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _select_decorators, { kind: "method", name: "select", static: false, private: false, access: { has: obj => "select" in obj, get: obj => obj.select }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _tasks_decorators, { kind: "method", name: "tasks", static: false, private: false, access: { has: obj => "tasks" in obj, get: obj => obj.tasks }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _stopTask_decorators, { kind: "method", name: "stopTask", static: false, private: false, access: { has: obj => "stopTask" in obj, get: obj => obj.stopTask }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _icons_decorators, { kind: "method", name: "icons", static: false, private: false, access: { has: obj => "icons" in obj, get: obj => obj.icons }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _terminalSessions_decorators, { kind: "method", name: "terminalSessions", static: false, private: false, access: { has: obj => "terminalSessions" in obj, get: obj => obj.terminalSessions }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _adopt_decorators, { kind: "method", name: "adopt", static: false, private: false, access: { has: obj => "adopt" in obj, get: obj => obj.adopt }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _commands_decorators, { kind: "method", name: "commands", static: false, private: false, access: { has: obj => "commands" in obj, get: obj => obj.commands }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        static inject = [
            'typert',
            'llm',
            'agents',
            'sessions',
            'sessionProjections',
            'sessionQuery',
            'sessionController',
            'storageDomain',
            'approval',
            'userQuestions',
            'attachments',
            'permissionPresets',
            'agentPresets',
            'credentials',
        ];
        static Config = Config;
        bridge = __runInitializers(this, _instanceExtraInitializers);
        host;
        store;
        catalogs;
        runtime;
        route;
        harnesses;
        defaults;
        idleMinutes;
        providerIcons;
        endpoints;
        terminal;
        lifetime = new AbortController();
        constructor(ctx, config) {
            super(ctx, SERVICE);
            checkEndpoints(config);
            this.host = ctx;
            this.defaults = config.defaults;
            this.idleMinutes = config.idleMinutes;
            this.providerIcons = config.providerIcons;
            this.endpoints = config.claudeEndpoints;
            const log = (message) => ctx.logger.warn(`native-harness: ${message}`);
            this.harnesses = {
                'claude-code': new ClaudeHarness({
                    command: executable(config.claudeCommand),
                    entrypoint: config.claudeEntrypoint,
                    endpoints: this.endpoints,
                    // The catalog runs where new sessions start.
                    catalogEndpoint: resolveSettings({}, config.defaults['claude-code'], undefined, this.endpoints.map((endpoint) => endpoint.id))
                        .endpoint,
                    // The credential store first, then the host environment and `.env` files; read at each process start.
                    resolveVariable: async (name) => (await ctx.credentials.resolve(credentialRef(name)))?.value,
                }),
                codex: new CodexHarness({ command: config.codexCommand }),
                antigravity: new AntigravityHarness({ connect: agyConnector(executable(config.antigravityCommand)) }),
            };
            this.store = openSessionStore(ctx.storageDomain);
            // A new dsh session names its Claude conversation after its own UUID (dsh forks too), so those are dsh's.
            this.terminal = localTerminalDeps(async (id) => (await this.store.read(`session-${id}`))?.harness === 'claude-code');
            this.catalogs = new Catalogs((id) => this.harnesses[id]);
            this.runtime = new SessionRuntime({
                harness: (id) => this.harnesses[id],
                store: this.store,
                settings: (harness, cwd, stored) => this.settingsOf(harness, cwd, stored),
                ports: (agent) => {
                    const harness = this.harnessOf(agent) ?? 'codex';
                    return {
                        interactions: dshInteractions({
                            agent,
                            harnessName: HARNESS_NAMES[harness],
                            approval: ctx.approval,
                            questions: ctx.userQuestions,
                            callIdOf,
                        }),
                        signal: this.lifetime.signal,
                        log,
                    };
                },
                // Validates the directory first; a removed worktree falls back to the project by dsh's rules.
                cwd: async (agent, signal) => (await this.host.get('workingDirectory')?.ensure(agent, signal)) ?? agent.session.header.cwd ?? process.cwd(),
                readEvents: async (sessionId, from, to, signal) => {
                    const events = [];
                    for (let seq = from; seq < to;) {
                        const window = await ctx.sessionQuery.readEvent({ sessionId: SessionId(sessionId), seq: SessionSeq(seq), before: 0, after: Math.min(31, to - seq - 1) }, signal);
                        const batch = window.events.filter((event) => event.seq >= seq && event.seq < to);
                        if (!batch.length || batch[0].seq !== seq)
                            break;
                        events.push(...batch);
                        seq = batch.at(-1).seq + 1;
                    }
                    return events;
                },
            });
            this.bridge = createTurnBridge({
                agent: (id) => ctx.agents.get(SessionId(id)),
                harnessOf: (agent) => this.harnessOf(agent),
                open: (agent, harness, signal) => this.runtime.session(agent, harness, signal),
                closeSession: (id) => this.runtime.close(id),
                saveRef: (id, harness, ref) => this.runtime.saveRef(id, harness, ref),
                saveMode: (id, harness, mode) => this.runtime.saveMode(id, harness, mode),
                saveEndpoint: (id, harness, endpoint) => this.runtime.saveEndpoint(id, harness, endpoint),
                markForwarded: (id, harness, ids) => this.runtime.markForwarded(id, harness, ids),
                committed: (id, harness, seq, cut) => this.runtime.committed(id, harness, seq, cut),
                command: (agent, harness, token, signal) => this.catalogs.resolve(harness, this.cwdOf(agent), token, signal),
                image: (block) => ({
                    mediaType: block.attachment.mediaType,
                    ...(ctx.attachments.imageHostPath(block.attachment) ? { path: ctx.attachments.imageHostPath(block.attachment) } : {}),
                    read: async (signal) => (await ctx.attachments.readImage(block.attachment, signal)).data,
                }),
                contextWindow: (provider, model, window) => {
                    const harness = harnessOfProvider(provider);
                    if (harness)
                        this.catalogs.noteWindow(harness, model, window);
                },
                startTurn: (agent, reason) => {
                    const harness = this.harnessOf(agent);
                    const summary = boundContextSummary(turnNotice(harness ? HARNESS_NAMES[harness] : 'Native harness', reason));
                    agent.followup(createUserMessage({
                        content: [{ type: 'text', text: summary }],
                        source: { kind: 'native-harness', form: 'notice', summary },
                    }));
                },
                prepare: async (agent) => {
                    // dsh's Auto preset reviews every dsh tool call with a model; native sessions decide approvals themselves.
                    if (ctx.permissionPresets.current(agent.session) === 'auto')
                        ctx.permissionPresets.set(agent.session, 'workspace-write');
                },
                idleMs: config.idleMinutes * 60_000,
                log,
            });
            ctx.effect(() => ctx.typert.register({
                package: 'dsh-native-harness',
                face: 'host',
                schemas: [],
                model: { services: [], events: [], objects: [] },
                invocations: REMOTE.descriptors,
            }));
            ctx.effect(() => ctx.llm.registerAdapter(Object.values(PROVIDERS), new HiddenProvider(this.bridge, this.catalogs)));
            this.route = installRoute(ctx, {
                agent: (id) => ctx.agents.get(SessionId(id)),
                harnessOf: (agent) => this.harnessOf(agent),
                model: async (agent, harness) => {
                    const record = await this.store.read(agent.id);
                    const cwd = this.cwdOf(agent);
                    return this.modelOf(harness, cwd, this.settingsOf(harness, cwd, record?.harness === harness ? record.settings : {}));
                },
                fallback: (harness) => this.defaults[harness].model || 'default',
            });
            ctx.on('session/event', (session, event) => this.bridge.sessionEvent(session.id, event), { global: true });
            ctx.on('agent/inbox/inserted', ({ agent, message }) => this.bridge.inboxInserted(agent, message), { global: true });
            ctx.on('agent/disposed', ({ agent }) => void this.bridge.forget(agent.id), { global: true });
            ctx.effect(() => async () => {
                this.lifetime.abort();
                await this.runtime.closeAll();
                await Promise.allSettled(Object.values(this.harnesses).map((harness) => harness.close()));
                await this.store.close();
            });
        }
        /** What a session runs with: its own picks over the configured defaults, checked against the cached catalog. */
        settingsOf(harness, cwd, stored, catalog = this.catalogs.peek(harness, cwd)) {
            const endpoints = harness === 'claude-code' ? this.endpoints.map((endpoint) => endpoint.id) : [];
            return resolveSettings(stored, this.defaults[harness], catalog, endpoints);
        }
        /** The model id a session's steps route with: the native model, or the harness's own default. */
        modelOf(harness, cwd, settings) {
            return settings.model ?? this.catalogs.defaultModel(harness, cwd) ?? 'default';
        }
        harnessOf(agent) {
            return harnessOfPreset(this.host.agentPresets.presetForSession(agent.session));
        }
        /** The directory dsh last committed for a live session (a worktree once forge made one); no IO. */
        cwdOf(agent) {
            return this.host.get('workingDirectory')?.get(agent.session) ?? agent.session.header.cwd ?? process.cwd();
        }
        /** Harness and cwd of a live or cold session. */
        async locate(sessionId, signal) {
            const agent = this.host.agents.get(SessionId(sessionId));
            if (agent)
                return { harness: this.harnessOf(agent), cwd: this.cwdOf(agent) };
            const projections = await this.host.sessionController.projections({ sessionId: SessionId(sessionId) }, signal);
            const harness = harnessOfPreset(projections?.values.agentPreset);
            // dsh's working-directory projection; without it, the project the session started in.
            const recorded = projections?.values.workingDirectory;
            if (typeof recorded === 'string')
                return { harness, cwd: recorded };
            const observation = await this.host.sessionQuery.observeSession(SessionId(sessionId), { signal, projectionMode: 'none' });
            try {
                return { harness, cwd: observation.header.cwd ?? process.cwd() };
            }
            finally {
                observation[Symbol.dispose]();
            }
        }
        async view(sessionId, signal) {
            const combined = AbortSignal.any([signal ?? this.lifetime.signal, this.lifetime.signal]);
            const { harness, cwd } = await this.locate(sessionId, combined);
            if (!harness)
                return null;
            const record = await this.store.read(sessionId);
            const stored = record?.harness === harness ? record.settings : {};
            const ref = record?.harness === harness ? record.ref : undefined;
            const live = await this.runtime.live(sessionId);
            const native = ref ? { id: ref.id, cwd: record?.cwd ?? cwd, live: live !== undefined, idleMinutes: this.idleMinutes } : undefined;
            const endpoints = harness === 'claude-code' && this.endpoints.length ? this.endpointViews() : undefined;
            const switching = live?.endpoint?.().waiting;
            const adopted = record?.harness === harness ? record.adopted : undefined;
            const extras = {
                ...(native ? { native } : {}),
                ...(endpoints ? { endpoints } : {}),
                ...(switching ? { switching } : {}),
                ...(adopted ? { adopted } : {}),
            };
            try {
                const catalog = await this.catalogs.get(harness, cwd, combined);
                return {
                    harness,
                    settings: this.settingsOf(harness, cwd, stored, catalog),
                    catalog: { models: catalog.models, modes: catalog.modes },
                    ...extras,
                };
            }
            catch (error) {
                return {
                    harness,
                    settings: this.settingsOf(harness, cwd, stored),
                    catalog: null,
                    ...extras,
                    error: error instanceof Error ? error.message : String(error),
                };
            }
        }
        endpointViews() {
            return this.endpoints.map(({ id, name, command }) => ({ id, name: name || id, command }));
        }
        async select(sessionId, change, signal) {
            signal?.throwIfAborted();
            const { harness, cwd } = await this.locate(sessionId, signal ?? this.lifetime.signal);
            if (!harness)
                throw new Error('This session is not run by a native harness');
            return this.runtime.exclusive(sessionId, () => this.applySelection(sessionId, harness, cwd, change));
        }
        /** Validate, apply to the live session, and persist only what the harness accepted. */
        async applySelection(sessionId, harness, cwd, change) {
            const record = await this.store.read(sessionId);
            const stored = record?.harness === harness ? { ...record.settings } : {};
            const catalog = await this.catalogs.get(harness, cwd, this.lifetime.signal).catch(() => undefined);
            const before = this.settingsOf(harness, cwd, stored, catalog);
            if (change.mode && catalog && !catalog.modes.some((mode) => mode.id === change.mode))
                return { settings: before, result: { status: 'unsupported', detail: `Unknown mode ${change.mode}` } };
            if (change.endpoint && (harness !== 'claude-code' || !this.endpoints.some((endpoint) => endpoint.id === change.endpoint)))
                return { settings: before, result: { status: 'unsupported', detail: `Unknown endpoint ${change.endpoint}` } };
            // A new model picks its effort again unless the same change names one.
            const effective = 'model' in change && !('effort' in change) ? { ...change, effort: null } : change;
            const next = withChange(stored, effective);
            const after = this.settingsOf(harness, cwd, next, catalog);
            const delta = liveChange(before, after);
            const live = await this.runtime.live(sessionId);
            const result = live && Object.keys(delta).length ? await live.apply(delta) : { status: 'applied' };
            if (result.status === 'rejected' || result.status === 'unsupported')
                return { settings: before, result };
            await this.store.update(sessionId, (current) => {
                const base = current?.harness === harness ? current : { ...emptyRecord(harness), ...(current?.forwarded ? { forwarded: current.forwarded } : {}) };
                return { ...base, harness, settings: next };
            });
            const model = this.modelOf(harness, cwd, after);
            const agent = this.host.agents.get(SessionId(sessionId));
            if (agent)
                this.route.select(agent, harness, model);
            else
                this.route.note(sessionId, harness, model);
            return { settings: after, result };
        }
        async tasks(sessionId) {
            return (await this.runtime.live(sessionId))?.tasks() ?? [];
        }
        async stopTask(sessionId, taskId) {
            await (await this.runtime.live(sessionId))?.stopTask(taskId);
        }
        async icons() {
            return this.providerIcons;
        }
        async terminalSessions(sessionId, signal) {
            const { cwd } = await this.claudeSession(sessionId, signal);
            return { cwd, sessions: await listTerminalSessions(cwd, this.terminal) };
        }
        async adopt(sessionId, choice, signal) {
            const { cwd } = await this.claudeSession(sessionId, signal);
            const found = choice ? await findTerminalSession(choice.id, cwd, this.terminal) : undefined;
            if (choice && !found)
                throw new Error('No terminal Claude Code session with this id in the session directory');
            if (choice && found?.open && !choice.fork)
                throw new Error('A terminal still has this session open: close it there first, or continue on a copy');
            const adoption = choice && found ? { id: found.id, title: found.title, fork: choice.fork } : null;
            await this.runtime.exclusive(sessionId, () => this.runtime.adopt(sessionId, 'claude-code', adoption));
            return adoption;
        }
        /** The cwd of a session run by Claude Code; anything else cannot take over a terminal conversation. */
        async claudeSession(sessionId, signal) {
            const combined = AbortSignal.any([signal ?? this.lifetime.signal, this.lifetime.signal]);
            const { harness, cwd } = await this.locate(sessionId, combined);
            if (harness !== 'claude-code')
                throw new Error('Only Claude Code sessions can continue a terminal conversation');
            return { cwd };
        }
        async commands(sessionId, signal) {
            const combined = AbortSignal.any([signal ?? this.lifetime.signal, this.lifetime.signal]);
            const { harness, cwd } = await this.locate(sessionId, combined);
            if (!harness)
                return [];
            return this.catalogs.entries(harness, cwd, combined);
        }
    };
})();
export default NativeHarness;
/** The body of dsh's trigger card for a turn the native harness started; dsh fixes the card's title. */
function turnNotice(name, reason) {
    switch (reason) {
        case 'continued':
            return `${name} is still working on this turn. / ${name} 仍在继续本轮的工作。`;
        case 'queued':
            return `${name} is now handling a message sent earlier. / ${name} 正在处理之前发送、还没处理的消息。`;
        case 'native':
            return `${name} continued without new input, e.g. after a background task finished. / ${name} 在没有新输入的情况下继续了，比如后台任务结束后。`;
    }
}
