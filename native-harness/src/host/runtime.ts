/** Lifecycle of native sessions: one per dsh session, opened lazily, resumed or forked from persisted state. */
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { HARNESS_NAMES, type Adoption, type HarnessId, type HarnessSettings } from '../shared/types.ts'
import type { Harness, NativeCut, NativeRef, NativeSession, OpenOrigin, SessionPorts } from './harness/types.ts'
import { emptyRecord, type SessionRecord, type SessionStore } from './store.ts'

const FORK_SCAN_LIMIT = 512

/** A record written for another harness (the blank session switched presets) starts over. */
function baseFor(record: SessionRecord | undefined, harness: HarnessId): SessionRecord {
  return record?.harness === harness ? record : { ...emptyRecord(harness), forwarded: record?.forwarded ?? [] }
}
const CONVERSATIONAL = new Set(['user/message', 'assistant/message', 'tool/call', 'tool/result'])

/** Shown before the first output of a session that took over a terminal conversation. */
function takeOverNotice({ title, fork }: Adoption): string {
  const name = title.length > 60 ? `${title.slice(0, 59)}…` : title
  return fork
    ? `在副本上接着终端里的 Claude Code 会话「${name}」继续，终端里的原会话不变。之前的对话 dsh 里不显示，Claude 记得。\nContinuing the terminal Claude Code session "${name}" on a copy; the terminal's session stays as it was. dsh does not show the earlier conversation; Claude has it.`
    : `接着终端里的 Claude Code 会话「${name}」继续。之前的对话 dsh 里不显示，Claude 记得。\nContinuing the terminal Claude Code session "${name}". dsh does not show the earlier conversation; Claude has it.`
}

export interface RuntimeDeps {
  harness(id: HarnessId): Harness
  store: SessionStore
  /** What a session runs with, from its stored picks. */
  settings(harness: HarnessId, cwd: string, stored: HarnessSettings): HarnessSettings
  ports(agent: Agent): SessionPorts
  /** The directory the session runs in now: a worktree once dsh moved it there, else the project. */
  cwd(agent: Agent, signal: AbortSignal): Promise<string>
  /** Read events `[from, to)` of a session's log, in order; fewer when the log is shorter. */
  readEvents(sessionId: string, from: number, to: number, signal: AbortSignal): Promise<SessionEvent[]>
}

export interface OpenedSession {
  native: NativeSession
  forwarded: readonly string[]
  /** One-time text shown before the first output, e.g. when a fork could not inherit context. */
  notice?: string
}

export class SessionRuntime {
  private readonly sessions = new Map<string, Promise<OpenedSession>>()
  private readonly locks = new Map<string, Promise<void>>()
  private readonly opened = new Map<string, NativeSession>()
  private readonly deps: RuntimeDeps
  constructor(deps: RuntimeDeps) {
    this.deps = deps
  }

  /** Open, resume or fork the native session of one dsh session; concurrent callers share one open. */
  session(agent: Agent, harness: HarnessId, signal: AbortSignal): Promise<OpenedSession> {
    const existing = this.sessions.get(agent.id)
    if (existing) return existing
    // Opening reads the settings under the same lock as settings changes, so neither misses the other.
    const opening = this.exclusive(agent.id, () => this.open(agent, harness, signal))
    this.sessions.set(agent.id, opening)
    opening.then(
      (result) => {
        if (this.sessions.get(agent.id) === opening) this.opened.set(agent.id, result.native)
      },
      () => {
        if (this.sessions.get(agent.id) === opening) this.sessions.delete(agent.id)
      },
    )
    return opening
  }

