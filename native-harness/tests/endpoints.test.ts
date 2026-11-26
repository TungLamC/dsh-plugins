import assert from 'node:assert/strict'
import { test } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { checkEndpoints, Config, type ClaudeEndpoint } from '../src/host/config.ts'
import { claudeEnvironment } from '../src/host/harness/claude/index.ts'
import { childEnvironment } from '../src/host/harness/codex/rpc.ts'
import { FakeHarness, type FakeSession } from '../src/host/harness/fake.ts'
import { SessionRuntime } from '../src/host/runtime.ts'
import { liveChange, resolveSettings } from '../src/host/settings.ts'
import { memoryStore } from '../src/host/store.ts'
import { world } from './support.ts'

const parse = Config as unknown as (value: unknown) => Config
const endpoint = (id: string, env: Record<string, string> = {}): ClaudeEndpoint => ({ id, name: '', command: '', env })

test('endpoints default to none, and each entry fills in its optional fields', () => {
  const empty = parse({})
  assert.deepEqual(empty.claudeEndpoints, [])
  assert.equal(empty.defaults['claude-code'].endpoint, '')
  const config = parse({ claudeEndpoints: [{ id: 'gateway-a', env: { ANTHROPIC_API_KEY: '$GATEWAY_A_KEY' } }] })
  assert.deepEqual(config.claudeEndpoints, [{ id: 'gateway-a', name: '', command: '', env: { ANTHROPIC_API_KEY: '$GATEWAY_A_KEY' } }])
  assert.throws(() => parse({ claudeEndpoints: [{ id: 'has space' }] }))
})

test('endpoint ids are unique and the default endpoint must exist', () => {
  assert.doesNotThrow(() => checkEndpoints(parse({ claudeEndpoints: [{ id: 'a' }, { id: 'b' }], defaults: { 'claude-code': { endpoint: 'b' } } })))
  assert.throws(() => checkEndpoints(parse({ claudeEndpoints: [{ id: 'a' }, { id: 'a' }] })), /twice/)
  assert.throws(() => checkEndpoints(parse({ claudeEndpoints: [{ id: 'a' }], defaults: { 'claude-code': { endpoint: 'c' } } })), /not an id/)
})

test('a session runs on its own endpoint, else the default, else the first; a removed one falls back', () => {
  const ids = ['gateway-a', 'gateway-b']
  assert.equal(resolveSettings({}, {}, undefined, ids).endpoint, 'gateway-a')
  assert.equal(resolveSettings({}, { endpoint: 'gateway-b' }, undefined, ids).endpoint, 'gateway-b')
  assert.equal(resolveSettings({ endpoint: 'gateway-a' }, { endpoint: 'gateway-b' }, undefined, ids).endpoint, 'gateway-a')
  assert.equal(resolveSettings({ endpoint: 'gone' }, { endpoint: 'gateway-b' }, undefined, ids).endpoint, 'gateway-b')
  assert.equal(resolveSettings({ endpoint: 'gateway-a' }, {}, undefined, []).endpoint, undefined)
  const before = resolveSettings({}, {}, undefined, ids)
  assert.deepEqual(liveChange(before, resolveSettings({ endpoint: 'gateway-b' }, {}, undefined, ids)), { endpoint: 'gateway-b' })
})

/** Stands in for `ctx.credentials.resolve`: the credential store first, then the host environment. */
function credentials(store: Record<string, string> = {}) {
  const asked: string[] = []
  const resolveVariable = async (name: string) => {
    asked.push(name)
    return store[name] || process.env[name] || undefined
  }
  return { resolveVariable, asked }
}

