import assert from 'node:assert/strict'
import { test } from 'vitest'
import { Config } from '../src/host/config.ts'
import { liveChange, resolveSettings } from '../src/host/settings.ts'
import { withChange } from '../src/shared/types.ts'
import type { ModelOption } from '../src/shared/types.ts'

const models: ModelOption[] = [
  { id: 'opus', name: 'Opus', efforts: [{ id: 'high', name: 'high' }, { id: 'xhigh', name: 'xhigh' }], image: true },
  { id: 'small', name: 'Small', efforts: [{ id: 'low', name: 'low' }, { id: 'medium', name: 'medium' }], defaultEffort: 'medium', image: true },
]
const modes = [{ id: 'auto', name: 'Auto' }, { id: 'plan', name: 'Plan' }]
const defaults = { model: 'opus', effort: 'xhigh', mode: 'auto' }

test('a session without picks runs on the configured defaults', () => {
  assert.deepEqual(resolveSettings({}, defaults, { models, modes }), defaults)
})

test('a session pick wins over the configured default, field by field', () => {
  assert.deepEqual(resolveSettings({ mode: 'plan' }, defaults, { models, modes }), { ...defaults, mode: 'plan' })
})

test('a picked model keeps the configured effort only when it supports it', () => {
  assert.deepEqual(resolveSettings({ model: 'small' }, defaults, { models, modes }), { model: 'small', effort: 'medium', mode: 'auto' })
  assert.deepEqual(resolveSettings({ model: 'opus' }, { ...defaults, model: 'small' }, { models, modes }).effort, 'xhigh')
})

test('a configured mode the harness does not offer is not used', () => {
  assert.equal(resolveSettings({}, { ...defaults, mode: 'dontAsk' }, { models, modes }).mode, undefined)
})

test('without a catalog the configured values pass through unchecked', () => {
  assert.deepEqual(resolveSettings({}, defaults, undefined), defaults)
})

test('the live harness receives concrete values for every field that changed', () => {
  const before = resolveSettings({}, defaults, { models, modes })
  const after = resolveSettings({ model: 'small' }, defaults, { models, modes })
  assert.deepEqual(liveChange(before, after), { model: 'small', effort: 'medium' })
  assert.deepEqual(liveChange(before, before), {})
})

test('defaults fill every field a profile override leaves out', () => {
  const config = (Config as unknown as (value: unknown) => Config)({ defaults: { codex: { model: 'other' } } })
  assert.deepEqual(config.defaults.codex, { model: 'other', effort: 'xhigh', mode: 'auto-review', fast: false })
  assert.deepEqual(config.defaults['claude-code'], { model: 'opus', effort: 'xhigh', mode: 'auto', endpoint: '' })
  const fast = (Config as unknown as (value: unknown) => Config)({ defaults: { codex: { fast: true } } })
  assert.equal(fast.defaults.codex.fast, true)
})

test('fast mode follows the session pick over the configured default, and reaches a live session when it changes', () => {
  const codex = { ...defaults, fast: false }
  assert.equal(resolveSettings({}, codex, { models, modes }).fast, false)
  assert.equal(resolveSettings({ fast: true }, codex, { models, modes }).fast, true)
  assert.equal(resolveSettings({}, defaults, { models, modes }).fast, undefined)
  const before = resolveSettings({}, codex, { models, modes })
  assert.deepEqual(liveChange(before, resolveSettings({ fast: true }, codex, { models, modes })), { fast: true })
})

test('a change sets, clears or keeps each field', () => {
  assert.deepEqual(withChange({ model: 'a', effort: 'high', fast: true }, { model: 'b', effort: null, fast: false }), { model: 'b', fast: false })
  assert.deepEqual(withChange({ model: 'a', fast: true }, { fast: null }), { model: 'a' })
})

test('Codex offers fast mode for models with a priority tier and asks for it on every turn', async () => {
  const { modelOption, serviceTier } = await import('../src/host/harness/codex/index.ts')
  const tiered = modelOption({
    model: 'gpt-x',
    displayName: 'GPT X',
    supportedReasoningEfforts: [{ reasoningEffort: 'low' }],
    serviceTiers: [{ id: 'priority', name: 'Fast', description: '2x speed, increased usage' }, { id: 'ultrafast', name: 'Ultrafast', description: '' }],
  })
  assert.deepEqual(tiered?.fast, { name: 'Fast', description: '2x speed, increased usage' })
  const plain = modelOption({ model: 'gpt-y', serviceTiers: [{ id: 'flex', name: 'Flex', description: '' }] })
  assert.equal(plain?.fast, undefined)
  // turn/start keeps an omitted tier from the turn before, so off is an explicit null (the standard tier).
  assert.equal(serviceTier(true, tiered), 'priority')
  assert.equal(serviceTier(false, tiered), null)
  assert.equal(serviceTier(undefined, tiered), null)
  assert.equal(serviceTier(true, plain), null)
  assert.equal(serviceTier(true, undefined), null)
})

test('Claude lists its default alias only when no other entry names the same model', async () => {
  const { catalogOf } = await import('../src/host/harness/claude/index.ts')
  const entry = (value: string, resolvedModel: string) => ({ value, resolvedModel, displayName: value, supportedEffortLevels: ['high'] })
  const shared = catalogOf({ models: [entry('default', 'opus-5'), entry('opus', 'opus-5'), entry('sonnet', 'sonnet-5')] })
  assert.deepEqual(shared.models.map((model) => model.id), ['opus', 'sonnet'])
  assert.equal(shared.defaultModel, 'opus')
  const alone = catalogOf({ models: [entry('default', 'custom-1'), entry('sonnet', 'sonnet-5')] })
  assert.deepEqual(alone.models.map((model) => model.id), ['default', 'sonnet'])
  assert.ok(!catalogOf({ models: [] }).modes.some((mode) => mode.id === 'dontAsk'))
})

test('Claude processes carry the configured entrypoint, never an inherited one', async () => {
  const { claudeEnvironment } = await import('../src/host/harness/claude/index.ts')
  const config = (Config as unknown as (value: unknown) => Config)({})
  assert.equal(config.claudeEntrypoint, 'native-harness')
  const resolveVariable = async () => undefined
  const inherited = process.env.CLAUDE_CODE_ENTRYPOINT
  process.env.CLAUDE_CODE_ENTRYPOINT = 'cli'
  try {
    assert.equal((await claudeEnvironment({ command: 'claude', entrypoint: config.claudeEntrypoint, resolveVariable }, 'session-1')).CLAUDE_CODE_ENTRYPOINT, 'native-harness')
    assert.equal((await claudeEnvironment({ command: 'claude', entrypoint: 'my-tool', resolveVariable }, 'session-1')).CLAUDE_CODE_ENTRYPOINT, 'my-tool')
    // Empty: the Agent SDK fills in its own sdk-ts.
    assert.equal((await claudeEnvironment({ command: 'claude', entrypoint: '', resolveVariable }, 'session-1')).CLAUDE_CODE_ENTRYPOINT, undefined)
  } finally {
    if (inherited === undefined) delete process.env.CLAUDE_CODE_ENTRYPOINT
    else process.env.CLAUDE_CODE_ENTRYPOINT = inherited
  }
})
