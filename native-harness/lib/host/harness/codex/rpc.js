/** `codex app-server` over stdio: newline-delimited JSON-RPC with server requests. */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { object, text } from "../../../shared/types.js";
/** Environment for a nested CLI: never inherit a parent harness's identity. */
export function childEnvironment(sessionId) {
    const env = { ...process.env, DSH_SESSION_ID: sessionId };
    for (const key of ['CLAUDECODE', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_ENTRYPOINT', 'CODEX_THREAD_ID', 'CODEX_SESSION_ID'])
        delete env[key];
    return env;
}
function redact(value, env) {
    let result = value;
    for (const [key, secret] of Object.entries(env))
        if (/TOKEN|KEY|SECRET|PASSWORD|AUTH/i.test(key) && secret && secret.length >= 8)
            result = result.replaceAll(secret, '[redacted]');
    return result;
}
export class Rpc {
    onNotification = () => { };
    /** `signal` aborts when Codex resolves the request elsewhere, or the process exits. */
    onRequest = async (method) => {
        throw new Error(`Unsupported Codex request: ${method}`);
    };
    onExit = () => { };
    exited;
    child;
    pending = new Map();
    /** Server requests waiting on the user, with the thread each belongs to (subagents run their own threads). */
    serving = new Map();
    sequence = 0;
    stderr = '';
    ended = false;
    constructor(command, cwd, sessionId) {
        const env = childEnvironment(sessionId);
        this.child = spawn(command, ['app-server'], { cwd, env, detached: process.platform !== 'win32' });
        this.child.stdin.on('error', () => { });
        this.child.stderr.on('data', (data) => {
            this.stderr = (this.stderr + data.toString()).slice(-4000);
        });
        const lines = createInterface({ input: this.child.stdout });
        lines.on('line', (line) => this.frame(line));
        this.exited = new Promise((resolve) => {
            const finish = (error) => {
                if (this.ended)
                    return;
                this.ended = true;
                lines.close();
                for (const pending of this.pending.values()) {
                    clearTimeout(pending.timer);
                    pending.reject(error);
                }
                this.pending.clear();
                this.abortServing();
                this.onExit(error);
                resolve();
            };
            this.child.on('error', (error) => finish(new Error(`${command}: ${error.message}`)));
            this.child.on('close', (code, signal) => finish(new Error(`Codex app-server exited (${signal ?? code}). ${redact(this.stderr, env).trim() || 'Check the Codex installation and login.'}`)));
        });
    }
    get alive() {
        return !this.ended;
    }
    request(method, params, timeoutMs = 60_000) {
        return new Promise((resolve, reject) => {
            if (!this.alive) {
                reject(new Error('Codex app-server is not running'));
                return;
            }
            const id = ++this.sequence;
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`Codex ${method} timed out`));
            }, timeoutMs);
            this.pending.set(id, { resolve, reject, timer });
            this.write({ id, method, params });
        });
    }
    notify(method, params) {
        this.write(params === undefined ? { method } : { method, params });
    }
    async initialize() {
        await this.request('initialize', {
            clientInfo: { name: 'dsh_native_harness', version: '0.1.0' },
            capabilities: { experimentalApi: true },
        });
        this.notify('initialized');
    }
    /** Withdraw the server requests of one thread still waiting on the user, or all of them. */
    abortServing(thread) {
        for (const [key, entry] of this.serving) {
            if (thread !== undefined && entry.thread !== thread)
                continue;
            entry.controller.abort();
            this.serving.delete(key);
        }
    }
    async close() {
        this.abortServing();
        if (!this.alive)
            return;
        this.kill('SIGTERM');
        const force = setTimeout(() => this.kill('SIGKILL'), 1500);
        await this.exited;
        clearTimeout(force);
    }
    write(value) {
        if (this.alive)
            this.child.stdin.write(`${JSON.stringify(value)}\n`);
    }
    kill(signal) {
        try {
            if (process.platform !== 'win32' && this.child.pid)
                process.kill(-this.child.pid, signal);
            else
                this.child.kill(signal);
        }
        catch {
            // Already exited.
        }
    }
    frame(line) {
        let frame;
        try {
            frame = object(JSON.parse(line));
        }
        catch {
            return;
        }
        if (typeof frame.method === 'string') {
            const params = object(frame.params);
            if (frame.id === undefined) {
                if (frame.method === 'serverRequest/resolved') {
                    const key = JSON.stringify(params.requestId);
                    this.serving.get(key)?.controller.abort();
                    this.serving.delete(key);
                }
                this.onNotification(frame.method, params);
                return;
            }
            const key = JSON.stringify(frame.id);
            const controller = new AbortController();
            const entry = { controller, thread: text(params.threadId) };
            this.serving.set(key, entry);
            this.onRequest(frame.method, params, controller.signal)
                .then((result) => {
                if (!controller.signal.aborted)
                    this.write({ id: frame.id, result });
            }, (error) => {
                if (!controller.signal.aborted)
                    this.write({ id: frame.id, error: { code: -32603, message: String(error) } });
            })
                .finally(() => {
                if (this.serving.get(key) === entry)
                    this.serving.delete(key);
            });
            return;
        }
        if (typeof frame.id !== 'number')
            return;
        const pending = this.pending.get(frame.id);
        if (!pending)
            return;
        this.pending.delete(frame.id);
        clearTimeout(pending.timer);
        if (frame.error)
            pending.reject(new Error(text(object(frame.error).message) || 'Codex RPC error'));
        else
            pending.resolve(frame.result);
    }
}
