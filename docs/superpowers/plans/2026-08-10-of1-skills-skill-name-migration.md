# OF1 Skills — Skill-Name Identity Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat step-number identity (`"step": N`, `step-N-status.json`) across every of1-demo-skills unit with skill-name identity (`{stage, skill}`, `of1-<skill>-status.json`), removing step numbers from the status-file wire, the orchestrator contract, dispatch docs, SLICC scoop names, and the audit schema.

**Architecture:** This is **rollout stage 2** of the approved spec `docs/superpowers/specs/2026-08-10-skill-name-pipeline-identity-design.md`. Rollout stage 1 (of1-labs webhook + D1 + UI, dual-format) already shipped on the `of1-labs` `skills-v5-support` branch. This plan touches only `of1-demo-skills` (the v5 line on branch `skills-v5-next`). The of1-labs webhook already accepts the new `{stage, skill}` shape, so the skills can emit it directly. Sub-units (`6-base`/`6a`–`6e`/`6-assemble`, brand/content) become skill-internal phases — they never appear in status files or on the wire, but the orchestrator's internal DAG references them by `skill + phase`.

**Tech Stack:** Markdown SKILL files, bash (`verify.sh`), Node ESM (`fill-demo-hub.mjs`). No test runner in this repo — verification is by `grep` assertions, `jq` JSON validation, and `bash -n`.

## Global Constraints

- **Identity model:** every unit is `{stage: <0-3>, skill: "<of1-skill-name>"}`. Stage map: 0 Setup = `of1-check-dependencies`; 1 Discover = `of1-discovery`; 2 Replica = `stardust:replica` (+ conditional extraction, external); 3 Integrate = `of1-build-templates`, `of1-style-generative-block`, `of1-extract-brand-voice`, `of1-extract-content`, `of1-build-quick-suggestions`, `of1-build-cta-template`, `of1-generate-config-review`, `of1-publish`.
- **Status-file naming:** `$OF1_STATE_DIR/of1-<skill>-status.json` (e.g. `of1-build-templates-status.json`). `of1-discovery` already uses `of1-discovery-status.json`.
- **Status JSON body:** `{"stage": <n>, "skill": "<name>", "status": "done"|"review"|"failed", "summary": "…", "deliverables": [...]}`. The old `"step": N` field is removed. `substep` fields (brand/content) are removed — the skill *is* the unit.
- **No step numbers on the wire or in status files.** Numbers survive nowhere in of1-demo-skills after this change — not in status files, not in the orchestrator DAG, not in SLICC scoop names, not in the audit `stage` field.
- **Orchestrator-internal phases** keep their names (`base`, `intent-comparison`…`intent-discovery`, `assemble`) as sub-keys of a skill; they are logs/dispatch-only, never written to a status file.
- **Skip dated historical docs.** Do NOT edit `FINDINGS-2026-08-04.md`, `SKILLS-AUDIT-2026-08-05.md`, `SCRIPT-AUDIT-2026-08-05.md`, or anything under `docs/superpowers/{plans,specs}/2026-08-03-*`. They are historical record.
- **Branch:** `skills-v5-next`. Commit per task; do not push until the finishing-branch step.

---

## File Structure

Units that emit a status file (each owns its own "Completion" / "Env" section):

- `skills/of1-check-dependencies/SKILL.md` + `scripts/verify.sh` — stage 0
- `skills/of1-discovery/SKILL.md` — stage 1 (filename already migrated; body still wrong)
- `skills/of1-build-templates/SKILL.md` — stage 3
- `skills/of1-style-generative-block/SKILL.md` — stage 3
- `skills/of1-extract-brand-voice/SKILL.md` — stage 3
- `skills/of1-extract-content/SKILL.md` — stage 3
- `skills/of1-build-quick-suggestions/SKILL.md` — stage 3
- `skills/of1-build-cta-template/SKILL.md` — stage 3
- `skills/of1-generate-config-review/SKILL.md` — stage 3 (inline)
- `skills/of1-publish/SKILL.md` — stage 3 (inline)
- `skills/of1-integration/SKILL.md` — stage-3 step graph + `step-3-status.json` reference

Contract/consumer files (read or define the wire shape):

- `skills/of1-demo-orchestrator/knowledge/pipeline-contract.md` — status grammar, status-file table, audit schema
- `skills/of1-demo-orchestrator/knowledge/dispatch-cc.md` — CC dispatch template, status block
- `skills/of1-demo-orchestrator/knowledge/dispatch-slicc.md` — SLICC scoop names, dispatch, status block
- `skills/of1-demo-orchestrator/SKILL.md` — stage table, prose references to steps 6–12
- `skills/of1-publish/assets/fill-demo-hub.mjs` — audit reader (`s.stage ?? s.step`)

## Task Ordering Rationale

The orchestrator reads status files **by name**, so the contract (Task 10) and the file-writers (Tasks 1–9) must land together to avoid a window where the reader looks for `step-6-status.json` while the writer emits `of1-build-templates-status.json`. Because this repo has no runtime integration test, we mitigate by: (a) doing all writer edits + contract edits before any commit that claims completeness, and (b) a final repo-wide grep gate (Task 13) that fails if any `step-N` identifier survives outside dated docs. Individual tasks still commit independently for reviewability, but Task 13 is the real gate.

---

### Task 1: Migrate `of1-discovery` status body (stage 1)

**Files:**
- Modify: `skills/of1-discovery/SKILL.md:201`

**Interfaces:**
- Produces: `of1-discovery-status.json` body `{"stage": 1, "skill": "of1-discovery", …}` (filename already correct from the prior rename pass).

- [ ] **Step 1: Inspect the current Completion block**

Run: `sed -n '195,210p' skills/of1-discovery/SKILL.md`
Expected: a JSON block containing `"step": 1,`.

- [ ] **Step 2: Replace the `"step": 1` line**

Change the status JSON body. Find:
```json
  "step": 1,
```
Replace with:
```json
  "stage": 1,
  "skill": "of1-discovery",
```

