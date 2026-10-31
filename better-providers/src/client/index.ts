/**
 * Browser half of dsh-better-providers. The page loads it only for the main row,
 * so it carries every part's UI and shows each part only while that part's row
 * runs, as the main row's `watchParts` stream reports.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { CODEX_FAST_REMOTE } from '../shared/codex-fast.wire.ts'
import { MAIN_REMOTE, type PartsPresence } from '../shared/main.wire.ts'
import { MODELS_REMOTE } from '../shared/models.wire.ts'
import { OAUTH_REMOTE } from '../shared/oauth.wire.ts'
import { QUOTA_REMOTE } from '../shared/quota.wire.ts'
import { registerCardHost } from './card-host.tsx'
import { registerCodexFast, registerCodexFastLocale } from './codex-fast/index.ts'
import { follow } from './kit/follow.ts'
import { gateParts } from './kit/gate.ts'
import { registerModels, registerModelsLocale } from './models/index.ts'
import { registerOauth, registerOauthLocale } from './oauth/index.ts'
import { createPlanBoard } from './plans.ts'
import { registerQuota, registerQuotaLocale } from './quota/index.ts'

export const inject = ['slots', 'remote', 'locale', 'configForms']

export async function apply(ctx: Context): Promise<void> {
  registerOauthLocale(ctx)
  registerQuotaLocale(ctx)
  registerModelsLocale(ctx)
  registerCodexFastLocale(ctx)
  // Mounting is client-side only; a part whose row is off simply never gets called.
  // Owned by this context: unloading the package withdraws the namespaces.
  await ctx.remote.$mount(MAIN_REMOTE)
  await ctx.remote.$mount(OAUTH_REMOTE)
  await ctx.remote.$mount(QUOTA_REMOTE)
  await ctx.remote.$mount(MODELS_REMOTE)
  await ctx.remote.$mount(CODEX_FAST_REMOTE)
  ctx.inject(['remote.betterProviders', 'remote.betterProvidersOauth', 'remote.betterProvidersQuota', 'remote.betterProvidersModels', 'remote.betterProvidersCodexFast'], (child) => {
    const presence = follow<PartsPresence>(signal => child.remote.betterProviders.watchParts(signal))
    child.effect(() => () => { presence.dispose() }, 'better-providers: parts presence')
    const plans = createPlanBoard()
    child.effect(() => gateParts(presence, {
      oauth: () => registerOauth(child, plans),
      quota: () => registerQuota(child, plans),
      models: () => registerModels(child),
      codexFast: () => registerCodexFast(child),
    }, [
      { when: parts => parts.oauth || parts.quota || parts.models, register: () => registerCardHost(child) },
    ]), 'better-providers: part UI')
  })
}
