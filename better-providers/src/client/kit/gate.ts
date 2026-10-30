/**
 * Register UI only while the parts behind it run. Each part's registrar runs once
 * when its part starts running and its disposer once when the part stops; shared
 * UI (a composite) follows a condition over all parts. Composites register before
 * and unregister after the parts, so parts can rely on them.
 */

import type { Followed } from './follow.ts'

export type Registrar = () => () => void

export interface Composite<K extends string> {
  when(presence: Readonly<Record<K, boolean>>): boolean
  register: Registrar
}

interface Slot {
  wanted(presence: Readonly<Record<string, boolean>>): boolean
  register: Registrar
  dispose?: () => void
}

export function gateParts<K extends string>(
  presence: Followed<Readonly<Record<K, boolean>>>,
  parts: Readonly<Record<K, Registrar>>,
  composites: readonly Composite<K>[] = [],
  onError: (error: unknown) => void = (error) => { console.error('[dsh-better-providers]', error) },
): () => void {
  const shared: Slot[] = composites.map(composite => ({ wanted: p => composite.when(p as Record<K, boolean>), register: composite.register }))
  const own: Slot[] = (Object.keys(parts) as K[]).map(part => ({ wanted: p => p[part] === true, register: parts[part] }))

  const up = (slot: Slot, now: Readonly<Record<string, boolean>>): void => {
    if (slot.dispose !== undefined || !slot.wanted(now)) return
    try {
      slot.dispose = slot.register()
    } catch (error) {
      // Treated as not registered; the next rising edge tries again.
      onError(error)
    }
  }
  const down = (slot: Slot, now: Readonly<Record<string, boolean>> | undefined): void => {
    if (slot.dispose === undefined || (now !== undefined && slot.wanted(now))) return
    const dispose = slot.dispose
    slot.dispose = undefined
    try {
      dispose()
    } catch (error) {
      onError(error)
    }
  }

  const reconcile = (): void => {
    const now: Readonly<Record<string, boolean>> = presence.get() ?? {}
    for (const slot of own) down(slot, now)
    for (const slot of shared) down(slot, now)
    for (const slot of shared) up(slot, now)
    for (const slot of own) up(slot, now)
  }

  const unsubscribe = presence.subscribe(reconcile)
  reconcile()
  return () => {
    unsubscribe()
    for (const slot of own) down(slot, undefined)
    for (const slot of shared) down(slot, undefined)
  }
}
