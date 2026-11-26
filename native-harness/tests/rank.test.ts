import assert from 'node:assert/strict'
import { test } from 'vitest'
import { rankByName } from '../src/client/rank-by-name.ts'

const items = [
  { name: 'gpt-5-mini' },
  { name: 'o3' },
  { name: 'mini-max' },
  { name: 'opus', label: 'Claude Opus' },
] as const

test('an empty query keeps every item in source order', () => {
  assert.equal(rankByName(items, ''), items)
})

test('a query matches an ordered subsequence of the name, prefix hits first', () => {
  assert.deepEqual(rankByName(items, 'mini').map(item => item.name), ['mini-max', 'gpt-5-mini'])
  assert.deepEqual(rankByName(items, 'g5m').map(item => item.name), ['gpt-5-mini'])
  assert.deepEqual(rankByName(items, 'xyz'), [])
})

test('the label is a second key, matched without regard to case', () => {
  assert.deepEqual(rankByName(items, 'CLAUDE').map(item => item.name), ['opus'])
})

test('equal matches keep their source order', () => {
  const twins = [{ name: 'alpha-one' }, { name: 'alpha-two' }]
  assert.deepEqual(rankByName(twins, 'alpha').map(item => item.name), ['alpha-one', 'alpha-two'])
})
