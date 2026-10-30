/** A Remote call's result as the UI acts on it. */

import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'

export type Settled<T> =
  | { ok: true; value: T }
  /** The Host refused the request; `reason` is a stable token the UI translates. */
  | { ok: false; refused: string }
  /** The call failed for another reason, or its outcome is unknown. */
  | { ok: false; failed: string }

export async function settle<T>(call: () => Promise<RemoteResult<T>>): Promise<Settled<T>> {
  try {
    const result = await call()
    if (result.ok) return { ok: true, value: result.value }
    return result.error.code === 'gateway/bad-request' ? { ok: false, refused: result.error.message } : { ok: false, failed: result.error.message }
  } catch (error) {
    return { ok: false, failed: error instanceof Error ? error.message : String(error) }
  }
}
