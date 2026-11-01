# dsh-web-access

English | [中文](README.zh.md)

Search for DeepSeek Harness (dsh)'s `web_search`. dsh calls only the one search provider `web.searchProvider` names and never falls back to another; this plugin registers the provider `web-access`, which tries the enabled tiers in a fixed order: a tier not set up is skipped, and one that fails, runs out of time or finds nothing hands over to the next.

## Install

```bash
dsh plugin --profile <profile> add 'github:TungLamC/dsh-plugins#<tag>&path:/web-access'
```

Make sure `dsh.profile.bundles` in the profile's `package.json` lists `dsh-web-access`, then restart dsh.

## Tiers

| Tier | Service | Takes part when | Default |
|---|---|---|---|
| Codex | ChatGPT Codex's built-in search | the Models page has `openai-codex`, signed in with a ChatGPT account | on |
| OpenAI | the OpenAI API's built-in search (the Responses API's `web_search` tool) | the Models page has `openai`, with an API key or a ChatGPT sign-in | off |
| Gemini | the Gemini API's grounding with Google Search | the Models page has `google`, with an API key | off |
| Exa | Exa's public MCP endpoint, no key | always | on |
| Parallel | Parallel's public MCP endpoint, no key | always | on |
| AnySearch | AnySearch's search API, anonymous | always | on |

- The first three are hosted searches: a model searches on the provider's side and writes a short cited answer. The answer is the result's `content`; the pages it cites and read are its `sources`.
- A hosted tier's key or sign-in follows its route on the Models page, in the order dsh uses for model requests:
  - the credential the route's `apiKeyEnv` names, if set;
  - otherwise the key or account sign-in stored for the route;
  - otherwise the provider's own environment variable (`OPENAI_API_KEY`, `GEMINI_API_KEY`).
- The route's `baseURL` and `headers` apply too. An expired ChatGPT sign-in is refreshed inside the credential lock, on the same path dsh refreshes it before a model request.
- This plugin has no sign-in UI. To sign in with a ChatGPT account, install dsh-better-providers and sign in on the Models page.
- OpenAI and Gemini bill per search, so they start off; Codex uses your ChatGPT subscription's limits.
- A result does not say which tier it came from. Which tier answered, and why one failed, goes to the Host log (`web search: answered by codex` and the like). When every tier fails, the error the model sees lists each tier's reason.

## Settings

The plugin's page on the Plugins page lists the six tiers in the order they are tried. Each has a switch; the three hosted tiers also have a model menu:

- **Automatic**: Codex and OpenAI take the newest luna model, else the newest mainline one (such as `gpt-6`), never pro or ultra; Gemini takes the newest stable Flash.
- **The choices**: the models of the tier's route on the Models page. Without the route the menu reads "Not on Models page".
- **A chosen model that was removed**: treated as automatic, with a line in the log.
- **Reasoning effort**: `low` when the model offers it (`web_search` refuses `minimal`).

The settings live in the `web-access` row of the profile's `cordis.patch.yml` and apply to the next search, without a restart. Fields:

- `codex`, `openai`, `gemini`, `exa`, `parallel`, `anysearch`: the switches.
- `codexModel`, `openaiModel`, `geminiModel`: model ids; unset is automatic.

The plugin's patch sets `web.searchProvider` to `web-access`. Turning on "Use the new Web Search API" in dsh's own Built-in plugin settings → Web search switches search to DeepSeek's API, leaving this plugin out; turning it off brings it back.

## Time

dsh gives one `web_search` call 60 seconds, for up to 4 queries run at once. This plugin spends at most 58 seconds on a query:

- every enabled keyless tier keeps 8 seconds;
- the hosted tiers share the rest: one that fails fast leaves its time to the next, and no hosted tier starts with less than 10 seconds left.

With all six on, the hosted tiers share about 34 seconds; Codex alone gets 58.

## External services

The query goes to each enabled tier's service. Exa's and Parallel's keyless endpoints limit requests per IP; a limited request moves on to the next tier.

The service requests and the reading of their replies follow [pi-web-access](https://github.com/nicobailon/pi-web-access) 0.46.0 (MIT); see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). When a service changes its API, check how a newer pi-web-access handles it.

## dsh behaviour this relies on

Built against dsh 0.2.1-rc.5; check these when upgrading:

- **The search provider seam**: `ctx.web.registerSearchProvider` of `@deepseek-ai/dsh-web`. A request carries only `query` and `maxResults`; `available()` is synchronous and offline; dsh picks the provider `web.searchProvider` names and does not fall back.
- **Errors**: thrown as the host's own `WebError`, so `@deepseek-ai/dsh-web` is a peer dependency.
- **The `web_search` tool** (`dsh-tool-web`): up to 4 queries at once, `searchTimeoutMs` 60 seconds (set in the presets of `dsh-base` and `dsh-web-app`). One failed query aborts the rest of its batch, so the provider fails only when every tier did.
- **llm-pi-ai's routes**: `apiKeyEnv`, `baseURL` and `headers` of `providers.<route>`, the sign-in record `llm-pi-ai/<route>` (`api-key` or `grant`), and the order credentials resolve in. Models and reasoning efforts are read through `ctx.llm.listModels` and `ctx.llm.resolveModelInfo`.
- **Codex request headers**: as pi-ai sends Codex requests (`chatgpt-account-id`, `originator`, `OpenAI-Beta`).
- **The settings page**: the Plugins page's `plugins.bundle.config` slot and dsh's shared settings form; dsh generates no page from a config schema.

## Development

From the repository root: `pnpm build`, `pnpm test`.

- **Unit tests**: the chain (order, skipping, fallback, time, cancellation, the combined error), routes (credential order, refresh, environment variables), each tier's requests and replies, model picking, and the settings page's model menus.
- **Contract tests**: the built plugin with dsh's WebRuntime, LlmRuntime and llm-pi-ai, faking only the network, the sign-in and the settings; and the browser bundle loaded the way dsh's module loader loads it.

Manual checks:

1. With only Exa on, have a model search for recent news: the Host log has `web search: answered by exa`.
2. Sign in to `openai-codex` with a ChatGPT account and turn Codex on: the result opens with a cited answer, and the log has `answered by codex`.
3. Add `openai` or `google` on the Models page with a key, turn its tier on and pick a model: the log has `answered by openai` or `answered by gemini`.
4. Turn the `web-access` row off on the Plugins page: the settings disappear and `web_search` fails with `WEB_PROVIDER_CONFIGURED_MISSING`; turning it back on restores both.
