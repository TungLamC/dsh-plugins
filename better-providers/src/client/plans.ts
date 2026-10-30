/**
 * Subscription plans of signed-in routes. The quota part reads the current plan
 * from the provider; the sign-in section shows it in place of the one its token
 * states, which only changes when the token is refreshed.
 */

import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'

export interface PlanBoard extends ObservableSnapshot<Readonly<Record<string, string>>> {
  /** Set or (with undefined) withdraw a route's reported plan. */
  publish(provider: string, plan: string | undefined): void
}

export function createPlanBoard(): PlanBoard {
  let plans: Readonly<Record<string, string>> = {}
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => plans,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    publish(provider, plan) {
      if (plans[provider] === plan) return
      const { [provider]: _previous, ...rest } = plans
      plans = plan === undefined ? rest : { ...rest, [provider]: plan }
      for (const listener of [...listeners]) listener()
    },
  }
}

/** Display names of plans as providers and tokens state them; an unknown one is shown capitalised. */
const NAMES: Readonly<Record<string, string>> = {
  free: 'Free',
  go: 'Go',
  plus: 'Plus',
  pro: 'Pro',
  team: 'Team',
  business: 'Business',
  enterprise: 'Enterprise',
  edu: 'Edu',
}

export function planName(plan: string): string {
  const id = plan.toLowerCase()
  if (Object.hasOwn(NAMES, id)) return NAMES[id]!
  return plan.split(/[_\s-]+/).filter(Boolean).map(word => word[0]?.toUpperCase() + word.slice(1)).join(' ')
}
