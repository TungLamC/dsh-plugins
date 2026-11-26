/**
 * The composer model seat. Native-harness sessions read and write their own
 * settings through the plugin Remote; every other session keeps dsh's model
 * selection through the public `modelDirectories` service.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { ModelDirectoryResolver } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { UseSession, UseSessions } from '@deepseek-ai/dsh-client-ui-session/client'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { harnessOfPreset, HARNESS_NAMES, type HarnessId, type SettingsChange } from '../shared/types.ts'
import { BrandIcon } from './BrandIcon.tsx'
import type { Translate } from './locales.ts'
import { ModelMenu, type MenuModelGroup, type MenuSelection } from './ModelMenu.tsx'
import { providerIcon } from './ProviderIcon.tsx'
import { hasUsedModel, TeamDisableDialog, teamMode, TeamToggle, type TeamPort } from './TeamToggle.tsx'
import { useView, type Views } from './views.ts'

/** Something the seat reads that may come and go, such as agent-team's Remote. */
export interface Observed<T> {
  subscribe(listener: () => void): () => void
  getSnapshot(): T
}

interface SeatProps {
  sessionId: string
  locked: boolean
  useProjection: (key: 'agentPreset' | 'agentTeam' | 'modelSelection' | 'tokenUsage') => unknown
  useSession: UseSession
  useSessions: UseSessions
  views: Views
  directories: ModelDirectoryResolver
  team: Observed<TeamPort | null>
  /** The configured `providerIcons`, by provider id. */
  icons: Observed<Readonly<Record<string, string>>>
  t: Translate
}

export function ModelSeat(props: SeatProps) {
  const harness = harnessOfPreset(props.useProjection('agentPreset'))
  return harness ? (
    <HarnessModel key={`${props.sessionId}:${harness}`} {...props} harness={harness} />
  ) : (
    <DshModel key={props.sessionId} {...props} />
  )
}

/** How often a seat with a pending endpoint switch reads the session again; background tasks can end it any time. */
const SWITCH_POLL_MS = 2000

function HarnessModel({ sessionId, locked, views, useProjection, t, harness }: SeatProps & { harness: HarnessId }) {
  // Every finished step reads again: an endpoint switch takes effect when a turn ends.
  const { view, loading, error: readError } = useView(views, sessionId, harness, useProjection('tokenUsage'))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const catalog = view?.catalog
  const endpoints = view?.endpoints
  // With endpoints, each is a group listing the same models: picking in another group switches upstream.
  // Every group keeps the harness mark; the group headers tell endpoints apart.
  const groups = useMemo<MenuModelGroup[]>(() => {
    const models = (catalog?.models ?? []).map((model) => ({ id: model.id, name: model.name, efforts: model.efforts }))
    const icon = <BrandIcon harness={harness} />
    if (endpoints?.length) return endpoints.map((endpoint) => ({ id: endpoint.id, name: endpoint.name, icon, models }))
    return [{ id: harness, name: HARNESS_NAMES[harness], icon, models }]
  }, [catalog, endpoints, harness])
  // The Host resolves configured defaults, so the seat always shows concrete values.
  const settings = view?.settings ?? {}
  const endpoint = endpoints?.find((candidate) => candidate.id === settings.endpoint)
  const current: MenuSelection = {
    group: endpoints?.length ? (settings.endpoint ?? '') : harness,
    model: settings.model ?? '',
    effort: settings.effort ?? '',
  }
  const switching = view?.switching
  const pending =
    switching && endpoint ? t(switching === 'tasks' ? 'endpointWaitTasks' : 'endpointWaitTurn', { name: endpoint.name }) : ''
  useEffect(() => {
    if (!switching) return
    const timer = setInterval(() => views.refresh(sessionId), SWITCH_POLL_MS)
    return () => clearInterval(timer)
  }, [switching, views, sessionId])
  const choose = useCallback(
    async (selection: MenuSelection) => {
      setBusy(true)
      setError('')
      const change: SettingsChange = {}
      if (endpoints?.length && selection.group !== current.group) change.endpoint = selection.group
      if (selection.model !== current.model) change.model = selection.model || null
      // The menu picks a model with an empty effort; the same model on another endpoint keeps its effort.
      const sameModelElsewhere = 'endpoint' in change && !('model' in change)
      if ('model' in change || (selection.effort !== current.effort && !sameModelElsewhere)) change.effort = selection.effort || null
      try {
        const outcome = await views.select(sessionId, change)
        // An endpoint switch says what it waits for once the view is read again.
        setNote(outcome.result.status === 'next-turn' && !('endpoint' in change) ? t('nextTurn') : '')
        if ('endpoint' in change) views.refresh(sessionId)
        if (outcome.result.status === 'rejected' || outcome.result.status === 'unsupported')
          setError(outcome.result.detail ?? outcome.result.status)
        return true
      } catch (reason) {
        setError(String(reason))
        return false
      } finally {
        setBusy(false)
      }
    },
    [views, sessionId, endpoints, current.group, current.model, current.effort, t],
  )
  return (
    <ModelMenu
      title={endpoint ? `${HARNESS_NAMES[harness]} · ${endpoint.name}` : HARNESS_NAMES[harness]}
      groups={groups}
      current={current}
      defaultEffort={false}
      disabled={locked}
      busy={busy}
      loading={loading}
      error={error || readError}
      note={pending || note}
      pending={pending}
      retry={() => {
        setError('')
        views.refresh(sessionId)
      }}
      choose={choose}
      t={t}
    />
  )
}

