/**
 * Composer model/effort control built from public primitives; the trigger and
 * placement follow dsh's ModelSelect. Used for both native-harness and ordinary
 * dsh sessions.
 *
 * One panel shows models and efforts side by side: the left column is a search
 * field over the provider-grouped models, the right one the efforts of the
 * current model. Picking a model applies it and keeps the panel open so its
 * efforts can be picked next; a model without efforts, or an effort, closes it.
 * ↑/↓ move within a column (search keeps focus while they move the model
 * highlight), ←/→ switch columns, Enter picks, Escape closes; the search only
 * filters the models. An optional footer sits below both columns.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  Input,
  MenuGroup,
  MenuSurface,
  StateDot,
  IconCheckOutlineRegular,
  IconChevronDownOutlineRegular,
  IconCloseFillRegular,
  isMobileDevice,
  observeStickyMenuGroups,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { LocaleKey, Translate } from './locales.ts'
import { rankByName } from './rank-by-name.ts'
import './picker.css'

export interface MenuModel {
  id: string
  name: string
  efforts: { id: string; name: string }[]
  /** The effort the provider uses when none is picked. */
  defaultEffort?: string
}
export interface MenuModelGroup {
  id: string
  name: string
  /** Shown before each of the group's models and on the trigger; none leaves the place empty. */
  icon?: ReactNode
  models: MenuModel[]
}
export interface MenuSelection {
  group: string
  /** Empty string means "the default". */
  model: string
  effort: string
}
interface Props {
  title: string
  groups: MenuModelGroup[]
  current: MenuSelection
  /** List an empty effort that leaves the choice to the provider, when the model names no default. */
  defaultEffort?: boolean
  disabled: boolean
  busy: boolean
  loading: boolean
  error: string
  note?: string
  /** A pick that has not taken effect yet, said on the trigger as a dot. */
  pending?: string
  retry(): void
  /** Apply a pick; resolves false when it failed (the menu then stays open). */
  choose(selection: MenuSelection): Promise<boolean>
  /**
   * Session options below both columns; keys inside it other than Escape are left to it.
   * `dismiss` closes the menu and focuses its trigger at once, before another overlay opens.
   */
  footer?: (menu: { dismiss(): void }) => ReactNode
  t: Translate
}
const EFFORT_KEYS: Record<string, LocaleKey> = {
  low: 'effortLow',
  medium: 'effortMedium',
  high: 'effortHigh',
  xhigh: 'effortXHigh',
  max: 'effortMax',
  ultra: 'effortUltra',
  minimal: 'effortMinimal',
  none: 'effortNone',
}

