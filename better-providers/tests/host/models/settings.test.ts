import { describe, expect, it } from 'vitest'
import type { SettingsPathOp } from '@deepseek-ai/dsh-settings'
import { routeSettings, type SettingsDependencies } from '../../../src/host/models/settings.ts'
import { WriteFailure } from '../../../src/host/models/sync.ts'

/** The settings service and configuration editor, holding llm-pi-ai's composed configuration and the profile's own layer. */
function services(config: unknown, user: unknown = {}, fail?: Error) {
  const mutations: { ns: string; ops: readonly SettingsPathOp[]; revision?: number }[] = []
  const deps = {
    settings: {
      describe: () => [{ ns: 'llm-pi-ai', autoGenerate: false, schema: {}, value: { resolved: true }, user, revision: 7, applies: 'live' }],
      async mutate(ns: string, ops: readonly SettingsPathOp[], revision?: number) {
        mutations.push({ ns, ops, ...revision === undefined ? {} : { revision } })
        if (fail !== undefined) throw fail
      },
    },
    editor: { entries: () => [{ options: { id: 'other', config: {} } }, { options: { id: 'llm-pi-ai', config } }] },
  } as unknown as SettingsDependencies
  return { settings: routeSettings(deps), mutations }
}

const js = (code: string) => ({ __jsExpr: code })

describe('route settings', () => {
  it('reads the route as configured, not as resolved', async () => {
    const config = { providers: { 'kimi-coding': { apiKeyEnv: 'KIMI', models: [{ id: 'k3' }, { id: 'x', name: js('env.NAME') }] } } }
    await expect(services(config, { providers: {} }).settings.read('kimi-coding')).resolves.toEqual({
      profile: config.providers['kimi-coding'],
      revision: 7,
      firstWrite: false,
    })
    await expect(services(config).settings.read('xai')).resolves.toEqual({ revision: 7, firstWrite: true })
  })

  it('sets and removes fields of the route at the revision read', async () => {
    const { settings, mutations } = services({})
    await settings.write('openai-codex', { modelOverrides: null, models: [{ id: 'a' }], defaultMaxTokens: 1000 }, 7)
    expect(mutations).toEqual([{
      ns: 'llm-pi-ai',
      revision: 7,
      ops: [
        { op: 'unset', path: ['providers', 'openai-codex', 'modelOverrides'] },
        { op: 'set', path: ['providers', 'openai-codex', 'models'], value: [{ id: 'a' }] },
        { op: 'set', path: ['providers', 'openai-codex', 'defaultMaxTokens'], value: 1000 },
      ],
    }])
  })

  it('refuses a route with an expression where a write lands, before writing', async () => {
    const at = [
      js('config'),
      { providers: js('providers') },
      { providers: { r: js('profile') } },
      { providers: { r: { models: js('models') } } },
      { providers: { r: { defaultMaxTokens: js('size') } } },
    ]
    for (const config of at) {
      const { settings, mutations } = services(config)
      await expect(settings.read('r')).resolves.toMatchObject({ blocked: 'expression' })
      await expect(settings.write('r', { models: [] }, 7)).rejects.toEqual(new WriteFailure('expression'))
      expect(mutations).toEqual([])
    }
    // An expression elsewhere stays as it is.
    const elsewhere = { providers: { r: { headers: js('headers') }, other: js('other') } }
    await expect(services(elsewhere).settings.read('r')).resolves.not.toHaveProperty('blocked')
  })

  it('names a stale revision, a home patch, and llm-pi-ai\'s refusal', async () => {
    const conflict = Object.assign(new Error('settings namespace "llm-pi-ai" changed since it was read'), { code: 'SETTINGS_CONFLICT' })
    const home = new Error('Configuration for "llm-pi-ai" is overridden by a home patch or command-line overlay')
    const refused = new Error('llm-pi-ai: provider "r" lists model "a" more than once')
    const kind = (error: Error) => services({}, {}, error).settings.write('r', { models: [] }, 7).then(() => undefined, (failure: WriteFailure) => [failure.kind, failure.message])
    expect(await kind(conflict)).toEqual(['conflict', conflict.message])
    expect(await kind(home)).toEqual(['overridden', home.message])
    expect(await kind(refused)).toEqual(['rejected', refused.message])
  })

  it('refuses a route when llm-pi-ai is not running', async () => {
    const deps = { settings: { describe: () => [], mutate: async () => {} }, editor: { entries: () => [] } } as unknown as SettingsDependencies
    await expect(routeSettings(deps).read('r')).rejects.toMatchObject({ reason: 'unsupported' })
  })
})
