/**
 * Account sign-in on a built-in pi-ai provider card: a row under the card's own
 * fields with the account status on the left and its actions on the right; a
 * running sign-in shows its page, code and question below that row.
 */

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Button, Input, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { isCredentialRoute } from '../../shared/ids.ts'
import type { OauthRemote, SignInPrompt, SignInView } from '../../shared/oauth.wire.ts'
import { settle, type Settled } from '../kit/settle.ts'
import { useFollowed } from '../kit/use-followed.ts'
import { flowText, promptLabel, webUrl } from './flow-text.ts'
import { planName } from './plan.ts'
import css from './SignInSection.module.css'

/** The llm-pi-ai settings this section reads: whether a route is pinned to an API key. */
export interface PiAiSettings {
  providers?: Readonly<Record<string, { apiKeyEnv?: string } | undefined>>
}

export interface Injected {
  remote: OauthRemote
  hooks: { piAi: ConfigForm<PiAiSettings> }
}

type Props = PropsRuntime<'better-providers.provider-card'> & InjectFace<Injected> & PropsLocale<'better-providers-oauth'>
type T = TranslateNS<'better-providers-oauth'>
type Status = 'signedIn' | 'signedOut' | 'signingIn'

export function SignInSection(props: Props): ReactNode {
  const { provider } = props
  // Hand-declared routes are not pi-ai's built-in providers and have no account sign-in.
  if (provider.declared === true || !isCredentialRoute(provider.provider)) return null
  return <Section key={provider.provider} {...props} />
}

function failure(result: Settled<unknown>, t: T): string | undefined {
  if (result.ok) return undefined
  return 'refused' in result ? t(`refused.${result.refused}` as Parameters<T>[0]) : t('failed', { message: result.failed })
}

/** How to sign in, as the flow's first question offered it, and the way picked. */
interface Choice { message: string; options: { id: string; label: string; description?: string }[]; value: string }

