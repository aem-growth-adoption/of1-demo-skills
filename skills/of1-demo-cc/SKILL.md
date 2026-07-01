---
name: of1-demo-cc
description: "Claude Code ONLY orchestrator for the OF1 demo pipeline. DO NOT USE IN SLICC — use of1-demo instead."
user-invocable: false
---

# OF1 Demo — Claude Code Orchestrator

Turns any website into a branded OF1 generative-search demo on Adobe Edge Delivery Services. 13 steps. Auto-approves by default; user can interrupt to revise any step.

**🚫 SLICC HARD GATE: This skill is ONLY for Claude Code. If you are running in SLICC, STOP IMMEDIATELY and use the `of1-demo` skill instead.** This skill uses Claude Code-specific primitives (Agent dispatch, TaskCreate) that do not exist in SLICC. Using it in SLICC will produce broken orchestration with no progress tracking and no scoop dispatch. There is zero reason to use this skill in SLICC.

## Entry

The user invokes you with a target domain — e.g. "one-shot demo for frescopa.coffee" or "/of1-demo-cc frescopa.coffee". Extract:

- `DOMAIN` — bare hostname (no protocol, no path). Required.
- `MODE` — `one-shot` (default) or `step` (pause for review between every step). Default to `one-shot` unless the user explicitly says "pause", "wait for my review", or "step by step".

If `DOMAIN` is missing, ask the user once using `AskUserQuestion`, then proceed.

## Phase 0 — Verify dependencies (inline)

Invoke the `of1-setup` skill via the **Skill tool** (not Agent — this is light and must run in your context to read the verified state). If it fails, surface the exact error and stop.

After it succeeds, read `<STATE_DIR>/setup.json` to get `stateDir` and `of1Repo` absolute paths. Use these for all subsequent steps.

## Phase 1 — Initialize task list

Use **TaskCreate** with one task per pipeline step:

```
1.  Setup           (already done if you got here)
2.  Repo setup      — set up EDS repo + create demo branch
3.  Discovery       — crawl site, propose narrative
4.  Extraction      — design tokens, logo, screenshots (parallel with 3)
5.  Prototype       — pixel-perfect HTML (needs 3 + 4)
6.  Snowflake       — convert prototypes to EDS pages
7.  Templates       — 25 branded templates (base + fan-out: 5 intents + assemble)
8.  OF1 styling     — generative-block CSS + /of1 page setup (needs 6)
9a. Brand voice     — voice extraction (parallel)
9b. Content meta    — products, personas, FAQs + image upload (parallel)
10. Suggestions     — search chips + UI copy (parallel)
11. CTA template    — branded CTA JSON (parallel)
12. Config review   — generate review page (inline; needs 9a + 9b + 10 + 11)
13. Deploy          — push, sync, pre-launch checklist
```

Mark task 1 completed immediately. Mark each task `in_progress` when its dispatch begins and `completed`/`failed` when the Agent returns.

## Phase 2 — Run the pipeline

**Completion tracking:** Maintain a mental ledger of which steps have returned `"status": "done"`. Before dispatching ANY step, verify its prerequisites are ALL in the "done" set. If you're unsure, do NOT dispatch — wait for the pending Agent results first.

The dependency graph and parallelism rules:

```
2  →  3 ∥ 4  →  5  →  ┬─ 6  →  ┬─ 7-base → 7a ∥ 7b ∥ 7c ∥ 7d ∥ 7e  →  7-assemble  ─┐
                      │        └─ 8                                                   │
                      └─ 9a ∥ 9b ∥ 11  →  10  →  12  ───────────────────────────────┴─→  13
```

**Parallelism is mandatory** — at each fan-out point, dispatch all eligible step Agents **in a single message with multiple Agent tool-use blocks**. Do NOT serialize what the graph says is parallel.

