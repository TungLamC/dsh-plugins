/**
 * One ACP connection to Antigravity: `agy acp` over stdio, spoken through the
 * official SDK's stable v1 entry. Only stable ACP methods are called; the
 * client advertises no file-system or terminal capability, so agy runs every
 * tool itself.
 */
import { spawn } from 'node:child_process'
import { Readable, Writable } from 'node:stream'
import {
  client,
  ndJsonStream,
  PROTOCOL_VERSION,
  RequestError,
  type AgentApp,
  type AgentCapabilities,
  type ClientConnection,
  type ClientContext,
  type InitializeResponse,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionNotification,
  type Stream,
} from '@agentclientprotocol/sdk'

export interface AcpHandlers {
  update(notification: SessionNotification): void
  /** `signal` aborts when agy withdraws the request or the connection closes. */
  permission(request: RequestPermissionRequest, signal: AbortSignal): Promise<RequestPermissionResponse>
}

/** An initialized connection. `closed` resolves with the reason once it is gone. */
export interface AcpLink {
  readonly agent: ClientContext
  readonly capabilities: AgentCapabilities
  readonly closed: Promise<Error>
  readonly alive: boolean
  close(): Promise<void>
}

/** Opens a link for one purpose (a dsh session id, or `catalog`) in `cwd`. Tests substitute an in-process agent. */
export type Connector = (cwd: string, purpose: string, handlers: AcpHandlers) => Promise<AcpLink>

const CLIENT_INFO = { name: 'dsh-native-harness', version: '0.1.0' }
const AUTH_REQUIRED = RequestError.authRequired().code

/** A request error from agy, with the sign-in case explained. */
export function acpError(error: unknown): Error {
  if (error instanceof RequestError && error.code === AUTH_REQUIRED)
    return new Error(
      'Antigravity is not signed in. Run `agy` in a terminal and sign in, then try again. / Antigravity 未登录，请先在终端运行 `agy` 登录后再试。',
    )
  return error instanceof Error ? error : new Error(String(error))
}

/** Connect the client side to an ACP stream or an in-process agent app, and initialize. */
export async function link(
  target: Stream | AgentApp,
  handlers: AcpHandlers,
  options: { stop?: () => Promise<void>; exitReason?: () => Error } = {},
): Promise<AcpLink> {
  const app = client({ name: 'dsh-native-harness' })
    .onNotification('session/update', ({ params }) => handlers.update(params))
    .onRequest('session/request_permission', ({ params, signal }) => handlers.permission(params, signal))
    .onRequest('*', ({ method }) => {
      throw RequestError.methodNotFound(method)
    })
  const connection: ClientConnection = 'connect' in target ? app.connect(target) : app.connect(target)
  let alive = true
  const closed = connection.closed.then(() => {
    alive = false
    return options.exitReason?.() ?? new Error('The Antigravity ACP connection closed')
  })
  const close = async () => {
    connection.close()
    await options.stop?.()
  }
  try {
    const response: InitializeResponse = await connection.agent.request('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {},
      clientInfo: CLIENT_INFO,
    })
    return {
      agent: connection.agent,
      capabilities: response.agentCapabilities ?? {},
      closed,
      get alive() {
        return alive
      },
      close,
    }
  } catch (error) {
    // A process that never started or died during the handshake explains itself better than the closed stream.
    const reason = connection.signal.aborted ? options.exitReason?.() : undefined
    await close()
    throw reason ?? acpError(error)
  }
}

/** Environment for a nested CLI: never inherit a parent harness's identity. */
function childEnvironment(sessionId: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, DSH_SESSION_ID: sessionId }
  for (const key of ['CLAUDECODE', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_ENTRYPOINT', 'CODEX_THREAD_ID', 'CODEX_SESSION_ID'])
    delete env[key]
  return env
}

function redact(value: string, env: NodeJS.ProcessEnv): string {
  let result = value
  for (const [key, secret] of Object.entries(env))
    if (/TOKEN|KEY|SECRET|PASSWORD|AUTH/i.test(key) && secret && secret.length >= 8) result = result.replaceAll(secret, '[redacted]')
  return result
}

/** The production connector: one unmodified `agy acp` process per link, in its own process group. */
export function agyConnector(command: string): Connector {
  return async (cwd, purpose, handlers) => {
    const env = childEnvironment(purpose)
    const child = spawn(command, ['acp'], { cwd, env, detached: process.platform !== 'win32' })
    let stderr = ''
    let exit: string | undefined
    child.stderr.on('data', (data: Buffer) => {
      stderr = (stderr + data.toString()).slice(-4000)
    })
    child.stdin.on('error', () => {})
    const exited = new Promise<void>((resolve) => {
      child.on('error', (error) => {
        exit = error.message
        resolve()
      })
      child.on('close', (code, signal) => {
        exit ??= String(signal ?? code)
        resolve()
      })
    })
    const kill = (signal: NodeJS.Signals) => {
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal)
        else child.kill(signal)
      } catch {
        // Already exited.
      }
    }
    const stop = async () => {
      if (exit !== undefined) return
      kill('SIGTERM')
      const force = setTimeout(() => kill('SIGKILL'), 1500)
      await exited
      clearTimeout(force)
    }
    const stream = ndJsonStream(
      Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
      Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
    )
    // The process can die before the stream notices; close the link either way.
    const reason = () =>
      new Error(
        `Antigravity ACP server exited (${exit ?? 'closed'}). ${redact(stderr, env).trim() || `Check that \`${command}\` runs and is signed in.`}`,
      )
    const opened = await link(stream, handlers, { stop, exitReason: reason })
    void exited.then(() => opened.close())
    return opened
  }
}
