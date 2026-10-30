/**
 * Subscription usage on a built-in pi-ai provider card: the main limits as bars
 * under the sign-in, and on demand the other limits, balances and reset cards in
 * a tinted panel like the Models page's own editor. What shows when is decided by
 * `describeQuota`; this file lays it out and sends redemptions.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Button, IconChevronDownOutlineRegular, Modal, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { hasQuota, type QuotaRemote, type Redemption, type ResetCard } from '../../shared/quota.wire.ts'
import { settle } from '../kit/settle.ts'
import { useFollowed } from '../kit/use-followed.ts'
import type { PlanBoard } from '../plans.ts'
import type { LocaleKey } from './locales.ts'
import { describeQuota, newRequestId, type CardLine, type QuotaPresentation, type WindowLine } from './model.ts'
import css from './QuotaSection.module.css'

export interface Injected {
  remote: QuotaRemote
  /** Where the plan the provider reports goes, for the sign-in section to show. */
  plans: PlanBoard
}

type Props = PropsRuntime<'better-providers.provider-card'> & InjectFace<Injected> & PropsLocale<'better-providers-quota'>
type T = TranslateNS<'better-providers-quota'>

export function QuotaSection(props: Props): ReactNode {
  const { provider, configured } = props
  if (provider.declared === true || !configured || !hasQuota(provider.provider)) return null
  return <Section key={provider.provider} {...props} />
}

/** The clock countdowns and ages read; ticks every 30 seconds. */
function useNow(): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => { setNow(Date.now()) }, 30_000)
    return () => { clearInterval(timer) }
  }, [])
  return now
}

function Section({ provider, remote, plans, t }: Props): ReactNode {
  const id = provider.provider
  const { value: view, lost } = useFollowed(signal => remote.watch(id, signal), id)
  const plan = view?.usage?.plan
  useEffect(() => {
    plans.publish(id, plan)
    return () => { plans.publish(id, undefined) }
  }, [plans, id, plan])
  const now = useNow()
  const [open, setOpen] = useState(false)
  const [chosen, setChosen] = useState<ResetCard>()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string>()
  const account = useRef<string>(undefined)
  // What was chosen or answered for one account means nothing for the next.
  useEffect(() => {
    account.current = view?.account
    setChosen(undefined)
    setNotice(undefined)
  }, [view?.account])

  const shown = view === undefined ? null : describeQuota(view, { now, t, busy })
  if (view === undefined || shown === null) return null

  const redeem = (redemption: Redemption): void => {
    setBusy(true)
    setNotice(undefined)
    void settle(() => remote.redeem(id, redemption)).then((result) => {
      setBusy(false)
      if (account.current !== redemption.account) return
      // A failure on the way may have lost the answer: the Host then keeps the redemption pending.
      setNotice(result.ok ? t(`outcome.${result.value}`) : 'refused' in result ? t(`refused.${result.refused}` as LocaleKey) : t('outcome.unknown'))
    })
  }
  const usable = chosen !== undefined && shown.details?.cards?.items.some(item => item.card.id === chosen.id && item.usable) === true
  const confirm = (): void => {
    if (chosen === undefined || view.account === undefined || !usable) return
    redeem({ account: view.account, card: chosen.id, request: newRequestId() })
    setChosen(undefined)
  }

  return (
    <section className={css['panel']} aria-label={t('title')}>
      {shown.notes.map(note => (
        <p key={note.text} className={css[note.tone]} role={note.tone === 'error' ? 'alert' : undefined}>{note.text}</p>
      ))}
      {shown.windows.map(line => <WindowRow key={line.id} line={line} />)}
      {shown.details !== undefined && (
        <Details open={open} onToggle={() => { setOpen(value => !value) }} t={t}>
          <DetailsBody details={shown.details} onUse={setChosen} t={t} />
        </Details>
      )}
      {shown.pending !== undefined && (
        <div className={css['line']}>
          <p className={css['hint']}>{shown.pending.text}</p>
          <Button variant="outline" size="sm" disabled={busy || lost} onClick={() => { if (shown.pending !== undefined) redeem(shown.pending.retry) }}>
            {t('checkPending')}
          </Button>
        </div>
      )}
      {notice !== undefined && <p className={css['hint']} role="status">{notice}</p>}
      {lost && <p className={css['error']} role="alert">{t('streamLost')}</p>}
      <Modal
        open={chosen !== undefined}
        title={t('confirmTitle')}
        closeLabel={t('cancel')}
        onClose={() => { setChosen(undefined) }}
        footer={(
          <>
            <Button variant="outline" onClick={() => { setChosen(undefined) }}>{t('cancel')}</Button>
            <Button variant="primary" disabled={!usable} onClick={confirm}>{t('confirmUse')}</Button>
          </>
        )}
      >
        <div className={css['confirm']}>
          <p>{chosen?.title ?? t('cardTitle')}</p>
          {chosen?.description !== undefined && <p className={css['description']}>{chosen.description}</p>}
          <p className={css['description']}>{t('confirmBody')}</p>
        </div>
      </Modal>
    </section>
  )
}