- [ ] **Step 3: Verify no `step` field remains in this file**

Run: `grep -n '"step"' skills/of1-discovery/SKILL.md`
Expected: no output (exit 1).

- [ ] **Step 4: Commit**

```bash
git add skills/of1-discovery/SKILL.md
git commit -m "refactor(of1-discovery): status body uses {stage,skill} not step"
```

---

### Task 2: Migrate `of1-check-dependencies` status file + body (stage 0)

**Files:**
- Modify: `skills/of1-check-dependencies/SKILL.md:256`
- Modify: `skills/of1-check-dependencies/scripts/verify.sh:11,267,294,268,295`

**Interfaces:**
- Produces: `of1-check-dependencies-status.json` with body `{"stage": 0, "skill": "of1-check-dependencies", "status": …}`.
- Consumed by: orchestrator (Task 10 documents it) and SLICC sprinkle.

- [ ] **Step 1: Update the SKILL.md state-file table row**

In `skills/of1-check-dependencies/SKILL.md`, find:
```
| `$OF1_STATE_DIR/step-1-status.json` | `{"step":1,"status":"done"|"failed",…}`. SLICC's sprinkle polls it; CC ignores it. |
```
Replace with:
```
| `$OF1_STATE_DIR/of1-check-dependencies-status.json` | `{"stage":0,"skill":"of1-check-dependencies","status":"done"|"failed",…}`. SLICC's sprinkle polls it; CC ignores it. |
```

- [ ] **Step 2: Update verify.sh header comment (line ~11)**

Find:
```
#   <stateDir>/step-1-status.json  — SLICC sprinkle IPC ack (harmless in CC)
```
Replace with:
```
#   <stateDir>/of1-check-dependencies-status.json — SLICC sprinkle IPC ack (harmless in CC)
```

- [ ] **Step 3: Update the failure-path status write (line ~267)**

Find:
```bash
    printf '{"step":1,"status":"failed","error":%s}\n' "$ESCAPED" \
```
Replace with:
```bash
    printf '{"stage":0,"skill":"of1-check-dependencies","status":"failed","error":%s}\n' "$ESCAPED" \
```

- [ ] **Step 4: Update the failure-path filename (line ~268)**

Find (the redirect target on the line after the printf):
```bash
      > "$STATE_DIR/step-1-status.json"
```
Replace with:
```bash
      > "$STATE_DIR/of1-check-dependencies-status.json"
```

- [ ] **Step 5: Update the success-path status write (line ~294)**

Find:
```bash
echo '{"step":1,"status":"done","summary":"prerequisites verified"}' \
```
Replace with:
```bash
echo '{"stage":0,"skill":"of1-check-dependencies","status":"done","summary":"prerequisites verified"}' \
```

- [ ] **Step 6: Update the success-path filename (line ~295)**

Find:
```bash
  > "$STATE_DIR/step-1-status.json"
```
Replace with:
```bash
  > "$STATE_DIR/of1-check-dependencies-status.json"
```

- [ ] **Step 7: Verify no `step-1` or `"step"` remains and bash still parses**

Run: `grep -n 'step-1\|"step"' skills/of1-check-dependencies/SKILL.md skills/of1-check-dependencies/scripts/verify.sh`
Expected: no output.
Run: `bash -n skills/of1-check-dependencies/scripts/verify.sh && echo OK`
Expected: `OK`.

- [ ] **Step 8: Verify the two emitted JSON blobs are valid JSON**

Run:
```bash
echo '{"stage":0,"skill":"of1-check-dependencies","status":"done","summary":"prerequisites verified"}' | jq -e . >/dev/null && echo "success-json OK"
```
Expected: `success-json OK`.

- [ ] **Step 9: Commit**

```bash
git add skills/of1-check-dependencies/
git commit -m "refactor(of1-check-dependencies): status file+body use {stage,skill}"
```

---

### Task 3: Migrate `of1-build-templates` status file + body (stage 3)

**Files:**
- Modify: `skills/of1-build-templates/SKILL.md:470-472`
- Modify: any `OF1_STATE_DIR | … receives step-6-status.json` env-table row if present

**Interfaces:**
- Produces: `of1-build-templates-status.json`, body `{"stage": 3, "skill": "of1-build-templates", …}`. Internal phases `base`, `intent-comparison`…`intent-discovery`, `assemble` stay skill-internal (not in this file).

- [ ] **Step 1: Locate the status write and env-table row**

Run: `grep -n 'step-6-status\|"step": 6\|"step":6\|receives .step-6' skills/of1-build-templates/SKILL.md`
Expected: the `cat > … step-6-status.json` line (~470) and the `"step": 6,` body line (~472). Note whether an env-table row (`| OF1_STATE_DIR | … step-6-status.json |`) exists near line 15.

- [ ] **Step 2: Rename the status file in the write heredoc**

Find:
```bash
cat > "$OF1_STATE_DIR/step-6-status.json" <<EOF
```
Replace with:
```bash
cat > "$OF1_STATE_DIR/of1-build-templates-status.json" <<EOF
```

- [ ] **Step 3: Replace the `"step": 6` body field**

Find:
```json
  "step": 6,
```
Replace with:
```json
  "stage": 3,
  "skill": "of1-build-templates",
```

- [ ] **Step 4: Update the env-table row if it exists**

If Step 1 found `receives \`step-6-status.json\``, replace `step-6-status.json` with `of1-build-templates-status.json` in that row.

- [ ] **Step 5: Verify**

