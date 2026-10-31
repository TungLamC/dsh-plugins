/** The codex-fast part, browser half: the fast-mode switch in the composer, and the default on the row's page. */

import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import { ROW } from '../../shared/ids.ts'
import { follow } from '../kit/follow.ts'
import { registerRowConfig, switchSetting } from '../kit/row-config.tsx'
import { FastToggle } from './FastToggle.tsx'
import { en, NS, zh } from './locales.ts'

const SLOT = 'conversation.input.right'

export function registerCodexFastLocale(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), `${NS}: dictionaries`)
}

/** Add the switch to the composer, beside the model selector it depends on; returns the disposer. */
export function registerCodexFast(ctx: Context): () => void {
  const remote = ctx.remote.betterProvidersCodexFast
  // One stream for every composer: whether fast mode works is the same for all sessions.
  const support = follow<boolean>(signal => remote.watchSupport(signal))
  const supportSnapshot = { getSnapshot: () => support.get(), subscribe: support.subscribe }
  // directoryFor reads the session store and the session Remote through the caller's context.
  const composer = ctx.inject(['modelDirectories', 'sessions', 'remote.session'], (scope) => {
    scope.effect(() => scope.slots.inject(SLOT, () => scope.slots.register({
      name: SLOT,
      id: ROW.codexFast,
      order: 100,
      locale: NS,
      inject: (sessionId: string) => ({
        sessionId,
        remote,
        // The slot hands the composer's session id as a plain string.
        hooks: { directory: scope.modelDirectories.directoryFor(sessionId as SessionId).store, support: supportSnapshot },
      }),
    }, FastToggle)), `${NS}: composer switch`)
  })
  const settings = registerRowConfig(ctx, {
    row: ROW.codexFast,
    locale: NS,
    settings: [switchSetting('defaultEnabled', { label: 'settings.default' })],
    summary: (values, t) => t(values?.['defaultEnabled'] === true ? 'settings.summary.on' : 'settings.summary.off'),
  })
  return () => {
    settings()
    void composer.dispose()
    support.dispose()
  }
}
