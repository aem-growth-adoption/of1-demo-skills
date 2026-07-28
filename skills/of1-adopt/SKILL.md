---
name: of1-adopt
description: "Introduce OF1 onto an existing EDS/Stardust site — reuses whatever design tokens/blocks/pages already exist instead of crawling an external domain or pixel-cloning. Works on both Claude Code and SLICC; no sprinkle/scoop UI."
user-invocable: true
---

# OF1 Adopt — Introduce OF1 on an Existing EDS/Stardust Site

For sites that already have EDS blocks, content pages, and (usually) Stardust design tokens. Produces only the OF1-specific layer: templates, the `/of1` page, and tenant config. Runs identically in spirit on Claude Code and SLICC — the dispatch mechanism differs (see "## Dispatch" below), but there is **no sprinkle UI and no `sprinkle_send` call on either runtime.**

## Entry

The user invokes you pointed at an existing EDS repo — e.g. "adopt OF1 onto this site" or "/of1-adopt" from inside the repo. No domain crawl is needed; the site itself is the source of truth. If the repo isn't obvious from context, ask once via `AskUserQuestion` for the local path.

## Phase 0 — Verify dependencies + repo state (inline)

Invoke the `of1-setup` skill exactly as `of1-demo-cc`/`of1-demo` do (Skill tool on Claude Code; read + follow inline on SLICC — not Agent/scoop dispatch, this step is light and must run in your own context to read the verified state). If it fails, surface the exact error and stop.

After it succeeds, read `<STATE_DIR>/setup.json` for `stateDir`/`of1Repo` and `<STATE_DIR>/repo-config.json` for `owner`/`repo`/`branch`/`domain`. Use these for all subsequent steps.

## Phase 1 — Artifact detection (inline)

```bash
cd "$OF1_DEMO_REPO"
HAS_DESIGN_JSON=false
[ -f stardust/current/DESIGN.json ] && HAS_DESIGN_JSON=true
echo "DESIGN.json present: $HAS_DESIGN_JSON"
```

If `HAS_DESIGN_JSON=false`, Step 3 (extraction) runs in own-site mode (`OF1_EXTRACT_OWN_SITE=1`). If `true`, Step 3 is skipped entirely — `of1-extraction` itself detects this (see its own § "0. Detect existing extraction") and writes `step-3-status.json` with `"status":"done"` either way, so downstream dependency checks don't need to special-case the skip.

## Step graph

```
1 (setup) → artifact detection (inline)
              │
       [DESIGN.json exists?]
         no → 3 (extraction, own-site mode)
         yes → skip to 6/8 (of1-extraction itself no-ops and reports done)
              │
      ┌───────┴────────┐
      ↓                ↓
  Track A          Track B
  6 (templates:    8a (brand-voice) ∥ 8b (content-metadata) ∥ 10 (CTA template)
  base→intent×5→          ↓
  assemble)        9 (suggestions — needs 8a + 8b)
      ↓                ↓
  7 (OF1 styling)      │
      └───────┬────────┘
               ↓
      11 (config review, inline — needs 8a + 8b + 9 + 10)
               ↓
      12 (deploy — needs 6-assemble + 7 + 11)
```

Track A (6→7) and Track B (8a ∥ 8b ∥ 10 → 9) both dispatch as soon as step 3 returns `done` (whether it ran or was skipped) — they run concurrently, same rule `of1-demo-cc` already uses between its Track A/Track B steps.

| Trigger (ALL must be done) | Dispatch in one message |
|---|---|
| Step 1 done | Artifact detection (inline, immediate) |
| Artifact detection done | Step 3 |
| Step 3 done (ran or skipped) | Step 6-base AND Step 7 AND Steps 8a, 8b, 10 (5 dispatches in one message) |
| Step 6-base done | Steps 6a–6e (5 intent dispatches in one message) |
| Steps 6a–6e all done | Step 6-assemble (1 dispatch, sequential) |
| Steps 8a + 8b done | Step 9 (needs products.json + brand-voice.json) |
| Steps 8a + 8b + 9 + 10 ALL done | Step 11 (inline — do NOT run until all four are confirmed done) |
| Steps 6-assemble + 7 + 11 ALL done | Step 12 |

