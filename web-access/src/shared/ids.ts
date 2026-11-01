/**
 * Names shared by the Host and browser halves: the package, its one row, the
 * service the row provides, and the search tiers in the order a search tries them.
 */

export const PACKAGE = 'dsh-web-access'

/** The row id in cordis.patch.yml: also its settings namespace and the search provider id `web.searchProvider` names. */
export const ROW = 'web-access'

/** The cordis service key, which also names the row's Remote namespace. */
export const SERVICE = 'webAccess'

/** Every tier, in the order a search tries them. */
export const TIERS = ['codex', 'openai', 'gemini', 'exa', 'parallel', 'anysearch'] as const
export type Tier = typeof TIERS[number]

/** Tiers where a model searches on the provider's side and writes a cited answer; each runs one route's model. */
export const HOSTED_TIERS = ['codex', 'openai', 'gemini'] as const satisfies readonly Tier[]
export type HostedTier = typeof HOSTED_TIERS[number]

export function isHosted(tier: Tier): tier is HostedTier {
  return (HOSTED_TIERS as readonly Tier[]).includes(tier)
}

/** Whether a tier is on when its switch was never changed: the hosted tiers billed per search start off. */
export const ON_BY_DEFAULT: Readonly<Record<Tier, boolean>> = {
  codex: true,
  openai: false,
  gemini: false,
  exa: true,
  parallel: true,
  anysearch: true,
}

/** The row's settings field naming a hosted tier's model; unset picks one. */
export const MODEL_FIELD = {
  codex: 'codexModel',
  openai: 'openaiModel',
  gemini: 'geminiModel',
} as const satisfies Record<HostedTier, string>
