/**
 * New Session option of a blank Claude Code session: continue a conversation
 * started in a terminal. It sits with dsh's own options (beside forge's
 * worktree switch); its panel lists the Claude Code sessions started in the
 * session's directory, newest first. The pick holds until the first turn,
 * which resumes that conversation or a copy of it; until then it can change
 * or be undone.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Button,
  Checkbox,
  IconCheckOutlineRegular,
  IconCloseFillRegular,
  MenuSurface,
  Tag,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { harnessOfPreset, type TerminalSessions } from '../shared/types.ts'
import type { NativeActions } from './actions.ts'
import { BrandIcon } from './BrandIcon.tsx'
import type { Translate } from './locales.ts'
import { useView, type Views } from './views.ts'
import './picker.css'
import './style.css'

interface Props {
  sessionId: string
  useProjection: (key: 'agentPreset') => unknown
  actions: NativeActions
  views: Views
  t: Translate
}

type Listing = { status: 'loading' } | { status: 'ready'; value: TerminalSessions } | { status: 'failed'; error: string }

const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))
const basename = (path: string) => path.replace(/\/+$/, '').split('/').pop() || path

/** How long ago `ms` was, coarsely; a week or more shows the date. */
export function ago(ms: number, now: number, t: Translate): string {
  const minutes = Math.floor((now - ms) / 60_000)
  if (minutes < 1) return t('agoNow')
  if (minutes < 60) return t('agoMinutes', { n: String(minutes) })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('agoHours', { n: String(hours) })
  const days = Math.floor(hours / 24)
  if (days < 7) return t('agoDays', { n: String(days) })
  return new Date(ms).toLocaleDateString()
}

export function TerminalResume(props: Props) {
  return harnessOfPreset(props.useProjection('agentPreset')) === 'claude-code' ? <Picker key={props.sessionId} {...props} /> : null
}

function Picker({ sessionId, actions, views, t }: Props) {
  const { view } = useView(views, sessionId, 'claude-code')
  const adopted = view?.adopted
  const [open, setOpen] = useState(false)
  const [listing, setListing] = useState<Listing>({ status: 'loading' })
  const [reload, setReload] = useState(0)
  const [picked, setPicked] = useState<string | undefined>()
  const [fork, setFork] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const anchorName = `--nh-terminal-${useId().replaceAll(':', '')}`

  useEffect(() => {
    if (!open) return
    let live = true
    setListing({ status: 'loading' })
    actions.terminalSessions(sessionId).then(
      (value) => live && setListing({ status: 'ready', value }),
      (reason: unknown) => live && setListing({ status: 'failed', error: message(reason) }),
    )
    return () => {
      live = false
    }
  }, [open, reload, sessionId, actions])
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!trigger.current?.contains(target) && !panel.current?.contains(target)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  const show = () => {
    setPicked(adopted?.id)
    setFork(adopted?.fork ?? false)
    setError('')
    setOpen(true)
  }
  const sessions = listing.status === 'ready' ? listing.value.sessions : []
  const choice = sessions.find((session) => session.id === picked)
  // A conversation a terminal still has open can only be continued on a copy.
  const forced = choice?.open === true
  const adopt = async (next: { id: string; fork: boolean } | null) => {
    setBusy(true)
    setError('')
    try {
      await actions.adopt(sessionId, next)
      views.refresh(sessionId)
      return true
    } catch (reason) {
      setError(message(reason))
      return false
    } finally {
      setBusy(false)
    }
  }
  const confirm = async () => {
    if (!choice || busy) return
    if (await adopt({ id: choice.id, fork: fork || forced })) {
      setOpen(false)
      trigger.current?.focus()
    }
  }

  const label = adopted ? t(adopted.fork ? 'terminalAdoptedFork' : 'terminalAdopted', { title: adopted.title }) : t('terminalResume')
  const now = Date.now()
  return (
    <span className="nh-terminal-option">
      <button
        ref={trigger}
        type="button"
        className="nh-resume-trigger nh-terminal-trigger"
        style={{ anchorName }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-pressed={adopted ? true : undefined}
        title={adopted ? adopted.title : t('terminalTitle')}
        disabled={busy}
        onClick={() => (open ? setOpen(false) : show())}
      >
        <BrandIcon harness="claude-code" size={14} />
        <span className="nh-terminal-label">{label}</span>
      </button>
      {adopted && (
        <button
          type="button"
          className="nh-resume-trigger nh-terminal-cancel"
          aria-label={t('terminalCancel')}
          title={t('terminalCancel')}
          disabled={busy}
          onClick={() => void adopt(null)}
        >
          <IconCloseFillRegular size={12} />
        </button>
      )}
      {!open && error && (
        <span className="nh-terminal-error" role="alert">
          {error}
        </span>
      )}
      {open &&
        createPortal(
          <MenuSurface
            ref={panel}
            role="dialog"
            aria-label={t('terminalTitle')}
            aria-busy={busy || listing.status === 'loading'}
            className="nh-resume-panel nh-terminal-panel"
            style={{ positionAnchor: anchorName }}
          >
            <span className="nh-terminal-heading">{t('terminalTitle')}</span>
            {listing.status === 'loading' && (
              <span className="nh-resume-caption" role="status">
                {t('terminalLoading')}
              </span>
            )}
            {listing.status === 'failed' && (
              <div className="nh-picker-error" role="alert">
                <span>{listing.error}</span>
                <button type="button" onClick={() => setReload((value) => value + 1)}>
                  {t('retry')}
                </button>
              </div>
            )}
            {listing.status === 'ready' && (
              <span className="nh-resume-caption" title={listing.value.cwd}>
                {t('terminalCaption', { dir: basename(listing.value.cwd) })}
              </span>
            )}
            {listing.status === 'ready' && !sessions.length && <p className="nh-resume-note">{t('terminalEmpty')}</p>}
            {sessions.length > 0 && (
              <div className="nh-terminal-list" role="radiogroup" aria-label={t('terminalTitle')}>
                {sessions.map((session) => {
                  const checked = session.id === picked
                  return (
                    <button
                      key={session.id}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      className="nh-terminal-row"
                      title={session.title}
                      onClick={() => setPicked(session.id)}
                    >
                      <span className="nh-terminal-row-title">{session.title}</span>
                      <span className="nh-terminal-row-meta">
                        <span>{ago(session.modified, now, t)}</span>
                        {session.branch && <span className="nh-terminal-row-branch">{session.branch}</span>}
                        <span className="nh-resume-id">{session.id.slice(0, 8)}</span>
                        {session.open && <Tag tone="warning">{t('terminalOpen')}</Tag>}
                      </span>
                      <span className="nh-picker-check">{checked && <IconCheckOutlineRegular />}</span>
                    </button>
                  )
                })}
              </div>
            )}
            {choice && (
              <>
                <Checkbox checked={fork || forced} disabled={forced} onChange={setFork} label={t('terminalFork')} />
                {forced && <p className="nh-terminal-warning">{t('terminalForkForced')}</p>}
                {!forced && !fork && <p className="nh-resume-note">{t('terminalDirect')}</p>}
                <p className="nh-resume-note">{t('terminalHistory')}</p>
              </>
            )}
            {error && (
              <div className="nh-picker-error" role="alert">
                <span>{error}</span>
              </div>
            )}
            <div className="nh-terminal-actions">
              <Button variant="primary" size="sm" disabled={!choice || busy} onClick={() => void confirm()}>
                {t('terminalConfirm')}
              </Button>
            </div>
          </MenuSurface>,
          document.body,
        )}
    </span>
  )
}
