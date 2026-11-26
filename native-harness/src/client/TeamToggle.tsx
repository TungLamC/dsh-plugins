/**
 * Agent-team switch for ordinary dsh sessions, at the bottom of the model menu.
 *
 * dsh rc.5 puts this switch in its own model button (`conversation.input.model.options`),
 * which this plugin replaces; its component is not exported, so it is redrawn here from
 * public parts with the same behaviour: hidden for subagent sessions and without
 * agent-team; disabled while locked, saving, or before the model selection is known;
 * turning it off after the session has used a model asks first; no optimistic update.
 */
import { useState } from 'react'
import { Button, IconInfoOutlineRegular, Modal, Switch, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from './locales.ts'
import './picker.css'

/** `remote.agentTeams` unwrapped; rejects with the Host's message. */
export interface TeamPort {
  setEnabled(sessionId: string, enabled: boolean): Promise<void>
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined
/** The `agentTeam` projection, or undefined when agent-team is not installed. */
export function teamMode(value: unknown): { enabled: boolean } | undefined {
  const enabled = record(value)?.enabled
  return typeof enabled === 'boolean' ? { enabled } : undefined
}
/** Whether the session has sent a model request; undefined until the projection arrives. */
export function hasUsedModel(value: unknown): boolean | undefined {
  const selection = record(value)
  return selection && 'lastUsed' in selection ? selection.lastUsed !== null : undefined
}

interface ToggleProps {
  sessionId: string
  port: TeamPort
  mode: { enabled: boolean }
  /** undefined while dsh's model selection is not known yet. */
  used: boolean | undefined
  locked: boolean
  /** Close the menu and ask before turning the team off. */
  requestDisable(): void
  t: Translate
}

/** A failed change shows in an error strip above the row until the next try or the menu closes. */
export function TeamToggle({ sessionId, port, mode, used, locked, requestDisable, t }: ToggleProps) {
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState('')
  const select = (enabled: boolean) => {
    if (!enabled && used) {
      requestDisable()
      return
    }
    setPending(true)
    setFailure('')
    port
      .setEnabled(sessionId, enabled)
      .catch((error: unknown) => setFailure(t('teamFailed', { message: error instanceof Error ? error.message : String(error) })))
      .finally(() => setPending(false))
  }
  return (
    <>
      {failure && (
        <div className="nh-picker-error" role="alert">
          <span>{failure}</span>
        </div>
      )}
      <div className="nh-team-row">
        <span className="nh-team-label">
          <span>{t('teamLabel')}</span>
          <Tooltip label={t('teamDescription')} side="top" delayMs={300} maxWidth={300} portal openOnClick>
            <Button variant="ghost" size="sm" className="nh-team-info" aria-label={t('teamInfo')}>
              <IconInfoOutlineRegular size={11} aria-hidden="true" />
            </Button>
          </Tooltip>
        </span>
        <Switch
          className="nh-team-switch"
          checked={mode.enabled}
          disabled={locked || pending || used === undefined}
          label={t('teamLabel')}
          onChange={select}
        />
      </div>
    </>
  )
}

/** Confirmation that outlives the menu that opened it; a failure stays visible until retry or cancel. */
export function TeamDisableDialog({ sessionId, port, onClose, t }: { sessionId: string; port: TeamPort; onClose(): void; t: Translate }) {
  const [state, setState] = useState<{ kind: 'ready' } | { kind: 'saving' } | { kind: 'failed'; message: string }>({ kind: 'ready' })
  const saving = state.kind === 'saving'
  const cancel = () => {
    if (!saving) onClose()
  }
  const confirm = () => {
    if (saving) return
    setState({ kind: 'saving' })
    port.setEnabled(sessionId, false).then(onClose, (error: unknown) =>
      setState({ kind: 'failed', message: error instanceof Error ? error.message : String(error) }),
    )
  }
  return (
    <Modal
      open
      tone="warning"
      title={t('teamDisableTitle')}
      closeLabel={t('close')}
      onClose={cancel}
      className="nh-team-dialog"
      contentClassName="nh-team-dialog-content"
      footer={
        <>
          <Button variant="outline" disabled={saving} data-modal-autofocus onClick={cancel}>
            {t('cancel')}
          </Button>
          <Button variant="primary" disabled={saving} onClick={confirm}>
            {t('teamDisableConfirm')}
          </Button>
        </>
      }
    >
      <div className="nh-team-dialog-copy">
        <p>{t('teamDisableDescription')}</p>
        <p>{t('teamDisableWarning')}</p>
      </div>
      {state.kind === 'failed' && (
        <p role="alert" className="nh-team-dialog-error">
          {t('teamFailed', { message: state.message })}
        </p>
      )}
    </Modal>
  )
}