test("an endpoint's variables replace the host's upstream; $NAME reads the credential store, then the host environment", async () => {
  const saved = { ...process.env }
  Object.assign(process.env, {
    ANTHROPIC_BASE_URL: 'https://host.example',
    ANTHROPIC_API_KEY: 'host-key',
    ANTHROPIC_AUTH_TOKEN: 'host-token',
    NH_TEST_ENV_KEY: 'env-key',
    NH_TEST_BOTH_KEY: 'env-value',
  })
  delete process.env.NH_TEST_STORE_KEY
  delete process.env.NH_TEST_UNSET
  try {
    const { resolveVariable, asked } = credentials({ NH_TEST_STORE_KEY: 'stored-key', NH_TEST_BOTH_KEY: 'stored-value' })
    const config = { command: 'claude', resolveVariable }
    const host = await claudeEnvironment(config, 'session-1')
    assert.equal(host.ANTHROPIC_BASE_URL, 'https://host.example')
    const gateway = (key: string) => endpoint('gw', { ANTHROPIC_BASE_URL: 'https://gw.example', ANTHROPIC_API_KEY: key })
    // Only in the credential store, e.g. saved from the Models page or by another plugin.
    const stored = await claudeEnvironment(config, 'session-1', gateway('$NH_TEST_STORE_KEY'))
    assert.equal(stored.ANTHROPIC_BASE_URL, 'https://gw.example')
    assert.equal(stored.ANTHROPIC_API_KEY, 'stored-key')
    assert.equal(stored.ANTHROPIC_AUTH_TOKEN, undefined)
    assert.equal(stored.DSH_SESSION_ID, 'session-1')
    // Only in the host environment: as before.
    assert.equal((await claudeEnvironment(config, 's', gateway('$NH_TEST_ENV_KEY'))).ANTHROPIC_API_KEY, 'env-key')
    // In both: the store wins.
    assert.equal((await claudeEnvironment(config, 's', gateway('$NH_TEST_BOTH_KEY'))).ANTHROPIC_API_KEY, 'stored-value')
    // In neither: the error names the variable.
    await assert.rejects(claudeEnvironment(config, 's', gateway('$NH_TEST_UNSET')), /ANTHROPIC_API_KEY reads \$NH_TEST_UNSET/)
    // Only a whole `$NAME` is a reference, and the resolver gets the bare name.
    asked.length = 0
    assert.equal((await claudeEnvironment(config, 's', endpoint('gw', { X: 'a$NH_TEST_STORE_KEY' }))).X, 'a$NH_TEST_STORE_KEY')
    assert.deepEqual(asked, [])
    await claudeEnvironment(config, 's', gateway('$NH_TEST_STORE_KEY'))
    assert.deepEqual(asked, ['NH_TEST_STORE_KEY'])
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]
    Object.assign(process.env, saved)
  }
})

const OWN_URL = 'NATIVE_HARNESS_ANTHROPIC_BASE_URL'
const OWN_TOKEN = 'NATIVE_HARNESS_ANTHROPIC_AUTH_TOKEN'
const OWN_KEY = 'NATIVE_HARNESS_ANTHROPIC_API_KEY'

/** Runs with the host environment changed as given (undefined unsets), then puts it back. */
async function withHostEnv(change: Record<string, string | undefined>, run: () => Promise<void>): Promise<void> {
  const saved = { ...process.env }
  for (const [key, value] of Object.entries(change)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  try {
    await run()
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]
    Object.assign(process.env, saved)
  }
}

/** A host that points Claude Code at its own upstream with a key, and sets none of the plugin's variables. */
const HOST_UPSTREAM = {
  ANTHROPIC_BASE_URL: 'https://host.example',
  ANTHROPIC_API_KEY: 'host-key',
  ANTHROPIC_AUTH_TOKEN: undefined,
  [OWN_URL]: undefined,
  [OWN_TOKEN]: undefined,
  [OWN_KEY]: undefined,
}

