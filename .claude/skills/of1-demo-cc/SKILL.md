---
name: of1-demo-cc
description: Orchestrate the OF1 generative-search demo pipeline end-to-end for any website. Claude Code variant — uses Agent dispatch for sub-skills and TaskCreate for progress. Invoke as "/of1-demo-cc <domain>" or "one-shot a demo of <domain>".
---

# OF1 Demo — Claude Code Orchestrator

Turns any website into a branded OF1 generative-search demo on Adobe Edge Delivery Services. 13 steps. Auto-approves by default; user can interrupt to revise any step.

This is the Claude Code variant of `of1-demo` (which targets SLICC). See [Differences from SLICC variant](#differences-from-slicc-variant) at the bottom if you've worked on the SLICC orchestrator.

## Entry

The user invokes you with a target domain — e.g. "one-shot demo for frescopa.coffee" or "/of1-demo-cc frescopa.coffee". Extract:

- `DOMAIN` — bare hostname (no protocol, no path). Required.
- `MODE` — `one-shot` (default) or `step` (pause for review between every step). Default to `one-shot` unless the user explicitly says "pause", "wait for my review", or "step by step".

If `DOMAIN` is missing, ask the user once using `AskUserQuestion`, then proceed.

## Phase 0 — Verify dependencies (inline)

Invoke the `of1-setup` skill via the **Skill tool** (not Agent — this is light and must run in your context to read the verified state). If it fails, surface the exact error and stop.

After it succeeds, read `<STATE_DIR>/setup.json` to get `stateDir` and `of1Repo` absolute paths. Use these for all subsequent steps.

## Phase 1 — Initialize task list

Use **TaskCreate** with one task per pipeline step. This is the user-facing progress surface:

```
1.  Setup           (already done if you got here)
2.  Branch setup    — create branch on of1-demo repo
3.  Discovery       — crawl site, propose narrative
4.  Extraction      — design tokens, logo, screenshots (parallel with 3)
5.  Prototype       — pixel-perfect HTML (needs 3 + 4)
6.  Snowflake       — convert prototypes to EDS pages
7.  Templates       — 25 branded templates (fan-out: 5 intents + assemble)
8.  OF1 styling     — generative-block CSS (needs 6; commits AFTER 6)
9a. Brand voice     — voice extraction (parallel)
9b. Content meta    — products, personas, FAQs + parallel image upload (parallel)
10. Suggestions     — search chips + UI copy (parallel)
11. CTA template    — branded CTA JSON (parallel)
12. Config review   — generate review page (inline; needs 9a + 9b + 10 + 11)
13. Deploy          — push, sync, pre-launch checklist
```

The user-facing task list can show 9 as a single row that completes only when both 9a and 9b finish — or show them separately, your choice.

Mark task 1 completed immediately. Mark each task `in_progress` when its dispatch begins and `completed`/`failed` when the Agent returns.

## Phase 2 — Run the pipeline

The dependency graph and parallelism rules:

```
2  →  3 ∥ 4  →  5  →  ┬─ 6  →  ┬─ 7a ∥ 7b ∥ 7c ∥ 7d ∥ 7e  →  7-assemble  ─┐
                      │        └─ 8                                       │
                      └─ 9a ∥ 9b ∥ 10 ∥ 11  →  12  ─────────────────────┴─→  13
```

**Parallelism is mandatory** — at each fan-out point, dispatch all eligible step Agents **in a single message with multiple Agent tool-use blocks**. Do NOT serialize what the graph says is parallel.

| Trigger | Dispatch in one message |
|---------|-------------------------|
| Step 2 done | Step 3 AND Step 4 |
| Step 5 done | Step 6 AND Steps 9a, 9b, 10, 11 (5 agents in one message) |
| Step 6 done | Steps 7a–7e (5 intent agents) AND Step 8 — 6 agents in one message |
| Steps 7a–7e all done | Step 7-assemble (1 agent, sequential after the fan-out) |
| Steps 7-assemble + 8 done AND Step 12 approved | Step 13 |

### Step 7 fan-out detail

Step 7 (template generation) used to be a single ~22-minute agent. It is now split into 6 dispatches:

- **Pre-fan-out (inline, orchestrator turn):** capture **every** prototype page's EDS-rendered visual reference. The 5 intent agents need to see the *actual* rendered design system across all page types (home → hero patterns, listing → card grids, detail → fact lists / tabs), not just one screenshot of home.
- **7a — 7e (parallel intent agents):** each runs the `of1-template-generation` skill with `OF1_TG_MODE=intent` and `OF1_TG_INTENT` set to one of `comparison`, `recommendation`, `deep-dive`, `budget`, `discovery`. Each writes only its own `templates/of1-{intent}-*.{html,metadata.json,sample.json}` + `styles/of1-{intent}-*.css` files. No git operations.
- **7-assemble (sequential after 7a–7e):** runs the same skill with `OF1_TG_MODE=assemble`. Writes `styles/of1-template-base.css` directly from the prototype CSS files (no script — see the template-generation skill's "Mode: assemble § 1"), assembles the fully-inlined catalog, runs `fill-template.py`, installs the gallery, and commits everything in one push.

### Pre-fan-out: capture EDS visual references for ALL prototypes (inline)

After Step 6 returns `done` and before dispatching 7a–7e, screenshot every page in `deliverables/prototype-*.html` as rendered by EDS. The 5 intent agents read these from disk — `prototype-home` gives hero/section rhythm, listing pages give card grids, detail pages give fact lists and tabbed content. Templates that draw from all three feel native to the site; templates that only see home tend to look like generic landing pages.

```bash
PROTOTYPE_PAGES=$(ls "${OF1_REPO}/deliverables/"prototype-*.html 2>/dev/null \
  | xargs -n1 basename | sed 's/\.html$//')

for PAGE in $PROTOTYPE_PAGES; do
  URL="https://${BRANCH}--of1-demo--aem-growth-adoption.aem.page/${BRANCH}/${PAGE}"
  REF="${OF1_REPO}/deliverables/eds-${PAGE}.png"
  playwright-cli open "$URL"
  # Wait for full render — EDS pulls fragments + lazy CSS
  sleep 6
  playwright-cli screenshot --full-page --filename "$REF"

  if [ -s "$REF" ] && [ "$(stat -f%z "$REF" 2>/dev/null || stat -c%s "$REF")" -gt 51200 ]; then
    echo "EDS reference saved: $REF"
  else
    echo "WARN: EDS screenshot for ${PAGE} looks empty/missing — intent agents will fall back to that prototype's HTML/CSS alone"
  fi
done
```

Do NOT commit this PNG. It's local reference material for the intent agents; deliverables that need to be public are committed by `7-assemble`. If the screenshot fails (preview not ready, playwright timeout), the intent agents fall back to the prototype HTML + CSS files alone — degraded fidelity but still functional.

Dispatch all 5 intent agents in the **same message** as Step 8 (6 parallel `Agent` calls total). When all 6 return, dispatch `7-assemble` as a 7th call.

If any 7a–7e fails, retry just that one; don't re-run the others. Once all 5 intent agents are `done`, dispatch `7-assemble`. If `7-assemble` fails, fix and re-run it alone — the intent outputs are intact.

### Step 9 split

Step 9 used to be a single agent that ran `of1-brand-voice-extractor` and `of1-content-metadata` back-to-back (~12 min). They're independent — both consume Step 4's extraction output and produce different files — so split into two parallel agents:

- **9a:** runs `of1-brand-voice-extractor` only. Produces `of1/config/brand-voice.json`. ~1–2 min.
- **9b:** runs `of1-content-metadata` only. Produces `of1/config/{products,personas,use-cases,features,faqs}.json` and uploads all product images via `download-images.py` (concurrent, 8 workers — see that skill's "Step 9b — Parallel batch download + upload" section). ~3–5 min.

Dispatch both in the same message as Steps 10 + 11 (4 agents in one message after Step 5).

**The content-metadata agent MUST use `download-images.py`, NOT a per-image curl loop.** The skill documents this; if the agent tries to loop curl by hand, it will take 12 minutes for a 50-image catalog instead of 2. Inject this reminder explicitly in the agent prompt:

```
## Image-upload performance requirement (Step 9b)
You MUST use `python3 <skill-dir>/assets/download-images.py --update-products`
for image download + DA upload. It runs 8 concurrent workers and finishes in
~2 min for 50 images. Do NOT loop `curl` per image — the previous pipeline
revision did this and it took 12 minutes per run.
```

**Per-dispatch prompt additions for Step 7:** Add these lines to the standard dispatch template prompt:

For each intent agent (7a–7e):
```
## Mode (Step 7 fan-out)
- `OF1_TG_MODE=intent`
- `OF1_TG_INTENT=<comparison|recommendation|deep-dive|budget|discovery>`
- Export these env vars at the start of your work and follow the skill's "Mode: intent" section. Do NOT generate `styles/of1-template-base.css`, the catalog, the gallery, or commit anything — those are the assemble agent's job.
```

For the assemble agent (7-assemble):
```
## Mode (Step 7 fan-out)
- `OF1_TG_MODE=assemble`
- Export this env var at the start of your work and follow the skill's "Mode: assemble" section.
- `$SKILL_DIR` for the helper scripts is: `/Users/quentinvecchio/workspace/labs/of1-demo-skills-v3/.claude/skills/of1-template-generation` (substitute the absolute path of this skill in your environment).
- Precondition: all 25 `templates/of1-*.html`, `templates/of1-*.metadata.json`, `templates/of1-*.sample.json`, and `styles/of1-*.css` files exist. Fail fast if any are missing.
```

## Model assignment per step

Each `Agent` dispatch MUST pass an explicit `model` parameter. The default (inheriting the orchestrator's model) puts every sub-agent on Opus, which is wasteful — most steps are pattern-matching, scripted-tool-use, or structured generation that Sonnet 4.6 handles equivalently. A representative wknd.site run on all-Opus cost ~$50 and took ~55 min; the assignments below cut both roughly in half.

| Step | Model | Why |
|------|-------|-----|
| 2 — branch setup | `sonnet` | Mechanical: `git checkout`, `git push`, write `of1-endpoint.json`. No reasoning. |
| 3 — discovery | `opus` | Brand/narrative synthesis from crawled pages. Drives the demo story; downstream depends on the judgment quality here. |
| 4 — extraction | `opus` | Design-token + visual-system extraction. Wrong tokens cascade into every prototype/template. |
| 5 — prototype | `opus` | Pixel-perfect HTML generation requiring visual judgment against extracted tokens. |
| 6 — snowflake | `sonnet` | Runs `snowflake-split.py`, copies substrate, installs OF1 block. Scripted. |
| 7a–7e — template intents | `sonnet` | Structured generation following a clear pattern + EDS visual reference. 5 parallel agents, this is the biggest cost block — Sonnet here is the single largest saving. |
| 7-assemble | `sonnet` | Writes `of1-template-base.css` directly from prototype CSS (no script), then runs `assemble-catalog.py` + `fill-template.py` + one commit. The base-CSS authoring is light synthesis but cascades into 25 templates — bump to `opus` here if quality dips. |
| 8 — OF1 styling | `sonnet` | CSS generation matching prototype-home tokens. Has clear reference; not deep reasoning. |
| 9a — brand voice | `sonnet` | Synthesis from existing extraction JSON. |
| 9b — content metadata | `sonnet` | Scrape product pages + run `download-images.py`. Structured. |
| 10 — quick suggestions | `sonnet` | Generate 12 chips from discovery narrative. |
| 11 — CTA template | `sonnet` | Generate one JSON file from DESIGN.json tokens. |
| 13 — deploy + verify | `sonnet` | Scripted sync + verification curls + screenshots. |

**Rule of thumb:** keep Opus only for steps that **author content the downstream pipeline depends on for quality** (discovery's narrative, extraction's tokens, prototype's HTML). Everything else — including template generation, which surprises people — should be Sonnet.

If a Sonnet step produces visibly degraded output in practice, the fix is to bump *that step* to Opus, not the whole pipeline.

## Step dispatch template

Each step is a single `Agent` call. Use this exact prompt template — sub-agents see none of this conversation, so the prompt must be self-contained. **Always pass the `model` parameter** per the table above.

```
You are executing **Step N (<step-name>)** of the OF1 demo pipeline for `<DOMAIN>`.

## Load the step skill
Read the skill file and follow it as written:
  Read: <absolute path to .claude/skills/<skill>/SKILL.md>

## Project context
- Working directory: <of1Repo>
- Branch: <branch>          (from repo-config.json — step 2 sets this)
- DA owner/repo: aem-growth-adoption/of1-demo
- State dir: <stateDir>
- repo-config.json: <stateDir>/repo-config.json (read it)
- Prior step outputs you need: <list specific files>

## CLAUDE CODE PLATFORM OVERRIDES (the step skill was written for SLICC — these supersede)

- **Do not** call `sprinkle send`, `feed_scoop`, `scoop_scoop`, or write `step-N-status.json`. Return your final status as the agent's last message in the format below.
- Replace `/shared/of1-demo/` with `<stateDir>/` everywhere.
- Skills that read `OF1_STATE_DIR` should pick up `<stateDir>` — export it at the top of your work: `export OF1_STATE_DIR="<stateDir>"`.
- Replace `/mnt/da/<branch>/` with the admin.da.live API path:
    `cat file | curl -s -X PUT -H "Authorization: Bearer $DA_TOKEN" -H "Content-Type: text/html" --data-binary @- "https://admin.da.live/source/aem-growth-adoption/of1-demo/<branch>/page.html"`
- Replace `oauth-token adobe` with: `DA_TOKEN=$(jq -r .access_token "$TOKEN_FILE")` (read `TOKEN_FILE` from `<stateDir>/setup.json`). If `tokenFromEnv:true`, use `DA_TOKEN="$ADOBE_IMS_TOKEN"` directly.
- Replace `upskill ...` with: STOP — that means a dependency is missing; report failure.
- Replace `serve --entry <file>` with: `python3 -m http.server` from the file's parent dir, return the local URL.
- **playwright-cli (Playwright agent CLI, not SLICC)**: same binary name, slightly different shape. Apply these renames:
    - `playwright-cli visit <url>`  → `playwright-cli open <url>`
    - `playwright-cli navigate <url>` → `playwright-cli open <url>`
    - `--output <path>` → `--filename <path>`
    - `--tab=<id>` → run `playwright-cli tab-select <id>` first, then call the action without `--tab` (Playwright agent CLI is stateful: tabs are indexed 0,1,2…)
    - `playwright-cli eval "<bare expr>"` → `playwright-cli eval "() => (<bare expr>)"`
    - Unchanged: `screenshot`, `snapshot`, `click`, `fill`, `tab-list`, `tab-new`, `--full-page`, `--headed`, element refs (`e1`, `e2`, …)
  If the host has a transparent shim installed (`<setup-cc-dir>/scripts/playwright-cli-shim.sh`), these renames happen automatically — but injecting them in every sub-agent prompt is the safe default.

## Output contract
End your last message with EXACTLY this fenced block (the orchestrator parses it):

```json
{"step": N, "status": "done" | "review" | "failed", "summary": "<one sentence>", "deliverable": "<url or null>"}
```

If status is `failed`, also write what specifically broke and what to retry.
```

Substitute the bracketed values per step. The "prior step outputs you need" list comes from the dependency map in the SLICC orchestrator (`of1-demo/SKILL.md` § "Context Passing Between Steps") — copy from there per step.

## Auto-approve vs review mode

After each step's Agent returns:

- **One-shot mode (default):** Mark task completed. Continue immediately. Do NOT pause.
- **Step mode:** If the returned status is `review`, call `AskUserQuestion` with two options:
  - "Approve and continue" (default)
  - "Revise — describe changes"

  On "Revise", re-dispatch the same step's Agent with the user's feedback appended to the prompt under a new `## Revision feedback` section.

In both modes, the user can interrupt at any time and say "revise step N" — handle that by re-dispatching with their feedback.

## Step 12 — Config review (inline, no Agent)

Once steps 9 + 10 + 11 are all done, run inline (not via Agent — it's a simple shell invocation):

```bash
cd "$OF1_REPO"
python3 ~/.claude/skills/of1-config-review/assets/fill-config-review.py . "$DOMAIN"
git add deliverables/config-review.html
git commit -m "docs: config review page for $DOMAIN"
git push origin "$BRANCH"
```

Then either auto-approve (one-shot) or `AskUserQuestion` (step mode). Deliverable URL:

```
https://<branch>--of1-demo--aem-growth-adoption.aem.page/deliverables/config-review.html
```

## Step 13 — Deploy + MANDATORY pre-launch checklist (inline)

After step 12 approved AND steps 7 + 8 done, deploy:

```bash
TENANT_ID="${BRANCH}--of1-demo--aem-growth-adoption"
curl -s -X POST "https://of1-gen-web-service.franklin-prod.workers.dev/api/tenants/${TENANT_ID}/sync" \
  -H "Authorization: Bearer $DA_TOKEN"
```

Then run the **4 checks inline** (the SLICC orchestrator's "Step 13 — MANDATORY Pre-Launch Checklist" — copy verbatim):

1. OF1 page loads with styled search UI (screenshot)
2. OF1 nav/footer matches prototype-home (screenshot)
3. All products have ≥2 images (python check on products.json)
4. All quick-link URLs return 200 (curl loop)

Mark task 13 `completed` only after all 4 pass. On any failure, fix the underlying issue, re-deploy, and re-check.

## State files

The orchestrator writes/reads under `<stateDir>/` (replaces SLICC's `/shared/of1-demo/`):

| File | Owner | Purpose |
|------|-------|---------|
| `setup.json` | of1-setup | Verified paths + token source |
| `repo-config.json` | Step 2 | owner, repo, branch, repoDir, domain, daSource |
| `step-<N>-summary.json` | Each step Agent (returned in prompt response, you write to disk) | Step result, for resuming/debug |
| `pipeline.log` | Orchestrator | Append-only log of dispatches and returns |

You parse the step Agent's final JSON block and write it to `step-<N>-summary.json` yourself. This lets you resume mid-pipeline if a step fails — re-run just that step and the ones downstream.

## Failure recovery

If a step returns `failed`:
1. Mark its task `failed` and pause the pipeline (do NOT dispatch downstream steps).
2. Show the user the agent's failure message.
3. Ask: retry as-is / retry with guidance / skip / abort.
4. On retry, re-dispatch the same step Agent (with guidance appended if provided).
5. On skip, only allow it if no downstream step structurally depends on this one (use the dependency graph).

## Differences from SLICC variant

| Thing | SLICC (`of1-demo`) | Claude Code (`of1-demo-cc`) |
|-------|--------------------|-----------------------------|
| Sub-agent dispatch | `scoop_scoop` + `feed_scoop` + poll status file | `Agent` tool, synchronous return |
| Progress UI | Sprinkle (`.shtml` panel + `sprinkle send`) | `TaskCreate` + `TaskUpdate` |
| Review gates | Sprinkle Approve/Revise buttons | `AskUserQuestion` |
| Cross-step state | `/shared/of1-demo/` | `<stateDir>` (project-local, e.g. `.of1/state/`) |
| DA upload | `/mnt/da/<branch>/page.html` (mount) | `curl -X PUT https://admin.da.live/source/...` |
| IMS token | `oauth-token adobe` | `$ADOBE_IMS_TOKEN` env var (or oauth-token if present) |
| Dependency install | `upskill <repo> --force` (mid-session) | Plugin deps resolved at `/plugin install` time; this skill verifies only |
| Serve static page | `serve --entry <file>` | `python3 -m http.server` |
| Parallelism | Spawn N scoops + poll loop | One assistant message with N parallel `Agent` tool calls |

The actual step skills (`of1-discovery`, `of1-extraction`, etc.) are **unmodified** by this prototype — the platform overrides above are injected into each Agent's prompt. If the prototype proves out, the next step is to fold those overrides into a shared section inside each step skill so they apply regardless of runtime.

## Out-of-scope (this prototype)

- Cron / scheduled re-runs
- Multi-tenant parallel pipelines (one DOMAIN at a time)
- Resuming across separate Claude Code sessions (state files exist but resume logic isn't implemented yet — would read `step-<N>-summary.json` files and rebuild the task list on next invocation)
