/**
 * Remote failures: a caller's mistake (`Refusal`) reaches the browser as a bad
 * request whose message is a stable reason token the UI translates; anything else
 * is an internal failure.
 */

import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'

/** A request the caller got wrong, named by a stable reason token. */
export class Refusal extends Error {
  readonly reason: string

  constructor(reason: string, detail?: string) {
    super(detail === undefined ? reason : `${reason}: ${detail}`)
    this.reason = reason
  }
}

function remoteError(error: unknown): RemoteError {
  if (error instanceof RemoteError) return error
  if (error instanceof Refusal) return new RemoteError('gateway/bad-request', error.reason, {}, { cause: error })
  const message = error instanceof Error ? error.message : String(error)
  return new RemoteError('gateway/internal', message, {}, { cause: error })
}

/** Run one Remote call, mapping its failure. */
export async function guard<T>(call: () => T | Promise<T>): Promise<T> {
  try {
    return await call()
  } catch (error) {
    throw remoteError(error)
  }
}

/** Run one Remote stream, mapping a failure to open it or one raised while it runs. */
export async function* guardStream<T>(open: () => AsyncIterable<T>): AsyncIterable<T> {
  try {
    yield* open()
  } catch (error) {
    throw remoteError(error)
  }
}
