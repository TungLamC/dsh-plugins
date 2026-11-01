/**
 * AnySearch's search API, which takes anonymous requests.
 *
 * The request and the reading of replies follow pi-web-access 0.46.0
 * (`anysearch.ts`), Copyright (c) 2025 Nico Bailon, MIT License; see THIRD_PARTY_NOTICES.md.
 */

import type { WebSearchResult } from '@deepseek-ai/dsh-web'
import type { Tier } from '../chain.ts'
import { httpFailure, isObject, parseJson, postJson } from '../kit/http.ts'
import { toSource, uniqueSources } from '../kit/sources.ts'
import { resultCount } from './mcp.ts'

const ENDPOINT = 'https://api.anysearch.com/v1/search'

export function anysearchTier(): Tier {
  return {
    hosted: false,
    prepare: async () => async (request, signal): Promise<WebSearchResult> => {
      const response = await postJson(ENDPOINT, { query: request.query, max_results: resultCount(request.maxResults) }, {}, signal)
      if (!response.ok) throw await httpFailure(response)
      const reply = parseJson(await response.text())
      // Success is `code` 0 with `data.results`; anything else carries a code and a message.
      const data = isObject(reply) && reply['code'] === 0 && isObject(reply['data']) ? reply['data'] : undefined
      if (data === undefined || !Array.isArray(data['results'])) {
        const fields = isObject(reply) ? reply : {}
        const message = typeof fields['message'] === 'string' ? `: ${fields['message']}` : ''
        throw new Error(isObject(reply) ? `the service answered code ${String(fields['code'])}${message}` : 'the reply is not JSON')
      }
      const sources = data['results'].filter(isObject).map(item => toSource({ url: item['url'], title: item['title'], snippet: item['snippet'] }))
      return { sources: uniqueSources(sources), truncated: false }
    },
  }
}
