import { describe, expect, it } from 'vitest'
import type { QuotaView, Redemption, ResetCard } from '../../../src/shared/quota.wire.ts'
import { createQuotaTracker, QuotaFailure, type Accounts, type Clock, type QuotaAdapter, type QuotaAuth, type Reading } from '../../../src/host/quota/tracker.ts'
import { Refusal } from '../../../src/host/kit/refusal.ts'

const ROUTE = 'openai-codex'
const MINUTE = 60_000

async function flush(): Promise<void> {
  for (let i = 0; i < 30; i += 1) await new Promise(resolve => setImmediate(resolve))
}

/** A clock whose timers fire only when the test advances it. */
function fakeClock(): Clock & { advance(ms: number): Promise<void> } {
  let now = 1_000_000
  let next = 0
  const timers = new Map<number, { at: number; fn: () => void }>()
  return {
    now: () => now,
    set(fn, ms) {
      next += 1
      timers.set(next, { at: now + ms, fn })
      return next
    },
    clear(handle) { timers.delete(handle as number) },
    async advance(ms) {
      const end = now + ms
      for (;;) {
        await flush()
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
        if (due === undefined) break
        timers.delete(due[0])
        now = Math.max(now, due[1].at)
        due[1].fn()
      }
      now = end
      await flush()
    },
  }
}

const CARD: ResetCard = { id: 'card-1', title: 'Full reset' }

function harness(options: { interval?: number } = {}) {
  const clock = fakeClock()
  let identity: string | undefined = 'alice'
  let interval = options.interval ?? 60
  const accounts: Accounts = {
    identity: async () => identity,
    resolve: async () => identity === undefined ? undefined : { identity, token: `token-${identity}`, accountId: 'workspace' },
  }
  const reads: { auth: QuotaAuth; signal: AbortSignal }[] = []
  const redeems: { auth: QuotaAuth; card: string; request: string }[] = []
  /** Usage reads, card list reads and redemptions in the order the adapter saw them. */
  const events: ('read' | 'cards' | 'redeem')[] = []
  /** How many cards the usage reply counts. */
  let cardCount: number | undefined = 1
  let read: (auth: QuotaAuth, signal: AbortSignal) => Promise<Reading> = async auth => ({
    plan: auth.identity,
    pools: [{ id: 'codex', windows: [{ id: 'primary', usedPercent: 40 }] }],
    balances: [],
    ...cardCount === undefined ? {} : { cardCount },
  })
  let cards: NonNullable<QuotaAdapter['cards']> = async () => ({ count: 1, cards: [CARD] })
  let redeem: NonNullable<QuotaAdapter['redeem']> = async () => 'reset'
  const adapter: QuotaAdapter = {
    read: (auth, signal) => {
      reads.push({ auth, signal })
      events.push('read')
      return read(auth, signal)
    },
    cards: (auth, signal) => {
      events.push('cards')
      return cards(auth, signal)
    },
    redeem: (auth, card, request, signal) => {
      redeems.push({ auth, card, request })
      events.push('redeem')
      return redeem(auth, card, request, signal)
    },
  }
  let ids = 0
  const tracker = createQuotaTracker({ accounts, adapters: { [ROUTE]: adapter }, interval: () => interval, clock, newId: () => `account-${++ids}` })

  function observe() {
    const controller = new AbortController()
    const values: QuotaView[] = []
    const done = (async () => { for await (const view of tracker.watch(ROUTE, controller.signal)) values.push(view) })()
    return {
      latest: (): QuotaView => {
        const value = values.at(-1)
        if (value === undefined) throw new Error('no view yet')
        return value
      },
      async stop() {
        controller.abort()
        await done
      },
    }
  }

  return {
    tracker, clock, reads, redeems, events, observe,
    signIn(next: string | undefined) {
      identity = next
      tracker.credentialsChanged(ROUTE)
    },
    setInterval(seconds: number) {
      interval = seconds
      tracker.intervalChanged()
    },
    failWith(error: unknown) { read = async () => { throw error } },
    readWith(next: typeof read) { read = next },
    countCards(next: number | undefined) { cardCount = next },
    cardsWith(next: typeof cards) { cards = next },
    redeemWith(next: typeof redeem) { redeem = next },
  }
}

