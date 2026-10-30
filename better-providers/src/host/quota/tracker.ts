/**
 * Usage of signed-in routes, read on demand. A route is read only while some view
 * watches it; all its views share each read, and reading stops when the last one
 * leaves. Failed reads back off up to five minutes and wait out a provider's
 * retry time. Another account signing in drops everything of the previous one.
 * The reset card list is read again only when its count moves, after a
 * redemption, or for a new account. A card is checked against a fresh list before
 * it is used, and a redemption whose answer was lost stays pending under its
 * request id, so a retry cannot use a second card.
 *
 * The tracker's ports are declared here: the accounts it reads with, and the
 * provider adapters, which only translate a provider's replies.
 */

import { randomUUID } from 'node:crypto'
import {
  REFRESH_SECONDS,
  type QuotaBalance, type QuotaIssue, type QuotaPool, type QuotaView, type Redemption, type RedemptionOutcome, type ResetCard, type ResetCards,
} from '../../shared/quota.wire.ts'
import { cell, type Cell } from '../kit/cell.ts'
import { Refusal } from '../kit/refusal.ts'

/** The credential of one read, with the account it belongs to. */
export interface QuotaAuth {
  /** Stable for one account and different for another; never shown. */
  identity: string
  token: string
  accountId?: string
}

/** The signed-in account of each route. */
export interface Accounts {
  /** A stable id of the stored sign-in's account, read without network access; undefined when there is none. */
  identity(provider: string): Promise<string | undefined>
  /**
   * The credential to read usage with, refreshed first when it is about to expire.
   * @returns undefined when no account is signed in.
   * @throws {QuotaFailure} `refresh-failed` when the refresh failed.
   */
  resolve(provider: string, signal: AbortSignal): Promise<QuotaAuth | undefined>
}

/** What one usage reply says. */
export interface Reading {
  /** The plan as the provider names it now: an id such as `pro`, or a display name. */
  plan?: string
  managedByTeam?: true
  pools: QuotaPool[]
  balances: QuotaBalance[]
  /** How many reset cards the account has; absent when the account has none at all. */
  cardCount?: number
}

/**
 * One provider's usage endpoints. Every method fails with a {@link QuotaFailure};
 * a redemption fails with `refused` set only when the provider answered that it
 * did nothing.
 */
export interface QuotaAdapter {
  read(auth: QuotaAuth, signal: AbortSignal): Promise<Reading>
  /** The usable reset cards, soonest expiry first, and how many the account has. */
  cards?(auth: QuotaAuth, signal: AbortSignal): Promise<{ count: number; cards: ResetCard[] }>
  /** Use one reset card; repeating `request` uses it at most once. */
  redeem?(auth: QuotaAuth, card: string, request: string, signal: AbortSignal): Promise<Exclude<RedemptionOutcome, 'unknown'>>
}

/** A failed step of a read or a redemption, as the issue the view shows. */
export class QuotaFailure extends Error {
  readonly issue: QuotaIssue
  /** The provider answered with a refusal, so a write it was asked for did not happen. */
  readonly refused: boolean

  constructor(issue: QuotaIssue, refused = false) {
    super(issue.code)
    this.issue = issue
    this.refused = refused
  }
}

/** The issue an error stands for; anything unexpected is a failed request. */
function issueOf(error: unknown): QuotaIssue {
  return error instanceof QuotaFailure ? error.issue : { code: 'request-failed' }
}

export interface Clock {
  now(): number
  set(fn: () => void, ms: number): unknown
  clear(handle: unknown): void
}

export interface TrackerDependencies {
  accounts: Accounts
  /** Usage adapters by route; other routes are unsupported. */
  adapters: Readonly<Partial<Record<string, QuotaAdapter>>>
  /** Seconds between reads while a route is watched. */
  interval(): number
  clock?: Clock
  newId?(): string
}

export interface QuotaTracker {
  /** The route's view at once, then every change, until `signal` aborts. Refuses an unsupported route. */
  watch(provider: string, signal: AbortSignal): AsyncIterable<QuotaView>
  /**
   * Use a reset card of the account it was chosen under.
   * @returns the provider's answer, or `unknown` when it was lost: the view then keeps the redemption as
   *   `pending` until the same redemption is retried and settles.
   */
  redeem(provider: string, redemption: Redemption): Promise<RedemptionOutcome>
  /** The route's stored credential changed. */
  credentialsChanged(provider: string): void
  /** The interval setting changed. */
  intervalChanged(): void
  dispose(): void
}