Run: `grep -n 'step-6\|"step"' skills/of1-build-templates/SKILL.md`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add skills/of1-build-templates/SKILL.md
git commit -m "refactor(of1-build-templates): status file+body use {stage,skill}"
```

---

### Task 4: Migrate `of1-style-generative-block` status file + body (stage 3)

**Files:**
- Modify: `skills/of1-style-generative-block/SKILL.md:15,394,396`

**Interfaces:**
- Produces: `of1-style-generative-block-status.json`, body `{"stage": 3, "skill": "of1-style-generative-block", …}`.

- [ ] **Step 1: Update the env-table row (line ~15)**

Find:
```
| `OF1_STATE_DIR` | state + IPC dir; receives `step-7-status.json` |
```
Replace with:
```
| `OF1_STATE_DIR` | state + IPC dir; receives `of1-style-generative-block-status.json` |
```

- [ ] **Step 2: Rename the status file in the write heredoc (line ~394)**

Find:
```bash
cat > "$OF1_STATE_DIR/step-7-status.json" <<EOF
```
Replace with:
```bash
cat > "$OF1_STATE_DIR/of1-style-generative-block-status.json" <<EOF
```

- [ ] **Step 3: Replace the `"step": 7` body field (line ~396)**

Find:
```json
  "step": 7,
```
Replace with:
```json
  "stage": 3,
  "skill": "of1-style-generative-block",
```

- [ ] **Step 4: Verify**

Run: `grep -n 'step-7\|"step"' skills/of1-style-generative-block/SKILL.md`
Expected: no output. (Note: internal prose "Step 0"…"Step 9" headings are the skill's OWN internal process steps — leave those; this grep targets `step-7` and the JSON `"step"` field only.)

- [ ] **Step 5: Commit**

```bash
git add skills/of1-style-generative-block/SKILL.md
git commit -m "refactor(of1-style-generative-block): status file+body use {stage,skill}"
```

---

### Task 5: Migrate `of1-extract-brand-voice` status body (stage 3)

**Files:**
- Modify: `skills/of1-extract-brand-voice/SKILL.md:15,136,137,141`

**Interfaces:**
- Produces: `of1-extract-brand-voice-status.json`, body `{"stage": 3, "skill": "of1-extract-brand-voice", …}`. The `"substep":"brand"` field is REMOVED (the skill is the unit). Current filename is `step-8-brand-status.json`.

- [ ] **Step 1: Update the env-table row (line ~15)**

Find: `| `OF1_STATE_DIR` | state + IPC dir; receives `step-8-brand-status.json` |`
Replace `step-8-brand-status.json` with `of1-extract-brand-voice-status.json`.

- [ ] **Step 2: Rename the status file write (line ~136)**

Find:
```bash
cat > "$OF1_STATE_DIR/step-8-brand-status.json" <<EOF
```
Replace with:
```bash
cat > "$OF1_STATE_DIR/of1-extract-brand-voice-status.json" <<EOF
```

- [ ] **Step 2b: Update the cross-reference line (line ~141)**

Find:
```
The orchestrator waits for both `step-8-brand-status.json` and `step-8-content-status.json` before marking step 8 complete.
```
Replace with:
```
The orchestrator waits for both `of1-extract-brand-voice-status.json` and `of1-extract-content-status.json` (the content track) before treating the content pair as complete.
```

- [ ] **Step 3: Replace the body field**

Find:
```json
{"step":8,"substep":"brand","status":"done","summary":"Brand voice extracted: [personality adjectives]. [N] vocabulary terms, [M] avoid words."}
```
Replace with:
```json
{"stage":3,"skill":"of1-extract-brand-voice","status":"done","summary":"Brand voice extracted: [personality adjectives]. [N] vocabulary terms, [M] avoid words."}
```

- [ ] **Step 4: Verify**

Run: `grep -n 'step-8\|"step"\|substep' skills/of1-extract-brand-voice/SKILL.md`
Expected: no output.
Run: `echo '{"stage":3,"skill":"of1-extract-brand-voice","status":"done","summary":"x"}' | jq -e . >/dev/null && echo OK`
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add skills/of1-extract-brand-voice/SKILL.md
git commit -m "refactor(of1-extract-brand-voice): status file+body use {stage,skill}, drop substep"
```

---

### Task 6: Migrate `of1-extract-content` status body (stage 3)

**Files:**
- Modify: `skills/of1-extract-content/SKILL.md:15,372,373,377`

**Interfaces:**
- Produces: `of1-extract-content-status.json`, body `{"stage": 3, "skill": "of1-extract-content", …}`. `"substep":"content"` REMOVED. Current filename is `step-8-content-status.json`.

- [ ] **Step 1: Update the env-table row (line ~15)**

Find: `| `OF1_STATE_DIR` | state + IPC dir; receives `step-8-content-status.json` |`
Replace `step-8-content-status.json` with `of1-extract-content-status.json`.

- [ ] **Step 2: Rename the status file write (line ~372)**

Find:
```bash
cat > "$OF1_STATE_DIR/step-8-content-status.json" <<EOF
```
Replace with:
```bash
cat > "$OF1_STATE_DIR/of1-extract-content-status.json" <<EOF
```

- [ ] **Step 2b: Update the cross-reference line (line ~377)**

Find:
```
The orchestrator waits for both `step-8-content-status.json` and `step-8-brand-status.json` before marking step 8 complete.
```
Replace with:
```
The orchestrator waits for both `of1-extract-content-status.json` and `of1-extract-brand-voice-status.json` before treating the content pair as complete.
```

- [ ] **Step 3: Replace the body field**

Find:
```json
{"step":8,"substep":"content","status":"done","summary":"Content metadata: [N] products, [M] personas, [P] use cases, [Q] features, [R] FAQs. All images on DA."}
```
Replace with:
```json
{"stage":3,"skill":"of1-extract-content","status":"done","summary":"Content metadata: [N] products, [M] personas, [P] use cases, [Q] features, [R] FAQs. All images on DA."}
```

- [ ] **Step 4: Verify**