test('with no endpoint, NATIVE_HARNESS_ANTHROPIC_* from the credential store replace the host upstream once any is set', () =>
  withHostEnv(HOST_UPSTREAM, async () => {
    const environment = (store: Record<string, string>, on?: ClaudeEndpoint) => {
      const { resolveVariable, asked } = credentials(store)
      return { asked, env: claudeEnvironment({ command: 'claude', entrypoint: 'native-harness', resolveVariable }, 's', on) }
    }
    // None set: the host environment as before, its ANTHROPIC_* included.
    const none = environment({})
    const inherited = await none.env
    assert.equal(inherited.ANTHROPIC_BASE_URL, 'https://host.example')
    assert.equal(inherited.ANTHROPIC_API_KEY, 'host-key')
    assert.deepEqual(inherited, { ...childEnvironment('s'), CLAUDE_CODE_ENTRYPOINT: 'native-harness' })
    assert.deepEqual(none.asked.toSorted(), [OWN_KEY, OWN_TOKEN, OWN_URL])
    // URL and token stored, a key in the host environment: the mapped URL and token, no inherited key.
    const gateway = await environment({ [OWN_URL]: 'https://team.example', [OWN_TOKEN]: 'team-token' }).env
    assert.equal(gateway.ANTHROPIC_BASE_URL, 'https://team.example')
    assert.equal(gateway.ANTHROPIC_AUTH_TOKEN, 'team-token')
    assert.equal(gateway.ANTHROPIC_API_KEY, undefined)
    assert.equal(gateway.DSH_SESSION_ID, 's')
    assert.equal(gateway.CLAUDE_CODE_ENTRYPOINT, 'native-harness')
    // Only a key: ANTHROPIC_API_KEY, on Claude Code's own default URL rather than the host's.
    const key = await environment({ [OWN_KEY]: 'team-key' }).env
    assert.equal(key.ANTHROPIC_API_KEY, 'team-key')
    assert.equal(key.ANTHROPIC_BASE_URL, undefined)
    assert.equal(key.ANTHROPIC_AUTH_TOKEN, undefined)
    // A URL with neither credential: the error names both variables.
    await assert.rejects(
      environment({ [OWN_URL]: 'https://team.example' }).env,
      /ANTHROPIC_BASE_URL reads \$NATIVE_HARNESS_ANTHROPIC_BASE_URL, but .* sets \$NATIVE_HARNESS_ANTHROPIC_AUTH_TOKEN or \$NATIVE_HARNESS_ANTHROPIC_API_KEY/,
    )
    // On an endpoint: its env alone, and the three variables are not read.
    const all = { [OWN_URL]: 'https://team.example', [OWN_TOKEN]: 'team-token', [OWN_KEY]: 'team-key' }
    const onEndpoint = environment(all, endpoint('gw', { ANTHROPIC_BASE_URL: 'https://gw.example', ANTHROPIC_API_KEY: 'gw-key' }))
    const routed = await onEndpoint.env
    assert.equal(routed.ANTHROPIC_BASE_URL, 'https://gw.example')
    assert.equal(routed.ANTHROPIC_API_KEY, 'gw-key')
    assert.equal(routed.ANTHROPIC_AUTH_TOKEN, undefined)
    assert.deepEqual(onEndpoint.asked, [])
  }))

/** A `claude` that records the upstream it started with and then waits on stdin, like an idle CLI; a leaked one exits by itself. */
interface Start {
  key: string | null
  url: string | null
  token: string | null
}

async function stubClaude() {
  const { mkdtemp, writeFile, chmod, readFile, rm } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')
  const dir = await mkdtemp(join(tmpdir(), 'nh-stub-claude-'))
  const command = join(dir, 'claude')
  const log = join(dir, 'starts.jsonl')
  await writeFile(
    command,
    `#!/usr/bin/env node
const env = process.env
require('node:fs').appendFileSync(env.NH_STUB_LOG, JSON.stringify({ key: env.ANTHROPIC_API_KEY ?? null, url: env.ANTHROPIC_BASE_URL ?? null, token: env.ANTHROPIC_AUTH_TOKEN ?? null }) + '\\n')
process.stdin.resume()
setTimeout(() => process.exit(0), 10_000)
`,
  )
  await chmod(command, 0o755)
  const starts = async (): Promise<Start[]> =>
    (await readFile(log, 'utf8').catch(() => ''))
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  /** Starts once `count` have shown up and stragglers had time to. */
  const settled = async (count = 1) => {
    for (let i = 0; i < 150 && (await starts()).length < count; i++) await new Promise((resolve) => setTimeout(resolve, 20))
    await new Promise((resolve) => setTimeout(resolve, 300))
    return starts()
  }
  return { dir, command, log, starts, settled, remove: () => rm(dir, { recursive: true, force: true }) }
}

const ports = {
  interactions: { approve: async () => ({ kind: 'allow' as const }), ask: async () => ({ answers: [] }), reviewPlan: async () => 'approve' as const },
  signal: new AbortController().signal,
  log: () => {},
}
const input = (id: string) => ({ id, text: 'hi', images: [] })

