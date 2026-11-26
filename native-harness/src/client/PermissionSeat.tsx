/**
 * The composer permission seat. Native-harness sessions list their own
 * harness's modes; other sessions keep dsh's preset control (same catalog,
 * projection and `/permission` command path as dsh's own seat).
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  Menu,
  RiskConfirmation,
  IconChevronDownOutlineRegular,
  PermissionIconAutoReviewRegular,
  PermissionIconFullAccessRegular,
  PermissionIconReadOnlyRegular,
  PermissionIconWorkspaceWriteRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { harnessOfPreset, type HarnessId, type ModeOption } from '../shared/types.ts'
import type { LocaleKey, Translate } from './locales.ts'
import { useView, type Views } from './views.ts'

export interface DshPermissionPort {
  /** Process permission catalog, refreshed when the Host announces a change. */
  catalog: { subscribe(listener: () => void): () => void; getSnapshot(): DshCatalog | null }
  /** Submit `/permission <preset>` for one session. */
  select(sessionId: string, preset: string): Promise<void>
}
export interface DshCatalog {
  options: { value: string; name: string; description?: string }[]
}

interface SeatProps {
  sessionId: string
  locked: boolean
  useProjection: (key: 'agentPreset' | 'permissions' | 'tokenUsage') => unknown
  views: Views
  dsh: DshPermissionPort
  t: Translate
}

const GLYPHS: Record<string, JSX.Element> = {
  'read-only': <PermissionIconReadOnlyRegular />,
  plan: <PermissionIconReadOnlyRegular />,
  'workspace-write': <PermissionIconWorkspaceWriteRegular />,
  default: <PermissionIconWorkspaceWriteRegular />,
  acceptEdits: <PermissionIconWorkspaceWriteRegular />,
  auto: <PermissionIconAutoReviewRegular />,
  'auto-review': <PermissionIconAutoReviewRegular />,
  'danger-full-access': <PermissionIconFullAccessRegular />,
  'full-access': <PermissionIconFullAccessRegular />,
  bypassPermissions: <PermissionIconFullAccessRegular />,
}

export function PermissionSeat(props: SeatProps) {
  const harness = harnessOfPreset(props.useProjection('agentPreset'))
  return harness ? (
    <HarnessModes key={`${props.sessionId}:${harness}`} {...props} harness={harness} />
  ) : (
    <DshPresets key={props.sessionId} {...props} />
  )
}

interface ChoiceProps {
  options: ModeOption[]
  current: string | undefined
  locked: boolean
  busy: boolean
  title?: string
  onChoose(id: string): void
  t: Translate
}

function Choice({ options, current, locked, busy, title, onChoose, t }: ChoiceProps) {
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const available = (id: string | null) => id !== null && options.some((option) => option.id === id)
  // Locking the composer or losing the option withdraws an open menu or confirmation, like dsh's own seat.
  useEffect(() => {
    if (!locked && (confirm === null || available(confirm))) return
    setOpen(false)
    setAcknowledged(false)
    setConfirm(null)
  }, [locked, confirm, options])
  const selected = options.find((option) => option.id === current)
  const label = selected?.name ?? current ?? t('default')
  const choose = (id: string) => {
    setOpen(false)
    if (locked || id === current || !available(id)) return
    if (options.find((option) => option.id === id)?.risky) {
      setAcknowledged(false)
      setConfirm(id)
      return
    }
    onChoose(id)
  }
  return (
    <>
      <Menu
        open={open}
        items={options.map((option) => ({
          id: option.id,
          label: option.name,
          ...(GLYPHS[option.id] ? { icon: GLYPHS[option.id] } : {}),
        }))}
        {...(current ? { selectedId: current } : {})}
        onSelect={choose}
        onClose={() => setOpen(false)}
        side="top"
        portal
        anchor={
          <button
            type="button"
            className="nh-permission-trigger"
            aria-label={t('permissionMode', { name: label })}
            title={title ?? selected?.description}
            disabled={locked || busy}
            onClick={() => setOpen(!open)}
          >
            {current && GLYPHS[current] && <span className="nh-permission-icon">{GLYPHS[current]}</span>}
            <span className="nh-permission-label">{label}</span>
            <span className={`nh-permission-chevron${open ? ' is-open' : ''}`} aria-hidden>
              <IconChevronDownOutlineRegular />
            </span>
          </button>
        }
      />
      {confirm !== null && (
        <RiskConfirmation
          open
          title={confirm === 'auto' ? t('autoConfirmTitle') : t('confirmTitle')}
          description={
            confirm === 'auto'
              ? t('autoConfirmDescription')
              : (options.find((option) => option.id === confirm)?.description ?? t('confirmDescription'))
          }
          acknowledgeLabel={t('confirmAcknowledge')}
          cancelLabel={t('cancel')}
          closeLabel={t('close')}
          confirmLabel={t('confirmEnable')}
          acknowledged={acknowledged}
          disabled={locked || busy}
          onAcknowledgedChange={setAcknowledged}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const id = confirm
            setConfirm(null)
            if (!locked && available(id)) onChoose(id)
          }}
        />
      )}
    </>
  )
}

function localized(key: string, fallback: string, t: Translate): string {
  const value = t(key as LocaleKey)
  return value === key ? fallback : value
}
/** Mode ids are native and may repeat across harnesses (both have `auto`), so labels are keyed per harness. */
function modeLabel(harness: HarnessId, option: ModeOption, t: Translate): ModeOption {
  return { ...option, name: localized(`mode_${harness}_${option.id}`, option.name, t) }
}

function HarnessModes({ sessionId, locked, useProjection, views, t, harness }: SeatProps & { harness: HarnessId }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  // The harness may switch modes by itself (leaving plan mode); every finished step re-reads the session.
  const { view } = useView(views, sessionId, harness, useProjection('tokenUsage'))
  const options = (view?.catalog?.modes ?? []).map((option) => modeLabel(harness, option, t))
  if (!options.length) return null
  const current = view?.settings.mode
  return (
    <Choice
      options={options}
      current={current}
      locked={locked}
      busy={busy}
      {...(message ? { title: message } : {})}
      onChoose={(id) => {
        setBusy(true)
        setMessage('')
        void views
          .select(sessionId, { mode: id })
          .then((outcome) => {
            if (outcome.result.status === 'next-turn') setMessage(t('nextTurn'))
            else if (outcome.result.status !== 'applied') setMessage(outcome.result.detail ?? outcome.result.status)
          })
          .catch((reason: unknown) => setMessage(String(reason)))
          .finally(() => setBusy(false))
      }}
      t={t}
    />
  )
}

function DshPresets({ sessionId, locked, useProjection, dsh, t }: SeatProps) {
  const selection = useProjection('permissions') as { currentValue?: string } | undefined
  const catalog = useSyncExternalStore(dsh.catalog.subscribe, dsh.catalog.getSnapshot)
  const [pending, setPending] = useState<string | null>(null)
  if (!selection || !catalog) return null
  const options: ModeOption[] = catalog.options.map((option) => ({
    id: option.value,
    name: option.name === option.value ? localized(`preset_${option.value}`, option.name, t) : option.name,
    ...(option.description ? { description: option.description } : {}),
    ...(option.value === 'danger-full-access' || option.value === 'auto' ? { risky: true } : {}),
  }))
  return (
    <Choice
      options={options}
      current={pending ?? selection.currentValue}
      locked={locked}
      busy={pending !== null}
      onChoose={(id) => {
        setPending(id)
        void dsh
          .select(sessionId, id)
          .catch(() => undefined)
          .finally(() => setPending(null))
      }}
      t={t}
    />
  )
}
