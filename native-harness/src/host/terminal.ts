/**
 * Claude Code conversations started in a terminal, for a blank dsh session to
 * take over. The Agent SDK lists a directory's sessions the way the terminal's
 * `/resume` does (no SDK sessions); dsh's own native sessions are left out.
 * A conversation a running terminal process has open is read from Claude
 * Code's process registry (`<config dir>/sessions/<pid>.json`); that format is
 * not documented, so anything unreadable there counts as not open.
 */
import { readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { getSessionInfo, listSessions, type SDKSessionInfo } from '@anthropic-ai/claude-agent-sdk'
import { object, text, type TerminalSession } from '../shared/types.ts'

export const TERMINAL_LIMIT = 30

export interface TerminalDeps {
  /** A directory's sessions, newest first. */
  list(cwd: string): Promise<SDKSessionInfo[]>
  /** One session of the directory, if it is there. */
  info(id: string, cwd: string): Promise<SDKSessionInfo | undefined>
  /** Session ids a running terminal Claude Code process has open. */
  open(): Promise<Set<string>>
  /** dsh runs this conversation itself. */
  owned(id: string): Promise<boolean>
}

const titleOf = (info: SDKSessionInfo) => (info.customTitle || info.summary || info.firstPrompt || info.sessionId).trim()

function terminalSession(info: SDKSessionInfo, open: Set<string>): TerminalSession {
  return {
    id: info.sessionId,
    title: titleOf(info),
    modified: info.lastModified,
    ...(info.gitBranch ? { branch: info.gitBranch } : {}),
    open: open.has(info.sessionId),
  }
}

export async function listTerminalSessions(cwd: string, deps: TerminalDeps): Promise<TerminalSession[]> {
  const [infos, open] = await Promise.all([deps.list(cwd), deps.open()])
  const sessions: TerminalSession[] = []
  for (const info of infos) {
    if (sessions.length >= TERMINAL_LIMIT) break
    if (!(await deps.owned(info.sessionId))) sessions.push(terminalSession(info, open))
  }
  return sessions
}

/** The session as the listing would show it, or undefined when it is not a terminal session of `cwd`. */
export async function findTerminalSession(id: string, cwd: string, deps: TerminalDeps): Promise<TerminalSession | undefined> {
  const [info, open] = await Promise.all([deps.info(id, cwd), deps.open()])
  if (!info || (await deps.owned(id))) return undefined
  return terminalSession(info, open)
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // Another user's process still exists.
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** Session ids open in running Claude Code processes, from the registry under `configDir`. */
export async function openSessions(configDir: string): Promise<Set<string>> {
  const dir = join(configDir, 'sessions')
  const ids = new Set<string>()
  const names = await readdir(dir).catch(() => [] as string[])
  await Promise.all(
    names
      .filter((name) => name.endsWith('.json'))
      .map(async (name) => {
        const entry = object(JSON.parse(await readFile(join(dir, name), 'utf8').catch(() => '{}')) as unknown)
        const id = text(entry.sessionId)
        const pid = typeof entry.pid === 'number' ? entry.pid : Number.NaN
        if (id && Number.isInteger(pid) && pid > 0 && alive(pid)) ids.add(id)
      })
      .map((reading) => reading.catch(() => undefined)),
  )
  return ids
}

/** Claude Code's own directory, where it keeps sessions and its process registry. */
export const claudeConfigDir = () => process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')

/** The real listing: only sessions started in exactly this directory, so resuming runs their tools where they ran. */
export function localTerminalDeps(owned: TerminalDeps['owned']): TerminalDeps {
  return {
    list: (cwd) => listSessions({ dir: cwd, includeWorktrees: false, includeProgrammatic: false, limit: TERMINAL_LIMIT * 2 }),
    info: (id, cwd) => getSessionInfo(id, { dir: cwd }),
    open: () => openSessions(claudeConfigDir()),
    owned,
  }
}
