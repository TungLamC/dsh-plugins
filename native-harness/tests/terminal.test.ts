import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SDKSessionInfo } from '@anthropic-ai/claude-agent-sdk'
import { startOptions } from '../src/host/harness/claude/index.ts'
import { FakeHarness, type FakeSession } from '../src/host/harness/fake.ts'
import { SessionRuntime } from '../src/host/runtime.ts'
import { memoryStore } from '../src/host/store.ts'
import { findTerminalSession, listTerminalSessions, openSessions, TERMINAL_LIMIT, type TerminalDeps } from '../src/host/terminal.ts'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'
const info = (sessionId: string, extra: Partial<SDKSessionInfo> = {}): SDKSessionInfo => ({
  sessionId,
  summary: `summary ${sessionId.slice(0, 1)}`,
  lastModified: 1000,
  ...extra,
})
const deps = (infos: SDKSessionInfo[], open: string[] = [], owned: string[] = []): TerminalDeps => ({
  list: async () => infos,
  info: async (id) => infos.find((candidate) => candidate.sessionId === id),
  open: async () => new Set(open),
  owned: async (id) => owned.includes(id),
})

test("a directory's terminal sessions leave out dsh's own and say which a terminal has open", async () => {
  const sessions = await listTerminalSessions(
    '/project',
    deps([info(A, { customTitle: 'renamed', gitBranch: 'main' }), info(B), info(C, { summary: '', firstPrompt: 'first prompt' })], [A], [B]),
  )
  assert.deepEqual(sessions, [
    { id: A, title: 'renamed', modified: 1000, branch: 'main', open: true },
    { id: C, title: 'first prompt', modified: 1000, open: false },
  ])
  const many = Array.from({ length: TERMINAL_LIMIT + 5 }, (_, index) => info(`${String(index).padStart(8, '0')}-0000-4000-8000-000000000000`))
  assert.equal((await listTerminalSessions('/project', deps(many))).length, TERMINAL_LIMIT)
})

test('only a terminal session of the directory can be found by id', async () => {
  const listing = deps([info(A), info(B)], [], [B])
  assert.equal((await findTerminalSession(A, '/project', listing))?.title, 'summary 1')
  assert.equal(await findTerminalSession(B, '/project', listing), undefined)
  assert.equal(await findTerminalSession(C, '/project', listing), undefined)
})

