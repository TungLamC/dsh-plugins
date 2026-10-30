/** Display names of subscription plans as tokens state them; an unknown one is shown capitalised. */

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
  const known = NAMES[plan.toLowerCase()]
  if (known !== undefined) return known
  return plan.split(/[_\s-]+/).filter(Boolean).map(word => word[0]?.toUpperCase() + word.slice(1)).join(' ')
}