describe('quota tracker: reading', () => {
  it('reads once for all views, on the interval, and not without views', async () => {
    const h = harness()
    const a = h.observe()
    const b = h.observe()
    await flush()
    expect(h.reads).toHaveLength(1)
    expect(a.latest()).toMatchObject({ status: 'ready', account: 'account-1', reading: false, usage: { plan: 'alice' } })
    expect(b.latest()).toEqual(a.latest())
    await h.clock.advance(MINUTE)
    expect(h.reads).toHaveLength(2)
    await a.stop()
    await h.clock.advance(MINUTE)
    expect(h.reads).toHaveLength(3)
    await b.stop()
    await h.clock.advance(10 * MINUTE)
    expect(h.reads).toHaveLength(3)
  })

  it('cancels a read nobody waits for anymore', async () => {
    const h = harness()
    h.readWith((_auth, signal) => new Promise((_resolve, reject) => { signal.addEventListener('abort', () => { reject(new Error('aborted')) }) }))
    const view = h.observe()
    await flush()
    expect(view.latest().reading).toBe(true)
    await view.stop()
    expect(h.reads[0]?.signal.aborted).toBe(true)
  })

  it('reads at once for a returning view only when the last reading is due', async () => {
    const h = harness()
    const first = h.observe()
    await flush()
    await first.stop()
    await h.clock.advance(MINUTE / 2)
    const second = h.observe()
    await flush()
    expect(h.reads).toHaveLength(1)
    expect(second.latest().status).toBe('ready')
    await h.clock.advance(MINUTE / 2)
    expect(h.reads).toHaveLength(2)
    await second.stop()
    await h.clock.advance(5 * MINUTE)
    const third = h.observe()
    await flush()
    expect(h.reads).toHaveLength(3)
    await third.stop()
  })

  it('takes a new interval at once', async () => {
    const h = harness()
    const view = h.observe()
    await flush()
    await h.clock.advance(20_000)
    h.setInterval(15)
    await flush()
    expect(h.reads).toHaveLength(2)
    await h.clock.advance(15_000)
    expect(h.reads).toHaveLength(3)
    h.setInterval(600)
    await h.clock.advance(5 * MINUTE)
    expect(h.reads).toHaveLength(3)
    await h.clock.advance(5 * MINUTE)
    expect(h.reads).toHaveLength(4)
    await view.stop()
  })

  it('backs off after failures up to five minutes, keeping the last reading', async () => {
    const h = harness()
    const view = h.observe()
    await flush()
    h.failWith(new QuotaFailure({ code: 'request-failed' }))
    const times: number[] = []
    const start = h.clock.now()
    for (let elapsed = 0; elapsed < 20 * MINUTE; elapsed += 10_000) {
      const before = h.reads.length
      await h.clock.advance(10_000)
      if (h.reads.length > before) times.push(Math.round((h.clock.now() - start) / 1000))
    }
    // Failures double the wait from the interval: 60, 120, 240, then 300 seconds at most.
    expect(times.slice(0, 6)).toEqual([60, 120, 240, 480, 780, 1080])
    expect(view.latest()).toMatchObject({ status: 'error', issue: { code: 'request-failed' }, usage: { plan: 'alice' } })
    await view.stop()
  })

  it('waits out the provider retry time', async () => {
    const h = harness()
    h.failWith(new QuotaFailure({ code: 'rate-limited', retryAt: 1_000_000 + 10 * MINUTE }))
    const view = h.observe()
    await flush()
    expect(view.latest().issue).toEqual({ code: 'rate-limited', retryAt: 1_000_000 + 10 * MINUTE })
    await h.clock.advance(9 * MINUTE)
    expect(h.reads).toHaveLength(1)
    await h.clock.advance(MINUTE)
    expect(h.reads).toHaveLength(2)
    await view.stop()
  })

  it('waits for a new sign-in after the provider refused the current one', async () => {
    const h = harness()
    h.failWith(new QuotaFailure({ code: 'auth-expired' }))
    const view = h.observe()
    await flush()
    await h.clock.advance(30 * MINUTE)
    expect(h.reads).toHaveLength(1)
    h.readWith(async () => ({ pools: [], balances: [] }))
    h.signIn('alice')
    await flush()
    expect(h.reads).toHaveLength(2)
    expect(view.latest()).toMatchObject({ status: 'ready', account: 'account-1' })
    expect(view.latest()).not.toHaveProperty('issue')
    await view.stop()
  })

  it('shows signed-out without reading, and reads once someone signs in', async () => {
    const h = harness()
    h.signIn(undefined)
    const view = h.observe()
    await flush()
    expect(view.latest()).toEqual({ status: 'signed-out', reading: false, redeeming: false })
    expect(h.reads).toHaveLength(0)
    h.signIn('alice')
    await flush()
    expect(h.reads).toHaveLength(1)
    expect(view.latest()).toMatchObject({ status: 'ready', account: 'account-1' })
    await view.stop()
  })

  it('drops everything of the previous account, including its read in flight', async () => {
    const h = harness()
    const view = h.observe()
    await flush()
    expect(view.latest()).toMatchObject({ account: 'account-1', usage: { plan: 'alice' } })
    const held: (() => void)[] = []
    h.readWith(auth => new Promise((resolve) => {
      held.push(() => { resolve({ plan: auth.identity, pools: [], balances: [] }) })
    }))
    await h.clock.advance(MINUTE)
    h.signIn('bob')
    await flush()
    expect(view.latest()).toMatchObject({ status: 'loading', account: 'account-2' })
    expect(view.latest()).not.toHaveProperty('usage')
    // Alice's read answers after the switch: it must not show.
    held[0]?.()
    await flush()
    expect(view.latest()).not.toHaveProperty('usage')
    expect(h.reads.at(-1)?.auth.identity).toBe('bob')
    held[1]?.()
    await flush()
    expect(view.latest()).toMatchObject({ status: 'ready', account: 'account-2', usage: { plan: 'bob' } })
    await view.stop()
  })

  it('refuses a route without usage', () => {
    expect(() => harness().tracker.watch('anthropic', new AbortController().signal)).toThrow(Refusal)
  })
})