**HARD RULE — dependency enforcement:** You MUST NOT dispatch a step until ALL of its listed prerequisites have returned `done`. No exceptions. No "it's probably fine." Wait for the Agent result, confirm `"status": "done"`, THEN dispatch the next step. Violating this corrupts the pipeline output.

| Trigger (ALL must be done) | Dispatch in one message |
|---------|-------------------------|
| Step 2 done | Step 3 AND Step 4 |
| Steps 3 + 4 done | Step 5 |
| Step 5 done | Step 6 AND Steps 9a, 9b, 11 (4 agents in one message) |
| Step 6 done | Step 7-base AND Step 8 (Step 7-base must finish before intent fan-out) |
| Step 7-base done | Steps 7a–7e (5 intent agents in one message) |
| Steps 9a + 9b done | Step 10 (needs products.json + brand-voice.json) |
| Steps 7a–7e all done | Step 7-assemble (1 agent, sequential) |
| Steps 9a + 9b + 10 + 11 ALL done | Step 12 (inline — do NOT run until all four are confirmed done) |
| Steps 7-assemble + 8 + 12 ALL done | Step 13 |

**Common mistakes to avoid:**
- Do NOT run Step 12 as soon as 9a finishes — it needs 9a + 9b + 10 + 11 ALL completed.
- Do NOT run Step 7-base before Step 6 returns — 7 reads from 6's output files.
- Do NOT run Step 10 before BOTH 9a and 9b return — it needs both brand-voice.json and products.json.

### Step 7 fan-out detail

Step 7 (template generation) is split into 7 dispatches across 3 phases:

- **7-base (sequential, 1 agent):** runs `of1-template-generation` with `OF1_TG_MODE=base`. Generates `styles/of1-template-base.css` from the prototype CSS — the shared design tokens all 25 per-template CSS files `@import`. Must finish before intent agents start so they can read the tokens.
- **7a–7e (parallel, 5 agents):** each runs the same skill with `OF1_TG_MODE=intent` and `OF1_TG_INTENT` set to one of `comparison`, `recommendation`, `deep-dive`, `budget`, `discovery`. Each writes only its own `templates/of1-{intent}-*` + `styles/of1-{intent}-*` files. No git operations.
- **7-assemble (sequential, 1 agent):** same skill with `OF1_TG_MODE=assemble`. Verifies base CSS exists, assembles the fully-inlined catalog, runs `fill-template.py`, installs the gallery, and commits everything in one push.

### Pre-fan-out: capture EDS visual references (inline, orchestrator turn)

After Step 6 returns `done` and before dispatching 7-base, screenshot every prototype page as rendered by EDS. The intent agents read these from disk to match their templates to the full rendered design system.

```bash
PROTOTYPE_PAGES=$(ls "${OF1_REPO}/deliverables/"prototype-*.html 2>/dev/null \
  | xargs -n1 basename | sed 's/\.html$//')

OWNER=$(jq -r .owner "$OF1_STATE_DIR/repo-config.json")
REPO=$(jq -r .repo "$OF1_STATE_DIR/repo-config.json")

for PAGE in $PROTOTYPE_PAGES; do
  URL="https://${BRANCH}--${REPO}--${OWNER}.aem.page/${PAGE}"
  REF="${OF1_REPO}/deliverables/eds-${PAGE}.png"
  playwright-cli open "$URL"
  sleep 6
  playwright-cli screenshot --fullPage=true --filename "$REF"

  if [ -s "$REF" ] && [ "$(stat -f%z "$REF" 2>/dev/null || stat -c%s "$REF")" -gt 51200 ]; then
    echo "EDS reference saved: $REF"
  else
    echo "WARN: EDS screenshot for ${PAGE} empty/missing — intent agents fall back to HTML/CSS alone"
  fi
done
```

Do NOT commit these PNGs. They're local reference material. If screenshots fail, intent agents fall back to prototype HTML + CSS alone — degraded fidelity but functional.

If any 7a–7e fails, retry just that one; don't re-run the others. If `7-assemble` fails, re-run it alone — intent outputs are intact.

