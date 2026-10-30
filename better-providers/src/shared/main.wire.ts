/** The main row's Remote contract: which parts are running, so the browser shows exactly their UI. */

import type { RemoteStreamHandle, TypertRemoteNamespace } from '@deepseek-ai/dsh-typert-protocol'
import { MODULE, PARTS, SERVICE, type Part } from './ids.ts'
import { defineRemote } from './remote.ts'

/** Whether each part's row is running (its service is provided and its Remote is callable). */
export type PartsPresence = Readonly<Record<Part, boolean>>

export const NO_PARTS: PartsPresence = Object.freeze(Object.fromEntries(PARTS.map(part => [part, false])) as Record<Part, boolean>)

export function samePresence(a: PartsPresence, b: PartsPresence): boolean {
  return PARTS.every(part => a[part] === b[part])
}

export const MAIN_REMOTE = defineRemote(MODULE.main, SERVICE.main, {
  watchParts: { params: [], stream: true, signal: true },
})

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteMap {
    'betterProviders/watchParts': (signal?: AbortSignal) => RemoteStreamHandle<PartsPresence, never>
  }
  interface TypertRemoteNamespaceMap {
    betterProviders: TypertRemoteNamespace<'betterProviders'>
  }
}