**Step 7 (OF1 styling) does NOT wait for step 6** — per `of1-generative-block-styler`'s own dependency table (fixed in Task 2), it only needs step 1's block install context and the repo's existing chrome (`content/nav.html`/`content/footer.html`, already present since this is an existing EDS site) — dispatch it alongside step 6-base.

**Common mistakes to avoid** (same class of mistake `of1-demo-cc` already warns about):
- Do NOT run Step 11 before ALL of 8a, 8b, 9, 10 return `done`.
- Do NOT run Step 9 before BOTH 8a and 8b return — it needs products.json + brand-voice.json.
- Do NOT dispatch step 6-intent agents before step 6-base returns — they read its output.

## Dispatch

Same step-graph, same dependency rules on both runtimes. Only the invocation mechanism differs. **Neither runtime ever calls a sprinkle/scoop UI push (`sprinkle_send`) — there is no sprinkle for this skill.**

### Claude Code

- Use **TaskCreate** with one task per step (1, 3, 6-base, 6a–6e, 6-assemble, 7, 8a, 8b, 9, 10, 11, 12). Mark task 1 completed immediately; mark each task `in_progress`/`completed`/`failed` around its dispatch.
- Each step (except 2 and 9, which are inline) is a single `Agent` dispatch. Sub-agents see none of this conversation — the prompt must be self-contained: read the target step skill's `SKILL.md`, export the same env vars `of1-demo-cc` exports (`OF1_STATE_DIR`, `OF1_DEMO_REPO`, `ADOBE_IMS_TOKEN`/`OF1_TOKEN_FILE`, `SKILL_DIR`), state the branch/owner/repo, list which prior-step output files it needs, and require the same JSON status block: `{"step":N,"status":"done"|"review"|"failed","summary":"...","deliverables":[...]}`.
- **Parallelism is mandatory** at each fan-out point — dispatch all eligible Agents in a single message with multiple Agent tool-use blocks.
- Model assignment: same rule of thumb as `of1-demo-cc` — Opus only where output quality cascades downstream. Since this pipeline skips discovery/prototype entirely, the only Opus-worthy step is 7 (OF1 styling — multi-step DA authoring) and 3 when it actually runs (extraction — design-token quality cascades). Everything else (`sonnet`): 6-base, 6a–6e, 6-assemble, 8a, 8b, 9, 10.
- Auto-approve by default (mirrors `of1-demo-cc`'s one-shot mode) — mark each `review`-status task completed and continue immediately, unless the user explicitly asked to pause between steps.

### SLICC

- Dispatch each step as a `scoop_scoop()` call with `writablePaths` covering `/scoops/<name>/`, `/shared/`, and the project repo path — same pattern `of1-demo` already uses per step.
- Each scoop writes its own `/shared/of1-demo/step-N-status.json` on completion, exactly like every step skill already documents in its own "Completion" section — **do not** additionally push to a sprinkle. There is nothing listening for `sprinkle_send` on this skill.
- Handle completions event-driven, not via polling: end your turn after dispatching, and react when a scoop-completion notification arrives — read its status file, check if it unblocks the next dispatch per the table above, and dispatch the next batch.
- Model assignment: same as the Claude Code column above, using `claude-opus-4-6`/`claude-sonnet-5` model strings per `of1-demo`'s own convention.

## Step 11 — Config review (inline, no dispatch on either runtime)

Identical to `of1-demo-cc`'s Step 11 / `of1-demo`'s Step 11 — run the `of1-config-review` skill's fill script directly:

```bash
cd "$OF1_DEMO_REPO"
python3 "$SKILL_DIR_CONFIG_REVIEW/assets/fill-config-review.py" . "$DOMAIN"
git add deliverables/config-review.html
git commit -m "docs: config review page for $DOMAIN"
git push origin "$BRANCH"
```

(`$SKILL_DIR_CONFIG_REVIEW` = absolute path to the `of1-config-review` skill directory.)

## Step 12 — Deploy (inline)

After step 11 is approved AND steps 6-assemble + 7 are both done, run the `of1-deploy` skill inline (read it and follow it directly — same as `of1-demo-cc`'s Step 12). Its pre-launch checklist (6 checks) must all pass before marking done.
