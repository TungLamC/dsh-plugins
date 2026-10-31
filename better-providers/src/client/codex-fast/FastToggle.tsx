/**
 * The fast-mode switch in the composer: a bare lightning bolt right before the
 * model selector, coloured while on. What shows when is decided by
 * `fastToggle`; this file lays it out and saves a click.
 */

import { useState, type ReactNode } from 'react'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { prioritizable, type CodexFastRemote } from '../../shared/codex-fast.wire.ts'
import { settle } from '../kit/settle.ts'
import { useFollowed } from '../kit/use-followed.ts'
import css from './FastToggle.module.css'
import { fastToggle } from './model.ts'

export interface Injected {
  sessionId: string
  remote: CodexFastRemote
  hooks: {
    /** The session's model selection, shared with the model selector. */
    directory: ObservableSnapshot<ModelDirectoryState>
    /** Whether fast mode works in this dsh; undefined until the Host says. */
    support: ObservableSnapshot<boolean | undefined>
  }
}

type Props = InjectFace<Injected> & PropsLocale<'better-providers-codex-fast'>

export function FastToggle({ sessionId, remote, useDirectory, useSupport, t }: Props): ReactNode {
  const provider = useDirectory(state => state.current?.provider)
  const supported = useSupport(value => value)
  // Reading the switch records it on first sight, so only for a session that shows it.
  const watching = supported === true && provider !== undefined && prioritizable(provider)
  const { value: enabled } = useFollowed(watching ? signal => remote.watch(sessionId, signal) : undefined, sessionId)
  const [saving, setSaving] = useState<boolean>()
  const [failed, setFailed] = useState(false)
  const view = fastToggle({ provider, supported, enabled, saving })
  if (!view.shown) return null

  const toggle = (): void => {
    const next = !view.pressed
    setSaving(next)
    setFailed(false)
    void settle(() => remote.set(sessionId, next)).then((result) => {
      setSaving(undefined)
      setFailed(!result.ok)
    })
  }
  return (
    <span className={css['wrap']}>
      <button
        type="button"
        className={view.pressed ? `${css['bolt']} ${css['on']}` : css['bolt']}
        aria-label={t('label')}
        aria-pressed={view.pressed}
        title={t(view.title)}
        disabled={view.disabled}
        onClick={toggle}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
          <path d="M13 2 4 14h7l-1 8 10-13h-7l1-7Z" />
        </svg>
      </button>
      {failed && <span className={css['error']} role="status">{t('failed')}</span>}
    </span>
  )
}
