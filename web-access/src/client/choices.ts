/**
 * The models the settings page offers each hosted tier: read from the Host
 * each time the page opens, since routes and their models change on the Models page.
 */

import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { ModelChoice, SearchModels } from '../shared/web-access.wire.ts'

export interface ChoicesStore {
  /** The models per tier; undefined until the Host has answered. */
  getSnapshot(): SearchModels | undefined
  subscribe(listener: () => void): () => void
  /** Ask the Host again; a request already under way is not repeated. */
  load(): void
}

export function choicesStore(fetch: () => Promise<RemoteResult<SearchModels>>): ChoicesStore {
  let current: SearchModels | undefined
  let loading = false
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => current,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    load() {
      if (loading) return
      loading = true
      fetch().then((result) => {
        if (!result.ok) return
        current = result.value
        for (const listener of [...listeners]) listener()
      }, () => {
        // The menus keep offering what they had; the next opening asks again.
      }).finally(() => { loading = false })
    },
  }
}

/** What one hosted tier's model menu offers. */
export type ModelMenu =
  /** The Models page has no route for the tier. */
  | { kind: 'no-route' }
  /** "Automatic" first, then these; a chosen model the route no longer lists stays, so the menu shows what is stored. */
  | { kind: 'models'; models: readonly ModelChoice[] }

/**
 * @param models - the tier's models from the Host: null without a route, undefined until the Host answers.
 * @param chosen - the model the form holds for the tier; empty for automatic.
 */
export function modelMenu(models: readonly ModelChoice[] | null | undefined, chosen: string): ModelMenu {
  if (models === null) return { kind: 'no-route' }
  const listed = models ?? []
  const missing = chosen !== '' && !listed.some(model => model.id === chosen)
  return { kind: 'models', models: missing ? [...listed, { id: chosen, name: chosen }] : listed }
}