/** Longest wait between reads after repeated failures (unless the interval itself is longer). */
const MAX_BACKOFF_MS = 5 * 60_000
/** Settled redemptions remembered per route, so repeating one answers without redeeming again. */
const SETTLED_LIMIT = 50
/** Issues only a new sign-in clears; reads wait for the credential to change. */
const SIGN_IN_ISSUES: ReadonlySet<string> = new Set(['auth-required', 'auth-expired'])

const realClock: Clock = {
  now: () => Date.now(),
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => { clearTimeout(handle as ReturnType<typeof setTimeout>) },
}

interface Attempt {
  redemption: Redemption
  /** Sent to the provider at least once, so it may have taken effect. */
  sent: boolean
  running?: Promise<RedemptionOutcome>
}

interface Route {
  provider: string
  adapter: QuotaAdapter
  view: Cell<QuotaView>
  watchers: number
  /** Redemptions in progress; they keep reads possible without watchers. */
  holds: number
  /** Whether the stored account has been looked up since the route was created. */
  known: boolean
  identity?: string
  /** Bumped when the account changes; work started before must not publish. */
  epoch: number
  /** Bumped per account lookup, so only the latest one applies. */
  lookups: number
  failures: number
  /** When the last read started. */
  lastRead: number
  timer?: unknown
  reading?: Promise<void>
  controller?: AbortController
  /** Read again as soon as the running read ends. */
  again: boolean
  /** Read the reset card list afresh even if its count did not move. */
  cardsStale: boolean
  attempt?: Attempt
  settled: Map<string, { card: string; outcome: RedemptionOutcome }>
}

function withoutPending(view: QuotaView): QuotaView {
  const { pending: _pending, ...rest } = view
  return rest
}

function withoutIssue(view: QuotaView): QuotaView {
  const { issue: _issue, ...rest } = view
  return rest
}