test("Claude Code's process registry gives the sessions running processes hold", async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nh-registry-'))
  try {
    await mkdir(join(dir, 'sessions'))
    // A pid that existed and is gone now.
    const gone = spawnSync(process.execPath, ['-e', '']).pid
    await writeFile(join(dir, 'sessions', `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: A, kind: 'interactive' }))
    await writeFile(join(dir, 'sessions', `${gone}.json`), JSON.stringify({ pid: gone, sessionId: B }))
    await writeFile(join(dir, 'sessions', 'broken.json'), '{not json')
    await writeFile(join(dir, 'sessions', `${process.pid}.key`), 'not a registry entry')
    assert.deepEqual([...(await openSessions(dir))], [A])
    assert.deepEqual([...(await openSessions(join(dir, 'missing')))], [])
  } finally {
    await rm(dir, { recursive: true })
  }
})

test('a process starts on its own conversation, a fork, a copy of the one it takes over, or a new one', () => {
  const ref = { harness: 'claude-code' as const, id: A }
  assert.deepEqual(startOptions(ref, { kind: 'copy', ref: { harness: 'claude-code', id: B } }, C), { resume: A })
  assert.deepEqual(startOptions(undefined, { kind: 'copy', ref }, C), { resume: A, forkSession: true, sessionId: C })
  assert.deepEqual(startOptions(undefined, { kind: 'fork', cut: { ref, at: 'm1' } }, C), {
    resume: A,
    forkSession: true,
    resumeSessionAt: 'm1',
    sessionId: C,
  })
  assert.deepEqual(startOptions(undefined, { kind: 'new' }, C), { sessionId: C })
  assert.deepEqual(startOptions(undefined, { kind: 'new' }, undefined), {})
})

function claudeRuntime() {
  const store = memoryStore()
  const fake = new FakeHarness('claude-code', { models: [], modes: [], commands: [] })
  const runtime = new SessionRuntime({
    harness: () => fake,
    store,
    settings: (_harness, _cwd, stored) => stored,
    ports: () => ({
      interactions: { approve: async () => ({ kind: 'allow' }), ask: async () => ({ answers: [] }), reviewPlan: async () => 'approve' as const },
      signal: new AbortController().signal,
      log: () => {},
    }),
    readEvents: async () => [],
    cwd: async () => '/project',
  })
  const agent = { id: 'session-t', session: { header: { cwd: '/project', isSeeded: false }, inheritedEventCount: 0 } } as unknown as Agent
  const open = async () => {
    const opened = await runtime.session(agent, 'claude-code', new AbortController().signal)
    await runtime.close(agent.id)
    return { request: (opened.native as FakeSession).request, notice: opened.notice }
  }
  return { store, runtime, open }
}

test('continuing a terminal session resumes it, with a notice until the first turn is committed', async () => {
  const { store, runtime, open } = claudeRuntime()
  await runtime.adopt('session-t', 'claude-code', { id: A, title: 'terminal work', fork: false })
  assert.deepEqual(store.records.get('session-t')?.ref, { harness: 'claude-code', id: A })
  const first = await open()
  assert.deepEqual(first.request.origin, { kind: 'resume', ref: { harness: 'claude-code', id: A } })
  assert.match(first.notice ?? '', /接着终端里的 Claude Code 会话「terminal work」继续/)
  await runtime.committed('session-t', 'claude-code', 3, { ref: { harness: 'claude-code', id: A }, at: 'm1' })
  assert.equal(store.records.get('session-t')?.adopted, undefined)
  const later = await open()
  assert.deepEqual(later.request.origin, { kind: 'resume', ref: { harness: 'claude-code', id: A } })
  assert.equal(later.notice, undefined)
})

test('a fork starts from a copy, and from the copy once it has reported its own id', async () => {
  const { store, runtime, open } = claudeRuntime()
  await runtime.adopt('session-t', 'claude-code', { id: A, title: 'terminal work', fork: true })
  assert.equal(store.records.get('session-t')?.ref, undefined)
  const first = await open()
  assert.deepEqual(first.request.origin, { kind: 'copy', ref: { harness: 'claude-code', id: A } })
  assert.match(first.notice ?? '', /在副本上/)
  await runtime.saveRef('session-t', 'claude-code', { harness: 'claude-code', id: C })
  const again = await open()
  assert.deepEqual(again.request.origin, { kind: 'resume', ref: { harness: 'claude-code', id: C } })
})

test('a take-over can change or be undone before the first turn, and never replaces a conversation of its own', async () => {
  const { store, runtime, open } = claudeRuntime()
  await runtime.adopt('session-t', 'claude-code', { id: A, title: 'a', fork: false })
  await runtime.adopt('session-t', 'claude-code', { id: B, title: 'b', fork: true })
  assert.deepEqual(store.records.get('session-t')?.adopted, { id: B, title: 'b', fork: true })
  assert.equal(store.records.get('session-t')?.ref, undefined)
  await runtime.adopt('session-t', 'claude-code', null)
  assert.equal(store.records.get('session-t')?.adopted, undefined)
  assert.deepEqual((await open()).request.origin, { kind: 'new' })

  await runtime.saveRef('session-t', 'claude-code', { harness: 'claude-code', id: C })
  await assert.rejects(runtime.adopt('session-t', 'claude-code', { id: A, title: 'a', fork: false }), /its own native conversation/)
  assert.deepEqual(store.records.get('session-t')?.ref, { harness: 'claude-code', id: C })
})

test('a session that is open cannot take over a terminal conversation', async () => {
  const { runtime } = claudeRuntime()
  const agent = { id: 'session-t', session: { header: { cwd: '/project', isSeeded: false }, inheritedEventCount: 0 } } as unknown as Agent
  await runtime.session(agent, 'claude-code', new AbortController().signal)
  await assert.rejects(runtime.adopt('session-t', 'claude-code', { id: A, title: 'a', fork: true }), /already started/)
  await runtime.closeAll()
})
