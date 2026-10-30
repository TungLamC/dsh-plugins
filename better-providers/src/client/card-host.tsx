/**
 * The extension area on pi-ai provider cards. The Models page renders one
 * registrant per settings namespace there, and every pi-ai route shares the
 * `llm-pi-ai` namespace; so this host takes that seat and the plugin's parts add
 * their sections to its own list.
 */

import type { ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ProviderCardExtrasOwnerProps } from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { PI_AI } from '../shared/ids.ts'

export const CARD_SLOT = 'better-providers.provider-card'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** One part's section of a pi-ai provider card; the owner props are the card's. */
    'better-providers.provider-card': { kind: 'list'; scope: 'root'; owner: ProviderCardExtrasOwnerProps }
  }
}

type Props = PropsRuntime<'settings.models.provider-card'> & PropsRenderSlots<'better-providers.provider-card'>

function CardHost({ provider, configured, keyConfigured, renderSlot }: Props): ReactNode {
  return renderSlot(CARD_SLOT, { provider, configured, keyConfigured })
}

/** Take the pi-ai card seat; returns the disposer. */
export function registerCardHost(ctx: Context): () => void {
  return ctx.slots.inject('settings.models.provider-card', () => ctx.slots.register({
    name: 'settings.models.provider-card',
    key: PI_AI,
    children: { [CARD_SLOT]: { kind: 'list', scope: 'root' } },
  }, CardHost))
}