export function createQuotaTracker(deps: TrackerDependencies): QuotaTracker {
  const clock = deps.clock ?? realClock
  const newId = deps.newId ?? randomUUID
  const routes = new Map<string, Route>()
  const lifetime = new AbortController()

  const intervalMs = (): number => Math.min(REFRESH_SECONDS.max, Math.max(REFRESH_SECONDS.min, deps.interval())) * 1000
  const update = (route: Route, changes: Partial<QuotaView>): void => { route.view.set({ ...route.view.get(), ...changes }) }

  function routeOf(provider: string): Route {
    const existing = routes.get(provider)
    if (existing !== undefined) return existing
    const adapter = Object.hasOwn(deps.adapters, provider) ? deps.adapters[provider] : undefined
    if (adapter === undefined) throw new Refusal('unsupported', provider)
    const route: Route = {
      provider, adapter, view: cell<QuotaView>({ status: 'loading', reading: false, redeeming: false }),
      watchers: 0, holds: 0, known: false, epoch: 0, lookups: 0, failures: 0, lastRead: Number.NEGATIVE_INFINITY,
      again: false, cardsStale: true, settled: new Map(),
    }
    routes.set(provider, route)
    return route
  }

  function clearTimer(route: Route): void {
    if (route.timer !== undefined) clock.clear(route.timer)
    route.timer = undefined
  }

  /** Stop the running read without publishing its result. */
  function cancelRead(route: Route): void {
    route.controller?.abort()
    route.controller = undefined
    if (route.view.get().reading) update(route, { reading: false })
  }

  /** Start over for another account (undefined: none signed in), keeping nothing of the previous one's. */
  function switchAccount(route: Route, identity: string | undefined): void {
    route.known = true
    route.identity = identity
    route.epoch += 1
    cancelRead(route)
    route.failures = 0
    route.lastRead = Number.NEGATIVE_INFINITY
    route.cardsStale = true
    route.attempt = undefined
    route.settled.clear()
    route.view.set(identity === undefined
      ? { status: 'signed-out', reading: false, redeeming: false }
      : { status: 'loading', account: newId(), reading: false, redeeming: false })
  }

  /** Follow the stored account; @returns whether it changed. */
  async function lookUp(route: Route): Promise<boolean> {
    const lookup = ++route.lookups
    const identity = await deps.accounts.identity(route.provider)
    if (lookup !== route.lookups || lifetime.signal.aborted) return false
    if (route.known && identity === route.identity) return false
    switchAccount(route, identity)
    return true
  }

  function schedule(route: Route): void {
    clearTimer(route)
    const view = route.view.get()
    if (lifetime.signal.aborted || route.watchers === 0 || route.reading !== undefined || view.redeeming) return
    // Signed out, or refused until someone signs in again: a credential change brings the next read.
    if (route.known && route.identity === undefined) return
    if (view.issue !== undefined && SIGN_IN_ISSUES.has(view.issue.code)) return
    let delay = 0
    if (route.known && view.status !== 'loading') {
      const base = intervalMs()
      const period = route.failures === 0 ? base : Math.max(base, Math.min(MAX_BACKOFF_MS, base * 2 ** (route.failures - 1)))
      delay = Math.max(route.lastRead + period, view.issue?.retryAt ?? 0) - clock.now()
    }
    if (delay <= 0) {
      void read(route)
      return
    }
    route.timer = clock.set(() => {
      route.timer = undefined
      void read(route)
    }, delay)
  }

  /** Read now, or join the running read (and read once more after it when `again`). */
  function read(route: Route, again = false): Promise<void> {
    if (route.reading !== undefined) {
      if (again) route.again = true
      return route.reading
    }
    clearTimer(route)
    const run = runRead(route)
    route.reading = run
    void run.then(() => {
      if (route.reading === run) route.reading = undefined
      if (route.again) {
        route.again = false
        void read(route)
      } else {
        schedule(route)
      }
    })
    return run
  }

  /**
   * The reset cards of a reading. The usage reply carries only their count, so the list is read again
   * when the count moves, when none is held for this account, after a redemption, or when the last
   * attempt failed and the provider's wait is over. A failed list leaves the usage intact.
   */
  async function cardsOf(route: Route, auth: QuotaAuth, count: number | undefined, signal: AbortSignal): Promise<ResetCards | undefined> {
    if (count === undefined || route.adapter.cards === undefined) return undefined
    const held = route.cardsStale ? undefined : route.view.get().usage?.resets
    if (held?.status === 'ready' && held.count === count) return held
    if (held?.status === 'unavailable' && (held.issue?.retryAt ?? 0) > clock.now()) return { ...held, count }
    try {
      const list = await route.adapter.cards(auth, signal)
      return { status: 'ready', count: list.count, cards: list.cards }
    } catch (error) {
      return { status: 'unavailable', count, cards: [], issue: issueOf(error) }
    }
  }

  async function runRead(route: Route): Promise<void> {
    try {
      await lookUp(route)
    } catch (error) {
      route.failures += 1
      update(route, { status: 'error', issue: issueOf(error) })
      return
    }
    if (lifetime.signal.aborted || route.identity === undefined || route.watchers + route.holds === 0) return
    const epoch = route.epoch
    const controller = new AbortController()
    route.controller = controller
    route.lastRead = clock.now()
    update(route, { reading: true })
    const current = (): boolean => !controller.signal.aborted && epoch === route.epoch && !lifetime.signal.aborted
    try {
      const auth = await deps.accounts.resolve(route.provider, controller.signal)
      if (!current()) return
      if (auth === undefined) throw new QuotaFailure({ code: 'auth-required' })
      // A refresh may hand over another account's token: never read one account with another's.
      if (auth.identity !== route.identity) {
        switchAccount(route, auth.identity)
        return
      }
      const { cardCount, ...reading } = await route.adapter.read(auth, controller.signal)
      const resets = await cardsOf(route, auth, cardCount, controller.signal)
      if (!current()) return
      route.failures = 0
      route.cardsStale = false
      const usage = { fetchedAt: clock.now(), ...reading, ...resets === undefined ? {} : { resets } }
      route.view.set({ ...withoutIssue(route.view.get()), status: 'ready', usage, reading: false })
    } catch (error) {
      if (!current()) return
      route.failures += 1
      update(route, { status: 'error', issue: issueOf(error), reading: false })
    } finally {
      if (route.controller === controller) route.controller = undefined
    }
  }

  async function* follow(route: Route, signal: AbortSignal): AsyncIterable<QuotaView> {
    const stop = AbortSignal.any([signal, lifetime.signal])
    if (stop.aborted) return
    route.watchers += 1
    if (route.watchers === 1) schedule(route)
    try {
      yield* route.view.watch(stop)
    } finally {
      route.watchers -= 1
      if (route.watchers === 0) {
        clearTimer(route)
        if (route.holds === 0) cancelRead(route)
      }
    }
  }

  function remember(route: Route, redemption: Redemption, outcome: RedemptionOutcome): void {
    route.settled.set(redemption.request, { card: redemption.card, outcome })
    if (route.settled.size > SETTLED_LIMIT) route.settled.delete(route.settled.keys().next().value!)
  }

  async function perform(route: Route, attempt: Attempt): Promise<RedemptionOutcome> {
    const { redemption } = attempt
    const epoch = route.epoch
    const sentBefore = attempt.sent
    let outcome: RedemptionOutcome | undefined
    let sentNow = false
    route.holds += 1
    update(route, { redeeming: true })
    try {
      if (!sentBefore) {
        // Check the card against a fresh list before spending it; a read already running may predate the mark.
        route.cardsStale = true
        if (route.reading !== undefined) await route.reading
        await read(route)
        if (epoch !== route.epoch) throw new Refusal('account-changed')
        const view = route.view.get()
        const card = view.usage?.resets?.cards.find(candidate => candidate.id === redemption.card)
        if (view.status !== 'ready' || card === undefined || (card.expiresAt !== undefined && card.expiresAt <= clock.now())) {
          throw new Refusal('card-unavailable')
        }
      }
      const auth = await deps.accounts.resolve(route.provider, lifetime.signal)
      if (epoch !== route.epoch || auth === undefined || auth.identity !== route.identity) throw new Refusal('account-changed')
      attempt.sent = true
      sentNow = true
      try {
        outcome = await route.adapter.redeem!(auth, redemption.card, redemption.request, lifetime.signal)
      } catch (error) {
        // A refusal means the provider did nothing; any other failure may have lost its answer.
        if (error instanceof QuotaFailure && error.refused) throw new Refusal('redeem-refused')
        outcome = 'unknown'
      }
      if (outcome !== 'unknown' && epoch === route.epoch) remember(route, redemption, outcome)
      return outcome
    } finally {
      route.holds -= 1
      if (epoch === route.epoch) {
        // Keep the attempt while an earlier or this send may have taken effect without an answer.
        const settled = (outcome !== undefined && outcome !== 'unknown') || !attempt.sent || (!sentBefore && outcome === undefined)
        if (settled && route.attempt === attempt) route.attempt = undefined
        const pending = route.attempt?.redemption
        route.view.set({ ...withoutPending(route.view.get()), redeeming: false, ...pending === undefined ? {} : { pending } })
        if (sentNow) {
          // A send may have changed the limits and the cards, whatever its answer.
          route.cardsStale = true
          void read(route, true)
        } else {
          schedule(route)
        }
      }
    }
  }

  return {
    watch(provider, signal) {
      return follow(routeOf(provider), signal)
    },

    async redeem(provider, redemption) {
      const route = routeOf(provider)
      if (route.adapter.redeem === undefined) throw new Refusal('unsupported', provider)
      await lookUp(route)
      if (route.identity === undefined || route.view.get().account !== redemption.account) throw new Refusal('account-changed')
      const settled = route.settled.get(redemption.request)
      if (settled !== undefined) {
        if (settled.card !== redemption.card) throw new Refusal('request-mismatch')
        return settled.outcome
      }
      const current = route.attempt
      if (current !== undefined && current.redemption.request !== redemption.request) throw new Refusal('reset-pending')
      if (current !== undefined && current.redemption.card !== redemption.card) throw new Refusal('request-mismatch')
      if (current?.running !== undefined) return current.running
      const attempt = current ?? { redemption, sent: false }
      route.attempt = attempt
      const running = perform(route, attempt)
      attempt.running = running
      const done = (): void => { if (attempt.running === running) delete attempt.running }
      running.then(done, done)
      return running
    },

    credentialsChanged(provider) {
      const route = routes.get(provider)
      if (route === undefined || lifetime.signal.aborted) return
      void lookUp(route).then((switched) => {
        if (switched) {
          schedule(route)
          return
        }
        const code = route.view.get().issue?.code
        // The same account signed in again, or its token was refreshed elsewhere: what a refused read waited for.
        if (route.watchers > 0 && (code === 'auth-required' || code === 'auth-expired' || code === 'refresh-failed')) {
          cancelRead(route)
          void read(route, true)
        }
      }, () => undefined)
    },

    intervalChanged() {
      for (const route of routes.values()) if (route.timer !== undefined) schedule(route)
    },

    dispose() {
      lifetime.abort()
      for (const route of routes.values()) {
        clearTimer(route)
        route.controller?.abort()
      }
      routes.clear()
    },
  }
}
