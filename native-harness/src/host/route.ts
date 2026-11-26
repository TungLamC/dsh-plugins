/**
 * Route: keeps a harness session's dsh model selection on its hidden provider.
 *
 * dsh fixes each step's provider, model and effort from the session's model
 * selection before the step is prepared, so the route is chosen ahead of time
 * with the public `agent.model.select()`:
 * - as soon as the session runs a native preset: when its agent is created
 *   (new, resumed, cleared, compacted) and when a blank session switches to
 *   one, so nothing reads the stale pick before the first input;
 * - when input is queued, before the step that takes it is prepared;
 * - when the session picks another native model;
 * - right after anything else selects for the session (dsh's `/model`); the
 *   session event that reports it cannot append another.
 *
 * A blank session switched back to a normal preset gets back the pick it had
 * before it was routed, or the model the agent was created with when this
 * process never saw that pick.
 *
 * Invariants: a step whose route is not its harness's fails before reaching
 * any model; the selection never carries an effort, since the hidden provider
 * declares none and effort reaches the native session directly.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent, ModelSelection } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import { HARNESS_NAMES, PROVIDERS, harnessOfPreset, harnessOfProvider, type HarnessId } from '../shared/types.ts'

export interface RouteDeps {
  agent(sessionId: string): Agent | undefined
  harnessOf(agent: Agent): HarnessId | undefined
  /** The model a session runs with, from its stored picks. */
  model(agent: Agent, harness: HarnessId): Promise<string>
  /** The model of a session nothing is known about yet. */
  fallback(harness: HarnessId): string
}

export interface Route {
  /** Route a live session to its harness with this model; a no-op when it already is. */
  select(agent: Agent, harness: HarnessId, model: string): void
  /** Remember the model a cold session picked, for when it wakes. */
  note(sessionId: string, harness: HarnessId, model: string): void
}

export function installRoute(ctx: Context, deps: RouteDeps): Route {
  /** Each session's native model as last resolved: routing queued input cannot wait for the store. */
  const models = new Map<string, { harness: HarnessId; model: string }>()
  /** A session's own pick from before it was routed, to give back if it leaves the native preset while blank. */
  const previous = new Map<string, ModelSelection>()

  function select(agent: Agent, harness: HarnessId, model: string): void {
    models.set(agent.id, { harness, model })
    agent.model.select({ provider: PROVIDERS[harness], model })
  }

  function ensure(agent: Agent, harness: HarnessId): void {
    const current = agent.model.current()
    if (current && !harnessOfProvider(current.provider)) previous.set(agent.id, { ...current })
    const kept = current?.provider === PROVIDERS[harness] ? current.model : undefined
    const remembered = models.get(agent.id)
    const known = remembered?.harness === harness ? remembered.model : undefined
    select(agent, harness, known ?? kept ?? deps.fallback(harness))
  }

  /** Leave the hidden provider for the pick the session had before, or the one it was created with. */
  function restore(agent: Agent): void {
    const current = agent.model.current()
    if (!current || !harnessOfProvider(current.provider)) return
    const { provider, model, reasoningEffort } = agent.options
    const fallback = provider && model ? { provider, model, ...(reasoningEffort ? { reasoningEffort } : {}) } : undefined
    const target = previous.get(agent.id) ?? fallback
    if (!target) return
    previous.delete(agent.id)
    agent.model.select(target)
  }

  // New sessions carry their preset in the header and announce nothing else.
  ctx.on(
    'agent/created',
    ({ agent }) => {
      const harness = deps.harnessOf(agent)
      if (!harness) return
      // A failing listener would fail the session's creation; the input-time routing still covers it.
      try {
        ensure(agent, harness)
      } catch (error) {
        ctx.logger.warn(`native-harness: routing ${agent.id} on creation failed: ${String(error)}`)
      }
    },
    { global: true },
  )

  // Emitted once the input is logged and before the driver wakes, so no step has taken it yet.
  ctx.on(
    'agent/inbox/inserted',
    ({ agent }) => {
      const harness = deps.harnessOf(agent)
      if (harness) ensure(agent, harness)
    },
    { global: true },
  )

  ctx.on(
    'session/event',
    (session, event) => {
      if (event.type === 'agent-preset/selected') {
        // dsh's preset picker on a blank session; the event's preset is the one it now runs.
        const agent = deps.agent(session.id)
        const harness = harnessOfPreset(event.data.agentPreset)
        if (agent) queueMicrotask(() => (harness ? ensure(agent, harness) : restore(agent)))
        return
      }
      if (event.type !== 'model/selection') return
      const agent = deps.agent(session.id)
      const harness = agent && deps.harnessOf(agent)
      if (agent && harness && event.data.provider !== PROVIDERS[harness]) queueMicrotask(() => ensure(agent, harness))
    },
    { global: true },
  )

  ctx.on(
    'agent/pre-step',
    async ({ agent, modelSelection }, next) => {
      const harness = deps.harnessOf(agent)
      if (!harness) return next()
      if (modelSelection.provider !== PROVIDERS[harness]) {
        ensure(agent, harness)
        const name = HARNESS_NAMES[harness]
        throw new Error(
          `${name} runs this session, so its model cannot be switched from dsh. Pick one with the model button and send again. / 本会话由 ${name} 运行，不能从 dsh 切换模型，请用模型按钮选择后重新发送。`,
        )
      }
      const decision = await next()
      // A pick made while the session was cold, or a changed configured default, routes the next step.
      const model = await deps.model(agent, harness).catch(() => modelSelection.model)
      if (model !== modelSelection.model) select(agent, harness, model)
      else models.set(agent.id, { harness, model })
      return decision
    },
    { global: true },
  )

  ctx.on(
    'agent/disposed',
    ({ agent }) => {
      models.delete(agent.id)
      previous.delete(agent.id)
    },
    { global: true },
  )

  return {
    select,
    note: (sessionId, harness, model) => void models.set(sessionId, { harness, model }),
  }
}
