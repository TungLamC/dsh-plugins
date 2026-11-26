import assert from 'node:assert/strict'
import { test } from 'vitest'
import { ClaudeTasks } from '../src/host/harness/claude/tasks.ts'
import { CodexEvents } from '../src/host/harness/codex/events.ts'

test('Claude task tools edit one list that dsh receives whole', () => {
  const tasks = new ClaudeTasks()
  assert.equal(tasks.start('Bash', 'b1', { command: 'ls' }), undefined)
  assert.deepEqual(tasks.start('TaskCreate', 'c1', { subject: 'Read the code', description: '' }), [
    { content: 'Read the code', status: 'pending' },
  ])
  tasks.created('c1', { task: { id: '1', subject: 'Read the code' } })
  tasks.start('TaskCreate', 'c2', { subject: 'Change it', description: '' })
  tasks.created('c2', { task: { id: '2', subject: 'Change it' } })
  assert.deepEqual(tasks.start('TaskUpdate', 'u1', { taskId: '1', status: 'completed' }), [
    { content: 'Read the code', status: 'completed' },
    { content: 'Change it', status: 'pending' },
  ])
  assert.deepEqual(tasks.start('TaskUpdate', 'u2', { taskId: '2', status: 'deleted' }), [
    { content: 'Read the code', status: 'completed' },
  ])
  assert.deepEqual(
    tasks.start('TodoWrite', 't1', { todos: [{ content: 'Only this', status: 'in_progress', activeForm: 'Doing it' }] }),
    [{ content: 'Only this', status: 'in_progress' }],
  )
})

test('a Codex plan update becomes the whole task list', () => {
  const events = new CodexEvents().accept('turn/plan/updated', {
    turnId: 'turn-1',
    explanation: null,
    plan: [
      { step: 'Read the code', status: 'completed' },
      { step: 'Change it', status: 'inProgress' },
    ],
  })
  assert.deepEqual(
    events.map((event) => event.type === 'todos' && event.todos),
    [
      [
        { content: 'Read the code', status: 'completed' },
        { content: 'Change it', status: 'in_progress' },
      ],
    ],
  )
})