### Step 9 split

Steps 9a and 9b are independent — both consume Step 4's extraction output and produce different files. Dispatch both in the same message as Steps 10 + 11 (4 agents total after Step 5).

## Model assignment per step

Each `Agent` dispatch MUST pass an explicit `model` parameter. Default inheritance puts every sub-agent on Opus, which is wasteful.

**Required model versions:**
- `opus` → Claude Opus 4.6 v1 1M context (`us.anthropic.claude-opus-4-6-v1[1m]`)
- `sonnet` → Claude Sonnet 5 (`us.anthropic.claude-sonnet-5`)

⚠️ Do NOT use `haiku` — it resolves to a smaller model insufficient for this pipeline.

| Step | Model | Why |
|------|-------|-----|
| 2 — branch setup | `sonnet` | Mechanical: git ops + write config JSON. |
| 3 — discovery | `opus` | Brand/narrative synthesis from crawled pages. Drives demo story. |
| 4 — extraction | `opus` | Design-token extraction. Wrong tokens cascade everywhere. |
| 5 — prototype | `opus` | Pixel-perfect HTML requiring visual judgment. |
| 6 — snowflake | `opus` | Invokes the adobe snowflake skill. Complex multi-phase conversion requiring precise instruction-following. |
| 7-base | `sonnet` | Reads prototype CSS → writes `:root` tokens. Structured extraction. |
| 7a–7e — template intents | `sonnet` | Structured generation from a clear pattern. 5 parallel = biggest cost block. |
| 7-assemble | `sonnet` | Runs scripts + one commit. Bump to `opus` if quality dips. |
| 8 — OF1 styling | `opus` | CSS generation + /of1 page setup. Must follow multi-step instructions precisely (copy base CSS, patch scripts.js, copy fragments, upload DA content). Sonnet deviates from the procedure. |
| 9a — brand voice | `sonnet` | Synthesis from existing extraction JSON. |
| 9b — content metadata | `sonnet` | Scrape product pages + run download-images.py. Structured. |
| 10 — quick suggestions | `sonnet` | Generate 12 chips from discovery narrative. |
| 11 — CTA template | `sonnet` | Generate one JSON file from DESIGN.json tokens. |
| 13 — deploy + verify | `sonnet` | Scripted sync + verification curls + screenshots. |

**Rule of thumb:** Opus only for steps that author content the downstream pipeline depends on for quality (discovery narrative, extraction tokens, prototype HTML). Everything else should be Sonnet 4.6.

## Step dispatch template

Each step is a single `Agent` call. Sub-agents see none of this conversation — the prompt must be self-contained. **Always pass `model` and `mode: "bypassPermissions"`.**

```
You are executing **Step N (<step-name>)** of the OF1 demo pipeline for `<DOMAIN>`.

## Load the step skill
Read the skill file and follow it as written:
  Read: <absolute path to .claude/skills/<skill>/SKILL.md>

## Environment (export these at the top of your work)
export OF1_STATE_DIR="<stateDir>"
export OF1_DEMO_REPO="<of1Repo>"
export ADOBE_IMS_TOKEN="<token>"    # or: export OF1_TOKEN_FILE="<path>"
export SKILL_DIR="<absolute path to the step skill's directory>"

## Project context
- Branch: <branch>          (from repo-config.json)
- DA owner/repo: <owner>/<repo>  (from repo-config.json)
- Prior step outputs you need: <list specific files>

## Platform notes
- If the skill calls `upskill ...`: STOP — that means a dependency is missing; report failure.
- playwright-cli: the shim at of1-setup/scripts/playwright-cli-shim.sh translates
  legacy syntax (visit/--output) to the modern binary automatically. No manual renames needed.

## Output contract
End your last message with EXACTLY this fenced block (the orchestrator parses it):

```json
{"step": N, "status": "done" | "review" | "failed", "summary": "<one sentence>", "deliverables": [{"url": "...", "label": "..."}]}
```

If status is `failed`, also write what specifically broke and what to retry.
```

