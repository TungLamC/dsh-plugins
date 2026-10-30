/** The quota part, browser half: usage on the cards of routes that report it, and the row's settings page. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { ROW } from '../../shared/ids.ts'
import { REFRESH_SECONDS } from '../../shared/quota.wire.ts'
import { CARD_SLOT } from '../card-host.tsx'
import { integerSetting, registerRowConfig } from '../kit/row-config.tsx'
import type { PlanBoard } from '../plans.ts'
import { en, NS, zh } from './locales.ts'
import { QuotaSection } from './QuotaSection.tsx'

export function registerQuotaLocale(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), `${NS}: dictionaries`)
}

/** Add the usage section to the pi-ai cards and the interval to the row's page; returns the disposer. */
export function registerQuota(ctx: Context, plans: PlanBoard): () => void {
  const remote = ctx.remote.betterProvidersQuota
  const section = ctx.slots.inject(CARD_SLOT, () => ctx.slots.register({
    name: CARD_SLOT,
    id: ROW.quota,
    order: 10,
    locale: NS,
    inject: () => ({ remote, plans }),
  }, QuotaSection))
  const settings = registerRowConfig(ctx, {
    row: ROW.quota,
    locale: NS,
    settings: [integerSetting('quotaRefreshSeconds', REFRESH_SECONDS, {
      label: 'settings.interval',
      hint: 'settings.intervalHint',
      invalid: 'settings.intervalInvalid',
    })],
    summary: (values, t) => {
      const seconds = values?.['quotaRefreshSeconds']
      return t('settings.summary', { seconds: typeof seconds === 'number' ? seconds : REFRESH_SECONDS.initial })
    },
  })
  return () => {
    settings()
    section()
  }
}