function WindowRow({ line }: { line: WindowLine }): ReactNode {
  return (
    <div className={css['window']}>
      <div className={css['windowLine']}>
        <span className={css['windowName']}>{line.label}</span>
        {line.reset !== undefined && (
          <time className={css['windowReset']} dateTime={new Date(line.reset.at).toISOString()} title={new Date(line.reset.at).toLocaleString()}>
            {line.reset.text}
          </time>
        )}
        <span className={css['windowAmount']}>{line.left}</span>
      </div>
      <div
        className={css['meter']}
        data-level={line.level}
        role="meter"
        aria-label={line.label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={line.remaining}
        aria-valuetext={line.left}
      >
        <span className={css['fill']} style={{ width: `${line.remaining ?? 0}%` }} />
      </div>
    </div>
  )
}

/** Reset cards first, as a list with their actions; then the other limits; then the balances as plain figures. */
function DetailsBody({ details, onUse, t }: { details: NonNullable<QuotaPresentation['details']>; onUse(card: ResetCard): void; t: T }): ReactNode {
  return (
    <>
      {details.cards !== undefined && (
        <div className={css['group']}>
          <span className={css['groupHead']}>
            <span className={css['label']}>{details.cards.heading}</span>
            {details.cards.count !== undefined && <Tag tone={details.cards.count.available ? 'success' : 'neutral'}>{details.cards.count.text}</Tag>}
          </span>
          {details.cards.note !== undefined && <p className={css['description']}>{details.cards.note}</p>}
          {details.cards.items.length > 0 && (
            <div className={css['cards']}>
              {details.cards.items.map(item => <CardRow key={item.card.id} item={item} onUse={onUse} t={t} />)}
            </div>
          )}
        </div>
      )}
      {details.pools.length > 0 && (
        <div className={css['group']}>
          <span className={css['label']}>{t('limits')}</span>
          {details.pools.map(pool => (
            <div key={pool.name} className={css['pool']}>
              <span className={css['poolName']}>{pool.name}</span>
              {pool.empty !== undefined && <span className={css['description']}>{pool.empty}</span>}
              {pool.windows.map(line => <WindowRow key={line.id} line={line} />)}
            </div>
          ))}
        </div>
      )}
      {details.balances.length > 0 && (
        <div className={css['group']}>
          <span className={css['label']}>{t('balances')}</span>
          <dl className={css['figures']}>
            {details.balances.map(balance => (
              <div key={balance.label} className={css['figureLine']}>
                <dt>{balance.label}</dt>
                <dd className={css['figure']}>{balance.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </>
  )
}

/** One reset card with its action. */
function CardRow({ item, onUse, t }: { item: CardLine; onUse(card: ResetCard): void; t: T }): ReactNode {
  return (
    <div className={css['card']}>
      <span className={css['cardText']}>
        <span className={css['cardTitle']}>{item.title}</span>
        {item.expires !== undefined && <span className={css['description']}>{item.expires}</span>}
      </span>
      <Button variant="outline" size="sm" disabled={!item.usable} onClick={() => { onUse(item.card) }}>{t('useCard')}</Button>
    </div>
  )
}

/** A dashed divider with a chevron in its middle; the chevron turns over when the details open. */
function Details({ open, onToggle, children, t }: { open: boolean; onToggle(): void; children: ReactNode; t: T }): ReactNode {
  const id = useId()
  const label = t(open ? 'hideDetails' : 'showDetails')
  return (
    <>
      <button type="button" className={css['toggle']} aria-expanded={open} aria-controls={id} aria-label={label} title={label} onClick={onToggle}>
        <span className={css['chevron']} aria-hidden="true"><IconChevronDownOutlineRegular size={14} /></span>
      </button>
      <div id={id} className={css['details']} hidden={!open}>{open && children}</div>
    </>
  )
}
