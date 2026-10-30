/**
 * The sign-in flows speak English and assume a terminal (a browser "should open").
 * Known texts get this plugin's wording in the UI language; anything else is shown
 * as the flow wrote it.
 */

import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from './locales.ts'

type T = TranslateNS<'better-providers-oauth'>

/** A question asking to paste the browser's final redirect (or the code) when the callback cannot reach dsh. */
const PASTE = /^Complete (login|sign-in) in your browser[,.].*paste/i

const RULES: readonly (readonly [RegExp, (t: T, match: RegExpExecArray) => string])[] = [
  [/^A browser window should open/i, t => t('flow.openBrowser')],
  [/^(Continue in your browser|Open this page to continue signing in)\.?$/i, t => t('flow.openPage')],
  [/^Enter this code on the verification page/i, t => t('flow.enterCode')],
  [PASTE, t => t('flow.pasteRedirect')],
  [/^Select (.+) login method:?$/i, (t, m) => t('flow.selectMethod', { provider: m[1] ?? '' })],
  [/^(Browser login \(default\)|Sign in with browser \(recommended\))$/i, t => t('flow.browser')],
  [/^(Device code login \(headless\)|Sign in with device code\b.*)$/i, t => t('flow.deviceCode')],
  [/^Exchanging authorization code/i, t => t('flow.exchanging')],
  [/^Listening for .*callback/i, t => t('flow.waiting')],
  [/^Signing in…?$/i, t => t('flow.signingIn')],
]

/** The field label of a flow's question: finishing by hand when it asks for the redirect, else a generic one. */
export function promptLabel(message: string, t: T): string {
  return PASTE.test(message) ? t('answer') : t('details')
}

export function flowText(text: string, t: T): string {
  for (const [pattern, render] of RULES) {
    const match = pattern.exec(text)
    if (match !== null) return render(t, match)
  }
  return text
}

/** A notice link that is safe to open: http(s) only. */
export function webUrl(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined
  } catch {
    return undefined
  }
}
