---
name: of1-demo
description: Orchestrate full demo preparation for any website — user-driven step pipeline via sprinkle UI
user-invocable: true
---

# OF1 Demo — Orchestrator

Lightweight orchestrator that opens the demo pipeline sprinkle and dispatches step skills based on user interactions.

## How It Works

1. The sprinkle (`of1-demo`) shows 13 steps as a pipeline
2. User enters a domain and clicks "Run" on each step
3. Each click fires a lick to the cone with `{action: "run:<step>:<skill>:<domain>"}`
4. The cone spawns a scoop to execute the step skill with appropriate context
5. Steps with review gates pause for user approval (Approve/Revise buttons in sprinkle)
6. After step 5 (Prototype), two tracks run in parallel:
   - **Track A (EDS Site):** Step 6 (Snowflake) → Steps 7 (Templates) + 8 (OF1 styling) in parallel after S6
   - **Track B (Config):** Steps 9–11 (Brand & content, Suggestions, CTA) in parallel → Step 12 (Config review)
7. Step 13 (Deploy) requires Track A step 7 done AND Track B step 12 approved

## Setup

Open the sprinkle:

```
scoop_scoop({
  name: "of1-demo",
  writablePaths: ["/scoops/of1-demo/", "/shared/sprinkles/of1-demo/"],
  prompt: "You own the sprinkle 'of1-demo'. Copy /workspace/skills/of1-demo/of1-demo.shtml to /shared/sprinkles/of1-demo/of1-demo.shtml, then run: sprinkle open of1-demo. Stay ready for feed_scoop updates."
})
```

The sprinkle must be open and receiving updates throughout the demo. After each step completes, push the status to it via `sprinkle send of1-demo '<json>'`.

## Lick Events

The sprinkle sends licks as a single `action` string with colon-delimited fields.

### `set-domain:<domain>`
User entered the target domain. Store it for all subsequent steps.

**IMPORTANT:** Setting a new domain automatically resets ALL step states (pending, no deliverables, no summaries). The sprinkle handles this client-side — when `data.domain` differs from `state.domain`, all steps are wiped clean. This means:
- The orchestrator MUST always send `set-domain` FIRST before pushing any step statuses for a new run.
- No manual reset of individual steps is needed — the domain change handles it.
- Quick links are also cleared because they derive from step deliverables.

### `run:<step>:<skill>:<domain>`
User clicked Run on step N. Parse the step number, skill name, and domain from the colon-delimited string. Spawn a scoop to execute the skill.

**Model selection — assign per step, NOT a blanket choice:**

Pass an explicit `model` parameter on every `scoop_scoop()` call. Default-everything-to-Opus was the old rule and made representative runs cost ~$50 / take ~55 min. Most sub-steps are pattern-matching, scripted tool use, or structured generation that Sonnet 4.6 handles equivalently. Use Opus only for the steps whose output quality cascades into everything downstream.

| Step | Model | Why |
|------|-------|-----|
| 2 — branch setup | `claude-sonnet-4-6` | Mechanical: `git checkout`, `git push`, write `of1-endpoint.json`. No reasoning. |
| 3 — discovery | `claude-opus-4-6` | Brand/narrative synthesis from crawled pages. Drives the demo story. |
| 4 — extraction | `claude-opus-4-6` | Design-token + visual-system extraction. Wrong tokens cascade. |
| 5 — prototype | `claude-opus-4-6` | Pixel-perfect HTML generation requiring visual judgment. |
| 6 — snowflake | `claude-sonnet-4-6` | Invokes the adobe `snowflake` skill once per prototype. Thin wrapper. |
| 7a–7e — template intents | `claude-sonnet-4-6` | Structured generation following a clear pattern + EDS visual reference. 5 parallel scoops — biggest cost saving. |
| 7-base | `claude-sonnet-4-6` | Reads prototype CSS → writes `styles/of1-template-base.css` (shared tokens). Sequential, before intent fan-out. |
| 7-assemble | `claude-sonnet-4-6` | Verifies base CSS exists, runs `assemble-catalog.py` + `fill-template.py`, installs gallery, single commit + push. Bump to opus if quality dips. |
| 8 — OF1 styling | `claude-sonnet-4-6` | CSS generation matching prototype-home. Clear reference; not deep reasoning. |
| 9a — brand voice | `claude-sonnet-4-6` | Synthesis from existing extraction JSON. |
| 9b — content metadata | `claude-sonnet-4-6` | Scrape product pages + run `download-images.py`. Structured. |
| 10 — quick suggestions | `claude-sonnet-4-6` | Generate 12 chips from discovery narrative. |
| 11 — CTA template | `claude-sonnet-4-6` | Generate one JSON file from DESIGN.json tokens. |
| 13 — deploy + verify | `claude-sonnet-4-6` | Scripted sync + verification curls + screenshots. |

