/** The oauth part, browser half: a sign-in section on every built-in pi-ai provider card. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { PI_AI, ROW } from '../../shared/ids.ts'
import { CARD_SLOT } from '../card-host.tsx'
import { en, NS, zh, type LocaleKey } from './locales.ts'
import { SignInSection, type PiAiSettings } from './SignInSection.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'better-providers-oauth': LocaleKey
  }
}

export function registerOauthLocale(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), `${NS}: dictionaries`)
}

/** Add the sign-in section to the pi-ai cards; returns the disposer. */
export function registerOauth(ctx: Context): () => void {
  const remote = ctx.remote.betterProvidersOauth
  const piAi = ctx.configForms.get<PiAiSettings>(PI_AI)
  return ctx.slots.inject(CARD_SLOT, () => ctx.slots.register({
    name: CARD_SLOT,
    id: ROW.oauth,
    order: 0,
    locale: NS,
    inject: () => ({ remote, hooks: { piAi } }),
  }, SignInSection))
}