### Per-dispatch prompt additions for Step 7

For the base agent:
```
## Mode (Step 7)
- `export OF1_TG_MODE=base`
- Follow the skill's "Mode: base" section.
```

For each intent agent (7a–7e):
```
## Mode (Step 7 fan-out)
- `export OF1_TG_MODE=intent`
- `export OF1_TG_INTENT=<comparison|recommendation|deep-dive|budget|discovery>`
- Follow the skill's "Mode: intent" section. Do NOT generate styles/of1-template-base.css, the catalog, the gallery, or commit anything.
```

For the assemble agent:
```
## Mode (Step 7 fan-out)
- `export OF1_TG_MODE=assemble`
- Follow the skill's "Mode: assemble" section.
- Precondition: all 25 templates/of1-*.html, .metadata.json, .sample.json + styles/of1-*.css exist. Fail fast if missing.
```

## Auto-approve vs review mode

After each step's Agent returns:

- **One-shot mode (default):** Mark task completed. Continue immediately.
- **Step mode:** If the returned status is `review`, call `AskUserQuestion` with "Approve and continue" / "Revise — describe changes".

  On "Revise", re-dispatch the same step's Agent with the user's feedback appended under a `## Revision feedback` section.

The user can interrupt at any time ("revise step N") — re-dispatch with their feedback.

## Step 12 — Config review (inline, no Agent)

**PREREQUISITE GATE:** Do NOT execute this step until you have confirmed ALL FOUR of these steps returned `"status": "done"`: 9a (brand voice), 9b (content metadata), 10 (suggestions), 11 (CTA template). If ANY of these is still running or has not been dispatched yet, WAIT.

Once all four are confirmed done, run inline:

```bash
cd "$OF1_REPO"
python3 "$SKILL_DIR_CONFIG_REVIEW/assets/fill-config-review.py" . "$DOMAIN"
git add deliverables/config-review.html
git commit -m "docs: config review page for $DOMAIN"
git push origin "$BRANCH"
```

(`$SKILL_DIR_CONFIG_REVIEW` = absolute path to `.claude/skills/of1-config-review`.)

Deliverable: `https://<branch>--<repo>--<owner>.aem.page/deliverables/config-review.html`

## Step 13 — Deploy (inline)

After step 12 approved AND steps 7-assemble + 8 done, run step 13 inline (read the `of1-deploy` skill and follow it). The pre-launch checklist has **5 checks** — all must pass:

1. OF1 page loads with styled search UI
2. OF1 nav/footer matches prototype-home
3. All products have ≥2 images
4. Template catalog has 25 of1-* entries across all 5 intents
5. All deliverable URLs return 200

Mark task 13 `completed` only after all 5 pass.

## State files

The orchestrator writes/reads under `<stateDir>/`:

| File | Owner | Purpose |
|------|-------|---------|
| `setup.json` | of1-setup | Verified paths + token source |
| `repo-config.json` | Step 2 | owner, repo, branch, repoDir, domain |
| `step-<N>-summary.json` | Orchestrator (parsed from Agent return) | Step result, for resuming/debug |
| `pipeline.log` | Orchestrator | Append-only dispatch/return log |

You parse each Agent's final JSON block and write it to `step-<N>-summary.json` yourself.

## Failure recovery

If a step returns `failed`:
1. Mark its task `failed` and pause (do NOT dispatch downstream steps).
2. Show the user the failure message.
3. Ask: retry as-is / retry with guidance / skip / abort.
4. On retry, re-dispatch with guidance appended.
5. On skip, only allow if no downstream step structurally depends on it.

## Pipeline audit

After every Agent dispatch returns, record the step's telemetry from the `<usage>` block in the Agent result. The orchestrator tracks this in memory and writes the full audit to `$OF1_STATE_DIR/pipeline-audit.json` after the pipeline finishes (or fails).

### What to record per step

