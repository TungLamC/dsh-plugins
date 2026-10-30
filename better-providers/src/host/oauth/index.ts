/**
 * The oauth row: the `betterProvidersOauth` Remote service the Models page calls
 * to sign in to pi-ai provider routes with an account (relay.ts).
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { CredentialKey } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-authorization'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { SERVICE } from '../../shared/ids.ts'
import { OAUTH_REMOTE, type SignInView } from '../../shared/oauth.wire.ts'
import { grantsOf, planOf, providerOf } from '../kit/pi-ai-record.ts'
import { guard, guardStream } from '../kit/refusal.ts'
import { registerHost } from '../kit/typert.ts'
import { createSignInRelay, type SignInRelay } from './relay.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    betterProvidersOauth: BetterProvidersOauth
  }
}

/** Record keys reach the services only after `recordKey` checked their grammar. */
const asKey = (key: string): CredentialKey => key as CredentialKey

export default class BetterProvidersOauth extends TypertRemoteService {
  static inject = [SERVICE.main, 'typert', 'authorization', 'credentials']

  private readonly relay: SignInRelay

  constructor(ctx: Context) {
    super(ctx, SERVICE.oauth)
    registerHost(ctx, OAUTH_REMOTE)
    const grants = grantsOf(ctx.credentials)
    this.relay = createSignInRelay({
      flows: {
        describe: key => ctx.authorization.describe(asKey(key)),
        begin: request => ctx.authorization.begin({ ...request, key: asKey(request.key) }),
        cancel: (key) => { ctx.authorization.cancel(asKey(key)) },
      },
      records: {
        describe: key => ctx.credentials.describeRecord(asKey(key)),
        plan: async (key) => {
          const provider = providerOf(key)
          return provider === undefined ? undefined : planOf(await grants.read(provider))
        },
        remove: key => ctx.credentials.deleteRecord(asKey(key)),
      },
      changes(listener) {
        const settled = ctx.on('authorization/settled', (key) => { listener(String(key)) })
        const updated = ctx.on('credentials/record-updated', (key) => { listener(String(key)) })
        return () => { settled(); updated() }
      },
      newId: () => randomUUID(),
    })
  }

  @Remote({ mode: 'stream' })
  async *watch(provider: string, signal: AbortSignal): AsyncIterable<SignInView | null> {
    yield* guardStream(() => this.relay.watch(provider, signal))
  }

  @Remote
  async begin(provider: string, method: string, signal: AbortSignal): Promise<'authorized' | 'cancelled'> {
    return guard(() => this.relay.begin(provider, method, signal))
  }

  @Remote
  async answer(provider: string, promptId: string, value: string): Promise<void> {
    return guard(() => { this.relay.answer(provider, promptId, value) })
  }

  @Remote
  async cancel(provider: string): Promise<void> {
    return guard(() => { this.relay.cancel(provider) })
  }

  @Remote
  async signOut(provider: string): Promise<void> {
    return guard(() => this.relay.signOut(provider))
  }
}
