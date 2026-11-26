import assert from 'node:assert/strict'
import { test } from 'vitest'
import { Catalogs } from '../src/host/catalog.ts'
import { FakeHarness } from '../src/host/harness/fake.ts'

test('a context window the harness learned before any turn reaches the hidden provider', () => {
  const fake = Object.assign(new FakeHarness('claude-code', { models: [], modes: [], commands: [] }), {
    contextWindow: (model: string) => (model === 'opus' ? 1_000_000 : undefined),
  })
  const catalogs = new Catalogs(() => fake)
  assert.equal(catalogs.model('claude-code', 'opus').contextWindow, 1_000_000)
  assert.equal(catalogs.model('claude-code', 'sonnet').contextWindow, undefined)
  catalogs.noteWindow('claude-code', 'sonnet', 200_000)
  assert.equal(catalogs.model('claude-code', 'sonnet').contextWindow, 200_000)
})
