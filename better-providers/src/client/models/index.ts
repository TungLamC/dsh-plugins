/** The models part, browser half: the refresh row on the cards of built-in pi-ai routes. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { ROW } from '../../shared/ids.ts'
import { CARD_SLOT } from '../card-host.tsx'
import { en, NS, zh } from './locales.ts'
import { RefreshSection } from './RefreshSection.tsx'

export function registerModelsLocale(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), `${NS}: dictionaries`)
}

/** Add the refresh row to the pi-ai cards, after sign-in and usage; returns the disposer. */
export function registerModels(ctx: Context): () => void {
  const remote = ctx.remote.betterProvidersModels
  return ctx.slots.inject(CARD_SLOT, () => ctx.slots.register({
    name: CARD_SLOT,
    id: ROW.models,
    order: 20,
    locale: NS,
    inject: () => ({ remote }),
  }, RefreshSection))
}
