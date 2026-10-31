/**
 * Model refresh on a built-in pi-ai provider card: one row naming where the
 * models are read from, with a button that opens a dialog comparing the route
 * with pi-ai's newest catalog there. The new models
 * are checked to add and the withdrawn ones to keep; writing applies the choice.
 * What shows when is decided by `describePreview`; this file lays it out.
 */

import { useEffect, useId, useState, type ReactNode } from 'react'
import { Button, IconChevronDownOutlineRegular, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { CATALOG_SOURCE, type CatalogChoice, type CatalogPreview, type ModelsRemote } from '../../shared/models.wire.ts'
import { settle } from '../kit/settle.ts'
import { defaultChoice, describePreview, failureText, outcomeEffect, toggle, type GroupLine, type Note } from './model.ts'
import css from './RefreshSection.module.css'

export interface Injected {
  remote: ModelsRemote
}

type Props = PropsRuntime<'better-providers.provider-card'> & InjectFace<Injected> & PropsLocale<'better-providers-models'>
type T = TranslateNS<'better-providers-models'>

export function RefreshSection(props: Props): ReactNode {
  const { provider, configured } = props
  // Only a route pi-ai ships has a catalog to refresh from.
  if (provider.declared === true || !configured) return null
  return <Section key={provider.provider} {...props} />
}

function Section({ provider, remote, t }: Props): ReactNode {
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState<string>()
  const source = `${CATALOG_SOURCE}/${provider.provider}`
  return (
    <section className={css['panel']} aria-label={t('title')}>
      <div className={css['header']}>
        <span className={css['source']} title={`https://${source}`}>
          {t('source')}
          <code className={css['url']}>{source}</code>
        </span>
        <Button variant="outline" size="sm" onClick={() => { setNotice(undefined); setOpen(true) }}>{t('refresh')}</Button>
      </div>
      {notice !== undefined && <p className={css['hint']} role="status">{notice}</p>}
      {open && (
        <RefreshDialog
          provider={provider.provider}
          name={provider.displayName}
          remote={remote}
          t={t}
          onClose={(next) => { setOpen(false); setNotice(next) }}
        />
      )}
    </section>
  )
}

type Phase =
  | { phase: 'loading' }
  | { phase: 'failed'; text: string }
  | { phase: 'ready'; preview: CatalogPreview; choice: CatalogChoice }

interface DialogProps {
  provider: string
  name: string
  remote: ModelsRemote
  t: T
  /** Close the dialog, leaving a notice on the card. */
  onClose(notice?: string): void
}

function RefreshDialog({ provider, name, remote, t, onClose }: DialogProps): ReactNode {
  const [state, setState] = useState<Phase>({ phase: 'loading' })
  const [note, setNote] = useState<Note>()
  const [busy, setBusy] = useState(false)
  const [round, setRound] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setState({ phase: 'loading' })
    void settle(() => remote.preview(provider, controller.signal)).then((result) => {
      if (controller.signal.aborted) return
      setState(result.ok
        ? { phase: 'ready', preview: result.value, choice: defaultChoice(result.value) }
        : { phase: 'failed', text: failureText(result, t) })
    })
    return () => { controller.abort() }
  }, [provider, round]) // eslint-disable-line react-hooks/exhaustive-deps

  const shown = state.phase === 'ready' ? describePreview(state.preview, state.choice, t) : undefined

  const apply = (): void => {
    if (state.phase !== 'ready') return
    setBusy(true)
    setNote(undefined)
    void settle(() => remote.apply(state.preview.id, state.choice)).then((result) => {
      setBusy(false)
      if (!result.ok) {
        setNote({ tone: 'error', text: failureText(result, t) })
        return
      }
      const effect = outcomeEffect(result.value, t)
      if (effect.kind === 'close') onClose(effect.notice)
      else if (effect.kind === 'preview-again') {
        setNote({ tone: 'hint', text: effect.notice })
        setRound(value => value + 1)
      } else {
        setNote({ tone: 'error', text: effect.text })
      }
    })
  }

  const check = (group: 'added' | 'removed', id: string, on: boolean): void => {
    setState(current => current.phase === 'ready' ? { ...current, choice: toggle(current.preview, current.choice, group, id, on) } : current)
  }

  return (
    <Modal
      open
      className={css['modal']}
      title={t('dialogTitle', { provider: name })}
      closeLabel={t('cancel')}
      onClose={() => { onClose() }}
      footer={shown?.offersChange === false
        ? <Button variant="outline" onClick={() => { onClose() }}>{t('close')}</Button>
        : (
            <>
              <Button variant="outline" onClick={() => { onClose() }}>{t('cancel')}</Button>
              {state.phase === 'failed'
                ? <Button variant="primary" onClick={() => { setNote(undefined); setRound(value => value + 1) }}>{t('retry')}</Button>
                : <Button variant="primary" disabled={busy || shown?.canApply !== true} onClick={apply}>{t('apply')}</Button>}
            </>
          )}
    >
      <div className={css['dialog']}>
        {state.phase === 'loading' && <p className={css['hint']} role="status">{t('loading')}</p>}
        {state.phase === 'failed' && <p className={css['error']} role="alert">{state.text}</p>}
        {note !== undefined && <p className={css[note.tone]} role={note.tone === 'error' ? 'alert' : 'status'}>{note.text}</p>}
        {shown !== undefined && (
          <>
            {shown.notes.map(line => <p key={line.text} className={css[line.tone]}>{line.text}</p>)}
            <Groups groups={shown.groups.filter(group => !group.folded)} disabled={busy || !shown.canWrite} onCheck={check} />
            {shown.groups.some(group => group.folded) && (
              <Folded t={t}>
                <Groups groups={shown.groups.filter(group => group.folded)} disabled={busy || !shown.canWrite} onCheck={check} />
              </Folded>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}

/** The groups in a tinted panel: a solid line between groups, a dashed one between models. */
function Groups({ groups, disabled, onCheck }: { groups: GroupLine[]; disabled: boolean; onCheck(group: 'added' | 'removed', id: string, on: boolean): void }): ReactNode {
  if (groups.length === 0) return null
  return (
    <div className={css['groups']}>
      {groups.map(group => (
        <div key={group.kind} className={css['group']}>
          <span className={css['label']}>{group.heading}</span>
          {group.hint !== undefined && <p className={css['description']}>{group.hint}</p>}
          <ul className={css['items']}>
            {group.items.map((item) => {
              const kind = group.kind
              const text = (
                <>
                  <span className={css['itemName']}>{item.name}</span>
                  {item.name !== item.id && <code className={css['itemId']}>{item.id}</code>}
                </>
              )
              const checkable = item.checked !== undefined && (kind === 'added' || kind === 'removed')
              return (
                <li key={item.id} className={css['item']} data-checkable={checkable || undefined}>
                  {checkable
                    ? (
                        // The model's line itself is the label, so a checked model reads like an unchecked group's.
                        <label className={css['itemLine']}>
                          <input
                            type="checkbox"
                            className={css['check']}
                            checked={item.checked}
                            disabled={disabled}
                            onChange={(event) => { onCheck(kind, item.id, event.target.checked) }}
                          />
                          {text}
                        </label>
                      )
                    : <span className={css['itemLine']}>{text}</span>}
                  {item.details.map(detail => <span key={detail} className={css['description']}>{detail}</span>)}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}

/** A dashed divider with a chevron in its middle; the chevron turns over when the folded groups open. */
function Folded({ children, t }: { children: ReactNode; t: T }): ReactNode {
  const [open, setOpen] = useState(false)
  const id = useId()
  const label = t(open ? 'hideUnchanged' : 'showUnchanged')
  return (
    <>
      <button type="button" className={css['toggle']} aria-expanded={open} aria-controls={id} aria-label={label} title={label} onClick={() => { setOpen(value => !value) }}>
        <span className={css['chevron']} aria-hidden="true"><IconChevronDownOutlineRegular size={14} /></span>
      </button>
      <div id={id} hidden={!open}>{open && children}</div>
    </>
  )
}
