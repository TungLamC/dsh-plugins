/** Browser half: composer seats, sidebar mark, tool cards and the harness `/` groups. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type {} from '@deepseek-ai/dsh-client-ui-permission-presets/client'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { ACTIVITY_TOOL } from '../shared/activity.ts'
import { harnessOfPreset } from '../shared/types.ts'
import { REMOTE } from '../shared/wire.ts'
import { ActivityView } from './ActivityView.tsx'
import { nativeActions, type NativeActions } from './actions.ts'
import { commandSources } from './commands.ts'
import { en, zh, type LocaleKey, type Translate } from './locales.ts'
import { ModelSeat, type Observed } from './ModelSeat.tsx'
import { PermissionSeat, type DshCatalog, type DshPermissionPort } from './PermissionSeat.tsx'
import { ResumeAction } from './ResumeAction.tsx'
import { BackgroundTasks } from './BackgroundTasks.tsx'
import { FastToggle } from './FastToggle.tsx'
import { SessionMark } from './SessionMark.tsx'
import type { TeamPort } from './TeamToggle.tsx'
import { TerminalResume } from './TerminalResume.tsx'
import { createViews } from './views.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    nativeHarness: LocaleKey
  }
}
const NS = 'nativeHarness'
export const inject = ['slots', 'remote', 'locale', 'sessions', 'inputTriggers', 'modelDirectories']

/** dsh's permission catalog and command path, for the seat of ordinary sessions. */
function dshPermissions(ctx: Context): DshPermissionPort {
  let value: DshCatalog | null = null
  let epoch = 0
  let retry: ReturnType<typeof setTimeout> | undefined
  const listeners = new Set<() => void>()
  const remote = ctx.remote as unknown as {
    permissionPresets: { catalog(): Promise<{ ok: boolean; value?: DshCatalog }> }
    $on(event: string, listener: () => void): () => void
  }
  const publish = (next: DshCatalog | null) => {
    value = next
    for (const listener of listeners) listener()
  }
  // Latest read wins; failures retry with backoff so the seat does not stay empty.
  const read = (attempt = 0) => {
    clearTimeout(retry)
    const mine = ++epoch
    remote.permissionPresets
      .catalog()
      .then((result) => {
        if (mine !== epoch) return
        if (result.ok && result.value) publish(result.value)
        else throw new Error('permission catalog unavailable')
      })
      .catch(() => {
        if (mine === epoch && attempt < 6) retry = setTimeout(() => read(attempt + 1), 500 * 2 ** attempt)
      })
  }
  ctx.effect(() => remote.$on('permission-presets/catalog-changed', () => read()))
  // A new connection may reach another Host generation: drop the old catalog and read again.
  ;(ctx as unknown as { on(event: string, listener: () => void): void }).on('connection/reset', () => {
    publish(null)
    read()
  })
  ctx.effect(() => () => clearTimeout(retry))
  read()
  return {
    catalog: {
      subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      getSnapshot: () => value,
    },
    async select(sessionId, preset) {
      const live = ctx.sessions.binding(sessionId as SessionId)?.session
      if (!live) throw new Error('this session is not materialized yet')
      const result = await live.command(`/permission ${preset}`)
      if (!result.ok) throw new Error(result.error.message)
    },
  }
}

/** agent-team's Remote while its client face is mounted; without it the menu shows no team switch. */
function teamPort(ctx: Context): Observed<TeamPort | null> {
  let value: TeamPort | null = null
  const listeners = new Set<() => void>()
  const publish = (next: TeamPort | null) => {
    value = next
    for (const listener of listeners) listener()
  }
  ctx.inject(['remote.agentTeams'], (scope) => {
    const remote = scope.remote as unknown as {
      agentTeams: { setEnabled(sessionId: string, enabled: boolean): Promise<RemoteResult<void>> }
    }
    publish({
      async setEnabled(sessionId, enabled) {
        const result = await remote.agentTeams.setEnabled(sessionId, enabled)
        if (!result.ok) throw new Error(result.error.message)
      },
    })
    scope.effect(() => () => publish(null))
  })
  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => value,
  }
}