describe('quota tracker: the reset card list', () => {
  it('is read with the first usage, then only when its count moves', async () => {
    const h = harness()
    const view = h.observe()
    await flush()
    expect(view.latest().usage).toMatchObject({ fetchedAt: 1_000_000, resets: { status: 'ready', count: 1, cards: [CARD] } })
    await h.clock.advance(MINUTE)
    expect(h.events).toEqual(['read', 'cards', 'read'])
    h.countCards(0)
    h.cardsWith(async () => ({ count: 0, cards: [] }))
    await h.clock.advance(MINUTE)
    expect(h.events).toEqual(['read', 'cards', 'read', 'read', 'cards'])
    expect(view.latest().usage?.resets).toEqual({ status: 'ready', count: 0, cards: [] })
    await view.stop()
  })

  it('is read again for a new account', async () => {
    const h = harness()
    const view = h.observe()
    await flush()
    h.signIn('bob')
    await flush()
    expect(h.events).toEqual(['read', 'cards', 'read', 'cards'])
    await view.stop()
  })

  it('keeps the usage when the list fails, and waits out the provider\'s retry time for it', async () => {
    const h = harness()
    h.cardsWith(async () => { throw new QuotaFailure({ code: 'rate-limited', retryAt: 1_000_000 + 5 * MINUTE }) })
    const view = h.observe()
    await flush()
    expect(view.latest()).toMatchObject({
      status: 'ready',
      usage: { pools: [{ id: 'codex' }], resets: { status: 'unavailable', count: 1, cards: [], issue: { code: 'rate-limited' } } },
    })
    await h.clock.advance(4 * MINUTE)
    expect(h.events.filter(event => event === 'cards')).toHaveLength(1)
    h.cardsWith(async () => ({ count: 1, cards: [CARD] }))
    await h.clock.advance(MINUTE)
    expect(h.events.filter(event => event === 'cards')).toHaveLength(2)
    expect(view.latest().usage?.resets).toMatchObject({ status: 'ready', cards: [CARD] })
    await view.stop()
  })

  it('is left out for an account without reset cards', async () => {
    const h = harness()
    h.countCards(undefined)
    const view = h.observe()
    await flush()
    expect(view.latest().usage).not.toHaveProperty('resets')
    expect(h.events).toEqual(['read'])
    await view.stop()
  })
})

