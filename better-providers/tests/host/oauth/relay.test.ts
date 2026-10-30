import { describe, expect, it } from 'vitest'
import type { SignInView } from '../../../src/shared/oauth.wire.ts'
import { createSignInRelay, type FlowPrompt, type Flows, type Notice, type Records } from '../../../src/host/oauth/relay.ts'
import { Refusal } from '../../../src/host/kit/refusal.ts'

const KEY = 'llm-pi-ai/openai-codex'

/** A scripted sign-in flow the test drives, standing in for llm-pi-ai's. */
function harness(options: { methods?: { id: string; label: string }[]; record?: { configured: boolean; kind?: 'api-key' | 'grant'; writable: boolean } } = {}) {
  const listeners = new Set<(key: string) => void>()
  let record = options.record ?? { configured: false, writable: true }
  let inFlight = false
  let script: ((interaction: { notify(notice: Notice): void; prompt(prompt: FlowPrompt): Promise<string> }, signal: AbortSignal) => Promise<'authorized' | 'cancelled'>) | undefined
  let running: AbortController | undefined
  const emit = (key: string): void => { for (const listener of listeners) listener(key) }
  const flows: Flows = {
    describe: key => key === KEY ? { label: 'OpenAI', methods: options.methods ?? [{ id: 'oauth', label: 'ChatGPT' }, { id: 'api-key', label: 'API key' }], inFlight } : undefined,
    async begin(request) {
      if (request.key !== KEY) throw Object.assign(new Error('no flow'), { code: 'NO_FLOW' })
      if (inFlight) throw Object.assign(new Error('busy'), { code: 'ALREADY_IN_FLIGHT' })
      inFlight = true
      running = new AbortController()
      const signal = AbortSignal.any([request.signal, running.signal])
      try {
        const status = await (script ?? (async () => 'authorized' as const))(request.interaction, signal)
        if (status === 'authorized') { record = { configured: true, kind: 'grant', writable: true }; emit(KEY) }
        return { status }
      } finally {
        inFlight = false
        emit(KEY)
      }
    },
    cancel: () => { running?.abort() },
  }
  const removed: string[] = []
  const records: Records = {
    describe: async () => record,
    plan: async () => record.kind === 'grant' ? 'pro' : undefined,
    remove: async (key) => { removed.push(key); record = { configured: false, writable: true } },
  }
  let id = 0
  const relay = createSignInRelay({ flows, records, changes: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } }, newId: () => `q${++id}` })
  return { relay, removed, setScript: (next: typeof script) => { script = next } }
}

/** Collect views until one matches. */
async function until(watch: AsyncIterator<SignInView | null>, match: (view: SignInView | null) => boolean): Promise<SignInView | null> {
  for (;;) {
    const { value, done } = await watch.next()
    if (done === true) throw new Error('stream ended')
    if (match(value)) return value
  }
}

