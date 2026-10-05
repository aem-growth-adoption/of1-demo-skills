# Extending an Existing OF1 Demo

You have a working OF1 demo (built via `of1-demo-orchestrator` or `of1-integration`) and want to change one thing — refresh the product catalog, tweak the brand voice, add suggestion chips, restyle the CTA, or simulate a different acquisition channel. **No orchestrator is needed** — every config-producing skill below is standalone-invocable and self-locates the repo/state it needs from `repo-config.json`, the same way it does inside the pipeline.

| Want to change... | Call | Then |
|---|---|---|
| Products, personas, use cases, FAQs, testimonials | `of1-extract-content` | `of1-publish` |
| Brand tone/voice | `of1-extract-brand-voice` | `of1-publish` |
| Suggestion chips / search UI copy | `of1-build-quick-suggestions` | `of1-publish` |
| CTA visual template (pipeline-built demos only) | `of1-build-cta-template` | `of1-publish` |
| Fake acquisition signals (email/ads/LLM referral simulation) | `of1-signals` | **No redeploy** — extension-only config, never synced to the OF1 worker |

For a small hand edit you don't need a skill at all: open the item from the demo hub's DA edit links (`deliverables/index.html`), edit it in DA, then preview + sync (the **Sync OF1** DA app does both in one click).

## Why no orchestrator

Each config skill already reads `repo-config.json` (owner/repo/branch/domain) from the repo it's invoked in and writes straight to its source — a DA document/sheet (`/of1/brand-voice`, `/of1/config/personas`, `/of1/config/suggestions`, `/of1/knowledge/**`) or, for the CTA template, git `of1/config/cta-template.json` — the same contract the full pipeline uses. See `of1-integration/knowledge/worker-config-schemas.md` (in the **of1-skills** repo) for what lives in git vs DA. There's no setup phase to re-run and no dependency graph to manage for a single change.

## Always finish with deploy

After any config change, redeploy so the change actually reaches the OF1 worker:

1. **`of1-publish`** — asserts the git config set, syncs the OF1 worker (`POST /api/tenants/<id>/sync`), regenerates the demo hub (`deliverables/index.html`, with DA edit links + a status panel), commits, pushes, and re-runs the pre-launch checklist.

There is no separate config review step — authored config lives in DA and is reviewed/edited there; the demo hub links each item.

**Exception: `of1-signals`.** `signals.json` is read directly by the OF1 **preview extension**, not the OF1 worker — it's never synced, so no `of1-publish` step is needed after editing it. Just push the file and the extension picks it up on next load.