describe('quota tracker: reset cards', () => {
  const request = '00000000-0000-4000-8000-000000000001'
  const redemption = (overrides: Partial<Redemption> = {}): Redemption => ({ account: 'account-1', card: 'card-1', request, ...overrides })

  async function ready() {
    const h = harness()
    const view = h.observe()
    await flush()
    return { h, view }
  }

  it('checks the card against a fresh list, redeems it, and reads usage and cards again', async () => {
    const { h, view } = await ready()
    await expect(h.tracker.redeem(ROUTE, redemption())).resolves.toBe('reset')
    expect(h.redeems).toEqual([{ auth: expect.objectContaining({ identity: 'alice' }), card: 'card-1', request }])
    await flush()
    // The list is read afresh both before the card is spent and after.
    expect(h.events).toEqual(['read', 'cards', 'read', 'cards', 'redeem', 'read', 'cards'])
    expect(view.latest()).toMatchObject({ status: 'ready', redeeming: false })
    expect(view.latest()).not.toHaveProperty('pending')
    await view.stop()
  })

  it('answers a repeated request without redeeming again', async () => {
    const { h, view } = await ready()
    await h.tracker.redeem(ROUTE, redemption())
    await expect(h.tracker.redeem(ROUTE, redemption())).resolves.toBe('reset')
    await expect(h.tracker.redeem(ROUTE, redemption({ card: 'card-2' }))).rejects.toMatchObject({ reason: 'request-mismatch' })
    expect(h.redeems).toHaveLength(1)
    await view.stop()
  })

  it('keeps a redemption whose answer was lost pending, and settles it only by retrying it', async () => {
    const { h, view } = await ready()
    h.redeemWith(async () => { throw new QuotaFailure({ code: 'request-failed' }) })
    await expect(h.tracker.redeem(ROUTE, redemption())).resolves.toBe('unknown')
    await flush()
    expect(view.latest()).toMatchObject({ redeeming: false, pending: redemption() })
    const other = redemption({ request: '00000000-0000-4000-8000-000000000002' })
    await expect(h.tracker.redeem(ROUTE, other)).rejects.toMatchObject({ reason: 'reset-pending' })
    const before = h.events.length
    h.redeemWith(async () => 'already-redeemed')
    await expect(h.tracker.redeem(ROUTE, redemption())).resolves.toBe('already-redeemed')
    await flush()
    // A retry sends the same request at once; the list is not checked again first.
    expect(h.redeems.map(entry => entry.request)).toEqual([request, request])
    expect(h.events.slice(before)).toEqual(['redeem', 'read', 'cards'])
    expect(view.latest()).not.toHaveProperty('pending')
    await view.stop()
  })

  it('refuses a card missing from the fresh list without sending anything', async () => {
    const { h, view } = await ready()
    await expect(h.tracker.redeem(ROUTE, redemption({ card: 'card-9' }))).rejects.toMatchObject({ reason: 'card-unavailable' })
    expect(h.redeems).toHaveLength(0)
    await flush()
    expect(view.latest()).toMatchObject({ redeeming: false })
    expect(view.latest()).not.toHaveProperty('pending')
    await view.stop()
  })

  it('refuses a card chosen under another account', async () => {
    const { h, view } = await ready()
    await expect(h.tracker.redeem(ROUTE, redemption({ account: 'account-0' }))).rejects.toBeInstanceOf(Refusal)
    h.signIn('bob')
    await flush()
    await expect(h.tracker.redeem(ROUTE, redemption())).rejects.toMatchObject({ reason: 'account-changed' })
    expect(h.redeems).toHaveLength(0)
    await view.stop()
  })

  it('leaves nothing pending when the provider refused the redemption', async () => {
    const { h, view } = await ready()
    h.redeemWith(async () => { throw new QuotaFailure({ code: 'forbidden' }, true) })
    await expect(h.tracker.redeem(ROUTE, redemption())).rejects.toMatchObject({ reason: 'redeem-refused' })
    await flush()
    expect(view.latest()).not.toHaveProperty('pending')
    await view.stop()
  })

  it('forgets a pending redemption when another account signs in', async () => {
    const { h, view } = await ready()
    h.redeemWith(async () => { throw new Error('connection reset') })
    await expect(h.tracker.redeem(ROUTE, redemption())).resolves.toBe('unknown')
    h.signIn('bob')
    await flush()
    expect(view.latest()).toMatchObject({ account: 'account-2' })
    expect(view.latest()).not.toHaveProperty('pending')
    await view.stop()
  })
})