**Rule of thumb:** keep Opus only for steps that **author content the downstream pipeline depends on for quality** (discovery's narrative, extraction's tokens, prototype's HTML). Everything else — including template generation, which surprises people — should be Sonnet.

If a Sonnet step produces visibly degraded output in practice, bump *that step* to Opus — not the whole pipeline.

**For step 6 (Snowflake), the scoop MUST additionally be created with write access to the project repo AND the DA mount:**
```
scoop_scoop({
  name: "of1-s6",
  model: "claude-sonnet-4-6",
  writablePaths: ["/scoops/of1-s6/", "/shared/", "/workspace/{REPO_NAME}/", "/mnt/da/"]
})
```
This allows the scoop to write blocks, styles, and content directly into the repo AND upload DA content via the mount without permission errors.

**For step 9 (Brand voice + Content metadata), spawn TWO parallel scoops** — see "Step 9 split detail" below:

```
scoop_scoop({
  name: "of1-s9-brand",
  model: "claude-sonnet-4-6",
  writablePaths: ["/scoops/of1-s9-brand/", "/shared/", "/workspace/{REPO_NAME}/"]
})

# Content metadata also needs DA mount access for parallel image uploads.
scoop_scoop({
  name: "of1-s9-content",
  model: "claude-sonnet-4-6",
  writablePaths: ["/scoops/of1-s9-content/", "/shared/", "/workspace/{REPO_NAME}/", "/mnt/da/"]
})
```

Run these in the same orchestrator turn as scoops 10 + 11 (four scoops in one batch after step 5).

**For step 7 (Templates), spawn SEVEN scoops across 3 phases — one `base` scoop + five parallel intent scoops + one `assemble` scoop** (see "Step 7 fan-out detail" below for the rationale):

**Phase 1 — base (sequential, after Step 6):** spawn `of1-s7-base` alongside Step 8. It generates `styles/of1-template-base.css` from the prototype CSS — the shared design tokens all 25 per-template CSS files `@import`. Must finish before intent agents start.
```
scoop_scoop({
  name: "of1-s7-base",
  model: "claude-sonnet-4-6",
  writablePaths: ["/scoops/of1-s7-base/", "/shared/", "/workspace/{REPO_NAME}/"],
  env: { OF1_TG_MODE: "base" }
})
```

**Phase 2 — intent (parallel, after base finishes):** spawn 5 intent scoops once `/shared/of1-demo/step-7-base-status.json` exists. Each runs the same skill with `OF1_TG_MODE=intent` and one of the five intents:
```
for INTENT in comparison recommendation deep-dive budget discovery; do
  scoop_scoop({
    name: "of1-s7-${INTENT}",
    model: "claude-sonnet-4-6",
    writablePaths: ["/scoops/of1-s7-${INTENT}/", "/shared/", "/workspace/{REPO_NAME}/"],
    env: { OF1_TG_MODE: "intent", OF1_TG_INTENT: "${INTENT}" }
  })
done
```
Intent scoops do NOT need DA mount access — they only write to the local repo.

**Phase 3 — assemble (sequential, after all 5 intents finish):** spawn once all five `/shared/of1-demo/step-7-intent-<intent>-status.json` files exist:
```
scoop_scoop({
  name: "of1-s7-assemble",
  model: "claude-sonnet-4-6",
  writablePaths: ["/scoops/of1-s7-assemble/", "/shared/", "/workspace/{REPO_NAME}/"],
  env: { OF1_TG_MODE: "assemble" }
})
```
The assemble scoop verifies `styles/of1-template-base.css` exists, assembles the catalog, runs `fill-template.py`, installs the gallery, and does the single commit + push. It writes the canonical `/shared/of1-demo/step-7-status.json` that the orchestrator pushes to the sprinkle.

**If `env` is not supported by the scoop runtime,** pass the mode + intent in the scoop's system prompt instead — the skill reads them from env first, but the orchestrator can equivalently inject `export OF1_TG_MODE=intent OF1_TG_INTENT=<intent>` at the top of the prompt.

```
feed_scoop("of1-demo-step-N", <system prompt with skill instructions + context>)
```

The system prompt MUST include:
- The domain and branch name
- The repo owner, repo name, and local repo path (from `/shared/of1-demo/repo-config.json`)
- **DA auth instructions** — ALWAYS include this block in every scoop prompt that touches DA:
  ```
  ## DA Auth (CRITICAL — do not deviate)
  - Get IMS token: DA_TOKEN=$(oauth-token adobe)
  - Write DA content — TWO options (mount preferred, API as fallback):
    Option A (preferred): cp file /mnt/da/{branch}/page.html
    Option B (fallback):  cat file | curl -s -X PUT -H "Authorization: Bearer $DA_TOKEN" -H "Content-Type: text/html" --data-binary @- "https://admin.da.live/source/{owner}/{repo}/{branch}/page.html"
  - Trigger preview: curl -X POST -H "Authorization: Bearer $DA_TOKEN" -H "x-content-source-authorization: Bearer $DA_TOKEN" https://admin.hlx.page/preview/{owner}/{repo}/{branch}/{branch}/{page}
  - admin.da.live IS allowed for curl (PUT to write, GET to read)
  - admin.hlx.page IS allowed for curl (preview/publish triggers)
  - DO NOT use npx/da-auth-helper (doesn't exist)
  - DO NOT look for ~/.aem/da-token.json (doesn't exist)
  - Content path: /mnt/da/{branch}/page.html (NOT /mnt/da/{repo}/page.html)
  ```
- How to load the skill:
  - `read_file /workspace/skills/{skill-name}/SKILL.md` — the local skill will instruct the scoop on what to do, including invoking stardust plugins where needed (e.g., steps 4 & 5 call `stardust:extract` and `stardust:prototype` respectively)
- Current working directory context (the project repo)
- Any outputs from previous steps the skill needs
- Instruction to write a completion marker on finish (NOT `sprinkle send` — the step scoop must NOT call sprinkle commands):
  Write output to `/shared/of1-demo/step-N-output.md` and a status file to `/shared/of1-demo/step-N-status.json` with content `{"step":N,"status":"done"}` (or `"review"` or `"failed"`).

**When status is `"review"`, the status JSON MUST include a `deliverable` URL** so the sprinkle renders an open link for the user. The sprinkle renders these as `<a target="_blank">` and the user's browser opens them directly, so the URL must be publicly reachable from a browser tab — typically the EDS preview URL `https://{branch}--{repo}--{owner}.aem.page/...`. Do NOT use `serve --entry` (chrome-extension:// URLs won't open from outside SLICC) — commit the artifact to git and use its hosted URL. Trigger an EDS preview after pushing so the URL returns 200 before the status is sent.

Review steps without a deliverable URL will show the summary but no open link — always include one.

**After spawning the step scoop, YOU must immediately poll for the status file and push to the sprinkle when it appears.** Use a loop:

```bash
while [ ! -f /shared/of1-demo/step-N-status.json ]; do sleep 5; done
cat /shared/of1-demo/step-N-status.json
```

Then read the file and call `sprinkle send of1-demo '<contents>'` immediately.

Only the of1-demo scoop may call `sprinkle send`. Step scoops write files; the orchestrator reads them and pushes to the sprinkle.

## Parallelism — CRITICAL for Speed

The pipeline has TWO parallel tracks that MUST run concurrently. **Do NOT serialize steps that can run in parallel.**

### When to spawn what:

| Trigger | Spawn immediately |
|---------|-------------------|
| Step 5 (Prototype) approved | **Track A:** Step 6 (Snowflake) AND **Track B:** Steps 9, 10, 11 (all three at once) |
| Step 6 (Snowflake) done | Step 8 (OF1 styling) AND Steps 7a–7e (5 intent scoops in parallel) — 6 scoops at once |
| Steps 7a–7e ALL complete | Step 7-assemble — 1 scoop, sequential after the fan-out |
| Steps 9-11 ALL complete | Step 12 (Config review) — run inline by the cone |
| Steps 7-assemble + 8 done AND Step 12 approved | Step 13 (Deploy) |

### Dependency graph:
```
Steps 1→2 (sequential)
         ↓
    ┌────┴────┐
    ↓         ↓
  Step 3    Step 4        ← PARALLEL (both need only domain)
    ↓         ↓
    └────┬────┘
         ↓
       Step 5             ← needs both S3 + S4
         ↓
    ┌────┴────────────┐
    ↓                 ↓
  S6         Track B (S9+S10+S11)
    ↓                 ↓
  ┌─┴────────┐    Step 12
  S8   S7a∥7b∥7c∥7d∥7e
  ↓         ↓
  ↓     S7-assemble       ← runs ONCE after S7a–7e all done
  ↓         ↓             ↓
  └─────────┴─────────────┘
            ↓
       Step 13 (Deploy)
```

