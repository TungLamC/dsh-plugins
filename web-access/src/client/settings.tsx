/**
 * The plugin's settings on its own page of the Plugins page (the
 * `plugins.bundle.config` entry keyed by the package): one line per tier in the
 * order a search tries them, each with its switch, and a model menu for the
 * hosted tiers. Built on dsh's shared settings form over the row's settings
 * namespace, so edits are staged and written together by its save.
 */

import { useEffect, type ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import {
  SettingsForm, SettingsFormModel, settingsTextField, Switch, Tag,
  type SettingsFieldSpec, type SettingsFieldState, type SettingsFormActions, type SettingsFormShell,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PluginConfigViewProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { InjectFace, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { isHosted, MODEL_FIELD, PACKAGE, ROW, TIERS, type HostedTier, type Tier } from '../shared/ids.ts'
import type { SearchModels, WebAccessRemote } from '../shared/web-access.wire.ts'
import { choicesStore, modelMenu } from './choices.ts'
import { NS } from './locales.ts'
import css from './settings.module.css'

const SLOT = 'plugins.bundle.config'

/** A tier's switch, staged as the text of its state. */
function switchField(field: Tier): SettingsFieldSpec {
  return {
    field,
    format: value => value === true ? 'true' : 'false',
    parse: text => ({ kind: 'set', value: text === 'true' }),
  }
}

const FIELDS: SettingsFieldSpec[] = [
  ...TIERS.map(switchField),
  // An empty model is automatic: staged as a clear, so the field goes back to unset.
  ...TIERS.filter(isHosted).map(tier => settingsTextField(MODEL_FIELD[tier])),
]

interface FormState extends SettingsFormShell {
  fields: Readonly<Record<string, SettingsFieldState>>
}

interface Injected extends SettingsFormActions {
  hooks: { form: ObservableSnapshot<FormState>; choices: ObservableSnapshot<SearchModels | undefined> }
  loadChoices(): void
}

type Props = PluginConfigViewProps & InjectFace<Injected> & { t: TranslateNS<typeof NS> }

const NO_FIELD: SettingsFieldState = { text: '', overridden: false, invalid: false }

function ModelMenu({ tier, chosen, models, disabled, onChoose, t }: {
  tier: HostedTier
  chosen: string
  models: SearchModels | undefined
  disabled: boolean
  onChoose(model: string): void
  t: Props['t']
}): ReactNode {
  const menu = modelMenu(models?.[tier], chosen)
  const label = t('model.label', { tier: t(`tier.${tier}`) })
  if (menu.kind === 'no-route') {
    return (
      <select className={css['model']} aria-label={label} value="" disabled>
        <option value="">{t('model.noRoute')}</option>
      </select>
    )
  }
  return (
    <select className={css['model']} aria-label={label} value={chosen} disabled={disabled} onChange={(event) => { onChoose(event.target.value) }}>
      <option value="">{t('model.auto')}</option>
      {menu.models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
    </select>
  )
}

function SettingsPage({ view, useForm, useChoices, loadChoices, edit, resetField, save, discard, t }: Props): ReactNode {
  const state = useForm(form => form)
  const models = useChoices(choices => choices)
  useEffect(() => { loadChoices() }, [loadChoices])
  if (view !== 'page') return null
  const disabled = !state.writable || state.saving
  return (
    <SettingsForm
      labels={{ unavailable: t('form.unavailable'), readOnly: t('form.readOnly'), saveFailed: t('form.saveFailed'), save: t('form.save'), saving: t('form.saving') }}
      state={state}
      onSave={save}
      onDiscard={discard}
    >
      {TIERS.map((tier) => {
        const enabled = state.fields[tier] ?? NO_FIELD
        return (
          <div key={tier} className={css['tier']}>
            <span className={css['label']}>{t(`tier.${tier}`)}</span>
            {enabled.overridden && (
              <span className={css['badges']}>
                <Tag tone="neutral">{t('form.overridden')}</Tag>
                <button type="button" className={css['reset']} disabled={disabled} onClick={() => { resetField(tier) }}>{t('form.reset')}</button>
              </span>
            )}
            {isHosted(tier) && (
              <ModelMenu
                tier={tier}
                chosen={(state.fields[MODEL_FIELD[tier]] ?? NO_FIELD).text}
                models={models}
                disabled={disabled}
                onChoose={(model) => { edit(MODEL_FIELD[tier], model) }}
                t={t}
              />
            )}
            <Switch checked={enabled.text === 'true'} label={t(`tier.${tier}`)} disabled={disabled} onChange={(on) => { edit(tier, on ? 'true' : 'false') }} />
          </div>
        )
      })}
    </SettingsForm>
  )
}

/** Register the settings on the plugin's page; returns the disposer. */
export function registerSettings(ctx: Context, remote: WebAccessRemote): () => void {
  return ctx.slots.inject(SLOT, () => {
    const scope = ctx.configForms.get<Record<string, unknown>>(ROW)
    const model = new SettingsFormModel(scope, FIELDS)
    const form = model.bind((): FormState => ({
      ...model.shell(),
      fields: Object.fromEntries(FIELDS.map(spec => [spec.field, model.field(spec.field)])),
    }))
    const choices = choicesStore(() => remote.searchModels())
    const loadChoices = (): void => { choices.load() }
    const unregister = ctx.slots.register({
      name: SLOT,
      key: PACKAGE,
      locale: NS,
      inject: (): Injected => ({ hooks: { form, choices }, loadChoices, ...model.actions() }),
    }, SettingsPage)
    return () => {
      unregister()
      model.dispose()
    }
  })
}
