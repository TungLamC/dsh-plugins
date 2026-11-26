/**
 * Fast mode of a native Codex session: a bare lightning bolt before the model
 * button, where better-providers puts its own for dsh's Codex route, coloured
 * while on. Shown only when the session's model offers fast mode. Switching it
 * during a turn takes effect from the next turn.
 */
import { useEffect, useState } from 'react'
import { harnessOfPreset } from '../shared/types.ts'
import type { Translate } from './locales.ts'
import { useView, type Views } from './views.ts'
import './picker.css'

interface Props {
  sessionId: string
  useProjection: (key: 'agentPreset') => unknown
  views: Views
  t: Translate
}

export function FastToggle(props: Props) {
  return harnessOfPreset(props.useProjection('agentPreset')) === 'codex' ? <CodexFast key={props.sessionId} {...props} /> : null
}

function CodexFast({ sessionId, views, t }: Props) {
  const { view } = useView(views, sessionId, 'codex')
  const [saving, setSaving] = useState<boolean>()
  const [message, setMessage] = useState<{ text: string; failed: boolean }>()
  // "Next turn" is a passing hint; a failure stays until the next try.
  useEffect(() => {
    if (!message || message.failed) return
    const timer = setTimeout(() => setMessage(undefined), 4000)
    return () => clearTimeout(timer)
  }, [message])
  const model = view?.catalog?.models.find((candidate) => candidate.id === view.settings.model)
  if (!view || !model?.fast) return null
  const pressed = saving ?? view.settings.fast === true
  const about = model.fast.description ? `\n${model.fast.name}: ${model.fast.description}` : ''
  const toggle = () => {
    const next = !pressed
    setSaving(next)
    setMessage(undefined)
    views
      .select(sessionId, { fast: next })
      .then(
        (outcome) => {
          if (outcome.result.status === 'next-turn') setMessage({ text: t('nextTurn'), failed: false })
          else if (outcome.result.status !== 'applied')
            setMessage({ text: outcome.result.detail ?? t('fastFailed'), failed: true })
        },
        () => setMessage({ text: t('fastFailed'), failed: true }),
      )
      .finally(() => setSaving(undefined))
  }
  return (
    <span className="nh-fast">
      <button
        type="button"
        className={`nh-fast-bolt${pressed ? ' is-on' : ''}`}
        aria-label={t('fastLabel')}
        aria-pressed={pressed}
        title={`${t(pressed ? 'fastOn' : 'fastOff')}${about}`}
        disabled={saving !== undefined}
        onClick={toggle}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
          <path d="M13 2 4 14h7l-1 8 10-13h-7l1-7Z" />
        </svg>
      </button>
      {message && (
        <span className={`nh-fast-message${message.failed ? ' is-error' : ''}`} role="status">
          {message.text}
        </span>
      )}
    </span>
  )
}