| Field | Source |
|---|---|
| `step` | Step number |
| `name` | Step name (e.g. "repo-setup") |
| `model` | Model used for this dispatch |
| `startedAt` | ISO timestamp when the Agent was dispatched |
| `durationMs` | From the `<usage>` block: `duration_ms` |
| `totalTokens` | From the `<usage>` block: `total_tokens` |
| `toolUses` | From the `<usage>` block: `tool_uses` |
| `status` | From the agent's return JSON (`done` / `review` / `failed`) |
| `summary` | From the agent's return JSON |
| `retries` | Number of retries for this step (0 if first-pass success) |
| `error` | If failed: the failure message. Otherwise `null`. |

### When to write the audit file

Write `$OF1_STATE_DIR/pipeline-audit.json` at **two points**:
1. After step 13 completes (success path)
2. If the pipeline aborts (failure path — partial audit is still useful)

### Capture skill version at pipeline start

Before the first dispatch, record the git hash of the skill plugin so the audit is tied to a reproducible version:

```bash
SKILL_PLUGIN_DIR="<absolute path to the of1-demo-skills plugin root>"
SKILL_VERSION=$(git -C "$SKILL_PLUGIN_DIR" rev-parse --short HEAD 2>/dev/null || echo "unknown")
SKILL_BRANCH=$(git -C "$SKILL_PLUGIN_DIR" branch --show-current 2>/dev/null || echo "unknown")
```

Include both in the audit file's top-level fields.

### Audit file shape

```json
{
  "domain": "<DOMAIN>",
  "skillVersion": "<git short hash of the skill plugin>",
  "skillBranch": "<branch name of the skill plugin>",
  "startedAt": "<ISO timestamp of first dispatch>",
  "completedAt": "<ISO timestamp of last step return>",
  "totalTokens": <sum across all steps>,
  "totalDurationMs": <wall-clock from start to finish>,
  "stepCount": <number of dispatches including retries>,
  "steps": [
    {
      "step": 2,
      "name": "repo-setup",
      "model": "sonnet",
      "startedAt": "...",
      "durationMs": 12400,
      "totalTokens": 3200,
      "toolUses": 8,
      "status": "done",
      "summary": "branch + repo-config ready",
      "retries": 0,
      "error": null
    }
  ]
}
```

### Improvements section (append after completion)

After writing the audit, analyze the run and append an `improvements` array to `pipeline-audit.json`. For each step that had issues — retries, high token usage relative to its task complexity, unexpectedly long duration, or a `failed` status that was recovered — write a brief, actionable observation:

```json
{
  "improvements": [
    {
      "step": 5,
      "issue": "Prototype generation took 14 min (3× expected) — agent re-generated the full page 4 times instead of iterating on specific sections",
      "suggestion": "Add a 'targeted fix only — do not regenerate the full page' instruction to the stardust:prototype invocation"
    },
    {
      "step": 9,
      "issue": "Content-metadata retried 2× — download-images.py failed on first run because products.json had 3 products with only external CDN URLs (no source images found on detail pages)",
      "suggestion": "Have the extraction step (4) capture more image URLs per product page upfront, or fall back to listing-page carousel images when detail pages have <2"
    }
  ]
}
```

Rules for the improvements section:
- Only include steps that had actual problems (retries, failures, token spend >2× the expected range from the model table, duration >3× expected)
- Be specific: name the exact behavior that went wrong, not generic "could be better"
- Each `suggestion` should be a concrete change to a skill or dispatch prompt — something actionable for the next pipeline run
- If the run was clean (no retries, all steps within expected bounds), write `"improvements": []` — don't invent issues
- This section is for pipeline-level learning; skill-level bugs should be filed as skill edits, not left as audit notes

## Notes

- Resuming across sessions is not yet implemented (state files exist but resume logic would need to read `step-<N>-summary.json` and rebuild the task list).
- One domain at a time. No multi-tenant parallel pipelines.
