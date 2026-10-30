# Fixtures

Provider responses the adapters are tested against. Every value is synthetic: no
token, account id, e-mail or real usage figure.

- `codex/usage.json`, `codex/reset-credits.json`: the shape of
  `chatgpt.com/backend-api/wham/usage` and `…/rate-limit-reset-credits` as observed
  for a ChatGPT Pro sign-in (October 2026), with made-up values.
- `codex/consume.json`: written by hand; redeeming a reset card was not tried on a
  real account.
- `xai/*.json`: written by hand after the fields Grok Build reads; not observed on a
  real account.
