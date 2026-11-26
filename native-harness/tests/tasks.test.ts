import assert from 'node:assert/strict'
import { test } from 'vitest'
import { ClaudeTaskTracker } from '../src/host/harness/claude/tasks.ts'
import { CodexChildren } from '../src/host/harness/codex/events.ts'
import { world } from './support.ts'

test('Claude subagents and background shells are listed until they end', () => {
  const tracker = new ClaudeTaskTracker(() => 1000)
  tracker.accept({ subtype: 'task_started', task_id: 'a1', task_type: 'local_agent', subagent_type: 'Explore', description: 'Find login code' })
  tracker.accept({ subtype: 'task_started', task_id: 'b1', task_type: 'local_bash', description: 'npm test' })
  tracker.accept({ subtype: 'task_started', task_id: 'n1', task_type: 'local_bash', description: 'nested', parent_task_id: 'a1' })
  tracker.accept({ subtype: 'background_tasks_changed', tasks: [{ task_id: 'b1', task_type: 'local_bash', description: 'npm test' }, { task_id: 'm1', task_type: 'monitor', description: 'watch', ambient: true }] })
  tracker.accept({ subtype: 'task_progress', task_id: 'a1', description: 'Find login code', usage: { total_tokens: 1200, tool_uses: 3, duration_ms: 5 }, last_tool_name: 'Grep' })
  assert.deepEqual(tracker.list(), [
    { id: 'a1', kind: 'agent', title: 'Explore · Find login code', background: false, startedAt: 1000, tokens: 1200, toolUses: 3, lastTool: 'Grep' },
    { id: 'b1', kind: 'shell', title: 'npm test', background: true, startedAt: 1000 },
  ])
  assert.equal(tracker.background, true)
  tracker.accept({ subtype: 'task_updated', task_id: 'a1', patch: { is_backgrounded: true } })
  tracker.accept({ subtype: 'background_tasks_changed', tasks: [{ task_id: 'a1', task_type: 'local_agent', description: 'Find login code' }] })
  assert.deepEqual(tracker.list().map((task) => [task.id, task.background]), [['a1', true]])
  tracker.accept({ subtype: 'task_notification', task_id: 'a1', status: 'completed', summary: 'done' })
  assert.deepEqual(tracker.list(), [])
  assert.equal(tracker.background, false)
})

test('Codex subagent threads are listed while they run a turn', () => {
  const children = new CodexChildren(() => 2000)
  children.accept('main', 'item/completed', { threadId: 'main', item: { type: 'subAgentActivity', kind: 'started', agentThreadId: 't1', agentPath: '/root/read_a' } })
  children.accept('main', 'turn/started', { threadId: 't1', turn: { id: 'turn-a' } })
  children.accept('main', 'item/started', { threadId: 't1', item: { type: 'commandExecution', id: 'c' } })
  children.accept('main', 'thread/tokenUsage/updated', { threadId: 't1', tokenUsage: { total: { totalTokens: 4000 } } })
  assert.deepEqual(children.list(), [
    { id: 't1', kind: 'agent', title: '/root/read_a', background: true, startedAt: 2000, tokens: 4000, toolUses: 1, lastTool: 'commandExecution' },
  ])
  assert.equal(children.turnOf('t1'), 'turn-a')
  children.accept('main', 'turn/completed', { threadId: 't1', turn: { id: 'turn-a', status: 'completed' } })
  assert.deepEqual(children.list(), [])
})

test('the native session is not closed for idleness while background work runs', async () => {
  const w = await world(
    (session, input) => {
      session.running = [{ id: 'bg', kind: 'agent', title: 'Explore', background: true, startedAt: 0 }]
      session.emit(
        { type: 'turn-start', turn: 't1', origin: 'user', inputIds: [input.id] },
        { type: 'call-start', call: 'c1' },
        { type: 'delta', call: 'c1', block: 'text', key: 'm', text: 'started a background agent' },
        { type: 'call-end', call: 'c1' },
        { type: 'turn-end', turn: 't1', outcome: 'completed' },
      )
    },
    { idleMs: 30 },
  )
  try {
    w.send('go')
    await new Promise((resolve) => setTimeout(resolve, 150))
    await w.idle()
    const session = w.fake.sessions[0]!
    assert.equal(session.closed, false)
    session.running = []
    await new Promise((resolve) => setTimeout(resolve, 120))
    assert.equal(session.closed, true)
  } finally {
    await w.close()
  }
})