test('a Claude process starts with the stored key once, even when sends arrive while it resolves', async () => {
  const { ClaudeHarness } = await import('../src/host/harness/claude/index.ts')
  const stub = await stubClaude()
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  const asked: string[] = []
  const endpoints = ['a', 'b'].map((id) =>
    endpoint(id, { NH_STUB_LOG: stub.log, ANTHROPIC_BASE_URL: `https://${id}.example`, ANTHROPIC_API_KEY: `$NH_TEST_${id.toUpperCase()}_KEY` }),
  )
  const harness = new ClaudeHarness({
    command: stub.command,
    endpoints,
    resolveVariable: async (name) => {
      asked.push(name)
      await gate
      return { NH_TEST_A_KEY: 'stored-a', NH_TEST_B_KEY: 'stored-b' }[name]
    },
  })
  const session = await harness.open({ dshSessionId: 'session-stub', cwd: stub.dir, origin: { kind: 'new' }, settings: { endpoint: 'a' } }, ports)
  try {
    const first = session.send(input('m1'), 'turn')
    const second = session.send(input('m2'), 'steer')
    await new Promise((resolve) => setTimeout(resolve, 20))
    // Switched while the first start still resolves: the process starts on the new endpoint.
    assert.equal((await session.apply({ endpoint: 'b' })).status, 'applied')
    release()
    await Promise.all([first, second])
    assert.deepEqual(await stub.settled(), [{ key: 'stored-b', url: 'https://b.example', token: null }])
    assert.deepEqual(asked, ['NH_TEST_A_KEY', 'NH_TEST_B_KEY'])
  } finally {
    await session.close()
    await harness.close()
    await stub.remove()
  }
})

test('a Claude process does not start when its key is set nowhere, or the session closed while it resolved', async () => {
  const { ClaudeHarness } = await import('../src/host/harness/claude/index.ts')
  const stub = await stubClaude()
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  const harness = new ClaudeHarness({
    command: stub.command,
    endpoints: [
      endpoint('unset', { NH_STUB_LOG: stub.log, ANTHROPIC_API_KEY: '$NH_TEST_UNSET' }),
      endpoint('set', { NH_STUB_LOG: stub.log, ANTHROPIC_API_KEY: '$NH_TEST_SET_KEY' }),
    ],
    resolveVariable: async (name) => {
      await gate
      return name === 'NH_TEST_SET_KEY' ? 'stored' : undefined
    },
  })
  const open = (id: string, endpoint: string) =>
    harness.open({ dshSessionId: id, cwd: stub.dir, origin: { kind: 'new' }, settings: { endpoint } }, ports)
  try {
    const missing = await open('session-missing', 'unset')
    const failed = missing.send(input('m1'), 'turn')
    const closing = await open('session-closing', 'set')
    const closed = closing.send(input('m2'), 'turn')
    await closing.close()
    release()
    await assert.rejects(failed, /ANTHROPIC_API_KEY reads \$NH_TEST_UNSET/)
    await assert.rejects(closed, /closed/)
    await missing.close()
    await new Promise((resolve) => setTimeout(resolve, 300))
    assert.deepEqual(await stub.starts(), [])
  } finally {
    await harness.close()
    await stub.remove()
  }
})

