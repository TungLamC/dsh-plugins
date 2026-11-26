import { list, object, text, withChange } from "../../../shared/types.js";
import { Channel } from "../channel.js";
import { CodexChildren, CodexEvents, SteerLedger } from "./events.js";
import { Rpc } from "./rpc.js";
const MODES = [
    {
        id: 'read-only',
        name: 'Read only',
        description: 'Read files; ask before writing or using the network.',
        policy: { sandbox: 'read-only', approvalPolicy: 'on-request', approvalsReviewer: 'user' },
    },
    {
        id: 'auto',
        name: 'Ask for approval',
        description: 'Edit the workspace and run commands; ask before leaving it.',
        policy: { sandbox: 'workspace-write', approvalPolicy: 'on-request', approvalsReviewer: 'user' },
    },
    {
        id: 'auto-review',
        name: 'Auto review',
        description: 'Like Auto, but a reviewer agent answers approval requests.',
        policy: { sandbox: 'workspace-write', approvalPolicy: 'on-request', approvalsReviewer: 'auto_review' },
    },
    {
        id: 'full-access',
        name: 'Full access',
        description: 'No sandbox and no approvals.',
        risky: true,
        policy: { sandbox: 'danger-full-access', approvalPolicy: 'never', approvalsReviewer: 'user' },
    },
];
const COMPACT = { name: 'compact', description: 'Compact the conversation context', kind: 'command' };
/** Labels for the decisions that do more than allow once; plain allow and deny stay on dsh's own buttons. */
function choiceLabel(decision) {
    if (decision === 'acceptForSession')
        return 'Allow for this session / 本会话内都允许';
    const value = object(decision);
    const prefix = list(object(value.acceptWithExecpolicyAmendment).execpolicy_amendment).map(text).join(' ');
    if (prefix)
        return `Allow, and always allow commands starting with \`${prefix}\` / 允许，并以后都允许以 \`${prefix}\` 开头的命令`;
    const network = object(object(value.applyNetworkPolicyAmendment).network_policy_amendment);
    if (text(network.host))
        return text(network.action) === 'deny'
            ? `Deny, and always block ${text(network.host)} / 拒绝，并以后都禁止访问 ${text(network.host)}`
            : `Allow, and always allow ${text(network.host)} / 允许，并以后都允许访问 ${text(network.host)}`;
    return undefined;
}
/**
 * How one command approval is offered. With a plain \`accept\` it is dsh's allow-once / deny;
 * without one, the native decisions themselves are offered, since allowing once is not possible.
 */
export function approvalOf(available) {
    const decisions = list(available);
    const allowOnce = !decisions.length || decisions.includes('accept');
    const choices = allowOnce
        ? []
        : decisions.flatMap((decision, index) => {
            const label = choiceLabel(decision);
            return label ? [{ id: String(index), label }] : [];
        });
    return {
        allowOnce,
        choices,
        decide: (decision) => decision.kind === 'allow' && allowOnce
            ? 'accept'
            : decision.kind === 'choice'
                ? (decisions[Number(decision.id)] ?? 'decline')
                : 'decline',
    };
}
function defaultsOf(config) {
    const configured = text(config.sandbox_mode);
    const sandbox = configured === 'read-only' || configured === 'danger-full-access' ? configured : 'workspace-write';
    const approval = config.approval_policy ?? 'on-request';
    const reviewer = text(config.approvals_reviewer) || 'user';
    return {
        policy: { sandbox, approvalPolicy: approval, approvalsReviewer: reviewer },
        workspace: {
            roots: list(object(config.sandbox_workspace_write).writable_roots).map(text).filter(Boolean),
            network: object(config.sandbox_workspace_write).network_access === true,
            excludeTmpdir: object(config.sandbox_workspace_write).exclude_tmpdir_env_var === true,
            excludeSlashTmp: object(config.sandbox_workspace_write).exclude_slash_tmp === true,
        },
    };
}
/** The Codex service tier fast mode turns on. */
const FAST_TIER = 'priority';
/** One `model/list` entry; fast mode is offered when the model lists the `priority` tier. */
export function modelOption(model) {
    const id = text(model.model) || text(model.id);
    if (!id)
        return undefined;
    const modalities = list(model.inputModalities).map(text);
    const tier = list(model.serviceTiers).map(object).find((candidate) => text(candidate.id) === FAST_TIER);
    return {
        id,
        name: text(model.displayName) || id,
        ...(text(model.description) ? { description: text(model.description) } : {}),
        efforts: list(model.supportedReasoningEfforts).flatMap((effort) => {
            const value = text(object(effort).reasoningEffort);
            return value ? [{ id: value, name: value }] : [];
        }),
        ...(text(model.defaultReasoningEffort) ? { defaultEffort: text(model.defaultReasoningEffort) } : {}),
        image: modalities.length === 0 || modalities.includes('image'),
        ...(tier ? { fast: { name: text(tier.name) || 'Fast', description: text(tier.description) } } : {}),
    };
}
/**
 * The tier a turn asks for. turn/start keeps an omitted tier from the turn
 * before, so it is always sent; null is the standard tier, not the configured
 * `service_tier` (checked against Codex 0.170).
 */
