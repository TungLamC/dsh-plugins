/**
 * Composer dock pill of a native-harness session: the subagents and
 * background tasks its native process is running, each with its own stop
 * control when the harness can stop it alone. The main Stop spares them, so
 * this list is how a user stops one.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MenuSurface, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import { harnessOfPreset, type BackgroundTask } from '../shared/types.ts'
import type { NativeActions } from './actions.ts'
import type { Translate } from './locales.ts'

interface Props {
  sessionId: string
  useProjection: (key: 'agentPreset' | 'tokenUsage') => unknown
  useSession: <T>(select: (session: { running: boolean }) => T) => T
  actions: NativeActions
  t: Translate
}

/** Live work changes without dsh steps, so the list is re-read while anything runs. */
const POLL_MS = 2000

function elapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`
  return `${Math.floor(seconds / 3600)}h${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}m`
}
const tokens = (count: number) => (count >= 1000 ? `${(count / 1000).toFixed(1)}K` : String(count))

export function BackgroundTasks({ sessionId, useProjection, useSession, actions, t }: Props) {
  const harness = harnessOfPreset(useProjection('agentPreset'))
  const steps = useProjection('tokenUsage')
  const running = useSession((session) => session.running)
  const [tasks, setTasks] = useState<BackgroundTask[]>([])
  const [stopping, setStopping] = useState<ReadonlySet<string>>(new Set())
  const [failed, setFailed] = useState('')
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [reload, setReload] = useState(0)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const anchorName = `--nh-tasks-${useId().replaceAll(':', '')}`
  const active = tasks.length > 0
  useEffect(() => {
    if (!harness) return
    let live = true
    actions
      .tasks(sessionId)
      .then((value) => {
        if (!live) return
        setTasks(value)
        setStopping((previous) => new Set([...previous].filter((id) => value.some((task) => task.id === id))))
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [sessionId, harness, actions, steps, running, reload])
  useEffect(() => {
    if (!harness || (!active && !running)) return
    const timer = setInterval(() => setReload((value) => value + 1), POLL_MS)
    return () => clearInterval(timer)
  }, [harness, active, running])
  useEffect(() => {
    if (!open) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    const outside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!trigger.current?.contains(target) && !panel.current?.contains(target)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      clearInterval(timer)
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])
  useEffect(() => {
    if (!active) setOpen(false)
  }, [active])
  if (!harness || !active) return null
  const stop = (id: string) => {
    setFailed('')
    setStopping((previous) => new Set(previous).add(id))
    actions
      .stopTask(sessionId, id)
      .then(() => setReload((value) => value + 1))
      .catch((reason: unknown) => {
        setFailed(String(reason))
        setStopping((previous) => new Set([...previous].filter((item) => item !== id)))
      })
  }
  return (
    <span className="nh-tasks-anchor">
      <button
        ref={trigger}
        type="button"
        className="nh-tasks-pill"
        style={{ anchorName }}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setNow(Date.now())
          setOpen(!open)
        }}
      >
        <StateDot state="ongoing" />
        <span>{t('tasksRunning', { count: String(tasks.length) })}</span>
      </button>
      {open &&
        createPortal(
          <MenuSurface
            ref={panel}
            role="dialog"
            aria-label={t('tasksTitle')}
            className="nh-tasks-panel"
            style={{ positionAnchor: anchorName }}
          >
            <span className="nh-tasks-title">{t('tasksTitle')}</span>
            <ul className="nh-tasks-list">
              {tasks.map((task) => {
                const halting = stopping.has(task.id)
                const details = [
                  elapsed(now - task.startedAt),
                  task.tokens !== undefined ? t('taskTokens', { count: tokens(task.tokens) }) : '',
                  task.toolUses !== undefined ? t('taskTools', { count: String(task.toolUses) }) : '',
                  task.lastTool ?? '',
                ].filter(Boolean)
                return (
                  <li key={task.id} className="nh-tasks-row">
                    <StateDot state={halting ? 'warning' : 'ongoing'} />
                    <span className="nh-tasks-main">
                      <span className="nh-tasks-primary">
                        <span className="nh-tasks-kind">
                          {t(task.kind === 'agent' ? 'taskAgent' : task.kind === 'shell' ? 'taskShell' : 'taskOther')}
                        </span>
                        {task.background && <span className="nh-tasks-kind">{t('taskBackground')}</span>}
                        <span className="nh-tasks-label" title={task.title}>
                          {task.title}
                        </span>
                      </span>
                      <span className="nh-tasks-secondary">{details.join(' · ')}</span>
                    </span>
                    {task.stoppable !== false && (
                      <button type="button" className="nh-tasks-stop" disabled={halting} onClick={() => stop(task.id)}>
                        {halting ? t('taskStopping') : t('taskStop')}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
            {failed && <p className="nh-error">{failed}</p>}
          </MenuSurface>,
          document.body,
        )}
    </span>
  )
}