/** Ordinary sessions: dsh's model directory, plus the agent-team switch native sessions have no use for. */
function DshModel({ sessionId, locked, directories, team, icons, useProjection, useSession, useSessions, t }: SeatProps) {
  const directory = useMemo(() => directories.directoryFor(sessionId as never), [directories, sessionId])
  const state = useSyncExternalStore(directory.store.subscribe, directory.store.getSnapshot)
  const [busy, setBusy] = useState(false)
  const port = useSyncExternalStore(team.subscribe, team.getSnapshot)
  const configuredIcons = useSyncExternalStore(icons.subscribe, icons.getSnapshot)
  const mode = teamMode(useProjection('agentTeam'))
  const used = hasUsedModel(useProjection('modelSelection'))
  const addressedChild = useSession((snapshot) => snapshot.subagent !== null)
  const listedChild = useSessions((list) => list.byId[sessionId as SessionId]?.origin === 'subagent')
  const [confirming, setConfirming] = useState(false)
  const footer =
    port && mode && !addressedChild && !listedChild
      ? ({ dismiss }: { dismiss(): void }) => (
          <TeamToggle
            sessionId={sessionId}
            port={port}
            mode={mode}
            used={used}
            locked={locked}
            requestDisable={() => {
              dismiss()
              setConfirming(true)
            }}
            t={t}
          />
        )
      : undefined
  useEffect(() => {
    void directory.load().catch(() => undefined)
  }, [directory])
  const groups = useMemo<MenuModelGroup[]>(
    () =>
      state.groups.map((group) => ({
        id: group.id,
        name: group.name,
        icon: providerIcon(group.id, configuredIcons),
        models: group.models.map((model) => ({
          id: model.id,
          name: model.name,
          efforts: model.reasoning?.efforts.map((effort) => ({ id: effort.id, name: effort.name })) ?? [],
          ...(model.reasoning?.defaultEffort ? { defaultEffort: model.reasoning.defaultEffort } : {}),
        })),
      })),
    [state.groups, configuredIcons],
  )
  const current: MenuSelection = {
    group: state.current?.provider ?? '',
    model: state.current?.model ?? '',
    effort: state.current?.reasoningEffort ?? '',
  }
  return (
    <>
      <ModelMenu
        title="DeepSeek Harness"
        groups={groups}
        current={current}
        disabled={locked || state.status === 'selecting'}
        busy={busy}
        loading={state.status === 'loading'}
        error={state.error ?? ''}
        retry={() => void directory.load().catch(() => undefined)}
        choose={async (selection) => {
          setBusy(true)
          try {
            const result = await directory.select({
              provider: selection.group,
              model: selection.model,
              ...(selection.effort ? { reasoningEffort: selection.effort } : {}),
            } as never)
            return result.ok
          } finally {
            setBusy(false)
          }
        }}
        footer={footer}
        t={t}
      />
      {confirming && port && <TeamDisableDialog sessionId={sessionId} port={port} onClose={() => setConfirming(false)} t={t} />}
    </>
  )
}
