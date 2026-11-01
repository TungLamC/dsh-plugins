/**
 * The built row in dsh's web and model services: dsh's own WebRuntime selects
 * the provider the row registers, and dsh's LlmRuntime with the real llm-pi-ai
 * lists the Codex route's models. The sign-in, the settings and the network are
 * fake. Run `pnpm build` first.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as llmPiAi from '@deepseek-ai/dsh-llm-pi-ai'
import WebRuntime, { WebError } from '@deepseek-ai/dsh-web'
import { chatgptGrant, json, memoryCredentials, recordingFetch, sse, type Call } from '../kit/fakes.ts'

const { default: WebAccess } = await import('../../lib/host/index.js' as string) as typeof import('../../src/host/index.ts')

const cleanup: (() => unknown)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
  vi.unstubAllGlobals()
})

const CODEX = 'https://chatgpt.com/backend-api/codex/responses'
const EXA = 'https://mcp.exa.ai/mcp?tools=web_search_exa'

/** Codex answering with one search and a cited answer; Exa with one text result. */
function network(failing: readonly string[] = []) {
  return recordingFetch((call: Call) => {
    if (failing.some(prefix => call.url.startsWith(prefix))) return new Response('unavailable', { status: 503 })
    if (call.url === CODEX) {
      return sse([{ type: 'response.completed', response: { status: 'completed', output: [
        { type: 'web_search_call', action: { sources: [{ url: 'https://news.example/a' }] } },
        { type: 'message', content: [{ type: 'output_text', text: 'The answer.', annotations: [] }] },
      ] } }])
    }
    if (call.url === EXA) return json({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'Title: Exa result\nURL: https://exa.example/r\nText: page text' }] } })
    return new Response('not found', { status: 404 })
  })
}

async function dsh(config: Record<string, unknown> = {}, failing: readonly string[] = []) {
  const vendor = network(failing)
  vi.stubGlobal('fetch', vendor.fetch)
  const providers = { 'openai-codex': {} }
  const ctx = new Context()
  cleanup.push(() => ctx.fiber.dispose())
  ctx.reflect.provide('typert', { register: () => () => {} })
  ctx.reflect.provide('credentials', memoryCredentials({ 'llm-pi-ai/openai-codex': { kind: 'grant', payload: chatgptGrant() } }))
  ctx.reflect.provide('settings', { describe: () => [{ ns: 'llm-pi-ai', value: { providers } }] })
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(llmPiAi, { providers })
  await ctx.plugin(WebRuntime, { searchProvider: 'web-access' })
  await ctx.plugin(WebAccess, config)
  return { ctx, calls: vendor.calls }
}

describe('web-access in dsh\'s web service', () => {
  it('answers web searches through Codex with the route\'s model', async () => {
    const { ctx, calls } = await dsh()
    const result = await ctx.web.search({ query: 'news', maxResults: 8 })
    expect(result).toEqual({ content: 'The answer.', sources: [{ url: 'https://news.example/a' }], truncated: false })
    expect(calls.map(call => call.url)).toEqual([CODEX])
    expect(calls[0]?.body).toMatchObject({ model: 'gpt-6-luna', tools: [{ type: 'web_search' }] })
    expect(calls[0]?.headers.get('chatgpt-account-id')).toBe('acct-test')
  })

  it('falls back to Exa when Codex fails', async () => {
    const { ctx, calls } = await dsh({}, [CODEX])
    await expect(ctx.web.search({ query: 'news' })).resolves.toMatchObject({ sources: [{ url: 'https://exa.example/r', title: 'Exa result' }] })
    expect(calls.map(call => call.url)).toEqual([CODEX, EXA])
  })

  it('tries only the tiers switched on', async () => {
    const { ctx, calls } = await dsh({ codex: false, parallel: false, anysearch: false })
    await ctx.web.search({ query: 'news' })
    expect(calls.map(call => call.url)).toEqual([EXA])
  })

  it('fails with dsh\'s own WebError when every tier fails', async () => {
    const { ctx } = await dsh({ parallel: false, anysearch: false }, [CODEX, EXA])
    const error = await ctx.web.search({ query: 'news' }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(WebError)
    expect(error).toMatchObject({ code: 'WEB_PROVIDER_ERROR', message: 'web search failed: codex: HTTP 503: unavailable; exa: HTTP 503: unavailable' })
  })

  it('is unavailable to dsh with every tier switched off', async () => {
    const { ctx } = await dsh({ codex: false, exa: false, parallel: false, anysearch: false })
    await expect(ctx.web.search({ query: 'news' })).rejects.toMatchObject({ code: 'WEB_PROVIDER_CONFIGURED_UNAVAILABLE' })
  })

  it('offers the settings page each route\'s models', async () => {
    const { ctx } = await dsh()
    const models = await ctx.webAccess.searchModels()
    expect(models.openai).toBeNull()
    expect(models.gemini).toBeNull()
    expect(models.codex?.map(model => model.id)).toContain('gpt-6-luna')
  })
})
