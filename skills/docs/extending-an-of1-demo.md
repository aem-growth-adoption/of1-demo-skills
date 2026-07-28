# Extending an Existing OF1 Demo

You have a working OF1 demo (built via `of1-demo`/`of1-demo-cc` or `of1-adopt`) and want to change one thing — refresh the product catalog, tweak the brand voice, add suggestion chips, restyle the CTA, or simulate a different acquisition channel. **No orchestrator is needed** — every config-producing skill below is standalone-invocable and self-locates the repo/state it needs from `repo-config.json`, the same way it does inside the pipeline.

| Want to change... | Call | Then |
|---|---|---|
| Products, personas, use cases, FAQs, testimonials | `of1-content-metadata` | `of1-config-review` → `of1-deploy` |
| Brand tone/voice | `of1-brand-voice-extractor` | `of1-config-review` → `of1-deploy` |
| Suggestion chips / search UI copy | `of1-quick-suggestions` | `of1-config-review` → `of1-deploy` |
| CTA visual template | `of1-cta-template-builder` | `of1-config-review` → `of1-deploy` |
| Fake acquisition signals (email/ads/LLM referral simulation) | `of1-signals` | **No redeploy** — extension-only config, never synced to the OF1 worker |

## Why no orchestrator

Each config skill already reads `repo-config.json` (owner/repo/branch/domain) from the repo it's invoked in and writes directly to `of1/config/*.json` — the same contract the full pipeline's Track B steps use. There's no setup phase to re-run and no dependency graph to manage for a single-file change.

## Always finish with config-review + deploy

After any config change, regenerate the review page and redeploy so the change actually reaches the OF1 worker:

1. **`of1-config-review`** — regenerates `deliverables/config-review.html` from whatever's currently in `of1/config/`.
2. **`of1-deploy`** — commits, pushes, syncs the OF1 worker (`POST /api/tenants/<id>/sync`), and re-runs the pre-launch checklist.

**Exception: `of1-signals`.** `signals.json` is read directly by the OF1 **preview extension**, not the OF1 worker — it's never synced, so no `of1-deploy` step is needed after editing it. Just push the file and the extension picks it up on next load.
