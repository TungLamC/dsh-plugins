/**
 * Session header action of a native-harness session: the native session id
 * and the command that resumes it in the harness's own terminal UI.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CodeBlock, MenuSurface } from '@deepseek-ai/dsh-client-ui-primitives'
import { harnessOfPreset, HARNESS_NAMES, type HarnessId, type NativeView, type SessionView } from '../shared/types.ts'
import type { NativeActions } from './actions.ts'
import { BrandIcon } from './BrandIcon.tsx'
import type { Translate } from './locales.ts'

interface Props {
  sessionId: string
  useProjection: (key: 'agentPreset' | 'tokenUsage') => unknown
  actions: NativeActions
  t: Translate
}

const quote = (value: string) => `'${value.replaceAll(`'`, `'\\''`)}'`

/**
 * Claude keeps sessions per project directory, so every command starts from the
 * session's cwd. A Claude session on an endpoint with a `command` (e.g. a shell
 * alias that points `claude` at it) resumes with that command.
 */
export function resumeCommand(harness: HarnessId, native: NativeView, view?: Pick<SessionView, 'endpoints' | 'settings'>): string {
  const command = view?.endpoints?.find((endpoint) => endpoint.id === view.settings.endpoint)?.command || 'claude'
  const resume =
    harness === 'claude-code'
      ? `${command} --resume ${native.id}`
      : harness === 'antigravity'
        ? `agy --conversation ${native.id}`
        : `codex resume ${native.id}`
  return `cd ${quote(native.cwd)} && ${resume}`
}

export function ResumeAction({ sessionId, useProjection, actions, t }: Props) {
  const harness = harnessOfPreset(useProjection('agentPreset'))
  // A session gets its native id with its first turn; every finished step re-reads it.
  const steps = useProjection('tokenUsage')
  const [view, setView] = useState<SessionView | null>(null)
  const native = view?.native
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const anchorName = `--nh-resume-${useId().replaceAll(':', '')}`
  useEffect(() => {
    if (!harness) return
    let live = true
    actions
      .view(sessionId)
      .then((next: SessionView | null) => live && setView(next))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [sessionId, harness, actions, steps, open])
  useEffect(() => {
    if (!open) return
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
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])
  if (!harness || !native) return null
  const name = HARNESS_NAMES[harness]
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="nh-resume-trigger"
        style={{ anchorName }}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={t('resumeTitle', { name })}
        onClick={() => setOpen(!open)}
      >
        <BrandIcon harness={harness} size={14} />
        <span className="nh-resume-id">{native.id.slice(0, 8)}</span>
      </button>
      {open &&
        createPortal(
          <MenuSurface
            ref={panel}
            role="dialog"
            aria-label={t('resumeTitle', { name })}
            className="nh-resume-panel"
            style={{ positionAnchor: anchorName }}
          >
            <span className="nh-resume-caption">{t('resumeTitle', { name })}</span>
            <code className="nh-resume-full-id">{native.id}</code>
            <span className="nh-resume-caption">{t('resumeCommand')}</span>
            <CodeBlock code={resumeCommand(harness, native, view ?? undefined)} lang="bash" copyLabel={t('copy')} copiedLabel={t('copied')} />
            <p className={native.live ? 'nh-resume-warning' : 'nh-resume-note'}>
              {native.live ? t('resumeLive', { minutes: String(native.idleMinutes) }) : t('resumeIdle')}
            </p>
          </MenuSurface>,
          document.body,
        )}
    </>
  )
}
