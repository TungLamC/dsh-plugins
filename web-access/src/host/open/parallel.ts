/**
 * Parallel, through its public search MCP endpoint, which answers without a key.
 *
 * The request and the reading of replies follow pi-web-access 0.46.0
 * (`parallel-mcp.ts`), Copyright (c) 2025 Nico Bailon, MIT License; see THIRD_PARTY_NOTICES.md.
 */

import type { WebSearchResult } from '@deepseek-ai/dsh-web'
import { PACKAGE } from '../../shared/ids.ts'
import type { Tier } from '../chain.ts'
import { isObject } from '../kit/http.ts'
import { toSource, uniqueSources } from '../kit/sources.ts'
import { callTool, textResults } from './mcp.ts'

const ENDPOINT = 'https://search.parallel.ai/mcp'

export function parallelTier(): Tier {
  return {
    hosted: false,
    prepare: async () => async (request, signal): Promise<WebSearchResult> => {
      // The keyless tier limits requests that carry the default HTTP client's User-Agent.
      const result = await callTool(ENDPOINT, 'web_search', { objective: request.query, search_queries: [request.query] }, { 'user-agent': PACKAGE }, signal)
      if (isObject(result.data) && Array.isArray(result.data['results'])) {
        const sources = result.data['results'].filter(isObject).map((item) => {
          const excerpts = Array.isArray(item['excerpts']) ? item['excerpts'] : []
          return toSource({ url: item['url'], title: item['title'], snippet: excerpts.find(entry => typeof entry === 'string' && entry.trim() !== '') })
        })
        return { sources: uniqueSources(sources), truncated: false }
      }
      if (result.text === undefined) throw new Error('the reply has no results')
      const sources = textResults(result.text)
      if (sources.length === 0) throw new Error(`no results could be read from the reply: ${result.text.slice(0, 200)}`)
      return { sources, truncated: false }
    },
  }
}
