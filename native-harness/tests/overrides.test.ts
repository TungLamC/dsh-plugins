import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'vitest'
import { overrideNotice, settingsFiles, upstreamOverrides } from '../src/host/harness/claude/overrides.ts'
import type { NativeEvent } from '../src/host/harness/types.ts'

const KEYS = ['ANTHROPIC_BASE_URL', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN']
const PASSED = { ANTHROPIC_BASE_URL: 'https://team.example', ANTHROPIC_AUTH_TOKEN: 'team-token' }

async function withDir(run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'nh-overrides-'))
  try {
    await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function settings(path: string, content: unknown) {
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, typeof content === 'string' ? content : JSON.stringify(content))
}

test('Claude reads env from the user settings file and the two under the working directory', () => {
  assert.deepEqual(settingsFiles('/work/app', { CLAUDE_CONFIG_DIR: '/cfg' }), [
    '/cfg/settings.json',
    '/work/app/.claude/settings.json',
    '/work/app/.claude/settings.local.json',
  ])
  assert.match(settingsFiles('/work/app', {})[0]!, /\.claude\/settings\.json$/)
})

test('a settings file that sets an upstream variable to something else is reported by key, in file order', async () => {
  await withDir(async (dir) => {
    const [user, project, local] = settingsFiles(join(dir, 'work'), { CLAUDE_CONFIG_DIR: join(dir, 'cfg') })
    await settings(user!, { env: { ANTHROPIC_BASE_URL: 'https://old.example', ANTHROPIC_AUTH_TOKEN: 'old', OTHER: 'x' } })
    // The same value as passed, an empty value, and a non-upstream key change nothing.
    await settings(project!, { env: { ANTHROPIC_BASE_URL: 'https://team.example', ANTHROPIC_API_KEY: '', CLAUDE_CODE_MAX_OUTPUT_TOKENS: '1' } })
    await settings(local!, { env: { ANTHROPIC_API_KEY: 'sk-local' } })
    assert.deepEqual(await upstreamOverrides([user!, project!, local!], KEYS, PASSED), [
      { path: user, keys: ['ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN'] },
      { path: local, keys: ['ANTHROPIC_API_KEY'] },
    ])
  })
})

test('missing, unparsable and env-less settings files are skipped', async () => {
  await withDir(async (dir) => {
    const files = ['missing.json', 'broken.json', 'no-env.json', 'env-list.json', 'null.json'].map((name) => join(dir, name))
    await settings(files[1]!, '{ "env": ')
    await settings(files[2]!, { model: 'opus' })
    await settings(files[3]!, { env: ['ANTHROPIC_BASE_URL'] })
    await settings(files[4]!, 'null')
    assert.deepEqual(await upstreamOverrides(files, KEYS, PASSED), [])
  })
})

test('the notice names files and variables, never values', () => {
  const text = overrideNotice(
    [
      { path: '/home/me/.claude/settings.json', keys: ['ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN'] },
      { path: '/work/app/.claude/settings.local.json', keys: ['ANTHROPIC_API_KEY'] },
    ],
    '/home/me',
  )
  assert.equal(
    text,
    'Claude Code settings override the upstream native-harness passes: ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN in ~/.claude/settings.json; ' +
      'ANTHROPIC_API_KEY in /work/app/.claude/settings.local.json. Remove them there, or move them to your shell environment. / ' +
      'Claude Code 的 settings 盖掉了 native-harness 传入的上游：~/.claude/settings.json 的 env 设置了 ANTHROPIC_BASE_URL、ANTHROPIC_AUTH_TOKEN；' +
      '/work/app/.claude/settings.local.json 的 env 设置了 ANTHROPIC_API_KEY。把它们从文件里删掉，或者挪到 shell 的环境变量里。',
  )
})

/** A `claude` that waits on stdin like an idle CLI; a leaked one exits by itself. */
async function idleClaude(dir: string) {
  const command = join(dir, 'claude')
  await writeFile(command, `#!/usr/bin/env node\nprocess.stdin.resume()\nsetTimeout(() => process.exit(0), 10_000)\n`, { mode: 0o755 })
  return command
}

const ports = {
  interactions: { approve: async () => ({ kind: 'allow' as const }), ask: async () => ({ answers: [] }), reviewPlan: async () => 'approve' as const },
  signal: new AbortController().signal,
  log: () => {},
}

async function notices(session: { events: AsyncIterator<NativeEvent> }) {
  const found: string[] = []
  while (true) {
    const next = await Promise.race([session.events.next(), new Promise<undefined>((resolve) => setTimeout(resolve, 50))])
    if (!next || next.done) return found
    if (next.value.type === 'notice') found.push(next.value.text)
  }
}

test('a Claude process given its own upstream says once per dsh session that a settings file overrides it', async () => {
  const { ClaudeHarness } = await import('../src/host/harness/claude/index.ts')
  await withDir(async (dir) => {
    const before = process.env.CLAUDE_CONFIG_DIR
    // Never read the developer's own ~/.claude.
    process.env.CLAUDE_CONFIG_DIR = join(dir, 'cfg')
    try {
      const command = await idleClaude(dir)
      const cwd = join(dir, 'work')
      await settings(join(cwd, '.claude', 'settings.local.json'), { env: { ANTHROPIC_BASE_URL: 'https://old.example' } })
      const store: Record<string, string | undefined> = { NATIVE_HARNESS_ANTHROPIC_BASE_URL: 'https://team.example', NATIVE_HARNESS_ANTHROPIC_AUTH_TOKEN: 'team-token' }
      const harness = new ClaudeHarness({ command, resolveVariable: async (name) => store[name] })
      const run = async (id: string) => {
        const session = await harness.open({ dshSessionId: id, cwd, origin: { kind: 'new' }, settings: {} }, ports)
        try {
          await session.send({ id: `m-${Math.random()}`, text: 'hi', images: [] }, 'turn')
          return await notices(session)
        } finally {
          await session.close()
        }
      }
      try {
        const first = await run('session-a')
        assert.equal(first.length, 1)
        assert.match(first[0]!, /ANTHROPIC_BASE_URL in .*settings\.local\.json/)
        assert.doesNotMatch(first[0]!, /old\.example|team/)
        // The next process of the same dsh session (say, after idle recycling) does not repeat it.
        assert.deepEqual(await run('session-a'), [])
        // Another dsh session hears it too.
        assert.equal((await run('session-b')).length, 1)
        // With no upstream of its own the process runs on whatever Claude picks, as in a terminal: nothing to say.
        store.NATIVE_HARNESS_ANTHROPIC_BASE_URL = undefined
        store.NATIVE_HARNESS_ANTHROPIC_AUTH_TOKEN = undefined
        assert.deepEqual(await run('session-c'), [])
      } finally {
        await harness.close()
      }
    } finally {
      if (before === undefined) delete process.env.CLAUDE_CONFIG_DIR
      else process.env.CLAUDE_CONFIG_DIR = before
    }
  })
})