  /** Run `task` alone for this session: opening and settings changes never interleave. */
  exclusive<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(sessionId) ?? Promise.resolve()
    const run = previous.catch(() => undefined).then(task)
    const settled = run.then(
      () => undefined,
      () => undefined,
    )
    this.locks.set(sessionId, settled)
    void settled.then(() => {
      if (this.locks.get(sessionId) === settled) this.locks.delete(sessionId)
    })
    return run
  }

  /** The native session if it has finished opening; never waits (callers may hold the session lock). */
  async live(sessionId: string): Promise<NativeSession | undefined> {
    return this.opened.get(sessionId)
  }

  async close(sessionId: string): Promise<void> {
    const opening = this.sessions.get(sessionId)
    if (!opening) return
    this.sessions.delete(sessionId)
    this.opened.delete(sessionId)
    await (await opening.catch(() => undefined))?.native.close()
  }

  async closeAll(): Promise<void> {
    await Promise.allSettled([...this.sessions.keys()].map((id) => this.close(id)))
  }

  async saveRef(sessionId: string, harness: HarnessId, ref: NativeRef): Promise<void> {
    await this.deps.store.update(sessionId, (record) => ({ ...baseFor(record, harness), ref }))
  }

  async saveEndpoint(sessionId: string, harness: HarnessId, endpoint: string): Promise<void> {
    await this.deps.store.update(sessionId, (record) => ({ ...baseFor(record, harness), lastEndpoint: endpoint }))
  }

  async saveMode(sessionId: string, harness: HarnessId, mode: string): Promise<void> {
    await this.deps.store.update(sessionId, (record) => {
      const base = baseFor(record, harness)
      return { ...base, settings: { ...base.settings, mode } }
    })
  }

  async markForwarded(sessionId: string, harness: HarnessId, ids: readonly string[]): Promise<void> {
    if (!ids.length) return
    await this.deps.store.update(sessionId, (record) => {
      const base = baseFor(record, harness)
      return { ...base, forwarded: [...base.forwarded.filter((id) => !ids.includes(id)), ...ids] }
    })
  }

  /** Record a cut both sides have committed: the native turn ended and dsh logged its final assistant event. */
  async committed(sessionId: string, harness: HarnessId, seq: number, cut: NativeCut): Promise<void> {
    await this.deps.store.update(sessionId, (record) => {
      // The first committed turn ends a take-over: the session has its own conversation now.
      const { adopted: _, ...base } = baseFor(record, harness)
      return {
        ...base,
        ref: cut.ref,
        checkpoints: [...base.checkpoints.filter((checkpoint) => checkpoint.seq !== seq), { seq, cut }],
      }
    })
  }

  /**
   * Make a blank session take over a terminal conversation with its first turn,
   * or (null) cancel that. Continuing points `ref` at the conversation; a fork
   * starts from a copy when the session first opens. Refused once the session
   * has a native conversation of its own, or is open.
   */
  async adopt(sessionId: string, harness: HarnessId, adoption: Adoption | null): Promise<void> {
    if (this.sessions.has(sessionId)) throw new Error('This session has already started')
    await this.deps.store.update(sessionId, (record) => {
      const { adopted, ref, ...base } = baseFor(record, harness)
      // A ref only an earlier take-over set leaves with it.
      const own = adopted && !adopted.fork && ref?.id === adopted.id ? undefined : ref
      if (own || base.checkpoints.length) throw new Error('This session already runs its own native conversation')
      if (!adoption) return base
      return { ...base, adopted: adoption, ...(adoption.fork ? {} : { ref: { harness, id: adoption.id } }) }
    })
  }

  private async open(agent: Agent, harness: HarnessId, signal: AbortSignal): Promise<OpenedSession> {
    const record = await this.deps.store.read(agent.id)
    const plan = await this.origin(agent, harness, record, signal)
    const cwd = await this.deps.cwd(agent, signal)
    // The resume command shown later must start where the native session actually ran.
    if (record?.harness !== harness || record.cwd !== cwd)
      await this.deps.store.update(agent.id, (current) => ({ ...baseFor(current, harness), cwd }))
    const native = await this.deps.harness(harness).open(
      {
        dshSessionId: agent.id,
        cwd,
        origin: plan.origin,
        settings: this.deps.settings(harness, cwd, record?.harness === harness ? record.settings : {}),
        ...(record?.harness === harness && record.lastEndpoint ? { lastEndpoint: record.lastEndpoint } : {}),
      },
      this.deps.ports(agent),
    )
    return { native, forwarded: record?.forwarded ?? [], ...(plan.notice ? { notice: plan.notice } : {}) }
  }

  private async origin(
    agent: Agent,
    harness: HarnessId,
    record: SessionRecord | undefined,
    signal: AbortSignal,
  ): Promise<{ origin: OpenOrigin; notice?: string }> {
    const ref = record?.ref
    const adopted = record?.harness === harness ? record.adopted : undefined
    const notice = adopted ? { notice: takeOverNotice(adopted) } : {}
    if (ref?.harness === harness) return { origin: { kind: 'resume', ref }, ...notice }
    if (adopted?.fork) return { origin: { kind: 'copy', ref: { harness, id: adopted.id } }, ...notice }
    const header = agent.session.header
    if (!header.isSeeded || !header.parentSession) return { origin: { kind: 'new' } }
    const fresh = {
      origin: { kind: 'new' } as const,
      notice: `这是新的 ${HARNESS_NAMES[harness]} 上下文，没有继承父会话的上下文。\nThis is a new ${HARNESS_NAMES[harness]} context; the parent context was not inherited.`,
    }
    const boundary = agent.session.inheritedEventCount
    const parent = await this.deps.store.read(header.parentSession)
    const checkpoint = parent?.checkpoints
      .filter((candidate) => candidate.seq < boundary && candidate.cut.ref.harness === harness)
      .reduce<(typeof parent.checkpoints)[number] | undefined>(
        (latest, candidate) => (!latest || candidate.seq > latest.seq ? candidate : latest),
        undefined,
      )
    if (!checkpoint || boundary - checkpoint.seq > FORK_SCAN_LIMIT) return fresh
    // The child inherits the parent's log prefix: the checkpoint must be the same final answer there,
    // and nothing the native side would have seen may follow it inside the inherited prefix.
    const events = await this.deps.readEvents(agent.id, checkpoint.seq, boundary, signal)
    if (events.length !== boundary - checkpoint.seq || events[0]?.type !== 'assistant/message') return fresh
    if (events.slice(1).some((event) => CONVERSATIONAL.has(event.type))) return fresh
    return { origin: { kind: 'fork', cut: checkpoint.cut } }
  }
}
