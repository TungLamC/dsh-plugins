/**
 * Each native session's SessionView, shared by the composer controls that show
 * it (model, permission, fast mode), so a change made through one shows in the
 * others at once: after a model change the fast switch knows whether the new
 * model offers fast mode.
 *
 * Reads are deduplicated per session (asks in the same tick share one read; an
 * ask while one runs reads once more afterwards) and the latest answer wins; a pick's returned
 * settings outrank any read that started before it. An entry is dropped when
 * its last subscriber leaves.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import type { HarnessId, SelectOutcome, SessionView, SettingsChange } from '../shared/types.ts'
import type { NativeActions } from './actions.ts'

export interface ViewState {
  view: SessionView | null
  /** No answer yet for the latest read. */
  loading: boolean
  /** Why the latest read failed, or the catalog error the view carries. */
  error: string
}

export interface Views {
  subscribe(sessionId: string, listener: () => void): () => void
  get(sessionId: string): ViewState
  /** Read the session again from the Host. */
  refresh(sessionId: string): void
  /** Change settings through the Host and keep the settings it returns. */
  select(sessionId: string, change: SettingsChange): Promise<SelectOutcome>
}

interface Entry {
  state: ViewState
  listeners: Set<() => void>
  epoch: number
  scheduled: boolean
  reading: boolean
  again: boolean
}

const INITIAL: ViewState = { view: null, loading: true, error: '' }

export function createViews(actions: NativeActions): Views {
  const entries = new Map<string, Entry>()
  const entryOf = (sessionId: string): Entry => {
    let entry = entries.get(sessionId)
    if (!entry) {
      entry = { state: INITIAL, listeners: new Set(), epoch: 0, scheduled: false, reading: false, again: false }
      entries.set(sessionId, entry)
    }
    return entry
  }
  const publish = (entry: Entry, state: ViewState) => {
    entry.state = state
    for (const listener of entry.listeners) listener()
  }
  const read = (sessionId: string, entry: Entry) => {
    if (entry.reading) {
      entry.again = true
      return
    }
    entry.reading = true
    entry.again = false
    const epoch = ++entry.epoch
    if (!entry.state.loading) publish(entry, { ...entry.state, loading: true })
    actions
      .view(sessionId)
      .then(
        (view) => {
          if (epoch === entry.epoch) publish(entry, { view, loading: false, error: view?.error ?? '' })
        },
        (reason: unknown) => {
          if (epoch === entry.epoch) publish(entry, { ...entry.state, loading: false, error: String(reason) })
        },
      )
      .finally(() => {
        entry.reading = false
        if (entry.again && entries.get(sessionId) === entry) read(sessionId, entry)
        // A pick overtook this read: its answer was dropped, so stop showing the read as pending.
        else if (epoch !== entry.epoch && entry.state.loading) publish(entry, { ...entry.state, loading: false })
      })
  }
  return {
    subscribe(sessionId, listener) {
      const entry = entryOf(sessionId)
      entry.listeners.add(listener)
      return () => {
        entry.listeners.delete(listener)
        if (!entry.listeners.size && entries.get(sessionId) === entry) entries.delete(sessionId)
      }
    },
    get: (sessionId) => entries.get(sessionId)?.state ?? INITIAL,
    // Controls mounting together ask in the same tick; they share one read.
    refresh(sessionId) {
      const entry = entryOf(sessionId)
      if (entry.scheduled) return
      entry.scheduled = true
      queueMicrotask(() => {
        entry.scheduled = false
        if (entries.get(sessionId) === entry) read(sessionId, entry)
      })
    },
    async select(sessionId, change) {
      const outcome = await actions.select(sessionId, change)
      const entry = entries.get(sessionId)
      if (entry) {
        entry.epoch++
        const view = entry.state.view
        publish(entry, { ...entry.state, ...(view ? { view: { ...view, settings: outcome.settings } } : {}) })
      }
      return outcome
    },
  }
}

/**
 * One session's view as run by `harness`; reads it on mount and again whenever
 * `refreshKey` changes. A view kept from the other harness (a blank session
 * switched presets) counts as not read yet.
 */
export function useView(views: Views, sessionId: string, harness: HarnessId, refreshKey?: unknown): ViewState {
  // Stable, or React would resubscribe on every render and drop the entry in between.
  const subscribe = useCallback((listener: () => void) => views.subscribe(sessionId, listener), [views, sessionId])
  const state = useSyncExternalStore(subscribe, () => views.get(sessionId))
  useEffect(() => {
    views.refresh(sessionId)
  }, [views, sessionId, harness, refreshKey])
  return state.view && state.view.harness !== harness ? { ...state, view: null } : state
}