/** The configured `providerIcons`, read once per connection; empty until read or when the read fails. */
function configuredIcons(ctx: Context, actions: NativeActions): Observed<Readonly<Record<string, string>>> {
  let value: Readonly<Record<string, string>> = {}
  const listeners = new Set<() => void>()
  const read = () =>
    void actions
      .icons()
      .then((next) => {
        value = next
        for (const listener of listeners) listener()
      })
      .catch(() => undefined)
  ;(ctx as unknown as { on(event: string, listener: () => void): void }).on('connection/reset', read)
  read()
  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => value,
  }
}

export async function apply(ctx: Context): Promise<void> {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }))
  const t = ctx.locale.bind(NS) as unknown as Translate
  ctx.slots.inject('tool.call.toolview', () =>
    ctx.slots.register({ name: 'tool.call.toolview', key: ACTIVITY_TOOL, locale: NS }, ActivityView),
  )
  await ctx.remote.$mount(REMOTE)
  ctx.inject(['remote.nativeHarness', 'remote.permissionPresets', 'remote.session'], (child) => {
    const actions = nativeActions(child.remote.nativeHarness)
    const harnessOf = (sessionId: string) =>
      harnessOfPreset(child.sessions.list.getSnapshot().byId[sessionId as SessionId]?.projectionValues?.agentPreset)
    for (const source of commandSources(actions, harnessOf, t))
      child.effect(() => child.inputTriggers.registerSource(source))
    const dsh = dshPermissions(child)
    const team = teamPort(child)
    const views = createViews(actions)
    const icons = configuredIcons(child, actions)
    child.slots.inject('conversation.input.model', () =>
      child.slots.register(
        {
          name: 'conversation.input.model',
          priority: -10,
          locale: NS,
          inject: () => ({ views, directories: child.modelDirectories, team, icons }),
        },
        ModelSeat as never,
      ),
    )
    child.slots.inject('conversation.input.permission', () =>
      child.slots.register(
        { name: 'conversation.input.permission', priority: -10, locale: NS, inject: () => ({ views, dsh }) },
        PermissionSeat as never,
      ),
    )
    // Where better-providers puts its fast switch for dsh's Codex route; only one of them shows for a session.
    child.slots.inject('conversation.input.right', () =>
      child.slots.register(
        { name: 'conversation.input.right', id: 'native-harness-fast', order: 100, locale: NS, inject: () => ({ views }) },
        FastToggle as never,
      ),
    )
    // Beside dsh's activity (0) and usage (1) pills below the composer.
    child.slots.inject('conversation.composer.dock', () =>
      child.slots.register(
        { name: 'conversation.composer.dock', id: 'native-harness-tasks', order: 2, locale: NS, inject: () => ({ actions }) },
        BackgroundTasks as never,
      ),
    )
    // Next to the preset label (order -10) in the session title row.
    child.slots.inject('conversation.session.header.actions', () =>
      child.slots.register(
        { name: 'conversation.session.header.actions', id: 'native-harness-resume', order: -9, locale: NS, inject: () => ({ actions }) },
        ResumeAction as never,
      ),
    )
    child.slots.inject('sidebar.session.row.leading', () =>
      child.slots.register(
        { name: 'sidebar.session.row.leading', id: 'native-harness', order: 21, inject: () => ({ sessions: child.sessions.list }) },
        SessionMark as never,
      ),
    )
    // In the New Session row beside forge's worktree switch; blank Claude Code sessions only.
    child.slots.inject('conversation.hero.options', () =>
      child.slots.register(
        { name: 'conversation.hero.options', id: 'native-harness-terminal', locale: NS, inject: () => ({ actions, views }) },
        TerminalResume as never,
      ),
    )
  })
}