### Key rules:
1. **Track B does NOT wait for Step 6** — it starts immediately after Step 5 is approved
2. **Step 8 (OF1 styling) runs AFTER Step 6** — it must not overwrite of1.css that S6 creates. S8 commits last.
3. **Step 7 (Templates) waits for Step 6** — it needs the template CSS structure from the snowflake conversion
4. **Step 7 is FANNED OUT into 5 parallel intent scoops (7a–7e) + 1 assemble scoop** — see "Step 7 fan-out detail" below
5. **Step 8 runs in parallel with Steps 7a–7e** — 6 scoops at once after Step 6
6. **Steps 9, 10, 11 ALL run at once** — spawn all 3 scoops simultaneously
7. **Push each status as it arrives** — don't wait for all parallel steps to finish before updating the sprinkle

### Step 7 fan-out detail

Step 7 (template generation) is split into 7 scoops across 3 phases plus a small inline screenshot step:

- **Pre-fan-out (inline, orchestrator):** capture EDS-rendered visual references of all prototypes so the intent scoops see the actual rendered design system (see "Pre-fan-out: capture EDS visual reference" below).
- **7-base (sequential, 1 scoop):** named `of1-s7-base`. Runs `of1-template-generation` with `OF1_TG_MODE=base`. Generates `styles/of1-template-base.css` from the prototype CSS — the shared design tokens all per-template CSS files `@import`. Writes `/shared/of1-demo/step-7-base-status.json`. Must finish before intent scoops start.
- **7a–7e (parallel, 5 scoops):** named `of1-s7-comparison`, `of1-s7-recommendation`, `of1-s7-deep-dive`, `of1-s7-budget`, `of1-s7-discovery`. Each runs with `OF1_TG_MODE=intent` and `OF1_TG_INTENT=<intent>`. Each writes only its own `templates/of1-{intent}-*` + `styles/of1-{intent}-*` files. **No git operations.** Each writes `/shared/of1-demo/step-7-intent-<intent>-status.json` on completion.
- **7-assemble (sequential after 7a–7e):** named `of1-s7-assemble`. Same skill with `OF1_TG_MODE=assemble`. Verifies base CSS exists, assembles the fully-inlined catalog via `assemble-catalog.py`, runs `fill-template.py`, installs the gallery, single commit + push. Writes the canonical `/shared/of1-demo/step-7-status.json` that the sprinkle reads.

### Pre-fan-out: capture EDS visual reference (inline)

After step 6 returns `done` and before spawning 7a–7e, the orchestrator captures the EDS-rendered prototype-home and writes it to a known local path that all 5 intent scoops will read. This gives the agents the actual rendered styling stack (snowflake + OF1 + EDS base) instead of just the standalone prototype HTML.

```bash
EDS_HOME_URL="https://${BRANCH}--of1-demo--aem-growth-adoption.aem.page/${BRANCH}/prototype-home"
REF_PATH="/workspace/of1-demo/deliverables/eds-prototype-home.png"

playwright-cli visit "$EDS_HOME_URL"
sleep 6
playwright-cli screenshot --full-page --output "$REF_PATH"

[ -s "$REF_PATH" ] && [ "$(stat -c%s "$REF_PATH" 2>/dev/null)" -gt 51200 ] \
  && echo "EDS reference saved: $REF_PATH" \
  || echo "WARN: EDS screenshot looks empty/missing — intent scoops will fall back to prototype-only reference"
```

Do NOT commit this PNG — it's local reference material for the intent scoops only. If the screenshot fails, intent scoops fall back to the prototype HTML + snowflake CSS files (degraded fidelity but still functional).

Spawn 7a–7e and Step 8 in the **same orchestrator turn** (6 scoops total). After all 5 intent status files exist, spawn `of1-s7-assemble`. The sprinkle UI shows a single "Step 7" row; the orchestrator only pushes the step-7 status after `of1-s7-assemble` writes `step-7-status.json`.

**Writable paths for ALL 6 step-7 scoops** (intent and assemble): the project repo (`/workspace/of1-demo/`) and `/shared/`. Intent scoops do not need DA mount access (no uploads from this step).

If any intent scoop fails, retry only that one. If `of1-s7-assemble` fails, fix and re-run it alone — intent outputs are intact.

### Step 9 split detail

Step 9 used to be a single scoop that ran `of1-brand-voice-extractor` and `of1-content-metadata` back-to-back (~12 min). They're independent — both consume Step 4's extraction output and produce different config files — so split into two parallel scoops alongside Steps 10 and 11.

- **`of1-s9-brand`** — runs `of1-brand-voice-extractor`. Produces `of1/config/brand-voice.json`. Writes `/shared/of1-demo/step-9-brand-status.json`. ~1–2 min.
- **`of1-s9-content`** — runs `of1-content-metadata`. Produces `of1/config/{products,personas,use-cases,features,faqs}.json` + uploads all product images. Writes `/shared/of1-demo/step-9-content-status.json`. ~3–5 min.

The content scoop **MUST use `download-images.py`** (parallel: 8 workers, content-type sniffing, mount-or-API fallback) — NOT a per-image `curl` loop. The skill documents this in its Step 9 section; no separate injection needed.