test('with no endpoint, each Claude process starts on the NATIVE_HARNESS_ANTHROPIC_* stored then; a URL alone starts none', async () => {
  const { ClaudeHarness } = await import('../src/host/harness/claude/index.ts')
  const stub = await stubClaude()
  const store: Record<string, string> = { [OWN_URL]: 'https://team.example', [OWN_TOKEN]: 'team-token-1' }
  await withHostEnv({ ...HOST_UPSTREAM, NH_STUB_LOG: stub.log }, async () => {
    const harness = new ClaudeHarness({ command: stub.command, resolveVariable: async (name) => store[name] })
    const sessions: Awaited<ReturnType<typeof harness.open>>[] = []
    const open = async (id: string) => {
      const session = await harness.open({ dshSessionId: id, cwd: stub.dir, origin: { kind: 'new' }, settings: {} }, ports)
      sessions.push(session)
      return session
    }
    try {
      await (await open('session-own-1')).send(input('m1'), 'turn')
      assert.deepEqual(await stub.settled(), [{ key: null, url: 'https://team.example', token: 'team-token-1' }])
      // Changed in the store: the next process starts with the new value.
      store[OWN_TOKEN] = 'team-token-2'
      await (await open('session-own-2')).send(input('m2'), 'turn')
      assert.deepEqual((await stub.settled(2))[1], { key: null, url: 'https://team.example', token: 'team-token-2' })
      // The token removed, the URL left: that turn fails and no process starts.
      delete store[OWN_TOKEN]
      await assert.rejects((await open('session-own-3')).send(input('m3'), 'turn'), /\$NATIVE_HARNESS_ANTHROPIC_AUTH_TOKEN or \$NATIVE_HARNESS_ANTHROPIC_API_KEY/)
      await new Promise((resolve) => setTimeout(resolve, 300))
      assert.equal((await stub.starts()).length, 2)
    } finally {
      await Promise.all(sessions.map((session) => session.close()))
      await harness.close()
    }
  }).finally(stub.remove)
})

test('with no endpoint, the catalog process runs on NATIVE_HARNESS_ANTHROPIC_* too', async () => {
  const { ClaudeHarness } = await import('../src/host/harness/claude/index.ts')
  const stub = await stubClaude()
  await withHostEnv({ ...HOST_UPSTREAM, NH_STUB_LOG: stub.log }, async () => {
    const store: Record<string, string> = { [OWN_URL]: 'https://team.example', [OWN_KEY]: 'team-key' }
    const harness = new ClaudeHarness({ command: stub.command, resolveVariable: async (name) => store[name] })
    const abort = new AbortController()
    const catalog = harness.catalog(stub.dir, abort.signal)
    try {
      assert.deepEqual(await stub.settled(), [{ key: 'team-key', url: 'https://team.example', token: null }])
    } finally {
      abort.abort()
      await catalog.catch(() => undefined)
    }
    delete store[OWN_KEY]
    await assert.rejects(harness.catalog(stub.dir, new AbortController().signal), /\$NATIVE_HARNESS_ANTHROPIC_API_KEY/)
    assert.equal((await stub.starts()).length, 1)
    await harness.close()
  }).finally(stub.remove)
})

test('the endpoint a process started on is remembered and handed to the next open', async () => {
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
  const agent = { id: 'session-e', session: { header: { cwd: '/project', isSeeded: false }, inheritedEventCount: 0 } } as unknown as Agent
  const first = await runtime.session(agent, 'claude-code', new AbortController().signal)
  assert.equal((first.native as FakeSession).request.lastEndpoint, undefined)
  await runtime.saveEndpoint('session-e', 'claude-code', 'gateway-b')
  await runtime.close('session-e')
  const second = await runtime.session(agent, 'claude-code', new AbortController().signal)
  assert.equal((second.native as FakeSession).request.lastEndpoint, 'gateway-b')
  // A record written for the other harness starts over.
  await runtime.close('session-e')
  const codex = await runtime.session(agent, 'codex', new AbortController().signal)
  assert.equal((codex.native as FakeSession).request.lastEndpoint, undefined)
})

test('a switch notice shows in the conversation and the endpoint is stored with the session', async () => {
  const w = await world((session, input) =>
    session.emit(
      { type: 'notice', text: 'Now running on gateway-b. / 已切换到 gateway-b。' },
      { type: 'endpoint', endpoint: 'gateway-b' },
      { type: 'turn-start', turn: 't1', origin: 'user', inputIds: [input.id] },
      { type: 'call-start', call: 'c1' },
      { type: 'delta', call: 'c1', block: 'text', key: 'm', text: 'hello' },
      { type: 'call-end', call: 'c1' },
      { type: 'turn-end', turn: 't1', outcome: 'completed' },
    ),
  )
  try {
    w.send('hi')
    await w.idle()
    const text = w.events.flatMap((event) =>
      event.type === 'assistant/message' ? event.data.message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])) : [],
    )
    assert.match(text.join(''), /已切换到 gateway-b。[\s\S]*hello/)
    assert.equal(w.store.records.get(w.agent.id)?.lastEndpoint, 'gateway-b')
  } finally {
    await w.close()
  }
})
