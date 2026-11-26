/** Scripted Adapter for tests of dsh-side Modules. */
import { Channel } from './channel.ts'
import type {
  ApplyResult,
  BackgroundTask,
  Harness,
  HarnessCatalog,
  HarnessId,
  NativeEvent,
  NativeInput,
  NativeRef,
  NativeSession,
  OpenRequest,
  SendReceipt,
  SessionPorts,
  SettingsChange,
} from './types.ts'

export type FakeScript = (session: FakeSession, input: NativeInput, mode: 'turn' | 'steer') => void

export class FakeHarness implements Harness {
  readonly sessions: FakeSession[] = []
  readonly id: HarnessId
  private readonly catalogValue: HarnessCatalog
  private readonly script: FakeScript | undefined
  constructor(id: HarnessId, catalog: HarnessCatalog, script?: FakeScript) {
    this.id = id
    this.catalogValue = catalog
    this.script = script
  }
  async catalog(): Promise<HarnessCatalog> {
    return structuredClone(this.catalogValue)
  }
  async open(request: OpenRequest, ports: SessionPorts): Promise<FakeSession> {
    const session = new FakeSession(this.id, request, ports, this.script)
    this.sessions.push(session)
    return session
  }
  async close(): Promise<void> {
    await Promise.all(this.sessions.map((session) => session.close()))
  }
}

export class FakeSession implements NativeSession {
  readonly events = new Channel<NativeEvent>()
  readonly sent: { input: NativeInput; mode: 'turn' | 'steer' }[] = []
  readonly applied: SettingsChange[] = []
  interrupts = 0
  closed = false
  ref: NativeRef | undefined
  applyResult: ApplyResult = { status: 'applied' }
  running: BackgroundTask[] = []
  stopped: string[] = []
  onInterrupt?: () => void
  readonly harness: HarnessId
  readonly request: OpenRequest
  readonly ports: SessionPorts
  private readonly script: FakeScript | undefined
  constructor(harness: HarnessId, request: OpenRequest, ports: SessionPorts, script?: FakeScript) {
    this.harness = harness
    this.request = request
    this.ports = ports
    this.script = script
    if (request.origin.kind === 'resume') this.ref = request.origin.ref
  }
  emit(...events: NativeEvent[]): void {
    for (const event of events) {
      if (event.type === 'ref') this.ref = event.ref
      this.events.push(event)
    }
  }
  async send(input: NativeInput, mode: 'turn' | 'steer'): Promise<SendReceipt> {
    this.sent.push({ input, mode })
    queueMicrotask(() => this.script?.(this, input, mode))
    return { inputId: input.id, disposition: mode }
  }
  async apply(change: SettingsChange): Promise<ApplyResult> {
    this.applied.push(change)
    return this.applyResult
  }
  async interrupt(): Promise<void> {
    this.interrupts++
    this.onInterrupt?.()
  }
  tasks(): BackgroundTask[] {
    return this.running
  }
  async stopTask(id: string): Promise<void> {
    this.stopped.push(id)
    this.running = this.running.filter((task) => task.id !== id)
  }
  async close(): Promise<void> {
    this.closed = true
    this.events.close()
  }
}
