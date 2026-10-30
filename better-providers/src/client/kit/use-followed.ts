/** Follow a Remote stream from a component: opened while `open` is given, reopened when `key` changes. */

import { useEffect, useState, useSyncExternalStore } from 'react'
import { follow, type Followed } from './follow.ts'

const noSubscription = (): (() => void) => () => {}

export function useFollowed<T>(open: ((signal: AbortSignal) => AsyncIterable<T>) | undefined, key: string): { value: T | undefined; lost: boolean } {
  const [followed, setFollowed] = useState<Followed<T>>()
  const enabled = open !== undefined
  useEffect(() => {
    if (open === undefined) {
      setFollowed(undefined)
      return undefined
    }
    const next = follow(open)
    setFollowed(next)
    return () => { next.dispose() }
    // `open` is recreated every render; the stream depends only on what `key` names.
  }, [key, enabled]) // eslint-disable-line react-hooks/exhaustive-deps
  const subscribe = followed?.subscribe ?? noSubscription
  const value = useSyncExternalStore(subscribe, () => followed?.get())
  const lost = useSyncExternalStore(subscribe, () => followed?.lost() ?? false)
  return { value, lost }
}
