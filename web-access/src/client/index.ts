/**
 * Browser half of dsh-web-access: the plugin's settings on its page of the
 * Plugins page. The page loads it only while the `web-access` row runs.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { SERVICE } from '../shared/ids.ts'
import { WEB_ACCESS_REMOTE } from '../shared/web-access.wire.ts'
import { en, NS, zh } from './locales.ts'
import { registerSettings } from './settings.tsx'

export const inject = ['slots', 'remote', 'locale', 'configForms']

export async function apply(ctx: Context): Promise<void> {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), `${NS}: dictionaries`)
  // Owned by this context: unloading the bundle withdraws the namespace.
  await ctx.remote.$mount(WEB_ACCESS_REMOTE)
  ctx.inject([`remote.${SERVICE}`], (child) => {
    child.effect(() => registerSettings(child, child.remote.webAccess), `${NS}: settings`)
  })
}
