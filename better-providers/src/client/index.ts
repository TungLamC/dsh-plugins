/**
 * Browser half of dsh-better-providers. The page loads it only for the main row,
 * so it carries every part's UI and shows each part only while that part's row
 * runs, as the main row's `watchParts` stream reports.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { MAIN_REMOTE, type PartsPresence } from '../shared/main.wire.ts'
import { OAUTH_REMOTE } from '../shared/oauth.wire.ts'
import { registerCardHost } from './card-host.tsx'
import { follow } from './kit/follow.ts'
import { gateParts, type Registrar } from './kit/gate.ts'
import { registerOauth, registerOauthLocale } from './oauth/index.ts'

export const inject = ['slots', 'remote', 'locale', 'configForms']

const nothing: Registrar = () => () => {}

export async function apply(ctx: Context): Promise<void> {
  registerOauthLocale(ctx)
  // Mounting is client-side only; a part whose row is off simply never gets called.
  // Owned by this context: unloading the package withdraws the namespaces.
  await ctx.remote.$mount(MAIN_REMOTE)
  await ctx.remote.$mount(OAUTH_REMOTE)
  ctx.inject(['remote.betterProviders', 'remote.betterProvidersOauth'], (child) => {
    const presence = follow<PartsPresence>(signal => child.remote.betterProviders.watchParts(signal))
    child.effect(() => () => { presence.dispose() }, 'better-providers: parts presence')
    child.effect(() => gateParts(presence, {
      oauth: () => registerOauth(child),
      quota: nothing,
      models: nothing,
      codexFast: nothing,
    }, [
      { when: parts => parts.oauth || parts.quota || parts.models, register: () => registerCardHost(child) },
    ]), 'better-providers: part UI')
  })
}
