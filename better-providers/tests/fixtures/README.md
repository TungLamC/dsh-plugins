# Fixtures

Provider responses the adapters are tested against. Every value read with an
account is synthetic: no token, account id, e-mail or real usage figure.

- `pi-dev/*.json`: `pi.dev/api/models/providers/<id>` for `openai-codex`,
  `kimi-coding` and `xai`, verbatim (October 2026). The catalog is public and read
  without an account. Against pi-ai 1.4.0's catalog, `openai-codex` adds
  `gpt-6.1-terra`, `kimi-coding` adds `k3.1-pro` and `k3.1-pro-highspeed`, and
  `xai` adds nothing.

- `codex/usage.json`, `codex/reset-credits.json`: the shape of
  `chatgpt.com/backend-api/wham/usage` and `…/rate-limit-reset-credits` as observed
  for a ChatGPT Pro sign-in (October 2026), with made-up values.
- `codex/consume.json`: written by hand; redeeming a reset card was not tried on a
  real account.
- `codex/stream.sse`: written by hand; the shortest `chatgpt.com/backend-api/codex/responses`
  event stream pi-ai's Codex protocol reads as a complete answer.
- `xai/*.json`: written by hand after the fields Grok Build reads; not observed on a
  real account.
