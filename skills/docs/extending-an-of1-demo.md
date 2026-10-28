# Extending an Existing OF1 Demo

Status: Current

You have a working OF1 demo (built via `of1-demo-orchestrator` or `of1-integration`) and want to change one thing — refresh the product catalog, tweak the brand voice, add suggestion chips, restyle the CTA, or simulate a different acquisition channel. **No orchestrator is needed** — every config-producing skill below is standalone-invocable and self-locates the repo/state it needs from `repo-config.json`, the same way it does inside the pipeline.

| Want to change... | Call | Then |
|---|---|---|
| Products, personas, use cases, FAQs, testimonials | `of1-extract-content` | `of1-publish` |
| Brand tone/voice | `of1-extract-brand-voice` | `of1-publish` |
| Suggestion chips / search UI copy | `of1-build-quick-suggestions` | `of1-publish` |
| CTA visual template (pipeline-built demos only) | `of1-build-cta-template` | `of1-publish` |
| Fake acquisition signals (email/ads/LLM referral simulation) | `of1-signals` | **No worker sync**, but **publish** the DA sheet `of1/config/signals` (the skill previews it; the edge proxy on live hosts reads `aem.live`) |

**Orchestrator-built demos need no special flag.** `of1-integration` (run with `cta-template`) writes the CTA template to DA with the rest of the tenant config (config is DA sheets now, not git); for later hand edits, re-run `of1-publish` the same way (`OF1_CTA_TEMPLATE=1`).

For a small hand edit you don't need a skill at all: open the item from the demo hub's DA edit links (`deliverables/index.html`), edit it in DA, then preview + sync (the **Sync OF1** DA app does both in one click).

## Why no orchestrator

Each config skill already reads `repo-config.json` (owner/repo/branch/domain) from the repo it's invoked in and writes straight to its source — a DA document/sheet (`/of1/brand-voice`, `/of1/config/personas`, `/of1/config/suggestions`, `/of1/knowledge/**`) including the CTA template — the same contract the full pipeline uses. See `of1-integration/knowledge/worker-config-schemas.md` (in the **of1-skills** repo) for the DA config layout. There's no setup phase to re-run and no dependency graph to manage for a single change.

## Always finish with deploy

After any config change, redeploy so the change actually reaches the OF1 worker:

1. **`of1-publish`** (with `OF1_CTA_TEMPLATE=1` for demos built with a CTA template — see above) — syncs the OF1 worker (`POST /api/tenants/<id>/sync`), regenerates the demo hub (`deliverables/index.html`, with DA edit links + a status panel), commits, pushes, and re-runs the pre-launch checklist.

There is no separate config review step — authored config lives in DA and is reviewed/edited there; the demo hub links each item.

**Exception: `of1-signals`.** The `of1/config/signals` DA sheet is read directly by the **OF1 preview extension** and the **edge proxy**, not the OF1 worker — it's never synced to the worker, so no worker sync is needed after editing it. The skill uploads and previews the sheet on `main` (enough for the extension and `prev--…of1.live` hosts); nothing is committed to git. It must **also be published**: the edge proxy on live hosts (`main--<repo>--<owner>.of1.live`, also `--dev`) reads the sheet from `aem.live`, so an unpublished edit never reaches them. Publish it from DA (**Publish** on `/of1/config/signals`), via `POST https://admin.hlx.page/live/<owner>/<repo>/main/of1/config/signals.json` (see the skill's step 5), or as part of a full `of1-skills:of1-publish` run with `publish-live` (`OF1_PUBLISH_LIVE=1`), which publishes all config sheets including `signals`.
