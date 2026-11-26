import { HARNESS_NAMES, PROVIDERS, harnessOfPreset, harnessOfProvider } from "../shared/types.js";
export function installRoute(ctx, deps) {
    /** Each session's native model as last resolved: routing queued input cannot wait for the store. */
    const models = new Map();
    /** A session's own pick from before it was routed, to give back if it leaves the native preset while blank. */
    const previous = new Map();
    function select(agent, harness, model) {
        models.set(agent.id, { harness, model });
        agent.model.select({ provider: PROVIDERS[harness], model });
    }
    function ensure(agent, harness) {
        const current = agent.model.current();
        if (current && !harnessOfProvider(current.provider))
            previous.set(agent.id, { ...current });
        const kept = current?.provider === PROVIDERS[harness] ? current.model : undefined;
        const remembered = models.get(agent.id);
        const known = remembered?.harness === harness ? remembered.model : undefined;
        select(agent, harness, known ?? kept ?? deps.fallback(harness));
    }
    /** Leave the hidden provider for the pick the session had before, or the one it was created with. */
    function restore(agent) {
        const current = agent.model.current();
        if (!current || !harnessOfProvider(current.provider))
            return;
        const { provider, model, reasoningEffort } = agent.options;
        const fallback = provider && model ? { provider, model, ...(reasoningEffort ? { reasoningEffort } : {}) } : undefined;
        const target = previous.get(agent.id) ?? fallback;
        if (!target)
            return;
        previous.delete(agent.id);
        agent.model.select(target);
    }
    // New sessions carry their preset in the header and announce nothing else.
    ctx.on('agent/created', ({ agent }) => {
        const harness = deps.harnessOf(agent);
        if (!harness)
            return;
        // A failing listener would fail the session's creation; the input-time routing still covers it.
        try {
            ensure(agent, harness);
        }
        catch (error) {
            ctx.logger.warn(`native-harness: routing ${agent.id} on creation failed: ${String(error)}`);
        }
    }, { global: true });
    // Emitted once the input is logged and before the driver wakes, so no step has taken it yet.
    ctx.on('agent/inbox/inserted', ({ agent }) => {
        const harness = deps.harnessOf(agent);
        if (harness)
            ensure(agent, harness);
    }, { global: true });
    ctx.on('session/event', (session, event) => {
        if (event.type === 'agent-preset/selected') {
            // dsh's preset picker on a blank session; the event's preset is the one it now runs.
            const agent = deps.agent(session.id);
            const harness = harnessOfPreset(event.data.agentPreset);
            if (agent)
                queueMicrotask(() => (harness ? ensure(agent, harness) : restore(agent)));
            return;
        }
        if (event.type !== 'model/selection')
            return;
        const agent = deps.agent(session.id);
        const harness = agent && deps.harnessOf(agent);
        if (agent && harness && event.data.provider !== PROVIDERS[harness])
            queueMicrotask(() => ensure(agent, harness));
    }, { global: true });
    ctx.on('agent/pre-step', async ({ agent, modelSelection }, next) => {
        const harness = deps.harnessOf(agent);
        if (!harness)
            return next();
        if (modelSelection.provider !== PROVIDERS[harness]) {
            ensure(agent, harness);
            const name = HARNESS_NAMES[harness];
            throw new Error(`${name} runs this session, so its model cannot be switched from dsh. Pick one with the model button and send again. / 本会话由 ${name} 运行，不能从 dsh 切换模型，请用模型按钮选择后重新发送。`);
        }
        const decision = await next();
        // A pick made while the session was cold, or a changed configured default, routes the next step.
        const model = await deps.model(agent, harness).catch(() => modelSelection.model);
        if (model !== modelSelection.model)
            select(agent, harness, model);
        else
            models.set(agent.id, { harness, model });
        return decision;
    }, { global: true });
    ctx.on('agent/disposed', ({ agent }) => {
        models.delete(agent.id);
        previous.delete(agent.id);
    }, { global: true });
    return {
        select,
        note: (sessionId, harness, model) => void models.set(sessionId, { harness, model }),
    };
}