export function ModelMenu({
  title,
  groups,
  current,
  defaultEffort = true,
  disabled,
  busy,
  loading,
  error,
  note,
  pending,
  retry,
  choose,
  footer,
  t,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState<number | null>(null)
  const [selectionFocus, setSelectionFocus] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const models = useRef<HTMLDivElement>(null)
  const efforts = useRef<HTMLDivElement>(null)
  const footerRef = useRef<HTMLDivElement>(null)
  const mounted = useRef(true)
  const id = useId()
  const anchorName = `--nh-model-${id.replaceAll(':', '')}`

  const rows = useMemo(
    () =>
      groups.flatMap((group) =>
        group.models.map((model) => ({
          ...model,
          group: group.id,
          icon: group.icon,
          label: model.id,
          key: `${group.id}\0${model.id}`,
        })),
      ),
    [groups],
  )
  // Ranked within each provider, so the highlight moves in display order.
  const sections = useMemo(
    () =>
      groups
        .map((group) => ({ group, rows: rankByName(rows.filter((row) => row.group === group.id), query.trim()) }))
        .filter((section) => section.rows.length > 0),
    [groups, rows, query],
  )
  const visible = useMemo(() => sections.flatMap((section) => section.rows), [sections])
  const currentKey = `${current.group}\0${current.model}`
  const selected = rows.find((row) => row.key === currentKey)
  const selectedIndex = visible.findIndex((row) => row.key === currentKey)
  const activeIndex = Math.min(highlighted ?? Math.max(0, selectedIndex), visible.length - 1)

  const levels = selected?.efforts ?? []
  const effective = current.effort || selected?.defaultEffort || ''
  const effortName = (effort: string) => {
    if (!effort) return t('default')
    const known = EFFORT_KEYS[effort]
    return known ? t(known) : (levels.find((item) => item.id === effort)?.name ?? effort)
  }
  const choices = levels.length
    ? [
        ...new Set([
          ...(defaultEffort && !selected?.defaultEffort ? [''] : []),
          ...levels.map((level) => level.id),
          ...(effective ? [effective] : []),
        ]),
      ]
    : []
  const modelName = selected?.name ?? (current.model || t('default'))
  const effortLabel = levels.length || effective ? effortName(effective) : ''
  const triggerIcon = groups.find((group) => group.id === current.group)?.icon

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!root.current?.contains(target) && !menu.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])
  useLayoutEffect(() => {
    if (open && !isMobileDevice()) search.current?.focus()
  }, [open])
  useLayoutEffect(() => {
    if (open) models.current?.querySelector(`[data-model-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex, visible])
  useLayoutEffect(() => {
    if (open && models.current) return observeStickyMenuGroups(models.current)
  }, [open, sections])

  const effortNodes = () => [...(efforts.current?.querySelectorAll<HTMLButtonElement>('[data-nh-effort]') ?? [])]
  const focusEfforts = () => {
    const nodes = effortNodes()
    const target = nodes.find((node) => node.getAttribute('aria-checked') === 'true') ?? nodes[0]
    if (!target) return false
    target.focus()
    return true
  }
  const focusFooter = () => {
    const first = footerRef.current?.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]')
    first?.focus()
    return first !== undefined && first !== null
  }
  const dismiss = () => {
    setOpen(false)
    trigger.current?.focus()
  }
  const close = (restore = false) => {
    setOpen(false)
    if (restore)
      queueMicrotask(() => {
        if (mounted.current) trigger.current?.focus()
      })
  }
  const show = () => {
    setSelectionFocus(false)
    setQuery('')
    setHighlighted(null)
    setOpen(true)
    trigger.current?.focus()
  }
  const finish = () => {
    setSelectionFocus(true)
    close(true)
  }
  const chooseModel = async (row: (typeof rows)[number]) => {
    if (busy || disabled) return
    if (row.key === currentKey) {
      if (!row.efforts.length) finish()
      return
    }
    // The model applies at once; its efforts take the right column unless it has none.
    if ((await choose({ group: row.group, model: row.id, effort: '' })) && mounted.current && !row.efforts.length) finish()
  }
  const chooseEffort = async (effort: string) => {
    if (busy || disabled) return
    if (effort === effective) return finish()
    if ((await choose({ ...current, effort })) && mounted.current) finish()
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) return
    const arrow = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
    if (!open) {
      if (arrow && !disabled) {
        event.preventDefault()
        show()
      }
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close(true)
      return
    }
    const target = event.target as Node
    if (footerRef.current?.contains(target)) return
    const inEfforts = efforts.current?.contains(target) ?? false
    if (inEfforts) {
      const nodes = effortNodes()
      const at = nodes.findIndex((node) => node === target)
      if (arrow) {
        event.preventDefault()
        nodes[(at + arrow + nodes.length) % nodes.length]?.focus()
      } else if (event.key === 'ArrowLeft' || (event.key === 'Tab' && event.shiftKey)) {
        event.preventDefault()
        search.current?.focus()
      } else if (event.key === 'Tab') {
        event.preventDefault()
        if (!focusFooter()) close(true)
      }
      return
    }
    // The model column: search keeps focus, the highlight moves.
    const input = search.current
    if (arrow) {
      event.preventDefault()
      if (visible.length) setHighlighted((activeIndex + arrow + visible.length) % visible.length)
      input?.focus()
      return
    }
    const caretAtEnd = target !== input || (input.selectionStart === input.value.length && input.selectionEnd === input.value.length)
    if ((event.key === 'ArrowRight' && caretAtEnd) || (event.key === 'Tab' && !event.shiftKey)) {
      if (focusEfforts()) event.preventDefault()
      else if (event.key === 'Tab') {
        event.preventDefault()
        if (!focusFooter()) close(true)
      }
      return
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      close(true)
      return
    }
    if (event.key === 'Enter' && target === input) {
      event.preventDefault()
      const row = visible[activeIndex]
      if (row) void chooseModel(row)
    }
  }
  const status = (error || note) && (
    <div className={error ? 'nh-picker-error' : 'nh-picker-status'} role={error ? 'alert' : 'status'}>
      <span>{error || note}</span>
      {error && (
        <button type="button" onClick={retry}>
          {t('retry')}
        </button>
      )}
    </div>
  )
  const grouped = groups.length > 1
  // Rows keep one icon column when any provider has an icon, so names line up.
  const iconColumn = groups.some((group) => group.icon)
  return (
    <div
      ref={root}
      className="nh-controls"
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        const next = event.relatedTarget
        if (next instanceof Node && (root.current?.contains(next) || menu.current?.contains(next))) return
        close()
      }}
      onMouseDown={(event) => {
        // Clicks keep focus where it is (the search), except in the footer and the search field itself.
        const target = event.target
        if (!(target instanceof Element) || footerRef.current?.contains(target) || target.closest('input')) return
        if (target.closest('button') || menu.current?.contains(target)) event.preventDefault()
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="nh-picker-trigger"
        style={{ anchorName }}
        aria-label={[t('chooseModel'), modelName, effortLabel, pending].filter(Boolean).join(', ')}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        title={[[title, modelName, effortLabel].filter(Boolean).join(' · '), pending].filter(Boolean).join('\n')}
        aria-busy={busy}
        data-selection-focus={selectionFocus ? '' : undefined}
        disabled={disabled}
        onBlur={() => setSelectionFocus(false)}
        onClick={() => (open ? close(true) : show())}
      >
        {triggerIcon && <span className="nh-brand nh-picker-trigger-icon">{triggerIcon}</span>}
        <span className="nh-picker-trigger-label">{modelName}</span>
        {effortLabel && <span className="nh-picker-trigger-effort">{effortLabel}</span>}
        {pending && <span className="nh-picker-pending" aria-hidden="true" />}
        {busy ? (
          <StateDot state="ongoing" />
        ) : (
          <IconChevronDownOutlineRegular size={12} className={`nh-picker-chevron${open ? ' is-open' : ''}`} />
        )}
      </button>
      {!open && error && status}
      {open &&
        createPortal(
          <MenuSurface
            ref={menu}
            id={`${id}-menu`}
            className="nh-picker-menu"
            role="dialog"
            aria-label={t('pickerMenu')}
            aria-busy={busy || loading}
            style={{ positionAnchor: anchorName }}
          >
            {status}
            <div className="nh-picker-columns">
              <div className="nh-picker-models">
                <div className="nh-picker-search-row">
                  <Input
                    ref={search}
                    type="text"
                    role="searchbox"
                    className={`nh-picker-search${query ? ' has-query' : ''}`}
                    value={query}
                    placeholder={t('searchModels')}
                    aria-label={t('searchModels')}
                    aria-controls={`${id}-models`}
                    aria-activedescendant={activeIndex < 0 ? undefined : `${id}-model-${activeIndex}`}
                    onChange={(event) => {
                      setQuery(event.target.value)
                      setHighlighted(0)
                    }}
                  />
                  {query && (
                    <button
                      type="button"
                      className="nh-picker-search-clear"
                      aria-label={t('clearSearch')}
                      onClick={() => {
                        setQuery('')
                        setHighlighted(null)
                        search.current?.focus()
                      }}
                    >
                      <IconCloseFillRegular />
                    </button>
                  )}
                </div>
                {loading && (
                  <div className="nh-picker-status" role="status">
                    {t('loadingModels')}
                  </div>
                )}
                <div ref={models} id={`${id}-models`} className="nh-picker-scroll" role="menu" aria-label={t('model')}>
                  {visible.length > 0 ? (
                    sections.map(({ group, rows: members }) => (
                      <MenuGroup key={group.id} label={grouped ? group.name : title}>
                        {members.map((row) => {
                          const index = visible.indexOf(row)
                          const checked = row.key === currentKey
                          return (
                            <button
                              key={row.key}
                              type="button"
                              role="menuitemradio"
                              aria-checked={checked}
                              aria-disabled={busy || undefined}
                              id={`${id}-model-${index}`}
                              data-model-index={index}
                              data-highlighted={index === activeIndex ? '' : undefined}
                              className="nh-picker-option nh-picker-model-option"
                              tabIndex={-1}
                              title={row.name}
                              onClick={() => void chooseModel(row)}
                              onMouseMove={() => {
                                if (!busy && index !== activeIndex) setHighlighted(index)
                              }}
                            >
                              {iconColumn && <span className="nh-brand nh-picker-option-icon">{row.icon}</span>}
                              <span className="nh-picker-option-name">{row.name}</span>
                              <span className="nh-picker-check">{checked && <IconCheckOutlineRegular />}</span>
                            </button>
                          )
                        })}
                      </MenuGroup>
                    ))
                  ) : (
                    <div className="nh-picker-status" role="status">
                      {t('noModels')}
                    </div>
                  )}
                </div>
              </div>
              <div ref={efforts} className="nh-picker-efforts nh-picker-scroll" role="menu" aria-label={t('effort')}>
                <MenuGroup label={t('effort')}>
                  {choices.length ? (
                    choices.map((effort) => (
                      <button
                        key={effort || 'default'}
                        type="button"
                        role="menuitemradio"
                        aria-checked={effort === effective}
                        aria-disabled={busy || undefined}
                        data-nh-effort
                        className="nh-picker-option"
                        tabIndex={-1}
                        onClick={() => void chooseEffort(effort)}
                      >
                        <span className="nh-picker-option-name">{effortName(effort)}</span>
                        <span className="nh-picker-check">{effort === effective && <IconCheckOutlineRegular />}</span>
                      </button>
                    ))
                  ) : (
                    <div className="nh-picker-status">{t('noEfforts')}</div>
                  )}
                </MenuGroup>
              </div>
            </div>
            {footer && (
              <div ref={footerRef} className="nh-picker-footer">
                {footer({ dismiss })}
              </div>
            )}
          </MenuSurface>,
          document.body,
        )}
    </div>
  )
}