Once both `/shared/of1-demo/step-9-brand-status.json` AND `step-9-content-status.json` exist, the orchestrator merges them into a single `/shared/of1-demo/step-9-status.json` (so the sprinkle's polling loop sees a single completion for Step 9):

```bash
if [ -f /shared/of1-demo/step-9-brand-status.json ] \
   && [ -f /shared/of1-demo/step-9-content-status.json ] \
   && [ ! -f /shared/of1-demo/step-9-status.json ]; then
  BRAND_SUMMARY=$(jq -r .summary /shared/of1-demo/step-9-brand-status.json)
  CONTENT_SUMMARY=$(jq -r .summary /shared/of1-demo/step-9-content-status.json)
  jq -n \
    --arg s1 "$BRAND_SUMMARY" --arg s2 "$CONTENT_SUMMARY" \
    '{step:9, status:"done", summary:($s1 + " | " + $s2)}' \
    > /shared/of1-demo/step-9-status.json
fi
```

### Polling pattern for parallel steps:

```bash
# Poll for all active step status files and push each as it arrives.
# Step 7 has a two-phase shape: 5 intent status files appear first, then the
# orchestrator spawns of1-s7-assemble which writes the canonical step-7 status.
S7_INTENTS="comparison recommendation deep-dive budget discovery"
S7_ASSEMBLE_SPAWNED=false

while true; do
  ALL_DONE=true

  # Step 9 is fanned out into of1-s9-brand + of1-s9-content. Merge their
  # sub-statuses into a single step-9-status.json once both arrive.
  if [ -f /shared/of1-demo/step-9-brand-status.json ] \
     && [ -f /shared/of1-demo/step-9-content-status.json ] \
     && [ ! -f /shared/of1-demo/step-9-status.json ]; then
    BRAND_SUM=$(jq -r .summary /shared/of1-demo/step-9-brand-status.json)
    CONTENT_SUM=$(jq -r .summary /shared/of1-demo/step-9-content-status.json)
    jq -n --arg s1 "$BRAND_SUM" --arg s2 "$CONTENT_SUM" \
      '{step:9, status:"done", summary:($s1 + " | " + $s2)}' \
      > /shared/of1-demo/step-9-status.json
  fi

  # Standard single-status-file steps (step 9 status is synthesized above)
  for STEP in 6 8 9 10 11; do
    STATUS_FILE="/shared/of1-demo/step-${STEP}-status.json"
    PUSHED_FILE="/shared/of1-demo/step-${STEP}-pushed"
    if [ -f "$STATUS_FILE" ] && [ ! -f "$PUSHED_FILE" ]; then
      sprinkle send of1-demo "$(cat "$STATUS_FILE")"
      touch "$PUSHED_FILE"
    fi
    if [ ! -f "$STATUS_FILE" ]; then
      ALL_DONE=false
    fi
  done

  # Step 7 fan-out: wait for all 5 intent status files, then spawn assemble.
  ALL_INTENTS_DONE=true
  for INTENT in $S7_INTENTS; do
    if [ ! -f "/shared/of1-demo/step-7-intent-${INTENT}-status.json" ]; then
      ALL_INTENTS_DONE=false
    fi
  done
  if [ "$ALL_INTENTS_DONE" = true ] && [ "$S7_ASSEMBLE_SPAWNED" = false ]; then
    # Spawn of1-s7-assemble (see Step 7 fan-out detail)
    S7_ASSEMBLE_SPAWNED=true
    # (orchestrator: scoop_scoop call here for of1-s7-assemble)
  fi
  STEP7_STATUS_FILE="/shared/of1-demo/step-7-status.json"
  STEP7_PUSHED_FILE="/shared/of1-demo/step-7-pushed"
  if [ -f "$STEP7_STATUS_FILE" ] && [ ! -f "$STEP7_PUSHED_FILE" ]; then
    sprinkle send of1-demo "$(cat "$STEP7_STATUS_FILE")"
    touch "$STEP7_PUSHED_FILE"
  fi
  if [ ! -f "$STEP7_STATUS_FILE" ]; then
    ALL_DONE=false
  fi

  if [ "$ALL_DONE" = true ]; then break; fi
  sleep 5
done
```

### Handling scoop completion without status file:

Sometimes a scoop completes its work but forgets to write the status file (it shows "ready" in list_scoops but no `/shared/of1-demo/step-N-status.json` exists). When this happens:
1. Check if the scoop's output files exist (e.g., `ls /workspace/of1-demo/of1/config/`)
2. If the work IS done, write the status file manually
3. Push to sprinkle

For step 9 see "Step 9 split detail" above — the polling loop merges the two sub-status files into a single `step-9-status.json` before pushing to the sprinkle.

### `approve:<step>:<domain>`
User approved step N. The sprinkle auto-marks it done. No action needed unless the next step should auto-start.

### `revise:<step>:<domain>`
User wants changes. Ask in chat what they want different, then re-run the step skill with their feedback appended to the prompt.

### `reset`
User reset the pipeline. Clean up any running scoops.

## One-Shot Mode

When the user says **"one shot"** (or "one-shot", "oneshot"), run the ENTIRE pipeline end-to-end without any user interaction. This means:

1. **Zero approval gates** — every review step is auto-approved instantly
2. **All deliverables still generated** — discovery.html, brand-review.html, prototypes, config-review.html, gallery, demo hub — everything gets built and committed
3. **Pre-launch checklist still runs** — Step 13 must pass all 5 checks before marking done
4. **Sprinkle still updated** — push all statuses with deliverable URLs so the user can review anything after the fact
5. **Parallel execution maximized** — spawn all possible scoops simultaneously per the dependency graph

The pipeline should complete in one uninterrupted flow. The user will review the finished demo, not intermediate steps.

**Trigger:** User says "one shot a demo of X" or "one-shot demo for X.com" or similar.

## Auto-Approve (Default Behavior)

**By default, auto-approve all review steps and immediately proceed.** Do NOT wait for user confirmation between steps unless the user explicitly says "pause" or "wait for my review."

When a step finishes with `"status":"review"`:
1. Push the review status to the sprinkle (so the user CAN review if they want)
2. **Immediately treat it as approved** and proceed to the next step
3. If the user later clicks "Revise" in the sprinkle, handle it reactively

This means the full pipeline runs end-to-end without stopping. The user can always retroactively revise any step.

**One-shot mode and auto-approve are the same behavior** — the term "one shot" just makes the intent explicit from the start so the orchestrator never hesitates.

## Deliverable URLs — ALWAYS Include Them

When pushing ANY step status to the sprinkle (whether `"done"` or `"review"`), ALWAYS include a `deliverable` URL. The sprinkle's Quick Links section uses these URLs. Steps pushed without a `deliverable` field result in greyed-out quick links.

**Required deliverable URLs by step:**

| Step | Deliverable URL |
|------|----------------|
| 2 | `https://github.com/{owner}/{repo}/tree/{branch}` |
| 3 | `https://{branch}--{repo}--{owner}.aem.page/deliverables/discovery.html` |
| 4 | `https://{branch}--{repo}--{owner}.aem.page/deliverables/brand-review.html` |
| 5 | `https://{branch}--{repo}--{owner}.aem.page/deliverables/prototype-home.html` |
| 6 | `https://{branch}--{repo}--{owner}.aem.page/{branch}/prototype-home` |
| 7 | `https://{branch}--{repo}--{owner}.aem.page/gallery/index.html` |
| 8 | `https://{branch}--{repo}--{owner}.aem.page/{branch}/of1` |
| 12 | `https://{branch}--{repo}--{owner}.aem.page/deliverables/config-review.html` |
| 13 | `https://{branch}--{repo}--{owner}.aem.page/deliverables/index.html` |

## Step → Skill Mapping

| Step | Name | Skill(s) | Review | Track | Depends on |
|------|------|-----------|--------|-------|------------|
| 1 | Install dependencies | `of1-setup` | No | — | nothing |
| 2 | Branch setup | `of1-branch-setup` | No | — | step 1 |
| 3 | Discovery | `of1-discovery` | Yes | — | step 2 |
| 4 | Extraction | `of1-extraction` | Yes | — | step 2 (runs parallel with step 3) |
| 5 | Prototype | `of1-prototype` | Yes | — | steps 3 + 4 (needs both) |
| 6 | Snowflake | `of1-snowflake` | Yes | A | step 5 |
| 7 | Templates (fan-out) | `of1-template-generation` (×5 intent scoops + 1 assemble scoop) | Yes | A | step 6 |
| 8 | OF1 styling | `of1-generative-block-styler` | Yes | A | step 6 (must run AFTER S6 to avoid overwriting of1.css) |
| 9 | Brand & content (split) | `of1-brand-voice-extractor` (scoop `of1-s9-brand`) + `of1-content-metadata` (scoop `of1-s9-content`) — 2 parallel scoops | No | B | step 5 |
| 10 | Suggestions | `of1-quick-suggestions` | No | B | step 5 |
| 11 | CTA template | `of1-cta-template-builder` | No | B | step 5 |
| 12 | Config review | (orchestrator-inline) | Yes | B | steps 9+10+11 |
| 13 | Deploy | `of1-deploy` | Yes | — | steps 7+8+12 |

### Track Summary

**Track A (EDS Site):** Step 6 starts after Step 5 → Step 8 AND Steps 7a–7e (5 parallel intent scoops) start in parallel after Step 6 → Step 7-assemble runs once 7a–7e all complete

**Track B (Config):** Steps 9 + 10 + 11 (ALL parallel, start immediately after step 5) → Step 12 (Config review)

**Both tracks start after Step 5 is approved.** Track B does NOT wait for Step 6. Step 8 DOES wait for Step 6 — it must commit AFTER S6 so it doesn't get overwritten.

**Step 13 (Deploy)** requires Track A (step 7-assemble done AND step 8 done) AND Track B (step 12 approved).

## Step 2 — Branch Setup

This step creates a domain-specific branch on the shared `aem-growth-adoption/of1-demo` repo and sets up the output directory.

The repo is already cloned at `/workspace/of1-demo`. The step:
1. Fetches latest from origin
2. Creates a branch named after the domain (without TLD, e.g., `frescopa` for `frescopa.coffee`)
3. Creates `output/{DOMAIN}/` directory for deliverables
4. Verifies DA mount at `/mnt/da`

The step outputs `/shared/of1-demo/repo-config.json` which all subsequent steps use:
```json
{
  "owner": "aem-growth-adoption",
  "repo": "of1-demo",
  "branch": "frescopa",
  "repoUrl": "https://github.com/aem-growth-adoption/of1-demo",
  "previewUrl": "https://frescopa--of1-demo--aem-growth-adoption.aem.page/",
  "daSource": "da://aem-growth-adoption/of1-demo",
  "repoDir": "/workspace/of1-demo",
  "domain": "frescopa.coffee"
}
```

**All subsequent steps MUST read this file** to determine:
- Where to find the git repo (`repoDir`)
- Which branch to work on (`branch`)
- The DA mount source (`daSource`)
- The EDS preview URL (`previewUrl`)
- The preview/live URL patterns (`previewUrl`)
- The GitHub owner and repo name for branch URLs

## Screenshot Diff Loop (Steps 5 & 6)

Both the Prototype step (5) and the Snowflake step (6) MUST run a screenshot-based comparison loop before marking the step as review. This ensures visual fidelity.

### How it works

For each page, iterate up to **3 times**:

1. **Screenshot the reference** — the live site (Step 5) or the prototype (Step 6)
2. **Screenshot the output** — the prototype HTML (Step 5) or the EDS preview URL (Step 6)
3. **Compare using LLM vision** — open both screenshots and analyze differences
4. **If significant differences found:**
   - Identify which specific section/block is wrong
   - Fix only that section (targeted CSS/HTML fix, not full regeneration)
   - Re-screenshot and compare again
5. **If no significant differences** → PASS, move to next page
6. **After 3 iterations** → accept result, note remaining gaps as "known differences"

### What counts as "significant"

Fix these:
- Missing or broken images
- Layout differences (grid vs stack, wrong column count, missing columns)
- Missing entire sections or blocks
- Wrong colors or backgrounds
- Nav/footer not rendering or visually broken
- Obvious spacing issues (doubled padding, collapsed margins)

Ignore these:
- Minor font rendering differences (web font vs fallback anti-aliasing)
- Sub-pixel spacing (1-2px differences)
- Hover/animation states
- Cookie banners or overlays on the live page
- Dynamic content that changes between loads (carousel position, time-based promos)

### Step 5 specifics
- Reference = live site screenshot
- Output = prototype HTML served locally (`file://...`)
- Fix = edit the prototype HTML/CSS directly

### Step 6 specifics
- Reference = prototype screenshot (from Step 5 output)
- Output = EDS preview URL screenshot
- Fix = edit block CSS/JS, content HTML, re-push + re-preview

## CRITICAL: Pixel-Perfect Copy — No Redesign, No Placeholders

The OF1 demo pipeline produces a **pixel-perfect reproduction** of the existing site — NOT a redesign. The goal is to faithfully replicate the site's visual appearance so the OF1 personalization engine can run on top of it.

### What this means in practice:

**Do NOT:**
- Run `stardust direct`, author new `DESIGN.md`/`PRODUCT.md` target specs, or change the visual direction
- Use placeholder images, colored boxes, gradient divs, or CSS-drawn shapes in place of real images
- Use emoji, system icons, or generic SVGs in place of the site's real icons
- Invent, simplify, or redesign any visual element

**Do:**
- Use real images sourced directly from the live site via `playwright-cli eval` to extract actual `<img src>` URLs
- Use the site's real SVG icons — extract them from the live DOM (`document.querySelectorAll('img[src*=".svg"]')`, inline SVGs, or icon font codepoints)
- Match typography, colors, spacing, and layout exactly as they appear on the live site
- Use `format=png` or `format=jpg` (not `format=webply`) when constructing image URLs to ensure browser compatibility
- When the site uses private fonts (e.g. Sentinel, Gotham Narrow), use the closest system-font fallback AND note the substitution — do not invent a different typeface

**Image extraction pattern:**
```javascript
// Run in playwright-cli eval against the live page tab
Array.from(document.querySelectorAll('img'))
  .filter(i => i.naturalWidth > 200 && i.src.includes('sitedomain'))
  .map(i => ({ src: i.src, alt: i.alt, w: i.naturalWidth, h: i.naturalHeight }))
```

**Icon extraction pattern:**
```javascript
// Get all SVG icon URLs
Array.from(document.querySelectorAll('img')).filter(i => i.src.includes('.svg'))
  .map(i => i.src)
// Get inline SVGs near feature/icon areas
Array.from(document.querySelectorAll('[class*=icon] svg, [class*=feature] svg'))
  .map(s => s.outerHTML)
```

The prototype is considered acceptable only when a side-by-side comparison with a screenshot of the live page shows no obvious visual differences in layout, imagery, iconography, or brand identity.

## Scoop Naming

Name step scoops: `of1-s1`, `of1-s2`, ..., `of1-s13`. This keeps them short and identifiable.

## Context Passing Between Steps

Each step scoop needs context from prior steps. Key dependencies:

- **Step 1 (Install dependencies)** needs: nothing (can run without domain)
- **Step 2 (Branch setup)** needs: domain. Creates branch on `aem-growth-adoption/of1-demo` and outputs `repo-config.json`.
- **Step 3 (Discovery)** needs: domain — runs in PARALLEL with step 4
- **Step 4 (Extraction)** needs: domain only (does NOT need discovery output). Extracts design tokens, colors, typography, logo, and screenshots from the live site. Produces PRODUCT.md, DESIGN.json, screenshots, logo, and brand-review.html under `stardust/current/`. Runs in PARALLEL with step 3.
- **Step 5 (Prototype)** needs: domain + extraction outputs from step 4 (`stardust/current/`) + discovery output from step 3 (key pages and narrative). Waits for BOTH S3 and S4 to complete.
- **Step 6 (Snowflake)** needs: domain, prototypes from step 5, repo-config.json
- **Step 7 (Templates)** is fanned out into 1 `base` + 5 parallel `intent` + 1 `assemble` scoop (see "Step 7 fan-out detail"):
  - The base scoop needs: prototype CSS files from step 6, `DESIGN.json` from step 4. It generates `styles/of1-template-base.css`.
  - Each intent scoop needs: domain, `styles/of1-template-base.css` (from base), demo narrative from step 3, prototype CSS + slot-marked templates from step 6, plus its assigned `OF1_TG_INTENT`
  - The assemble scoop needs: all 25 per-intent template + CSS files (from the 5 intent scoops), repo-config.json. It owns the single commit + push.
- **Step 8 (OF1 styling)** needs: domain, block names from step 6, `stardust/` data
- **Steps 9–12 (Track B)** need: domain, `stardust/` data from step 4. They do NOT depend on the snowflake — they can start immediately after step 5.
- **Step 12 (Config review)** needs: all `of1/config/` files from steps 9-11 — orchestrator generates review page inline
- **Step 13 (Deploy)** needs: step 7-assemble done AND step 8 done (Track A) AND step 12 approved (Track B), plus domain, all config files, repo-config.json

When spawning a step scoop, read the relevant prior outputs and include key info in the prompt (or instruct the scoop to read specific files).

## Step 12 — Config Review (orchestrator-inline)

Once all parallel steps (9–11) are done, the orchestrator runs step 12 **inline** (no scoop needed). This is a review gate where the user validates all the config that will be deployed.

### What it shows

The config-review.html page displays:

1. **Products** — expandable cards with thumbnail images, names, categories, prices, image gallery, features, keywords
2. **Brand Voice** — personality, tone, vocabulary, avoid words
3. **Personas** — cards for each persona with keywords
4. **Use Cases** — list with descriptions and keywords
5. **Features** — chip list of all features
6. **Suggestions** — title/subtitle/placeholder + all suggestion chips with query text
7. **CTA Template** — JSON preview of the template

### How to run

Uses a **pre-built HTML template** + Python fill script. No LLM generation needed — just run the script:

```bash
# Read repo-config.json to get owner/repo
REPO_CONFIG=$(cat /shared/of1-demo/repo-config.json)
OWNER=$(echo "$REPO_CONFIG" | jq -r '.owner')
REPO=$(echo "$REPO_CONFIG" | jq -r '.repo')
BRANCH=$(echo "$REPO_CONFIG" | jq -r '.branch')
REPO_DIR=$(echo "$REPO_CONFIG" | jq -r '.repoDir')
DOMAIN=$(echo "$REPO_CONFIG" | jq -r '.domain')

# IMPORTANT: Must cd into repo dir first (VFS constraint)
cd "$REPO_DIR"

# Run the fill script — reads of1/config/*.json, writes deliverables/config-review.html
python3 /workspace/skills/of1-config-review/assets/fill-config-review.py . "$DOMAIN"

# Commit and push
git add deliverables/config-review.html
git commit -m "docs: config review page for ${DOMAIN}"
git push origin "$BRANCH"
```

Then push to sprinkle:
```bash
sprinkle send of1-demo '{"step":12,"status":"review","deliverable":"https://'${BRANCH}'--'${REPO}'--'${OWNER}'.aem.page/deliverables/config-review.html","summary":"Review all config before deploy: products, brand voice, personas, CTA, suggestions."}'
```

### What the user reviews

- Are the right blocks selected? (compare against block catalog — the guide should be a subset)
- Do all products have images? Are descriptions rich enough?
- Is the brand voice accurate? Any wrong vocabulary or missing avoid-words?
- Do suggestion chips cover enough intents?
- Are persona keywords realistic search terms?

The user approves or requests revisions. On revise, ask what needs changing and re-run the relevant parallel step.

## Iteration

If a step fails or the user requests revisions:
1. The sprinkle shows Retry/Revise button
2. User clicks it → lick with `run:<step>:<skill>:<domain>` (retry) or `revise:<step>:<domain>` (needs feedback)
3. Re-spawn the step scoop with the same prompt + any user feedback
4. The scoop can read prior outputs and iterate on them

## Step 13 — MANDATORY Pre-Launch Checklist

**DO NOT mark Step 13 as `"done"` without running these 5 checks.** This applies in ALL modes — one-shot, auto-approve, or manual. The cone must run these checks INLINE (not delegated to a scoop) after the sync succeeds:

### Check 1: OF1 page loads with styled search UI
```bash
playwright-cli open "${PREVIEW_BASE}/${BRANCH}/of1"
sleep 8
playwright-cli screenshot --tab <tab_id> --output /tmp/check-of1.png
open --view /tmp/check-of1.png
```
Pass: branded header, search input, suggestion chips visible, no raw unstyled content.

### Check 2: OF1 nav/footer matches prototype-home
```bash
playwright-cli open "${PREVIEW_BASE}/${BRANCH}/prototype-home"
sleep 8
playwright-cli screenshot --tab <tab_id> --output /tmp/check-home.png
open --view /tmp/check-home.png
```
Pass: nav bar and footer are visually identical between OF1 page and prototype-home.

### Check 3: All products have ≥2 images
```bash
python3 << 'EOF'
import json
with open('of1/config/products.json') as f:
    products = json.load(f)
all_good = True
for p in products:
    if len(p.get('images', [])) < 2:
        print(f"  ✗ {p['name']}: {len(p.get('images', []))} images")
        all_good = False
if not all_good:
    raise SystemExit("FAIL: products with <2 images")
print("✓ All products have ≥2 images")
EOF
```
If this fails: download additional images from the site, upload to DA, update products.json, re-sync.

### Check 4: Template catalog has 25 entries
```bash
python3 << 'EOF'
import json, sys
from pathlib import Path
p = Path('templates/templates-catalog.json')
if not p.exists():
    print("✗ templates-catalog.json missing"); sys.exit(1)
catalog = json.loads(p.read_text())
of1_entries = [t for t in catalog.get('templates', []) if t.get('name', '').startswith('of1-')]
if len(of1_entries) < 25:
    print(f"✗ Only {len(of1_entries)} of1-* templates (need 25)"); sys.exit(1)
intents = {t.get('intent') for t in of1_entries}
missing = {'comparison', 'recommendation', 'deep-dive', 'budget', 'discovery'} - intents
if missing:
    print(f"✗ Missing intents: {missing}"); sys.exit(1)
print(f"✓ Catalog has {len(of1_entries)} of1-* templates across all 5 intents")
EOF
```
Pass: 25+ of1-* templates across all 5 intents.

### Check 5: All quick link URLs return 200
```bash
for URL in discovery.html brand-review.html config-review.html index.html; do
  curl -s -o /dev/null -w "%{http_code} " "${PREVIEW_BASE}/deliverables/${URL}"
done
curl -s -o /dev/null -w "%{http_code} " "${PREVIEW_BASE}/${BRANCH}/prototype-home"
curl -s -o /dev/null -w "%{http_code} " "${PREVIEW_BASE}/${BRANCH}/of1"
curl -s -o /dev/null -w "%{http_code} " "${PREVIEW_BASE}/gallery/index.html"
```
Pass: All return 200.

### On failure:
Fix the issue (commit + push + re-preview + re-sync if needed), then re-run the failing check. Only push `"step":13,"status":"done"` to the sprinkle after ALL 5 pass.

## Pipeline audit

After the pipeline finishes (or aborts), write a structured audit to `/shared/of1-demo/pipeline-audit.json`. This gives cost/time visibility per run and a feedback loop for iterating on skill quality.

### What to record per step

For each step scoop, record timing and status when the status file appears:

```bash
# When dispatching a step:
STEP_START=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# When the status file appears (poll loop sees it):
STEP_END=$(date -u +%Y-%m-%dT%H:%M:%SZ)
STEP_DURATION_MS=$(( $(date +%s -d "$STEP_END") - $(date +%s -d "$STEP_START") ))
```

If `list_scoops` output includes token counts for the scoop, capture those too. Otherwise record `null` — duration alone is valuable.

| Field | Source |
|---|---|
| `step` | Step number |
| `name` | Step name |
| `model` | Model assigned (from the model table) |
| `startedAt` | Timestamp when `scoop_scoop()` was called |
| `completedAt` | Timestamp when the status file appeared |
| `durationMs` | Wall-clock between dispatch and status-file arrival |
| `totalTokens` | From `list_scoops` if available; otherwise `null` |
| `status` | From the step's status JSON (`done` / `review` / `failed`) |
| `summary` | From the step's status JSON |
| `retries` | Number of retries (0 if first-pass success) |
| `error` | If failed: the failure message. Otherwise `null` |

### Capture skill version at pipeline start

Before the first dispatch, record the git hash of the skill plugin:

```bash
SKILL_PLUGIN_DIR="/workspace/skills"
SKILL_VERSION=$(git -C "$SKILL_PLUGIN_DIR" rev-parse --short HEAD 2>/dev/null || echo "unknown")
SKILL_BRANCH=$(git -C "$SKILL_PLUGIN_DIR" branch --show-current 2>/dev/null || echo "unknown")
```

### Audit file shape

Write `/shared/of1-demo/pipeline-audit.json`:

```json
{
  "domain": "<DOMAIN>",
  "skillVersion": "<git short hash>",
  "skillBranch": "<branch name>",
  "startedAt": "<ISO>",
  "completedAt": "<ISO>",
  "totalDurationMs": <wall-clock>,
  "totalTokens": <sum or null if unavailable>,
  "stepCount": <dispatches including retries>,
  "steps": [ ... ],
  "improvements": [ ... ]
}
```

### Improvements section

After writing the step data, analyze the run and append an `improvements` array. For each step that had issues — retries, unexpectedly long duration (>3× expected from the model table), or a `failed` status that was recovered — write a brief, actionable observation:

```json
{
  "improvements": [
    {
      "step": 5,
      "issue": "Prototype took 22 min (2× expected) — scoop regenerated the full page 4 times instead of iterating on specific sections",
      "suggestion": "Add 'targeted fix only — do not regenerate the full page' instruction to stardust:prototype invocation"
    }
  ]
}
```

Rules:
- Only include steps with actual problems (retries, failures, duration >3× expected)
- Be specific: name the exact behavior that went wrong
- Each `suggestion` should be a concrete change to a skill or dispatch prompt
- If the run was clean: `"improvements": []` — don't invent issues

### When to write

1. After step 13 completes (success)
2. If the pipeline aborts (partial audit is still useful)

Push the audit file to the sprinkle as a final event so the user can access it:
```bash
sprinkle send of1-demo '{"type":"audit","file":"/shared/of1-demo/pipeline-audit.json"}'
```

## Completion

After step 13 succeeds, all steps show green. The sprinkle stays open as a reference with all URLs and status.

## Shell Environment Pitfalls (SLICC-specific)

These issues cost time in previous runs. Avoid them:

1. **`set -o pipefail` is not supported** — don't run scripts that use it (`deploy-tenant.sh`). Execute commands manually or use the shell loop in the deploy skill.

2. **Python in heredocs** — always quote the delimiter (`python3 << 'EOF'`). Unquoted heredocs mangle indentation and variables.

3. **Config sync uses EDS** — configs are committed to `of1/config/` in git, then synced via `POST /api/tenants/{id}/sync`. The tenant ID is `{branch}--{repo}--{owner}` format.

4. **Step 13 (Deploy)** — just `git push` + one POST to `/api/tenants/{id}/sync`. Can be done inline by the cone (no scoop needed).

5. **Sprinkle valid statuses** — only `pending`, `active`, `done`, `review`, `failed`. Anything else (e.g. "approved", "running", "complete") corrupts the UI state.

6. **EDS buttons** — `<strong><a>` = primary, `<em><a>` = secondary. The wrapper (`strong`/`em`) goes OUTSIDE the anchor, not inside.

7. **DA preview auth** — use `oauth-token adobe` to get the IMS token. For preview triggers, pass BOTH `Authorization: Bearer <token>` AND `x-content-source-authorization: Bearer <token>` headers to `admin.hlx.page`.

8. **`--data-binary @file` breaks in scoops** — curl's `@path` expansion can fail, storing the literal string `@/workspace/...` instead of file contents. Always pipe via stdin: `cat file | curl ... --data-binary @-`.

9. **Deliverable HTML with images** — When HTML deliverables reference images (screenshots, logos), paths must be absolute from the repo root (e.g., `/deliverables/assets/screenshots/home.png`) so they resolve on the EDS preview URL. Relative paths like `assets/screenshots/...` break because the HTML is served at `/deliverables/brand-review.html` while images are at `/deliverables/assets/screenshots/`. Always commit the image assets alongside the HTML.

10. **Logo SVG extraction** — The brand logo extracted via Playwright can be truncated if it comes from a `<symbol>` sprite. Always extract the full `innerHTML` of the symbol element and wrap it in a standalone `<svg>` with the correct `viewBox`. Verify the rendered SVG shows the complete wordmark before committing.

11. **Brand logo in prototypes** — Prototypes MUST use the real brand SVG logo (extracted in Step 4 and saved to `stardust/current/assets/logo.svg` or inline in `_brand-extraction.json`). Never substitute with text or a placeholder. The logo SVG should be inlined directly in the nav HTML of every prototype page.

12. **DA strips images from programmatic content** — DA's HTML→MD→HTML pipeline removes ALL `<img>`, `<picture>`, and `<svg>` elements from content uploaded via PUT. The solution: store image URLs as plain text in block cells, and have block JS create `<img>` elements at runtime. Every block that handles images needs a `convertTextToImages(block)` helper. See `of1-snowflake` skill § "EDS Content Authoring Constraints" for the full pattern.

13. **Full-bleed blocks need wrapper override** — EDS wraps sections in `.{block}-wrapper` with `max-width: 1440px`. Hero, banners, and other full-width blocks MUST have `.{block}-wrapper { max-width: 100% !important; padding: 0 !important; }` in `styles/styles.css`.

14. **Brand logo in EDS header** — DA strips SVGs from nav content. Commit logo to `/icons/logo.svg` and have `header.js` fetch + inject it into the brand link at runtime. Never rely on inline SVG in DA content.

15. **Static file URLs need `.html` extension** — EDS serves git-committed static HTML files at their exact path including the extension. A file at `deliverables/config-review.html` is served at `/deliverables/config-review.html` — NOT at `/deliverables/config-review` (that 404s). Always include the `.html` extension in deliverable URLs sent to the sprinkle. DA-authored content pages (like `/home`, `/block-catalog`) do NOT need the extension.

## DA Authentication & Content Upload (SLICC-specific)

**This is the #1 time waster in previous runs. Follow these rules exactly:**

### Getting the IMS token
```bash
DA_TOKEN=$(oauth-token adobe)
```
That's it. No npx, no da-auth-helper, no browser flow, no manual paste. Works instantly.

### Writing DA content — Mount (preferred) OR admin.da.live API

**Option A — Mount (preferred, fastest):**

The DA mount at `/mnt/da/` handles auth automatically. It is mounted at the REPO root level (`da://aem-growth-adoption/of1-demo`).

**Path structure:**
```
/mnt/da/                    ← repo root (da://aem-growth-adoption/of1-demo)
/mnt/da/{branch}/           ← content subfolder for this demo (e.g., /mnt/da/frescopa/)
/mnt/da/{branch}/page.html  ← a DA content page
```

**To upload a page:**
```bash
cp /path/to/content.html /mnt/da/${BRANCH}/page-name.html
```

**Option B — admin.da.live API (fallback if mount has permission issues):**

`admin.da.live` IS now in the allowed secret domains. Use it when the mount fails:

```bash
DA_TOKEN=$(oauth-token adobe)

# Upload HTML content to DA via API
cat /path/to/content.html | curl -s -X PUT \
  -H "Authorization: Bearer ${DA_TOKEN}" \
  -H "Content-Type: text/html" \
  --data-binary @- \
  "https://admin.da.live/source/${OWNER}/${REPO}/${BRANCH}/page-name.html"
```

**⚠️ IMPORTANT: When using `--data-binary @-`, always pipe via `cat file |`. Do NOT use `--data-binary @/path/to/file` — it can fail silently in scoops.**

**DO NOT:**
- Use `npx da-auth-helper` — it doesn't work in this environment
- Try to extract tokens from `~/.aem/da-token.json` — it doesn't exist
- Spend time exploring auth options — mount first, API second, that's it

### Triggering preview — USE admin.hlx.page

`admin.hlx.page` IS in the allowed secret domains. Use it for preview triggers:

```bash
DA_TOKEN=$(oauth-token adobe)
curl -s -X POST \
  -H "Authorization: Bearer ${DA_TOKEN}" \
  -H "x-content-source-authorization: Bearer ${DA_TOKEN}" \
  "https://admin.hlx.page/preview/${OWNER}/${REPO}/${BRANCH}/${CONTENT_PREFIX}/${PAGE_SLUG}"
```

### Content URL pattern

The of1-demo repo uses per-demo subfolders. Content URLs include the branch as a PATH prefix:
```
https://{branch}--of1-demo--aem-growth-adoption.aem.page/{branch}/{page}
                                                          ^^^^^^^^
                                                          content prefix (= branch name)
```

Example: `https://frescopa--of1-demo--aem-growth-adoption.aem.page/frescopa/prototype-home`

### Summary of allowed domains for curl with oauth.adobe.token

| Domain | Allowed | Use for |
|--------|---------|---------|
| `admin.hlx.page` | ✅ Yes | Preview/publish triggers |
| `admin.da.live` | ✅ Yes | Read/write DA content (PUT for upload, GET for read) |
| `content.da.live` | ✅ Yes | Read-only content delivery |
| `*.adobelogin.com` | ✅ Yes | (IMS auth, handled by oauth-token) |