function Section({ provider, remote, usePiAi, t }: Props): ReactNode {
  const id = provider.provider
  // A named key reference is the only credential llm-pi-ai uses for the route; an account is then ignored.
  const apiKeyEnv = usePiAi(form => form.value?.providers?.[id]?.apiKeyEnv)
  const { value: view, lost } = useFollowed(signal => remote.watch(id, signal), id)
  const [starting, setStarting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [cancelled, setCancelled] = useState(false)
  const [choice, setChoice] = useState<Choice>()
  const [restartWith, setRestartWith] = useState<string>()
  const attempt = useRef<AbortController>(undefined)
  const method = useRef<string>(undefined)
  /** The way of signing in picked on this card; later sign-ins start with it. */
  const preferred = useRef<string>(undefined)
  const answered = useRef(new Set<string>())
  // Leaving the card withdraws a sign-in started from it.
  useEffect(() => () => { attempt.current?.abort() }, [])

  const begin = (methodId: string): void => {
    const controller = new AbortController()
    attempt.current = controller
    method.current = methodId
    setStarting(true)
    setError(undefined)
    setCancelled(false)
    void settle(() => remote.begin(id, methodId, controller.signal)).then((result) => {
      if (controller.signal.aborted) return
      setStarting(false)
      setChoice(undefined)
      setError(failure(result, t))
      setCancelled(result.ok && result.value === 'cancelled')
    })
  }
  const act = (call: () => ReturnType<OauthRemote['cancel']>): void => {
    setBusy(true)
    setError(undefined)
    void settle(call).then((result) => {
      setBusy(false)
      setError(failure(result, t))
    })
  }

  // A sign-in that opens with a choice of how (browser or device code) goes on at once with the
  // way picked before, else the flow's recommended first option; the choice stays on screen to switch.
  const prompt = view?.prompt
  const opening = prompt?.kind === 'select' && view?.notice === undefined && !answered.current.has(prompt.id) ? prompt : undefined
  useEffect(() => {
    if (opening === undefined || opening.kind !== 'select' || answered.current.has(opening.id)) return
    answered.current.add(opening.id)
    const value = opening.options.find(option => option.id === preferred.current)?.id ?? opening.options[0]?.id
    if (value === undefined) return
    setChoice({ message: opening.message, options: opening.options, value })
    act(() => remote.answer(id, opening.id, value))
  }, [opening?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Switching the way restarts the sign-in once the running one has ended.
  useEffect(() => {
    if (restartWith === undefined || view?.inFlight !== false) return
    setRestartWith(undefined)
    begin(restartWith)
  }, [restartWith, view?.inFlight]) // eslint-disable-line react-hooks/exhaustive-deps

  const switchTo = (value: string): void => {
    preferred.current = value
    setChoice(current => current === undefined ? current : { ...current, value })
    if (method.current === undefined) return
    attempt.current?.abort()
    setRestartWith(method.current)
  }

  if (view === undefined || view === null) return null

  const signOut = (): void => { act(() => remote.signOut(id)) }

  if (apiKeyEnv !== undefined || view.credential === 'api-key') {
    return <KeyNotice apiKeyEnv={apiKeyEnv} accountStored={view.credential === 'account'} disabled={busy || view.inFlight || !view.writable} onSignOut={signOut} error={error} t={t} />
  }

  const signingIn = starting || view.inFlight
  const signedIn = view.credential === 'account'
  const disabled = busy || lost || !view.writable
  const status: Status = signingIn ? 'signingIn' : signedIn ? 'signedIn' : 'signedOut'
  return (
    <section className={css['panel']} aria-label={t('title')}>
      <div className={css['header']}>
        <span className={css['identity']} role="status">
          {/* The same dot as the Models page's credential status, followed by the status itself. */}
          <span className={css['dot']} data-state={status} aria-hidden="true" />
          <span className={css['title']}>{status === 'signedIn' && view.plan !== undefined ? t('signedInPlan', { plan: planName(view.plan) }) : t(status)}</span>
        </span>
        <span className={css['row']}>
          {signingIn
            ? <Button variant="outline" size="sm" disabled={busy || lost || !view.inFlight} onClick={() => { act(() => remote.cancel(id)) }}>{t('cancel')}</Button>
            : (
                <>
                  {view.methods.map(method => (
                    <Button key={method.id} variant={signedIn ? 'outline' : 'primary'} size="sm" disabled={disabled} onClick={() => { begin(method.id) }}>
                      {signedIn
                        ? (view.methods.length > 1 ? t('signInAgainWith', { method: method.label }) : t('signInAgain'))
                        : t('signInWith', { method: method.label })}
                    </Button>
                  ))}
                  {signedIn && <Button variant="ghost" size="sm" className={css['danger']} disabled={disabled} onClick={signOut}>{t('signOut')}</Button>}
                </>
              )}
        </span>
      </div>
      {!view.writable && <p className={css['hint']}>{t('readOnly')}</p>}
      {signingIn && (
        <Progress
          view={view}
          choice={choice}
          handled={answered.current}
          disabled={busy || lost}
          onSwitch={switchTo}
          onAnswer={(promptId, value) => { act(() => remote.answer(id, promptId, value)) }}
          t={t}
        />
      )}
      {cancelled && !signingIn && <p className={css['hint']} role="status">{t('cancelled')}</p>}
      {error !== undefined && <p className={css['error']} role="alert">{error}</p>}
      {lost && <p className={css['error']} role="alert">{t('streamLost')}</p>}
    </section>
  )
}

/** The route authenticates with an API key, so the account sign-in has nothing to do. */
function KeyNotice({ apiKeyEnv, accountStored, disabled, onSignOut, error, t }: {
  apiKeyEnv: string | undefined
  accountStored: boolean
  disabled: boolean
  onSignOut(): void
  error: string | undefined
  t: T
}): ReactNode {
  return (
    <section className={css['panel']} aria-label={t('title')}>
      <p className={css['hint']}>{apiKeyEnv === undefined ? t('usingStoredKey') : t('usingApiKey', { ref: apiKeyEnv })}</p>
      {accountStored && (
        <div className={css['header']}>
          <p className={css['hint']}>{t('unusedAccount')}</p>
          <Button variant="ghost" size="sm" className={css['danger']} disabled={disabled} onClick={onSignOut}>{t('signOut')}</Button>
        </div>
      )}
      {error !== undefined && <p className={css['error']} role="alert">{error}</p>}
    </section>
  )
}

/**
 * A running sign-in, laid out like the Models page's own editor: a tinted panel of
 * fields, each a small label over its content. The way of signing in, the page to
 * open (or the code to enter), and any question the flow waits on.
 */
function Progress({ view, choice, handled, disabled, onSwitch, onAnswer, t }: {
  view: SignInView
  choice: Choice | undefined
  /** Questions answered for the person (the opening choice); they show as `choice` instead. */
  handled: ReadonlySet<string>
  disabled: boolean
  onSwitch(value: string): void
  onAnswer(promptId: string, value: string): void
  t: T
}): ReactNode {
  const area = useRef<HTMLDivElement>(null)
  const choiceId = useId()
  const notice = view.notice
  const link = webUrl(notice?.url)
  const prompt = view.prompt !== undefined && !handled.has(view.prompt.id) ? view.prompt : undefined
  // Each new step can grow past the bottom of the settings panel: bring it into view,
  // scrolling only as far as needed and not at all when it is already visible.
  const step = JSON.stringify([notice?.message, notice?.url, notice?.code, prompt?.id])
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    area.current?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' })
  }, [step])
  const waiting = notice === undefined && prompt === undefined
  return (
    <div ref={area} className={css['steps']}>
      {choice !== undefined && (
        <div className={css['inline']}>
          <label className={css['label']} htmlFor={choiceId}>{t('method')}</label>
          <select id={choiceId} className={css['select']} value={choice.value} disabled={disabled} onChange={(event) => { onSwitch(event.target.value) }}>
            {choice.options.map(option => <option key={option.id} value={option.id} title={option.description}>{flowText(option.label, t)}</option>)}
          </select>
        </div>
      )}
      {waiting && <p className={css['description']} role="status">{t('preparing')}</p>}
      {notice !== undefined && (notice.code !== undefined
        ? (
            <div className={css['field']}>
              <span className={css['label']}>{t('code')}</span>
              <p className={css['description']}>{flowText(notice.message, t)}</p>
              <div className={css['row']}>
                <code className={css['code']}>{notice.code}</code>
                <Copy value={notice.code} label={t('copyCode')} t={t} />
                {link !== undefined && <OpenPage url={link} label={t('openVerification')} />}
              </div>
            </div>
          )
        : link !== undefined
          ? (
              <div className={css['field']}>
                <span className={css['label']}>{t('page')}</span>
                <p className={css['description']}>{flowText(notice.message, t)}</p>
                <div className={css['row']}>
                  <OpenPage url={link} label={t('openPage')} primary />
                  <Copy value={link} label={t('copyLink')} t={t} />
                </div>
              </div>
            )
          : <p className={css['description']} role="status">{flowText(notice.message, t)}</p>)}
      {prompt !== undefined && <Prompt key={prompt.id} prompt={prompt} disabled={disabled} onAnswer={onAnswer} t={t} />}
    </div>
  )
}

function OpenPage({ url, label, primary = false }: { url: string; label: string; primary?: boolean }): ReactNode {
  return <Button variant={primary ? 'primary' : 'outline'} size="sm" onClick={() => { window.open(url, '_blank', 'noopener,noreferrer') }}>{label}</Button>
}

/** A copy button that briefly says whether it worked. */
function Copy({ value, label, t }: { value: string; label: string; t: T }): ReactNode {
  const [result, setResult] = useState<'copied' | 'copyFailed'>()
  useEffect(() => {
    if (result === undefined) return undefined
    const timer = setTimeout(() => { setResult(undefined) }, 2000)
    return () => { clearTimeout(timer) }
  }, [result])
  return (
    <Button variant="ghost" size="sm" aria-live="polite" onClick={() => { void writeClipboard(value).then((ok) => { setResult(ok ? 'copied' : 'copyFailed') }) }}>
      {result === undefined ? label : t(result)}
    </Button>
  )
}

function Prompt({ prompt, disabled, onAnswer, t }: { prompt: SignInPrompt; disabled: boolean; onAnswer(promptId: string, value: string): void; t: T }): ReactNode {
  const id = useId()
  // Flows list their recommended choice first (browser sign-in, where there is one).
  const [value, setValue] = useState(prompt.kind === 'select' ? prompt.options[0]?.id ?? '' : '')
  const [sent, setSent] = useState(false)
  // A text question may take a blank answer; a select needs a choice.
  const ready = prompt.kind !== 'select' || value !== ''
  const description = prompt.kind === 'select' ? prompt.options.find(option => option.id === value)?.description : undefined
  const submit = (event: FormEvent): void => {
    event.preventDefault()
    if (disabled || sent || !ready) return
    setSent(true)
    onAnswer(prompt.id, value)
  }
  return (
    <form className={css['field']} onSubmit={submit}>
      <label className={css['label']} htmlFor={id}>{promptLabel(prompt.message, t)}</label>
      <p className={css['description']}>{flowText(prompt.message, t)}</p>
      <div className={css['answer']}>
        {prompt.kind === 'select'
          ? (
              <select id={id} className={css['select']} value={value} disabled={disabled || sent} onChange={(event) => { setValue(event.target.value) }}>
                {prompt.options.map(option => <option key={option.id} value={option.id}>{flowText(option.label, t)}</option>)}
              </select>
            )
          : (
              <Input
                id={id}
                className={css['input']}
                type={prompt.kind === 'secret' ? 'password' : 'text'}
                value={value}
                placeholder={prompt.placeholder ?? ''}
                autoComplete="off"
                spellCheck={false}
                disabled={disabled || sent}
                onChange={(event) => { setValue(event.target.value) }}
              />
            )}
        <Button type="submit" variant="outline" size="sm" disabled={disabled || sent || !ready}>{t('continue')}</Button>
      </div>
      {description !== undefined && <p className={css['description']}>{flowText(description, t)}</p>}
    </form>
  )
}
