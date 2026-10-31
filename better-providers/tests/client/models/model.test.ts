import { describe, expect, it } from 'vitest'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { CatalogPreview } from '../../../src/shared/models.wire.ts'
import { defaultChoice, describePreview, failureText, outcomeEffect, toggle } from '../../../src/client/models/model.ts'

/** Spells a key with its parameters, so a test reads which copy was chosen and with what. */
const t = ((key: string, params?: Record<string, unknown>) => params === undefined ? key : `${key} ${JSON.stringify(params)}`) as unknown as TranslateNS<'better-providers-models'>

const preview: CatalogPreview = {
  id: 'p',
  provider: 'openai-codex',
  added: [
    { id: 'gpt-6.1-terra', name: 'GPT-6.1 Terra', inherited: false },
    { id: 'gpt-6-luna', name: 'GPT-6 Luna', inherited: true },
  ],
  removed: [{ id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna' }],
  unchanged: [{ id: 'gpt-6-sol', name: 'GPT-6 Sol' }],
  skipped: [{ id: 'odd', reason: 'invalid' }],
  firstWrite: true,
}

describe('defaultChoice', () => {
  it('adds every new model and keeps every withdrawn one', () => {
    expect(defaultChoice(preview)).toEqual({ add: ['gpt-6.1-terra', 'gpt-6-luna'], keep: ['gpt-5.6-luna'] })
  })
})

describe('toggle', () => {
  it('checks and unchecks one model, keeping the preview\'s order', () => {
    const none = { add: [], keep: [] }
    const one = toggle(preview, none, 'added', 'gpt-6-luna', true)
    expect(toggle(preview, one, 'added', 'gpt-6.1-terra', true)).toEqual({ add: ['gpt-6.1-terra', 'gpt-6-luna'], keep: [] })
    expect(toggle(preview, defaultChoice(preview), 'removed', 'gpt-5.6-luna', false)).toEqual({ add: ['gpt-6.1-terra', 'gpt-6-luna'], keep: [] })
  })
})

describe('describePreview', () => {
  it('lists the groups in order, unchanged ones folded, and warns that the first write copies the shared providers', () => {
    expect(describePreview(preview, defaultChoice(preview), t)).toEqual({
      notes: [{ tone: 'warn', text: 'firstWrite' }],
      groups: [
        {
          kind: 'added',
          heading: 'group.added {"count":2}',
          folded: false,
          items: [
            {
              id: 'gpt-6.1-terra',
              name: 'GPT-6.1 Terra',
              details: [],
              checked: true,
            },
            { id: 'gpt-6-luna', name: 'GPT-6 Luna', details: ['inherited'], checked: true },
          ],
        },
        {
          kind: 'removed', heading: 'group.removed {"count":1}', hint: 'hint.removed', folded: false,
          items: [{ id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', details: [], checked: true }],
        },
        { kind: 'skipped', heading: 'group.skipped {"count":1}', folded: false, items: [{ id: 'odd', name: 'odd', details: ['skip.invalid'] }] },
        { kind: 'unchanged', heading: 'group.unchanged {"count":1}', folded: true, items: [{ id: 'gpt-6-sol', name: 'GPT-6 Sol', details: [] }] },
      ],
      offersChange: true,
      canWrite: true,
      canApply: true,
    })
  })

  it('can apply only a choice that changes the route', () => {
    expect(describePreview(preview, { add: [], keep: ['gpt-5.6-luna'] }, t).canApply).toBe(false)
    expect(describePreview(preview, { add: [], keep: [] }, t).canApply).toBe(true)
  })

  it('says the route is up to date when the newest catalog changes nothing, without the first-write warning', () => {
    const same: CatalogPreview = { ...preview, added: [], removed: [], skipped: [] }
    const shown = describePreview(same, defaultChoice(same), t)
    expect(shown.notes).toEqual([{ tone: 'hint', text: 'upToDate' }])
    expect(shown.groups.map(group => group.kind)).toEqual(['unchanged'])
    expect(shown.offersChange).toBe(false)
    expect(shown.canApply).toBe(false)
  })

  it('says why a route cannot be written, and does not offer to', () => {
    const blocked = describePreview({ ...preview, blocked: 'expression' }, defaultChoice(preview), t)
    expect(blocked.notes).toEqual([{ tone: 'error', text: 'blocked.expression' }])
    expect(blocked.canWrite).toBe(false)
    expect(blocked.canApply).toBe(false)
  })
})

describe('outcomeEffect', () => {
  it('closes after a write, previews again after a change elsewhere, and stays with what went wrong', () => {
    expect(outcomeEffect({ status: 'applied' }, t)).toEqual({ kind: 'close', notice: 'outcome.applied' })
    expect(outcomeEffect({ status: 'unchanged' }, t)).toEqual({ kind: 'close', notice: 'outcome.unchanged' })
    expect(outcomeEffect({ status: 'stale' }, t)).toEqual({ kind: 'preview-again', notice: 'outcome.stale' })
    expect(outcomeEffect({ status: 'expired' }, t)).toEqual({ kind: 'preview-again', notice: 'outcome.stale' })
    expect(outcomeEffect({ status: 'blocked', reason: 'overridden' }, t)).toEqual({ kind: 'error', text: 'blocked.overridden' })
    expect(outcomeEffect({ status: 'rejected', detail: 'llm-pi-ai: no' }, t)).toEqual({ kind: 'error', text: 'outcome.rejected {"detail":"llm-pi-ai: no"}' })
  })
})

describe('failureText', () => {
  it('words a refusal by its reason and anything else by its message', () => {
    expect(failureText({ ok: false, refused: 'catalog-unreachable' }, t)).toBe('refused.catalog-unreachable')
    expect(failureText({ ok: false, failed: 'socket hang up' }, t)).toBe('failed {"message":"socket hang up"}')
  })
})
