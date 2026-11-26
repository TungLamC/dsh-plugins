/** Scripted Adapter for tests of dsh-side Modules. */
import { Channel } from "./channel.js";
export class FakeHarness {
    sessions = [];
    id;
    catalogValue;
    script;
    constructor(id, catalog, script) {
        this.id = id;
        this.catalogValue = catalog;
        this.script = script;
    }
    async catalog() {
        return structuredClone(this.catalogValue);
    }
    async open(request, ports) {
        const session = new FakeSession(this.id, request, ports, this.script);
        this.sessions.push(session);
        return session;
    }
    async close() {
        await Promise.all(this.sessions.map((session) => session.close()));
    }
}
export class FakeSession {
    events = new Channel();
    sent = [];
    applied = [];
    interrupts = 0;
    closed = false;
    ref;
    applyResult = { status: 'applied' };
    running = [];
    stopped = [];
    onInterrupt;
    harness;
    request;
    ports;
    script;
    constructor(harness, request, ports, script) {
        this.harness = harness;
        this.request = request;
        this.ports = ports;
        this.script = script;
        if (request.origin.kind === 'resume')
            this.ref = request.origin.ref;
    }
    emit(...events) {
        for (const event of events) {
            if (event.type === 'ref')
                this.ref = event.ref;
            this.events.push(event);
        }
    }
    async send(input, mode) {
        this.sent.push({ input, mode });
        queueMicrotask(() => this.script?.(this, input, mode));
        return { inputId: input.id, disposition: mode };
    }
    async apply(change) {
        this.applied.push(change);
        return this.applyResult;
    }
    async interrupt() {
        this.interrupts++;
        this.onInterrupt?.();
    }
    tasks() {
        return this.running;
    }
    async stopTask(id) {
        this.stopped.push(id);
        this.running = this.running.filter((task) => task.id !== id);
    }
    async close() {
        this.closed = true;
        this.events.close();
    }
}