Run: `grep -n 'step-8\|"step"\|substep' skills/of1-extract-content/SKILL.md`
Expected: no output. (The prose "Step 7"/"Step 9" cross-references to other skills' work will be handled in Task 12; this grep only targets `step-8`, `"step"`, `substep`.)

- [ ] **Step 5: Commit**

```bash
git add skills/of1-extract-content/SKILL.md
git commit -m "refactor(of1-extract-content): status file+body use {stage,skill}, drop substep"
```

---

### Task 7: Migrate `of1-build-quick-suggestions` status file + body (stage 3)

**Files:**
- Modify: `skills/of1-build-quick-suggestions/SKILL.md:15,122,123`

**Interfaces:**
- Produces: `of1-build-quick-suggestions-status.json`, body `{"stage": 3, "skill": "of1-build-quick-suggestions", …}`.

- [ ] **Step 1: Update env-table row (line ~15)**

Find: `| `OF1_STATE_DIR` | state + IPC dir; receives `step-9-status.json` |`
Replace `step-9-status.json` with `of1-build-quick-suggestions-status.json`.

- [ ] **Step 2: Rename the status write (line ~122)**

Find:
```bash
cat > "$OF1_STATE_DIR/step-9-status.json" <<EOF
```
Replace with:
```bash
cat > "$OF1_STATE_DIR/of1-build-quick-suggestions-status.json" <<EOF
```

- [ ] **Step 3: Replace the body (line ~123)**

Find:
```json
{"step":9,"status":"done","summary":"Generated [N] suggestion chips covering [intents covered]."}
```
Replace with:
```json
{"stage":3,"skill":"of1-build-quick-suggestions","status":"done","summary":"Generated [N] suggestion chips covering [intents covered]."}
```

- [ ] **Step 4: Verify**

Run: `grep -n 'step-9\|"step"' skills/of1-build-quick-suggestions/SKILL.md`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add skills/of1-build-quick-suggestions/SKILL.md
git commit -m "refactor(of1-build-quick-suggestions): status file+body use {stage,skill}"
```

---

### Task 8: Migrate `of1-build-cta-template` status file + body (stage 3)

**Files:**
- Modify: `skills/of1-build-cta-template/SKILL.md:15,132,133`

**Interfaces:**
- Produces: `of1-build-cta-template-status.json`, body `{"stage": 3, "skill": "of1-build-cta-template", …}`.

- [ ] **Step 1: Update env-table row (line ~15)**

Find: `| `OF1_STATE_DIR` | state + IPC dir; receives `step-10-status.json` |`
Replace `step-10-status.json` with `of1-build-cta-template-status.json`.

- [ ] **Step 2: Rename the status write (line ~132)**

Find:
```bash
cat > "$OF1_STATE_DIR/step-10-status.json" <<EOF
```
Replace with:
```bash
cat > "$OF1_STATE_DIR/of1-build-cta-template-status.json" <<EOF
```

- [ ] **Step 3: Replace the body (line ~133)**

Find:
```json
{"step":10,"status":"done","summary":"CTA template generated: [brief visual description]"}
```
Replace with:
```json
{"stage":3,"skill":"of1-build-cta-template","status":"done","summary":"CTA template generated: [brief visual description]"}
```

- [ ] **Step 4: Verify**

Run: `grep -n 'step-10\|"step"' skills/of1-build-cta-template/SKILL.md`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add skills/of1-build-cta-template/SKILL.md
git commit -m "refactor(of1-build-cta-template): status file+body use {stage,skill}"
```

---

### Task 9: Migrate `of1-generate-config-review` + `of1-publish` (inline, stage 3)

**Files:**
- Modify: `skills/of1-generate-config-review/SKILL.md:15,99,101`
- Modify: `skills/of1-publish/SKILL.md:15,348,350`

**Interfaces:**
- Produces: `of1-generate-config-review-status.json` `{"stage":3,"skill":"of1-generate-config-review",…}` and `of1-publish-status.json` `{"stage":3,"skill":"of1-publish",…}`.

- [ ] **Step 1: config-review env-table row (line ~15)**

Find: `| `OF1_STATE_DIR` | … receives `step-11-status.json` |` and replace `step-11-status.json` with `of1-generate-config-review-status.json`.

- [ ] **Step 2: config-review status write (line ~99)**

Find:
```bash
cat > "$OF1_STATE_DIR/step-11-status.json" <<EOF
```
Replace with:
```bash
cat > "$OF1_STATE_DIR/of1-generate-config-review-status.json" <<EOF
```

- [ ] **Step 3: config-review body (line ~101)**

Find:
```json
  "step": 11,
```
Replace with:
```json
  "stage": 3,
  "skill": "of1-generate-config-review",
```

- [ ] **Step 4: publish env-table row (line ~15)**

Find: `| `OF1_STATE_DIR` | state + IPC dir; receives `step-12-status.json` |` and replace `step-12-status.json` with `of1-publish-status.json`.

- [ ] **Step 5: publish status write (line ~348)**

Find:
```bash
cat > "$OF1_STATE_DIR/step-12-status.json" <<EOF
```
Replace with:
```bash
cat > "$OF1_STATE_DIR/of1-publish-status.json" <<EOF
```

- [ ] **Step 6: publish body (line ~350)**

Find:
```json
  "step": 12,
```
Replace with:
```json
  "stage": 3,
  "skill": "of1-publish",
```

- [ ] **Step 7: Verify both files**

Run: `grep -n 'step-11\|step-12\|"step"' skills/of1-generate-config-review/SKILL.md skills/of1-publish/SKILL.md`
Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add skills/of1-generate-config-review/SKILL.md skills/of1-publish/SKILL.md
git commit -m "refactor(config-review,publish): inline steps use {stage,skill} status"
```

---

### Task 10: Rewrite the orchestrator contract (`pipeline-contract.md`)

**Files:**
- Modify: `skills/of1-demo-orchestrator/knowledge/pipeline-contract.md` (§ status/output contract ~106-131, status-file table ~71, audit schema ~139-183, 3-stage model ~33-52)

**Interfaces:**
- Consumes: every skill's `of1-<skill>-status.json` from Tasks 1-9.
- Produces: the canonical grammar all skills + the orchestrator cite. Defines the audit record shape read by `fill-demo-hub.mjs` (Task 11).

- [ ] **Step 1: Rewrite the status-block grammar (~line 111-116)**

Find:
```json
{"step": "<id>", "status": "done" | "review" | "failed", "summary": "<one sentence>", "deliverables": [{"url": "...", "label": "..."}]}
```
Replace with:
```json
{"stage": <0-3>, "skill": "<of1-skill-name>", "status": "done" | "review" | "failed", "summary": "<one sentence>", "deliverables": [{"url": "...", "label": "..."}]}
```
Then find the `<id> is the exact step id from the graph (...)` bullet and replace it with:
```
- `stage` is the pipeline stage (0 Setup, 1 Discover, 2 Replica, 3 Integrate); `skill` is the exact
  of1-skill directory name. Skill-internal phases (`base`, `intent-*`, `assemble`) never appear here —
  they are visible only in the orchestrator's dispatch logs.
```

- [ ] **Step 2: Fix the status-file line (~line 117)**

Find:
```
- Status files are written to `$OF1_STATE_DIR/step-<id>-status.json` (SLICC: `/shared/of1-demo-orchestrator/`).
```
Replace with:
```
- Status files are written to `$OF1_STATE_DIR/of1-<skill>-status.json` (SLICC: `/shared/of1-demo-orchestrator/`).
```

- [ ] **Step 3: Update the state-file table row (~line 71)**

Find:
```
| `step-<id>-status.json` | each dispatched step | orchestrator | per-step status (grammar below) |
```
Replace with:
```
| `of1-<skill>-status.json` | each dispatched skill | orchestrator | per-skill status (grammar below) |
```

- [ ] **Step 4: Update the 3-stage model table (~line 39) and prose (~43-52)**

In the stage table, change any `steps 6–12` phrasing under stage 3 to `the of1-integration skills (Integrate stage)`. In the nesting-cap prose (~46-52), replace "dispatches each step 6–12 itself" with "dispatches each Integrate-stage skill itself" and "reading `of1-integration` as the step-definition + dependency reference" stays but drop the `6–12` numeral. Leave `stardust:replica` (stage 2) references intact.

- [ ] **Step 5: Rewrite the audit schema `stage` field (~line 143)**

Find:
```
| `stage` | Stage/step id (`1`, `2`, or a Stage 3 step id: `6-base`, `6a`…`6e`, `6-assemble`, `7`, `8a`, `8b`, `9`, `10`, `11`, `12`) |
```
Replace with two rows:
```
| `stage` | Stage number (`0`, `1`, `2`, or `3`) |
| `skill` | Skill id for stages 0/1/3 (`of1-build-templates`, `of1-publish`, …) or `stardust:replica`/`stardust:extract` for stage 2. Skill-internal phases (`base`, `intent-*`, `assemble`) may be appended as `skill#phase` for the multi-dispatch templates skill. |
```

- [ ] **Step 6: Update the audit example record (~line 175)**

Find:
```json
      "stage": "1", "name": "discovery", "model": "opus",
```
Replace with:
```json
      "stage": 1, "skill": "of1-discovery", "name": "discovery", "model": "opus",
```

- [ ] **Step 7: Update the deliverable-URL table (~line 127-131)**

In the `| Stage/step | Deliverable URL |` table, change the `3 — steps 6–12` row label to `3 — Integrate skills`. Leave the `1 — discovery` / `2 — replica` rows.

- [ ] **Step 8: Verify**

Run: `grep -n 'step-<id>\|step id\|steps 6.12\|"step"' skills/of1-demo-orchestrator/knowledge/pipeline-contract.md`
Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add skills/of1-demo-orchestrator/knowledge/pipeline-contract.md
git commit -m "refactor(pipeline-contract): {stage,skill} status grammar + audit schema"
```

---

### Task 11: Update the audit reader (`fill-demo-hub.mjs`)

**Files:**
- Modify: `skills/of1-publish/assets/fill-demo-hub.mjs:109,126`

**Interfaces:**
- Consumes: `pipeline-audit.json` records with `{stage: <number>, skill: "<id>", …}` per Task 10.

- [ ] **Step 1: Read the current audit-render rows**

Run: `sed -n '100,130p' skills/of1-publish/assets/fill-demo-hub.mjs`
Expected: `<td>${s.stage ?? s.step ?? '?'}</td>` (~109) and an `imp.stage ?? imp.step` reference (~126).

- [ ] **Step 2: Render stage + skill in the per-record row (line ~109)**

Find:
```javascript
    html += `<td style="padding:6px 8px;">${s.stage ?? s.step ?? '?'}</td>`;
```
Replace with:
```javascript
    // {stage,skill} is canonical; s.step is the retired legacy shape (older audits).
    const stageLabel = s.skill ? `${s.stage ?? '?'} · ${s.skill}` : (s.stage ?? s.step ?? '?');
    html += `<td style="padding:6px 8px;">${htmlEscape(String(stageLabel))}</td>`;
```

- [ ] **Step 3: Update the improvements row (line ~126)**

Find:
```javascript
      html += `  <div style="color:var(--orange);margin-bottom:4px;">Stage ${imp.stage ?? imp.step ?? '?'} — ${htmlEscape(imp.issue ?? '')}</div>\n`;
```
Replace with:
```javascript
      const impLabel = imp.skill ? `${imp.stage ?? '?'} · ${imp.skill}` : (imp.stage ?? imp.step ?? '?');
      html += `  <div style="color:var(--orange);margin-bottom:4px;">Stage ${htmlEscape(String(impLabel))} — ${htmlEscape(imp.issue ?? '')}</div>\n`;
```

- [ ] **Step 4: Verify the module parses**

Run: `node --check skills/of1-publish/assets/fill-demo-hub.mjs && echo OK`
Expected: `OK`.

- [ ] **Step 5: Verify `htmlEscape` is in scope**

Run: `grep -n 'function htmlEscape\|const htmlEscape\|htmlEscape =' skills/of1-publish/assets/fill-demo-hub.mjs`
Expected: a definition line (confirms the new `htmlEscape(...)` calls resolve).

- [ ] **Step 6: Commit**

```bash
git add skills/of1-publish/assets/fill-demo-hub.mjs
git commit -m "refactor(fill-demo-hub): render {stage,skill} audit records, legacy step fallback"
```

---

### Task 12: Rewrite dispatch docs + orchestrator SKILL + of1-integration graph + status-file READER

**Files:**
- Modify: `skills/of1-demo-orchestrator/knowledge/dispatch-cc.md` (status block ~81, 114; step-dispatch template ~85-91; prose 6–12, 6-base∥7∥10)
- Modify: `skills/of1-demo-orchestrator/knowledge/dispatch-slicc.md` (scoop names ~47-49; approve/revise `<step>` ~38-41; status blocks ~79,104; step prose ~13-14,113-134; **the `step-<id>-status.json` READER convention ~136,142; the `case "$N"` id→subStep map ~157-168**)
- Modify: `skills/of1-demo-orchestrator/SKILL.md` (stage table + steps 6–12 prose ~90-118)
- Modify: `skills/of1-integration/SKILL.md` (step graph ~55-93; `step-3-status.json` ~49; env/completion; internal-phase status filenames)
- Modify: `skills/of1-build-templates/SKILL.md` (the internal phase status files `step-6-base-status.json` ~260, `step-6-intent-${INTENT}-status.json` ~381 — deferred here from Task 3 because they are read by the dispatch-slicc reader this task rewrites)

**Interfaces:**
- Consumes: every skill's `of1-<skill>-status.json` (Tasks 1-9) and the status grammar from Task 10. This task migrates the READER side (dispatch-slicc) to match the filenames the writers now emit — the two are a producer/consumer pair and MUST end this task consistent.
- Produces: dispatch templates + internal DAG keyed on `skill + phase`, SLICC scoop names `of1-s3-<skill>[-<phase>]`, and the completion reader that maps each skill/phase → the sprinkle `subStep` key.

**Critical context — the producer/consumer pair:** Tasks 1-9 renamed the *main* status files to `of1-<skill>-status.json` but the of1-build-templates *phase* files were intentionally left as `step-6-base-status.json` / `step-6-intent-${INTENT}-status.json` for this task. The consumer of ALL of these is `dispatch-slicc.md`: its "Handling completions" reader (~142) reads `step-<id>-status.json`, and its Stage-3 sub-progress `case "$N"` (157-168) maps step ids → subStep keys (`templates/styling/brand/content/suggest/cta/config/deploy`). After this task, the reader must read `of1-<skill>-status.json` + the migrated phase filenames, and the `case` must key on skill/phase, not step numbers. **The subStep KEYS themselves (`brand, content, suggest, templates, styling, cta, config, deploy`) do NOT change — they are a separate sprinkle-widget contract (line 175); only what maps TO them changes.**

- [ ] **Step 1: dispatch-cc.md — status block (line ~81)**

Find:
```json
{"step": 2, "status": "done"|"failed", "summary": "...", "deliverables": [{"url":"...","label":"..."}]}
```
Replace with:
```json
{"stage": 2, "skill": "stardust:replica", "status": "done"|"failed", "summary": "...", "deliverables": [{"url":"...","label":"..."}]}
```

- [ ] **Step 2: dispatch-cc.md — step-dispatch template header (line ~91)**

Find:
```
You are executing **Step N (<step-name>)** of the OF1 demo pipeline for `<DOMAIN>`.
```
Replace with:
```
You are executing the **<skill> skill** (Integrate stage) of the OF1 demo pipeline for `<DOMAIN>`.
```

- [ ] **Step 3: dispatch-cc.md — the output-contract example (~line 114-122)**

Run: `sed -n '114,126p' skills/of1-demo-orchestrator/knowledge/dispatch-cc.md` and replace the `{"step": N, …}` example block with:
```json
{"stage": 3, "skill": "<skill>", "status": "done" | "review" | "failed", "summary": "<one sentence>", "deliverables": [{"url": "...", "label": "..."}]}
```

- [ ] **Step 4: dispatch-cc.md — prose step numbers**

Find every `step 6–12`, `step 12`, `6-base ∥ 7 ∥ 10`, `6a–6e` reference in prose (lines ~60-61 and elsewhere) and reword to skill+phase: e.g. "dispatch `of1-build-templates`(base) ∥ `of1-style-generative-block` ∥ `of1-build-cta-template` once the replica is done; `of1-build-templates`(intent-*) once base returns. When `of1-publish` returns `done`, the pipeline is complete." Keep the *shape* of the DAG; only the identifiers change.

- [ ] **Step 5: dispatch-slicc.md — scoop names (lines ~47-49)**

Find the scoop-naming spec:
```
`of1-s1-discovery`, `of1-s2-replica`, and one per Stage 3 step — `of1-s3-<step-id>-<slug>`
```
Replace with:
```
`of1-s1-discovery`, `of1-s2-replica`, and one per Integrate-stage skill — `of1-s3-<skill>[-<phase>]`
```
Then update the parenthetical examples (`of1-s3-7-styling`, `of1-s3-9-suggest`, `of1-s3-10-cta`) to `of1-s3-styling`, `of1-s3-suggest`, `of1-s3-cta` (drop the numeral; keep the slug). The templates phases become `of1-s3-templates-base`, `of1-s3-templates-intent-comparison`, …, `of1-s3-templates-assemble`.

- [ ] **Step 6: dispatch-slicc.md — approve/revise lick args (lines ~38-41)**

Find `**`approve:<step>:<domain>`**` and `**`revise:<step>:<domain>`**` and change `<step>` to `<skill>` in both, updating the surrounding prose ("the user approved a review-gated Stage 3 skill", "re-dispatch just that skill's scoop").

- [ ] **Step 7: dispatch-slicc.md — status blocks (lines ~79, 104) + step prose (~13-14, 113-134)**

Replace the two `{"step":2,...}` example blocks with `{"stage":2,"skill":"stardust:replica",...}`. In the model-per-step prose (~13-14) reword "step 7 (styling) and step 3" to "`of1-style-generative-block` and the extraction step". In the Stage-3 fan-out prose (~133-134) reword `step 3 … → 6-base ∥ 7 ∥ 10; then 6a–6e; then 6-assemble. Step 9 after 8a+8b` to the skill+phase equivalents.

- [ ] **Step 8: of1-demo-orchestrator/SKILL.md — stage table + prose (~90-118)**

In the "Stage → skill mapping" table, change the stage-3 row `OF1 integration (steps 6–12)` to `OF1 integration (Integrate skills)`. In prose (~95-97, 100-101, 115-118) replace `step 3 … → 6-base ∥ 7 ∥ 10 → 6a–6e → 6-assemble; step 9 after 8a+8b; step 11 (inline) after 8a+8b+9+10; step 12 (deploy, inline) after 6-assemble+7+11` with the skill+phase DAG description, and `steps 6–12`/`step 12` with skill names (`of1-publish` for the terminal).

- [ ] **Step 9: of1-integration/SKILL.md — step graph (~55-93)**

Rewrite the ASCII step graph and the trigger table to use skill names + phases instead of `1/3/6-base/6a…/7/8a/8b/9/10/11/12`. Mapping to apply:
```
1        -> of1-check-dependencies (setup)
3        -> extraction (stardust:extract) / replica gate
6-base   -> of1-build-templates(base)
6a–6e    -> of1-build-templates(intent-comparison|intent-recommendation|intent-deep-dive|intent-budget|intent-discovery)
6-assemble -> of1-build-templates(assemble)
7        -> of1-style-generative-block
8a       -> of1-extract-brand-voice
8b       -> of1-extract-content
9        -> of1-build-quick-suggestions
10       -> of1-build-cta-template
11       -> of1-generate-config-review (inline)
12       -> of1-publish (inline)
```
Preserve every dependency edge exactly (same DAG, new labels). The trigger table's "Dispatch in one message" column lists the skills that become eligible together.

- [ ] **Step 10: of1-integration/SKILL.md — `step-3-status.json` reference (line ~49)**

Find `writes `step-3-status.json` with `"status":"done"`` and reword to `reports the extraction skill's status as `"done"`` (extraction is stardust's; no of1 status file is written for the skip case — confirm by reading lines 45-52 first and preserve the skip-vs-run logic).

- [ ] **Step 11: Migrate of1-build-templates internal phase status files**

These were deferred from Task 3 because their reader lives in dispatch-slicc (migrated in Step 12 below). In `skills/of1-build-templates/SKILL.md`:

Find (line ~260):
```bash
echo "{\"step\":6,\"substep\":\"base\",\"status\":\"done\",\"summary\":\"Generated styles/of1-template-base.css with brand tokens.\"}" \
  > "$OF1_STATE_DIR/step-6-base-status.json"
```
Replace with:
```bash
echo "{\"stage\":3,\"skill\":\"of1-build-templates\",\"phase\":\"base\",\"status\":\"done\",\"summary\":\"Generated styles/of1-template-base.css with brand tokens.\"}" \
  > "$OF1_STATE_DIR/of1-build-templates-base-status.json"
```

Find (line ~381):
```bash
echo "{\"step\":6,\"substep\":\"intent-${INTENT}\",\"status\":\"done\",\"summary\":\"Generated 3 ${INTENT} variations.\"}" \
  > "$OF1_STATE_DIR/step-6-intent-${INTENT}-status.json"
```
Replace with:
```bash
echo "{\"stage\":3,\"skill\":\"of1-build-templates\",\"phase\":\"intent-${INTENT}\",\"status\":\"done\",\"summary\":\"Generated 3 ${INTENT} variations.\"}" \
  > "$OF1_STATE_DIR/of1-build-templates-intent-${INTENT}-status.json"
```
(Note: `substep` → `phase` for consistency with the {stage,skill} model. If an `assemble`-phase status write exists elsewhere in the file, migrate it the same way: `of1-build-templates-assemble-status.json`, body `{stage:3,skill:of1-build-templates,phase:assemble,...}`. Grep the file for `step-6-assemble` first.)

- [ ] **Step 12: dispatch-slicc.md — migrate the completion READER + case map (~136,142,157-168)**

Find the reader convention (line ~136):
```
- Each step scoop reads its own step skill first and writes `step-<id>-status.json`; does NOT call
```
Replace `step-<id>-status.json` with `of1-<skill>-status.json` (phase scoops of of1-build-templates write `of1-build-templates-<phase>-status.json`).

Find (line ~142): `Read the scoop's `step-<id>-status.json` / deliverable output.` and replace `step-<id>-status.json` with `of1-<skill>-status.json`.

Rewrite the `case "$N"` block (~157-168) to key on skill/phase instead of step number. The subStep KEYS on the right stay identical:
```bash
case "$SKILL_OR_PHASE" in
  of1-build-templates*)        KEY=templates ;;   # base | intent-* | assemble | main
  of1-style-generative-block)  KEY=styling ;;
  of1-extract-brand-voice)     KEY=brand ;;
  of1-extract-content)         KEY=content ;;
  of1-build-quick-suggestions) KEY=suggest ;;
  of1-build-cta-template)      KEY=cta ;;
  of1-generate-config-review)  KEY=config ;;
  of1-publish)                 KEY=deploy ;;
  *)                           KEY="" ;;
esac
[ -n "$KEY" ] && sprinkle send of1-demo-orchestrator "{\"stage\":3,\"subStep\":\"$KEY\",\"status\":\"$S\"}"
```
Update the surrounding prose (~153-154) that says "map N to the subStep key" to reference the skill/phase name instead of the numeric step id `N`. Leave the line-175 statement that the subStep keys must match `subSteps[]` intact.

- [ ] **Step 13: Verify all five files**

Run:
```bash
grep -nE 'step 6.12|steps 6.12|step-[0-9]|"step"|\bstep-<id>|of1-s3-[0-9]' \
  skills/of1-demo-orchestrator/knowledge/dispatch-cc.md \
  skills/of1-demo-orchestrator/knowledge/dispatch-slicc.md \
  skills/of1-demo-orchestrator/SKILL.md \
  skills/of1-integration/SKILL.md \
  skills/of1-build-templates/SKILL.md
```
Expected: no output. Bare `6-base`/`6a`/`8a`/`8b` tokens may survive ONLY as skill-internal phase labels in prose (e.g. `of1-build-templates(base)`), never as `step-6-base` filenames or bare step ids in a dispatch/case context. If the grep flags a prose phase-label, confirm it's a `skill(phase)` form and not a status-file/step-id reference.

- [ ] **Step 14: Commit**

```bash
git add skills/of1-demo-orchestrator/ skills/of1-integration/SKILL.md skills/of1-build-templates/SKILL.md
git commit -m "refactor(orchestrator): dispatch docs + DAG + status reader use skill-name identity"
```

---

### Task 13: Repo-wide gate + README

**Files:**
- Modify: `README.md` (stage/step table if it uses step numbers)
- Verify: whole `skills/` tree

**Interfaces:**
- Consumes: all prior tasks.

- [ ] **Step 1: Repo-wide grep gate for surviving step identifiers (status files + JSON fields)**

Run:
```bash
grep -rnE 'step-[0-9]+[a-z]*-(status|output)|"step"[: ]*[0-9]' skills 2>/dev/null
```
Expected: no output. If any hit remains, fix it in its owning skill before proceeding.

- [ ] **Step 2: Grep for `"step"` JSON field anywhere in skills**

Run: `grep -rn '"step"' skills 2>/dev/null`
Expected: no output.

- [ ] **Step 2b: Broad PROSE step-number gate (the narrow gates above miss "step 12"/"steps 6–12"/DAG notation)**

The Task 10 review proved the status-file/JSON grep is too narrow — prose like `step 12`, `steps 6–12`, `steps 11/12`, and DAG notation like `6·7·10 → 6-assemble → 11 → 12` slip through. Run the broad gate over the orchestrator + integration docs (the only places that carry pipeline-ordering prose):
```bash
grep -rnE '\bstep[s]? [0-9]|[0-9][·-]?7[·-]10|6-assemble|6-base|11/12|6–12|of1-s3-[0-9]' \
  skills/of1-demo-orchestrator skills/of1-integration/SKILL.md skills/of1-build-templates/SKILL.md 2>/dev/null
```
Expected: no output, EXCEPT lines where a bare phase token appears only as a `skill(phase)` label (e.g. `of1-build-templates(base)`) — inspect each hit and confirm it is not a step-number identity or `step-<id>` filename. The intentionally-preserved `stardust:replica`/`stardust:extract` mentions and generic number-free "Stage/step" heading nouns will not match this pattern.

- [ ] **Step 3: Update README stage/step references**

Run: `grep -n 'step\|Step\|stage\|Stage' README.md`
Review the Stage-3 rows. Replace any `steps 6–12` / step-numbered phrasing with skill-name / stage phrasing consistent with the new model. Leave the high-level "3 stages" framing.

- [ ] **Step 4: Validate every emitted status JSON blob parses**

Run:
```bash
for skill in of1-check-dependencies of1-discovery of1-build-templates of1-style-generative-block \
  of1-extract-brand-voice of1-extract-content of1-build-quick-suggestions of1-build-cta-template \
  of1-generate-config-review of1-publish; do
  grep -h '"stage"' skills/$skill/SKILL.md 2>/dev/null | grep -oE '\{"stage".*\}' | while read -r j; do
    echo "$j" | sed 's/\[[^]]*\]/"x"/g' | jq -e . >/dev/null 2>&1 && echo "$skill: OK" || echo "$skill: (multiline body — check manually)"
  done
done
```
Expected: `OK` for single-line blobs; multiline blobs (config-review, publish, discovery, templates) are checked visually in their own tasks.

- [ ] **Step 5: bash + node re-check**

Run:
```bash
bash -n skills/of1-check-dependencies/scripts/verify.sh && echo "verify.sh OK"
node --check skills/of1-publish/assets/fill-demo-hub.mjs && echo "fill-demo-hub OK"
```
Expected: both OK.

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "refactor(of1-skills): README stage/skill vocabulary + migration gate"
```

---

## Post-plan: of1-labs alignment (SEPARATE, note only — do NOT do in this plan)

The of1-labs container's `step-tracker.ts` currently emits **numeric** `{step}` events and infers steps from agent labels. Rollout spec stage 3 rewrites it to emit `{stage, skill}` and is a **manual container-image rollout** — out of scope here. The of1-labs webhook already accepts both shapes (stage 1, shipped), so these skill changes are safe to ship first: on SLICC the orchestrator/cone POSTs whatever `of1-prompt.ts` documents (still numeric until that doc is updated in stage 3), and on CC the container still infers numerically. **This plan does not change runtime progress emission** — only the skills' own status files + orchestrator contract, which are consumed by the orchestrator itself, not the labs webhook directly.

## Self-Review

**Spec coverage:** status files (Tasks 1-9), status body `{stage,skill}` (1-9), audit schema (10), audit reader (11), dispatch docs + DAG (12), sub-units stay internal (12 step 9), README (13). Legacy fallback in reader (11) matches spec's "no backfill". ✓

**Deferred per spec:** container `step-tracker.ts` rewrite and `of1-prompt.ts` step-map are rollout stage 3 (manual image rollout) — explicitly noted as out of scope. ✓

**Placeholder scan:** every code/edit step shows exact find/replace strings. Filename-uncertain writes (Tasks 5, 6) instruct reading the heredoc first because the brand/content skills' current filenames weren't pinned in the survey. ✓

**Type consistency:** status body is `{stage:<number>, skill:<string>, status, summary, deliverables}` everywhere; audit record is `{stage:<number>, skill:<string>, name, …}`; scoop names `of1-s3-<skill>[-<phase>]`. Consistent across Tasks 9-12. ✓
