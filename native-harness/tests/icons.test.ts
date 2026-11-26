import assert from 'node:assert/strict'
import { test } from 'vitest'
import { Config } from '../src/host/config.ts'
import { iconOf } from '../src/shared/icons.ts'

test('built-in providers have their mark by exact id; a user-defined provider has none unless configured', () => {
  assert.deepEqual(iconOf('kimi-coding', {}), { kind: 'mark', name: 'kimi' })
  assert.deepEqual(iconOf('openai-codex', {}), { kind: 'mark', name: 'openai' })
  assert.deepEqual(iconOf('deepseek-account', {}), { kind: 'mark', name: 'deepseek' })
  assert.equal(iconOf('ark', {}), undefined)
  assert.equal(iconOf('kimi', {}), undefined)
  assert.equal(iconOf('my-openai-proxy', {}), undefined)
})

test('a configured icon names a mark or an image, and an empty one hides a built-in mark', () => {
  assert.deepEqual(iconOf('ark', { ark: 'volcengine' }), { kind: 'mark', name: 'volcengine' })
  assert.deepEqual(iconOf('ark', { ark: 'https://example.com/ark.png' }), { kind: 'image', url: 'https://example.com/ark.png' })
  assert.deepEqual(iconOf('kimi-coding', { 'kimi-coding': 'moonshot' }), { kind: 'mark', name: 'moonshot' })
  assert.equal(iconOf('kimi-coding', { 'kimi-coding': '' }), undefined)
  assert.equal(iconOf('ark', { ark: 'javascript:alert(1)' }), undefined)
})

test('providerIcons accepts shipped mark names, image URLs and empty values only', () => {
  const parse = Config as unknown as (value: unknown) => Config
  assert.deepEqual(parse({}).providerIcons, {})
  const config = parse({ providerIcons: { ark: 'volcengine', custom: 'data:image/png;base64,AAAA', 'kimi-coding': '' } })
  assert.deepEqual(config.providerIcons, { ark: 'volcengine', custom: 'data:image/png;base64,AAAA', 'kimi-coding': '' })
  assert.throws(() => parse({ providerIcons: { ark: 'volcano' } }), /volcengine/)
})
