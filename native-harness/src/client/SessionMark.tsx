/** Sidebar row mark: the brand of whatever runs the session, the native harness or dsh itself. */
import { useSyncExternalStore } from 'react'
import { FishLogo } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { harnessOfPreset, HARNESS_NAMES } from '../shared/types.ts'
import { BrandIcon } from './BrandIcon.tsx'

export function useHarness(sessionId: string, sessions: ISessions['list']) {
  return useSyncExternalStore(sessions.subscribe, () =>
    harnessOfPreset(sessions.getSnapshot().byId[sessionId as SessionId]?.projectionValues?.agentPreset),
  )
}

export function SessionMark({ sessionId, sessions }: { sessionId: string; sessions: ISessions['list'] }) {
  const harness = useHarness(sessionId, sessions)
  if (!harness)
    return (
      <span className="nh-brand" role="img" aria-label="DeepSeek Harness">
        <FishLogo size={14} />
      </span>
    )
  return (
    <span className="nh-brand" role="img" aria-label={HARNESS_NAMES[harness]}>
      <BrandIcon harness={harness} size={14} />
    </span>
  )
}
