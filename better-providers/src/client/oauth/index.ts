/** The oauth part, browser half: a sign-in section on every built-in pi-ai provider card. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { PI_AI, ROW } from '../../shared/ids.ts'
import { CARD_SLOT } from '../card-host.tsx'
import type { PlanBoard } from '../plans.ts'
import { en, NS, zh } from './locales.ts'
import { SignInSection, type PiAiSettings } from './SignInSection.tsx'

export function registerOauthLocale(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), `${NS}: dictionaries`)
}

/**
 * Add the sign-in section to the pi-ai cards; returns the disposer.
 * @param plans - plans the providers report, shown in place of the token's.
 */
export function registerOauth(ctx: Context, plans: PlanBoard): () => void {
  const remote = ctx.remote.betterProvidersOauth
  const piAi = ctx.configForms.get<PiAiSettings>(PI_AI)
  return ctx.slots.inject(CARD_SLOT, () => ctx.slots.register({
    name: CARD_SLOT,
    id: ROW.oauth,
    order: 0,
    locale: NS,
    inject: () => ({ remote, hooks: { piAi, plans } }),
  }, SignInSection))
}