export function serviceTier(fast, model) {
    return fast && model?.fast ? FAST_TIER : null;
}
async function readCatalog(rpc, cwd) {
    const defaults = defaultsOf(object(object(await rpc.request('config/read', { cwd })).config));
    const models = [];
    let cursor;
    let fallbackDefault;
    do {
        const page = object(await rpc.request('model/list', cursor ? { cursor } : {}));
        for (const value of list(page.data)) {
            const option = modelOption(object(value));
            if (!option)
                continue;
            if (object(value).isDefault === true)
                fallbackDefault ??= option.id;
            models.push(option);
        }
        cursor = text(page.nextCursor) || undefined;
    } while (cursor);
    const skills = object(await rpc.request('skills/list', { cwds: [cwd] }));
    const commands = list(skills.data)
        .flatMap((entry) => list(object(entry).skills))
        .flatMap((value) => {
        const skill = object(value);
        if (skill.enabled === false || !text(skill.name))
            return [];
        return [
            {
                name: text(skill.name),
                description: text(skill.shortDescription) || text(skill.description) || text(skill.name),
                kind: 'skill',
                ...(text(skill.path) ? { path: text(skill.path) } : {}),
            },
        ];
    });
    return {
        defaults,
        catalog: {
            models,
            ...(fallbackDefault ? { defaultModel: fallbackDefault } : {}),
            modes: MODES.map(({ policy: _policy, ...mode }) => mode),
            commands: [COMPACT, ...commands],
        },
    };
}
export class CodexHarness {
    id = 'codex';
    config;
    sessions = new Set();
    constructor(config) {
        this.config = config;
    }
    async catalog(cwd, signal) {
        const rpc = new Rpc(this.config.command, cwd, 'catalog');
        const abort = () => void rpc.close();
        signal.addEventListener('abort', abort, { once: true });
        try {
            await rpc.initialize();
            return (await readCatalog(rpc, cwd)).catalog;
        }
        finally {
            signal.removeEventListener('abort', abort);
            await rpc.close();
        }
    }
    async open(request, ports) {
        const session = new CodexSession(this.config, request, ports, () => this.sessions.delete(session));
        this.sessions.add(session);
        return session;
    }
    async close() {
        await Promise.allSettled([...this.sessions].map((session) => session.close()));
    }
}
class CodexSession {
    events = new Channel();
    ref;
    rpc;
    ready;
    defaults;
    catalog;
    settings;
    threadId;
    activeTurn;
    mapper = new CodexEvents();
    pendingInputs = [];
    steers = new SteerLedger();
    children = new CodexChildren();
    closed = false;
    config;
    request;
    ports;
    forget;
    constructor(config, request, ports, forget) {
        this.config = config;
        this.request = request;
        this.ports = ports;
        this.forget = forget;
        this.settings = { ...request.settings };
        if (request.origin.kind === 'resume')
            this.ref = request.origin.ref;
    }
    async send(input, mode, signal) {
        const rpc = await this.connect();
        const threadId = await this.thread(rpc);
        signal?.throwIfAborted();
        if (input.command?.kind === 'command' && input.command.name === 'compact') {
            this.pendingInputs.push(input.id);
            await rpc.request('thread/compact/start', { threadId });
            return { inputId: input.id, disposition: 'turn' };
        }
        const items = this.encode(input);
        if (mode === 'steer' && this.activeTurn) {
            try {
                await rpc.request('turn/steer', { threadId, expectedTurnId: this.activeTurn, clientUserMessageId: input.id, input: items });
                this.steers.add(input.id, items);
                return { inputId: input.id, disposition: 'steer' };
            }
            catch (error) {
                // Only a turn that is already gone is safe to retry as a new turn; anything else may have been accepted.
                if (!/no active turn|expected.*turn|not.*active|mismatch/i.test(String(error)))
                    throw error;
                this.ports.log(`Codex steer fell back to a new turn: ${String(error)}`);
            }
        }
        await this.startTurn(rpc, threadId, [input.id], items, signal);
        return { inputId: input.id, disposition: mode === 'steer' ? 'queued' : 'turn' };
    }
    async startTurn(rpc, threadId, ids, items, signal) {
        const policy = await this.policy();
        // Last point before Codex receives the turn: a cancelled step must not start native work.
        signal?.throwIfAborted();
        this.pendingInputs.push(...ids);
        // turn/start keeps earlier overrides when a field is omitted, so every setting is sent explicitly.
        const model = this.settings.model ?? this.catalog?.defaultModel;
        const option = this.catalog?.models.find((candidate) => candidate.id === model);
        const effort = this.settings.effort ?? option?.defaultEffort;
        await rpc.request('turn/start', {
            threadId,
            cwd: this.request.cwd,
            clientUserMessageId: ids.at(-1),
            input: items,
            ...(policy
                ? { approvalPolicy: policy.approvalPolicy, approvalsReviewer: policy.approvalsReviewer, sandboxPolicy: policy.sandboxPolicy }
                : {}),
            ...(model ? { model } : {}),
            effort: effort ?? null,
            serviceTier: serviceTier(this.settings.fast, option),
        });
    }
    /** Like the TUI's Esc: steers an interrupt dropped are sent again at once as a new turn. */
    resubmit(ids, items) {
        const rpc = this.rpc;
        const threadId = this.threadId;
        if (!rpc || !threadId || this.closed)
            return;
        this.startTurn(rpc, threadId, ids, items).catch((error) => {
            this.pendingInputs = this.pendingInputs.filter((id) => !ids.includes(id));
            this.ports.log(`Codex could not resend steers after an interrupt: ${String(error)}`);
        });
    }
    async apply(change) {
        if (change.mode && !MODES.some((mode) => mode.id === change.mode))
            return { status: 'unsupported', detail: `Unknown Codex mode ${change.mode}` };
        this.settings = withChange(this.settings, change);
        return { status: this.activeTurn ? 'next-turn' : 'applied' };
    }
    async interrupt() {
        const rpc = this.rpc;
        if (!rpc || !this.threadId)
            return;
        rpc.abortServing(this.threadId);
        // turn/start can answer before the turn is active; retry briefly.
        for (let attempt = 0; attempt < 10; attempt++) {
            if (this.activeTurn) {
                await rpc.request('turn/interrupt', { threadId: this.threadId, turnId: this.activeTurn }, 5000);
                return;
            }
            if (!this.pendingInputs.length)
                return;
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
    }
    tasks() {
        return this.children.list();
    }
    /** Interrupt one subagent thread's turn, like Esc on that thread in the TUI. */
    async stopTask(id) {
        const turnId = this.children.turnOf(id);
        if (!this.rpc || !turnId)
            return;
        await this.rpc.request('turn/interrupt', { threadId: id, turnId }, 5000);
    }
    async close() {
        if (this.closed)
            return;
        this.closed = true;
        this.forget();
        await this.rpc?.close();
        this.events.close();
    }
    connect() {
        if (this.closed)
            return Promise.reject(new Error('Codex session is closed'));
        if (this.rpc?.alive && this.ready)
            return this.ready;
        const rpc = new Rpc(this.config.command, this.request.cwd, this.request.dshSessionId);
        this.rpc = rpc;
        this.threadId = undefined;
        rpc.onNotification = (method, params) => this.notification(method, params);
        rpc.onRequest = (method, params, signal) => this.serverRequest(method, params, signal);
        rpc.onExit = (error) => {
            if (this.activeTurn || this.pendingInputs.length) {
                for (const event of this.mapper.finish('unknown'))
                    this.events.push(event);
                this.events.push({
                    type: 'turn-end',
                    turn: this.activeTurn ?? 'lost',
                    outcome: 'failed',
                    error: error.message,
                });
            }
            this.activeTurn = undefined;
            this.pendingInputs = [];
            this.steers.drain();
            this.children.clear();
            if (this.rpc === rpc)
                this.ready = undefined;
        };
        this.ready = (async () => {
            await rpc.initialize();
            const read = await readCatalog(rpc, this.request.cwd);
            this.defaults = read.defaults;
            this.catalog = read.catalog;
            return rpc;
        })();
        this.ready.catch(() => void rpc.close());
        return this.ready;
    }
    async thread(rpc) {
        if (this.threadId)
            return this.threadId;
        const origin = this.request.origin;
        const policy = await this.policy();
        const common = {
            cwd: this.request.cwd,
            ...(policy ? { approvalPolicy: policy.approvalPolicy, approvalsReviewer: policy.approvalsReviewer, sandbox: policy.sandboxMode } : {}),
            ...(this.settings.model ? { model: this.settings.model } : {}),
            config: { 'shell_environment_policy.set': { DSH_SESSION_ID: this.request.dshSessionId } },
        };
        let result;
        if (this.ref)
            result = object(await rpc.request('thread/resume', { ...common, threadId: this.ref.id }));
        else if (origin.kind === 'fork')
            result = object(await rpc.request('thread/fork', { ...common, threadId: origin.cut.ref.id, lastTurnId: origin.cut.at }));
        else if (origin.kind === 'copy')
            throw new Error('Codex sessions cannot take over another conversation');
        else
            result = object(await rpc.request('thread/start', common));
        const threadId = text(object(result.thread).id);
        if (!threadId)
            throw new Error('Codex returned no thread id');
        if (origin.kind === 'fork' && !this.ref && threadId === origin.cut.ref.id)
            throw new Error('Codex fork reused its parent thread');
        this.threadId = threadId;
        if (this.ref?.id !== threadId) {
            this.ref = { harness: 'codex', id: threadId };
            this.events.push({ type: 'ref', ref: this.ref });
        }
        return threadId;
    }
    /** Always explicit: Codex keeps earlier overrides when turn/start omits these fields. */
    async policy() {
        const defaults = this.defaults;
        if (!defaults)
            return undefined;
        const policy = MODES.find((candidate) => candidate.id === this.settings.mode)?.policy ?? defaults.policy;
        const sandboxPolicy = policy.sandbox === 'danger-full-access'
            ? { type: 'dangerFullAccess' }
            : policy.sandbox === 'read-only'
                ? { type: 'readOnly', networkAccess: false }
                : {
                    type: 'workspaceWrite',
                    writableRoots: [
                        ...new Set([this.request.cwd, ...defaults.workspace.roots]),
                    ],
                    networkAccess: defaults.workspace.network,
                    excludeTmpdirEnvVar: defaults.workspace.excludeTmpdir,
                    excludeSlashTmp: defaults.workspace.excludeSlashTmp,
                };
        return {
            approvalPolicy: policy.approvalPolicy,
            approvalsReviewer: policy.approvalsReviewer,
            sandboxPolicy,
            sandboxMode: policy.sandbox,
        };
    }
    /** Native `$skill` semantics: keep `$name` in the text, mark it, and attach the exact skill. */
    encode(input) {
        const items = [];
        const elements = new Map();
        const skills = new Map();
        let body = input.text;
        const mark = (at, token) => {
            const start = Buffer.byteLength(body.slice(0, at));
            elements.set(start, { byteRange: { start, end: start + Buffer.byteLength(token) }, placeholder: token });
        };
        if (input.command?.kind === 'skill') {
            const token = `$${input.command.name}`;
            body = body ? `${token} ${body}` : token;
            mark(0, token);
            if (input.command.path)
                skills.set(input.command.path, input.command.name);
        }
        // Typed `$name` mentions of enabled skills attach the skill too, like the TUI, when the name is unambiguous.
        const byName = new Map();
        for (const command of this.catalog?.commands ?? [])
            if (command.kind === 'skill' && command.path)
                byName.set(command.name, [...(byName.get(command.name) ?? []), command.path]);
        for (const [name, paths] of byName) {
            if (paths.length !== 1)
                continue;
            const token = `$${name}`;
            for (let at = body.indexOf(token); at >= 0; at = body.indexOf(token, at + token.length)) {
                const next = body[at + token.length];
                if (next !== undefined && !/[\s.,;:!?)]/.test(next))
                    continue;
                mark(at, token);
                if (![...skills.values()].includes(name))
                    skills.set(paths[0], name);
            }
        }
        if (body)
            items.push({ type: 'text', text: body, text_elements: [...elements.values()] });
        for (const image of input.images) {
            if (!image.path)
                throw new Error('Codex needs a local image file. / Codex 需要本地图片文件。');
            items.push({ type: 'localImage', path: image.path });
        }
        for (const [path, name] of skills)
            items.push({ type: 'skill', name, path });
        return items;
    }
    notification(method, params) {
        this.children.accept(this.threadId, method, params);
        if (text(params.threadId) && text(params.threadId) !== this.threadId)
            return;
        if (method === 'turn/started') {
            const turn = text(object(params.turn).id);
            this.activeTurn = turn;
            this.mapper = new CodexEvents();
            const inputIds = this.pendingInputs;
            this.pendingInputs = [];
            this.events.push({ type: 'turn-start', turn, origin: inputIds.length ? 'user' : 'native', inputIds });
            return;
        }
        if (method === 'turn/completed') {
            const turn = object(params.turn);
            const id = text(turn.id);
            const status = text(turn.status);
            for (const event of this.mapper.finish(status === 'interrupted' ? 'interrupted' : 'unknown'))
                this.events.push(event);
            this.activeTurn = undefined;
            // Subagents run their own threads; their pending approvals outlive this turn.
            this.rpc?.abortServing(this.threadId);
            const error = text(object(turn.error).message);
            this.events.push({
                type: 'turn-end',
                turn: id,
                outcome: status === 'completed' ? 'completed' : status === 'interrupted' ? 'interrupted' : 'failed',
                ...(this.ref && status === 'completed' ? { cut: { ref: this.ref, at: id } } : {}),
                ...(error ? { error } : {}),
            });
            const dropped = this.steers.drain();
            if (status === 'interrupted' && dropped.ids.length)
                this.resubmit(dropped.ids, dropped.items);
            return;
        }
        if ((method === 'item/started' || method === 'item/completed') && text(object(params.item).type) === 'userMessage')
            this.steers.taken(text(object(params.item).clientId));
        for (const event of this.mapper.accept(method, params))
            this.events.push(event);
    }
    async serverRequest(method, params, request) {
        const signal = AbortSignal.any([request, this.ports.signal]);
        const itemId = text(params.itemId);
        // A subagent's thread: its items never reach this transcript, so ask without a tool card of its own.
        const subagent = !!text(params.threadId) && text(params.threadId) !== this.threadId;
        const prefix = subagent ? 'Subagent · ' : '';
        if (method === 'item/commandExecution/requestApproval' || method === 'item/fileChange/requestApproval') {
            const command = method === 'item/commandExecution/requestApproval';
            if (!subagent)
                for (const event of this.mapper.startTool(command
                    ? { id: itemId, type: 'commandExecution', command: text(params.command), cwd: text(params.cwd) }
                    : { id: itemId, type: 'fileChange', changes: [] }))
                    this.events.push(event);
            const offer = approvalOf(command ? params.availableDecisions : undefined);
            const decision = await this.ports.interactions.approve({
                tool: itemId,
                title: `${prefix}${command ? 'Shell' : 'Edit files'}`,
                reason: [text(params.reason), text(params.command), text(params.grantRoot)].filter(Boolean).join('\n'),
                ...(offer.allowOnce ? {} : { allowOnce: false, choices: offer.choices }),
            }, signal);
            return { decision: offer.decide(decision) };
        }
        if (method === 'item/permissions/requestApproval') {
            const decision = await this.ports.interactions.approve({ tool: itemId, title: `${prefix}Permissions`, reason: [text(params.reason), JSON.stringify(params.permissions ?? {})].filter(Boolean).join('\n') }, signal);
            return {
                permissions: decision.kind === 'allow'
                    ? Object.fromEntries(Object.entries(object(params.permissions)).filter(([, value]) => value != null))
                    : {},
                scope: 'turn',
            };
        }
        if (method === 'item/tool/requestUserInput') {
            const questions = list(params.questions).map((value) => {
                const question = object(value);
                return {
                    id: text(question.id),
                    header: `${prefix}${text(question.header)}`,
                    question: text(question.question),
                    options: list(question.options).map((option) => ({
                        label: text(object(option).label),
                        ...(text(object(option).description) ? { description: text(object(option).description) } : {}),
                    })),
                };
            });
            const answer = await this.ports.interactions.ask(questions, signal);
            // A dismissed card answers nothing; Codex treats missing answers as unanswered.
            return {
                answers: Object.fromEntries(answer.answers.map((item) => [item.id, { answers: [...item.selected, ...(item.custom ? [item.custom] : [])] }])),
            };
        }
        if (method === 'mcpServer/elicitation/request')
            return { action: 'decline' };
        throw new Error(`Unsupported Codex request: ${method}`);
    }
}
