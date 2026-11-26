import assert from 'node:assert/strict'
import { test } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { FakeHarness, type FakeSession } from '../src/host/harness/fake.ts'
import { SessionRuntime, type RuntimeDeps } from '../src/host/runtime.ts'
import { memoryStore } from '../src/host/store.ts'

function runtimeWith(overrides: Partial<RuntimeDeps>) {
  const store = memoryStore()
  const fake = new FakeHarness('codex', { models: [], modes: [], commands: [] })
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
    cwd: async (agent) => agent.session.header.cwd ?? '/',
    ...overrides,
  })
  return { store, fake, runtime }
}

const agentIn = (cwd: string) =>
  ({ id: 'session-x', session: { header: { cwd, isSeeded: false }, inheritedEventCount: 0 } }) as unknown as Agent

test('a native session opens in the directory dsh runs the session in, not the project it started from', async () => {
  const seen: string[] = []
  const { store, fake, runtime } = runtimeWith({
    cwd: async (agent) => {
      seen.push(agent.id)
      return '/project/.worktrees/feature'
    },
    settings: (_harness, cwd, stored) => ({ ...stored, mode: cwd }),
  })
  const opened = await runtime.session(agentIn('/project'), 'codex', new AbortController().signal)
  const request = (opened.native as FakeSession).request
  assert.deepEqual(seen, ['session-x'])
  assert.equal(request.cwd, '/project/.worktrees/feature')
  assert.equal(request.settings.mode, '/project/.worktrees/feature')
  assert.equal(fake.sessions.length, 1)
  assert.equal(store.records.get('session-x')?.cwd, '/project/.worktrees/feature')
})

test('the remembered directory follows the latest open', async () => {
  let directory = '/project/.worktrees/feature'
  const { store, runtime } = runtimeWith({ cwd: async () => directory })
  await runtime.session(agentIn('/project'), 'codex', new AbortController().signal)
  await runtime.close('session-x')
  directory = '/project'
  await runtime.session(agentIn('/project'), 'codex', new AbortController().signal)
  assert.equal(store.records.get('session-x')?.cwd, '/project')
})
