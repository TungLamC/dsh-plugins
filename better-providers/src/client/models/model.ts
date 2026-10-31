/**
 * What the refresh dialog shows of a preview and a choice: its notes and groups
 * of models, worded and in order, as plain data, and what an outcome does to the
 * dialog. The component only lays it out.
 */

import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { ApplyOutcome, CatalogChoice, CatalogPreview } from '../../shared/models.wire.ts'
import type { Settled } from '../kit/settle.ts'
import type { LocaleKey } from './locales.ts'

type T = TranslateNS<'better-providers-models'>

export type Tone = 'hint' | 'warn' | 'error'

export interface Note {
  tone: Tone
  text: string
}

export interface ItemLine {
  id: string
  /** The display name; the id shows beside it when they differ. */
  name: string
  details: string[]
  /** Whether it is checked, for a model the choice includes or leaves out. */
  checked?: boolean
}

export type GroupKind = 'added' | 'removed' | 'skipped' | 'unchanged'

export interface GroupLine {
  kind: GroupKind
  heading: string
  hint?: string
  items: ItemLine[]
  /** Kept behind the details toggle until opened. */
  folded: boolean
}

export interface PreviewPresentation {
  notes: Note[]
  groups: GroupLine[]
  /** The newest catalog differs from the route, so there is something to choose. */
  offersChange: boolean
  /** The route can be written from here. */
  canWrite: boolean
  /** The choice changes the route, and the route can be written. */
  canApply: boolean
}

/** Every new model added, every withdrawn one kept. */
export function defaultChoice(preview: CatalogPreview): CatalogChoice {
  return { add: preview.added.map(model => model.id), keep: preview.removed.map(model => model.id) }
}

/** The choice with one model of a group checked or unchecked, in the preview's order. */
export function toggle(preview: CatalogPreview, choice: CatalogChoice, group: 'added' | 'removed', id: string, on: boolean): CatalogChoice {
  const field = group === 'added' ? 'add' : 'keep'
  const listed = group === 'added' ? preview.added : preview.removed
  const chosen = new Set(choice[field])
  if (on) chosen.add(id)
  else chosen.delete(id)
  return { ...choice, [field]: listed.map(model => model.id).filter(model => chosen.has(model)) }
}

function changes(preview: CatalogPreview, choice: CatalogChoice): boolean {
  return choice.add.length > 0 || preview.removed.some(model => !choice.keep.includes(model.id))
}

export function describePreview(preview: CatalogPreview, choice: CatalogChoice, t: T): PreviewPresentation {
  const notes: Note[] = []
  const offersChange = preview.added.length > 0 || preview.removed.length > 0
  if (preview.blocked !== undefined) notes.push({ tone: 'error', text: t(`blocked.${preview.blocked}`) })
  else if (offersChange && preview.firstWrite) notes.push({ tone: 'warn', text: t('firstWrite') })
  if (!offersChange) notes.push({ tone: 'hint', text: t('upToDate') })

  const groups: GroupLine[] = []
  const add = (kind: GroupKind, items: ItemLine[], hint?: string): void => {
    if (items.length === 0) return
    groups.push({ kind, heading: t(`group.${kind}`, { count: items.length }), ...hint === undefined ? {} : { hint }, items, folded: kind === 'unchanged' })
  }
  add('added', preview.added.map(model => ({
    id: model.id, name: model.name, details: model.inherited ? [t('inherited')] : [], checked: choice.add.includes(model.id),
  })))
  add('removed', preview.removed.map(model => ({
    id: model.id, name: model.name, details: [], checked: choice.keep.includes(model.id),
  })), t('hint.removed'))
  add('skipped', preview.skipped.map(model => ({ id: model.id, name: model.name ?? model.id, details: [t(`skip.${model.reason}`)] })))
  add('unchanged', preview.unchanged.map(model => ({ id: model.id, name: model.name, details: [] })))

  const canWrite = preview.blocked === undefined
  return { notes, groups, offersChange, canWrite, canApply: canWrite && changes(preview, choice) }
}

/** What an outcome does to the dialog: close it with a notice for the card, preview again, or stay with an error. */
export type OutcomeEffect =
  | { kind: 'close'; notice: string }
  | { kind: 'preview-again'; notice: string }
  | { kind: 'error'; text: string }

export function outcomeEffect(outcome: ApplyOutcome, t: T): OutcomeEffect {
  switch (outcome.status) {
    case 'applied':
    case 'unchanged':
      return { kind: 'close', notice: t(`outcome.${outcome.status}`) }
    case 'stale':
    case 'expired':
      return { kind: 'preview-again', notice: t('outcome.stale') }
    case 'blocked':
      return { kind: 'error', text: t(`blocked.${outcome.reason}`) }
    case 'rejected':
      return { kind: 'error', text: t('outcome.rejected', { detail: outcome.detail }) }
  }
}

/** Why a Remote call failed, worded. */
export function failureText(result: Exclude<Settled<unknown>, { ok: true }>, t: T): string {
  return 'refused' in result ? t(`refused.${result.refused}` as LocaleKey) : t('failed', { message: result.failed })
}
