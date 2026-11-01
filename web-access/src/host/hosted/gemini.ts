/**
 * A search through the Gemini API's Google Search grounding: the model
 * searches Google, then writes a short answer grounded in the results.
 *
 * The request and the reading of replies follow pi-web-access 0.46.0
 * (`gemini-search.ts`), Copyright (c) 2025 Nico Bailon, MIT License; see THIRD_PARTY_NOTICES.md.
 */

import type { WebSearchRequest, WebSearchResult } from '@deepseek-ai/dsh-web'
import { describeError, httpFailure, isObject, parseJson, postJson, redact } from '../kit/http.ts'
import { toSource, uniqueSources } from '../kit/sources.ts'

export interface GeminiTarget {
  /** The model's `…:generateContent` endpoint. */
  url: string
  /** Authentication and the endpoint's own headers. */
  headers: Readonly<Record<string, string>>
  /** The keys in `headers`, masked in every error. */
  secrets: readonly string[]
}

const INSTRUCTIONS = 'Search the web for the query, then answer concisely using only what the results say.'

/** Grounding links point at a Google redirect; the page they lead to is read from it within this time. */
const REDIRECT_MS = 5_000
const REDIRECT_HOST = 'vertexaisearch.cloud.google.com'

export async function searchGemini(target: GeminiTarget, request: WebSearchRequest, signal: AbortSignal): Promise<WebSearchResult> {
  try {
    const response = await postJson(target.url, {
      systemInstruction: { parts: [{ text: INSTRUCTIONS }] },
      contents: [{ role: 'user', parts: [{ text: request.query }] }],
      tools: [{ google_search: {} }],
    }, target.headers, signal)
    if (!response.ok) throw await httpFailure(response, target.secrets)
    const reply = parseJson(await response.text())
    if (!isObject(reply)) throw new Error('the reply is not JSON')
    const feedback = isObject(reply['promptFeedback']) ? reply['promptFeedback'] : {}
    if (typeof feedback['blockReason'] === 'string') throw new Error(`the query was blocked: ${feedback['blockReason']}`)
    const candidate = Array.isArray(reply['candidates']) ? reply['candidates'].find(isObject) : undefined
    if (candidate === undefined) throw new Error('the reply has no answer')

    const content = isObject(candidate['content']) ? candidate['content'] : {}
    const parts = Array.isArray(content['parts']) ? content['parts'].filter(isObject) : []
    // Thought summaries are the model's reasoning, not its answer.
    const answer = parts.filter(part => part['thought'] !== true).map(part => typeof part['text'] === 'string' ? part['text'] : '').join('').trim()

    const grounding = isObject(candidate['groundingMetadata']) ? candidate['groundingMetadata'] : {}
    const queries = Array.isArray(grounding['webSearchQueries']) ? grounding['webSearchQueries'] : []
    const chunks = Array.isArray(grounding['groundingChunks']) ? grounding['groundingChunks'].filter(isObject) : []
    if (queries.length === 0 && chunks.length === 0) throw new Error('the model answered without searching')

    const sources = await Promise.all(chunks.map(async (chunk) => {
      const web = isObject(chunk['web']) ? chunk['web'] : {}
      const uri = typeof web['uri'] === 'string' ? web['uri'] : undefined
      return toSource({ url: uri === undefined ? undefined : await destination(uri, signal), title: web['title'] })
    }))
    return { ...answer === '' ? {} : { content: answer }, sources: uniqueSources(sources), truncated: false }
  } catch (error) {
    signal.throwIfAborted()
    throw new Error(redact(describeError(error), target.secrets))
  }
}

/** Where a grounding redirect leads, read without following it; the redirect itself when that cannot be read. */
async function destination(uri: string, signal: AbortSignal): Promise<string> {
  let host: string
  try {
    host = new URL(uri).hostname
  } catch {
    return uri
  }
  if (host !== REDIRECT_HOST) return uri
  try {
    const response = await fetch(uri, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.any([signal, AbortSignal.timeout(REDIRECT_MS)]) })
    const location = response.headers.get('location')
    return location !== null && /^https?:\/\//i.test(location) ? location : uri
  } catch {
    return uri
  }
}
