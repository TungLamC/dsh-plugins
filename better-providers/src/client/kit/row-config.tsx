/**
 * A row's own settings page on the Plugins page: the `plugins.row.config` entry
 * keyed `<package>#<row id>`, over the row's settings namespace (its row id, which
 * holds the row's volatile Config fields). Built on dsh's shared settings form, so
 * edits are staged and written together by its save, as on every settings page.
 */

import { useId, type ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import {
  SettingsForm, SettingsFormModel, SettingsValueField, Switch, Tag,
  type SettingsFieldState, type SettingsFieldWrite, type SettingsFormActions, type SettingsFormShell,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PluginConfigViewProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { InjectFace, LocaleNamespaceMap, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { PACKAGE } from '../../shared/ids.ts'
import { FORM_COPY } from './form-copy.ts'
import css from './row-config.module.css'


type FormCopyKey = keyof typeof FORM_COPY.zh

/** Locale namespaces whose dictionary includes {@link FORM_COPY}: the ones a row page can use. */
export type RowPageNamespace = {
  [N in keyof LocaleNamespaceMap & string]: FormCopyKey extends LocaleNamespaceMap[N] ? N : never
}[keyof LocaleNamespaceMap & string]

/** One field of the row's section, with the locale keys `K` of its copy. */
export type RowSetting<K extends string = string> = ValueSetting<K> | SwitchSetting<K>

/** A field typed as text. */
export interface ValueSetting<K extends string = string> {
  kind: 'value'
  field: string
  label: K
  hint: K
  /** Shown in place of the hint while the draft is not a value the field accepts. */
  invalid: K
  /** The draft text a stored value shows as. */
  format(value: unknown): string
  /** The write a draft stages, or undefined when it is not a value the field accepts. */
  parse(text: string): SettingsFieldWrite | undefined
  numeric?: boolean
}

/** A boolean field, shown as a switch; its draft text is `true` or `false`. */
export interface SwitchSetting<K extends string = string> {
  kind: 'switch'
  field: string
  label: K
}

/** A whole number within bounds; an empty draft clears the field back to its default. */
export function integerSetting<K extends string>(field: string, range: { min: number; max: number }, copy: Pick<ValueSetting<K>, 'label' | 'hint' | 'invalid'>): RowSetting<K> {
  return {
    kind: 'value',
    field,
    ...copy,
    numeric: true,
    format: value => typeof value === 'number' ? String(value) : '',
    parse(text) {
      const trimmed = text.trim()
      if (trimmed === '') return { kind: 'clear' }
      if (!/^\d+$/.test(trimmed)) return undefined
      const value = Number(trimmed)
      return value >= range.min && value <= range.max ? { kind: 'set', value } : undefined
    },
  }
}

/** A boolean; the stored value, or the schema's default when nothing is stored. */
export function switchSetting<K extends string>(field: string, copy: Pick<SwitchSetting<K>, 'label'>): RowSetting<K> {
  return { kind: 'switch', field, ...copy }
}

/** How the form model stages a field: a switch's draft is the text of its state. */
function fieldSpec(setting: RowSetting): Pick<ValueSetting, 'field' | 'format' | 'parse'> {
  if (setting.kind === 'value') return setting
  return {
    field: setting.field,
    format: value => value === true ? 'true' : 'false',
    parse: text => ({ kind: 'set', value: text === 'true' }),
  }
}

/** The page's own view of a translator: it reads keys of whichever namespace its row names. */
type Translate = (key: string, params?: Record<string, unknown>) => string

export interface RowConfigOptions<N extends RowPageNamespace> {
  /** The row id, which is also its settings namespace. */
  row: string
  /** The namespace of the settings' copy; its dictionary includes {@link FORM_COPY}. */
  locale: N
  settings: readonly RowSetting<LocaleNamespaceMap[N] & string>[]
  /** The one-liner the Plugins page shows when the row has no description. */
  summary(values: Readonly<Record<string, unknown>> | undefined, t: TranslateNS<N>): string
}

interface FormState extends SettingsFormShell {
  fields: Readonly<Record<string, SettingsFieldState>>
  values: Readonly<Record<string, unknown>> | undefined
}

interface Injected extends SettingsFormActions {
  hooks: { form: ObservableSnapshot<FormState> }
  settings: readonly RowSetting[]
  summary(values: Readonly<Record<string, unknown>> | undefined, t: Translate): string
}

type Props = PluginConfigViewProps & InjectFace<Injected> & { t: Translate }

function RowConfigPage({ view, useForm, settings, summary, edit, resetField, save, discard, t }: Props): ReactNode {
  const state = useForm(form => form)
  const id = useId()
  if (view === 'summary') return summary(state.values, t)
  const disabled = !state.writable || state.saving
  return (
    <SettingsForm
      labels={{ unavailable: t('form.unavailable'), readOnly: t('form.readOnly'), saveFailed: t('form.saveFailed'), save: t('form.save'), saving: t('form.saving') }}
      state={state}
      onSave={save}
      onDiscard={discard}
    >
      {settings.map((setting) => {
        const field = state.fields[setting.field] ?? { text: '', overridden: false, invalid: false }
        if (setting.kind === 'switch') {
          return (
            <div key={setting.field} className={css['field']}>
              <span className={css['label']}>{t(setting.label)}</span>
              {field.overridden && (
                <span className={css['badges']}>
                  <Tag tone="neutral">{t('form.overridden')}</Tag>
                  <button type="button" className={css['reset']} disabled={disabled} onClick={() => { resetField(setting.field) }}>{t('form.reset')}</button>
                </span>
              )}
              <Switch checked={field.text === 'true'} label={t(setting.label)} disabled={disabled} onChange={(on) => { edit(setting.field, on ? 'true' : 'false') }} />
            </div>
          )
        }
        return (
          <SettingsValueField
            key={setting.field}
            id={`${id}-${setting.field}`}
            label={t(setting.label)}
            hint={t(setting.hint)}
            invalidLabel={t(setting.invalid)}
            overriddenLabel={t('form.overridden')}
            resetLabel={t('form.reset')}
            numeric={setting.numeric === true}
            disabled={disabled}
            {...field}
            onEdit={(text) => { edit(setting.field, text) }}
            onReset={() => { resetField(setting.field) }}
          />
        )
      })}
    </SettingsForm>
  )
}

/** Register the row's settings page; returns the disposer. */
export function registerRowConfig<N extends RowPageNamespace>(ctx: Context, options: RowConfigOptions<N>): () => void {
  return ctx.slots.inject('plugins.row.config', () => {
    const scope = ctx.configForms.get<Record<string, unknown>>(options.row)
    const model = new SettingsFormModel(scope, options.settings.map(fieldSpec))
    const form = model.bind((): FormState => ({
      ...model.shell(),
      fields: Object.fromEntries(options.settings.map(setting => [setting.field, model.field(setting.field)])),
      values: scope.getSnapshot().value,
    }))
    const unregister = ctx.slots.register({
      name: 'plugins.row.config',
      key: `${PACKAGE}#${options.row}`,
      locale: options.locale,
      inject: (): Injected => ({ hooks: { form }, settings: options.settings, summary: options.summary as Injected['summary'], ...model.actions() }),
    // The options were checked against the row's namespace above; the page itself reads its keys as strings.
    }, RowConfigPage as never)
    return () => {
      unregister()
      model.dispose()
    }
  })
}
