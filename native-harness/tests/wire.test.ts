import assert from 'node:assert/strict'
import { test } from 'vitest'
import type { z } from 'zod'
import { SETTING_KEYS } from '../src/shared/types.ts'
import { REMOTE } from '../src/shared/wire.ts'

function parameterSchema(method: string, name: string): z.ZodType {
  const descriptor = REMOTE.descriptors.find((candidate) => candidate.method === method)
  const parameter = descriptor?.parameters?.find((candidate) => candidate.name === name)
  const codec = parameter?.codec as { create(): z.ZodType } | undefined
  if (!codec) throw new Error(`no ${method}(${name}) parameter`)
  return codec.create()
}

test('the select wire accepts every settings field, including fast mode', () => {
  const change = parameterSchema('select', 'change')
  for (const key of SETTING_KEYS) assert.ok(change.safeParse({ [key]: null }).success, key)
  assert.ok(change.safeParse({ fast: true }).success)
  assert.ok(change.safeParse({ model: 'gpt-x', effort: null }).success)
  assert.ok(!change.safeParse({ fast: 'yes' }).success)
  assert.ok(!change.safeParse({ unknown: 1 }).success)
})
