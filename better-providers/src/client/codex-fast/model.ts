/**
 * What the composer shows of a session's fast-mode switch: nothing unless the
 * selected model is on the Codex route and the Host has answered, a disabled
 * switch when fast mode does not work in this dsh, otherwise the switch.
 */

import { prioritizable } from '../../shared/codex-fast.wire.ts'
import type { LocaleKey } from './locales.ts'

export interface ToggleInput {
  /** The route of the session's selected model. */
  provider: string | undefined
  /** Whether fast mode works in this dsh; undefined until the Host says. */
  supported: boolean | undefined
  /** The session's stored switch; undefined until the Host says. */
  enabled: boolean | undefined
  /** The switch being saved, until the Host answers. */
  saving: boolean | undefined
}

export type ToggleView =
  | { shown: false }
  | { shown: true; pressed: boolean; disabled: boolean; title: LocaleKey }

export function fastToggle({ provider, supported, enabled, saving }: ToggleInput): ToggleView {
  if (provider === undefined || !prioritizable(provider) || supported === undefined) return { shown: false }
  if (!supported) return { shown: true, pressed: false, disabled: true, title: 'title.unsupported' }
  if (enabled === undefined) return { shown: false }
  const pressed = saving ?? enabled
  return { shown: true, pressed, disabled: saving !== undefined, title: pressed ? 'title.on' : 'title.off' }
}