describe('sign-in relay', () => {
  it('shows account methods only, and the stored credential', async () => {
    const { relay } = harness({ record: { configured: true, kind: 'api-key', writable: true } })
    const watch = relay.watch('openai-codex', new AbortController().signal)[Symbol.asyncIterator]()
    const view = (await watch.next()).value
    expect(view).toMatchObject({ label: 'OpenAI', methods: [{ id: 'oauth', label: 'ChatGPT' }], credential: 'api-key', inFlight: false })
    expect(view).not.toHaveProperty('plan')
  })

  it('has no view for a route without an account flow', async () => {
    const withFlow = harness({ methods: [{ id: 'api-key', label: 'API key' }] })
    expect((await withFlow.relay.watch('openai-codex', new AbortController().signal)[Symbol.asyncIterator]().next()).value).toBeNull()
    const other = harness()
    expect((await other.relay.watch('xai', new AbortController().signal)[Symbol.asyncIterator]().next()).value).toBeNull()
  })

  it('refuses a route name that cannot address a credential record', () => {
    expect(() => harness().relay.watch('Bad/Name', new AbortController().signal)).toThrow(Refusal)
  })

  it('relays a notice and a question, and returns the outcome', async () => {
    const h = harness()
    h.setScript(async (interaction) => {
      interaction.notify({ message: 'Open the page', url: 'https://auth.example/device', code: 'ABCD' })
      const method = await interaction.prompt({ kind: 'select', message: 'How?', options: [{ id: 'browser', label: 'Browser' }, { id: 'device', label: 'Device' }] })
      return method === 'device' ? 'authorized' : 'cancelled'
    })
    const watch = h.relay.watch('openai-codex', new AbortController().signal)[Symbol.asyncIterator]()
    const outcome = h.relay.begin('openai-codex', 'oauth', new AbortController().signal)
    const asking = await until(watch, view => view?.prompt !== undefined)
    expect(asking).toMatchObject({ inFlight: true, notice: { url: 'https://auth.example/device', code: 'ABCD' }, prompt: { id: 'q1', kind: 'select' } })
    expect(() => { h.relay.answer('openai-codex', 'q1', 'phone') }).toThrow(Refusal)
    h.relay.answer('openai-codex', 'q1', 'device')
    expect(await outcome).toBe('authorized')
    const done = await until(watch, view => view?.inFlight === false && view.prompt === undefined)
    expect(done).toMatchObject({ credential: 'account', plan: 'pro' })
    expect(done?.notice).toBeUndefined()
  })

  it('refuses an answer to a replaced question', async () => {
    const h = harness()
    h.setScript(async (interaction) => {
      await interaction.prompt({ kind: 'text', message: 'Paste the code' })
      await interaction.prompt({ kind: 'text', message: 'Paste it again' })
      return 'authorized'
    })
    const watch = h.relay.watch('openai-codex', new AbortController().signal)[Symbol.asyncIterator]()
    const outcome = h.relay.begin('openai-codex', 'oauth', new AbortController().signal)
    await until(watch, view => view?.prompt?.id === 'q1')
    h.relay.answer('openai-codex', 'q1', 'x')
    await until(watch, view => view?.prompt?.id === 'q2')
    expect(() => { h.relay.answer('openai-codex', 'q1', 'y') }).toThrow(Refusal)
    h.relay.answer('openai-codex', 'q2', '')
    expect(await outcome).toBe('authorized')
  })

  it('clears a question the flow withdraws', async () => {
    const h = harness()
    const withdraw = new AbortController()
    h.setScript(async (interaction) => {
      const pasted = interaction.prompt({ kind: 'text', message: 'Or paste the redirect URL', signal: withdraw.signal }).catch(() => 'withdrawn')
      return (await pasted) === 'withdrawn' ? 'authorized' : 'cancelled'
    })
    const watch = h.relay.watch('openai-codex', new AbortController().signal)[Symbol.asyncIterator]()
    const outcome = h.relay.begin('openai-codex', 'oauth', new AbortController().signal)
    await until(watch, view => view?.prompt !== undefined)
    withdraw.abort()
    expect(await outcome).toBe('authorized')
  })

  it('cancels the running sign-in, by request or by the caller leaving', async () => {
    const h = harness()
    h.setScript((_interaction, signal) => new Promise(resolve => { signal.addEventListener('abort', () => { resolve('cancelled') }) }))
    const first = h.relay.begin('openai-codex', 'oauth', new AbortController().signal)
    await Promise.resolve()
    h.relay.cancel('openai-codex')
    expect(await first).toBe('cancelled')
    const caller = new AbortController()
    const second = h.relay.begin('openai-codex', 'oauth', caller.signal)
    caller.abort()
    expect(await second).toBe('cancelled')
  })

  it('refuses unknown methods, the API-key method, and a second sign-in', async () => {
    const h = harness()
    await expect(h.relay.begin('openai-codex', 'api-key', new AbortController().signal)).rejects.toMatchObject({ reason: 'unknown-method' })
    await expect(h.relay.begin('xai', 'oauth', new AbortController().signal)).rejects.toMatchObject({ reason: 'no-flow' })
    h.setScript((_interaction, signal) => new Promise(resolve => { signal.addEventListener('abort', () => { resolve('cancelled') }) }))
    const running = h.relay.begin('openai-codex', 'oauth', new AbortController().signal)
    await expect(h.relay.begin('openai-codex', 'oauth', new AbortController().signal)).rejects.toMatchObject({ reason: 'in-flight' })
    h.relay.cancel('openai-codex')
    await running
  })

  it('signs out by removing the record, but not while signing in', async () => {
    const h = harness({ record: { configured: true, kind: 'grant', writable: true } })
    await h.relay.signOut('openai-codex')
    expect(h.removed).toEqual([KEY])
    h.setScript((_interaction, signal) => new Promise(resolve => { signal.addEventListener('abort', () => { resolve('cancelled') }) }))
    const running = h.relay.begin('openai-codex', 'oauth', new AbortController().signal)
    await expect(h.relay.signOut('openai-codex')).rejects.toMatchObject({ reason: 'in-flight' })
    h.relay.cancel('openai-codex')
    await running
  })

  it('refuses to sign out of a read-only store', async () => {
    const h = harness({ record: { configured: true, kind: 'grant', writable: false } })
    await expect(h.relay.signOut('openai-codex')).rejects.toMatchObject({ reason: 'not-writable' })
  })
})
