# skills-v5 Prototype + Snowflake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `skills-v5` a distinct pipeline variant whose Stage 2 is `stardust:extract → stardust:prototype → snowflake` (mirroring `main`/v4), and teach the OF1 Labs event API + dashboard to track it as a third variant.

**Architecture:** Two repos. (A) `of1-demo-skills` branch `skills-v5`: rebuild Stage 2 into three substep skills (`of1-extract-design`, ported `of1-prototype`, ported `of1-snowflake`) and rewire the shared orchestrator/`of1-integration` docs. (B) `of1-labs` branch `skills-v5-support`: widen the coarse `v4|v5` version discriminant to a third `"v5-prototype"` value across both build roots (service `pipeline-map.ts` + container `step-tracker.ts`), add prototype step maps / predecessors / status-file maps, thread the variant into the legacy reverse-map and start-prompt step table, and render a prototype-specific Stage-2 in the dashboard step tracker.

**Tech Stack:** Markdown skill instruction files (of1-demo-skills, no test harness — verified structurally); TypeScript on Cloudflare Workers + React Router (of1-labs), Vitest for container unit tests, Biome for lint/format.

**Spec:** `docs/superpowers/specs/2026-08-18-skills-v5-prototype-snowflake-design.md`

## Global Constraints

- **`"v5"` literal keeps meaning replica** everywhere; the new prototype variant is `"v5-prototype"`. Do not repurpose the existing `"v5"` maps/labels.
- **The `SkillsVersion` type and the v5 maps exist TWICE** — `of1-labs/service/src/lib/pipeline-map.ts` and `of1-labs/container/src/step-tracker.ts` — with no shared import. Every variant addition must be mirrored in BOTH build roots (see the sync comments at `step-tracker.ts:19-33` and `pipeline-map.ts:58-63`).
- **Prototype numeric step layout (contiguous 1–12):** 1=of1-check-dependencies, 2=of1-discovery, 3=of1-extract-design, 4=of1-prototype, 5=of1-snowflake, 6=of1-build-templates, 7=of1-style-generative-block, 8=of1-extract-brand-voice/of1-extract-content, 9=of1-build-quick-suggestions, 10=of1-build-cta-template, 11=config-review, 12=of1-publish. Terminal step = 12. (Stage-3 numbering 6–12 is identical to replica-v5; only Stage 2 differs: replica uses 3 + conditional 4, prototype uses 3/4/5.)
- **v5 skill status-file convention:** each skill writes `$OF1_STATE_DIR/of1-<skill>-status.json` with `{ "stage": <n>, "skill": "<id>", "status": "review|done|failed", "deliverables": [{url,label?}], "summary": "..." }`.
- **Branch predicate (both build roots, identical logic):** not `^skills-v5` → `"v4"`; `^skills-v5$` or `^skills-v5-prototype` → `"v5-prototype"`; any other `^skills-v5*` (incl. `skills-v5-replica`) → `"v5"`.
- Snowflake is live at `adobe/skills → plugins/aem/edge-delivery-services/skills/snowflake`; the container installs `aem-edge-delivery-services@adobe-skills` unpinned, so it is available at build time. Do NOT substitute `stardust:deploy`.
- of1-demo-skills work is committed on branch `skills-v5`; of1-labs work is committed on branch `skills-v5-support`. Both are already checked out.

---

## Part A — of1-demo-skills (branch `skills-v5`)

Repo root: `/Users/quentinvecchio/workspace/labs/of1/of1-demo-skills`. Skill files are markdown; there is no unit-test harness, so each task's verification is a set of `grep`/structural assertions plus `bash -n` on any shell scripts, then a commit.

### Task A1: New `of1-extract-design` skill + rewire of1-integration's extraction

**Files:**
- Create: `skills/of1-extract-design/SKILL.md`
- Create: `skills/of1-extract-design/assets/fill-brand-review.mjs` (port of main's brand-review fill helper)
- Create: `skills/of1-extract-design/assets/brand-review-template.html`
- Modify: `skills/of1-integration/SKILL.md` (extraction step + step graph)

**Interfaces:**
- Produces: skill id `of1-extract-design` (stage 2); writes `$OF1_STATE_DIR/of1-extract-design-status.json` (`{stage:2, skill:"of1-extract-design", ...}`) and `stardust/current/DESIGN.json` + `deliverables/brand-review.html`. Consumed by Task A2 (of1-prototype) and by of1-integration's artifact-detection gate.
- Takes a target URL argument: the external domain (Stage 2a on skills-v5) or the EDS preview URL (of1-integration fallback).

- [ ] **Step 1: Seed the skill from main's `of1-extraction`**

```bash
cd /Users/quentinvecchio/workspace/labs/of1/of1-demo-skills
mkdir -p skills/of1-extract-design/assets
git show main:skills/of1-extraction/SKILL.md > skills/of1-extract-design/SKILL.md
git show main:skills/of1-extraction/assets/brand-review-template.html > skills/of1-extract-design/assets/brand-review-template.html
git show main:skills/of1-extraction/assets/fill-brand-review.py > skills/of1-extract-design/assets/fill-brand-review.mjs.orig
```
(The `.py`/`.jsh` helpers are references; the v5 line uses `assets/*.mjs`. In Step 3 you rewrite the fill helper as `fill-brand-review.mjs`; delete the `.orig` reference copy before committing.)

- [ ] **Step 2: Rewrite the frontmatter + intro for v5 conventions**

Replace the frontmatter block at the top of `skills/of1-extract-design/SKILL.md` with:

```markdown
---
name: of1-extract-design
description: Capture a live site's design tokens, brand surface, screenshots, per-page image URLs, and logo via stardust:extract, then publish a brand-review page. Stage 2a of the prototype+snowflake pipeline; also the extraction step of of1-integration when no DESIGN.json exists yet.
user-invocable: false
---
```

Apply these adaptations in the body:
- Env table: drop the `step-4-status.json` reference; state that this skill writes `$OF1_STATE_DIR/of1-extract-design-status.json` on completion (see the Completion block added in Step 4).
- Inputs: the target URL is an argument — the live external domain when run as Stage 2a, or the EDS preview URL when run as of1-integration's extraction fallback. Keep the page cap of 3 (homepage + 2 key pages).
- Keep the "DO NOT crawl by hand — delegate to `stardust:extract`" rule verbatim.
- DESIGN.json output path: `stardust/current/DESIGN.json` (the shared resolver's first path).

- [ ] **Step 3: Add the fail-loud-on-bot-block guard**

In the "Process" section, after the `stardust:extract` invocation, add a hard-stop check. Paste this block (adjust the surrounding prose to match the file's voice):

```markdown
### Fail loud on a blocked/degraded capture

`stardust:extract` can silently capture placeholder/gradient imagery instead of real
product photography when the source bot-blocks the crawler. That degraded capture must NOT
flow into prototype + snowflake. After extraction, verify the capture is real:

- If `stardust:extract` surfaces a machine-readable blocked-capture signal (a non-zero exit,
  or a `blocked`/`degraded` field in `stardust/state.json`), hard-stop: write
  `of1-extract-design-status.json` with `"status": "failed"` and a `summary` naming the block,
  and stop Stage 2. Do NOT proceed to prototype.
- If no machine-readable signal exists, inspect the captured screenshots / `stardust/current/pages/*.json`
  for placeholder or flat-gradient imagery; on detection, fail the same way.
```

(Implementation note for the executor: confirm what `stardust:extract` actually emits on a blocked capture before finalizing the first bullet; if it only emits prose, keep only the second bullet's screenshot inspection.)

- [ ] **Step 4: Add the v5 Completion block**

Append to `skills/of1-extract-design/SKILL.md`:

```markdown
## Completion

```bash
REPORT_URL="https://${BRANCH}--${REPO}--${OWNER}.aem.page/deliverables/brand-review.html"
cat > "$OF1_STATE_DIR/of1-extract-design-status.json" <<EOF
{
  "stage": 2,
  "skill": "of1-extract-design",
  "status": "review",
  "deliverables": [ { "url": "${REPORT_URL}", "label": "Brand review" } ],
  "summary": "Extracted design tokens + brand surface for [domain]. [N] pages captured."
}
EOF
```
```

- [ ] **Step 5: Port the brand-review fill helper to `.mjs`**

Rewrite `skills/of1-extract-design/assets/fill-brand-review.mjs` as a Node ESM script mirroring the logic of the `.py` reference (read a values JSON, fill `brand-review-template.html`, write the output). Then remove the reference copy:

```bash
rm skills/of1-extract-design/assets/fill-brand-review.mjs.orig
node --check skills/of1-extract-design/assets/fill-brand-review.mjs
```
Expected: `node --check` exits 0 (no syntax error).

- [ ] **Step 6: Rewire of1-integration's extraction step to dispatch this skill**

In `skills/of1-integration/SKILL.md`, in the "Artifact detection (inline)" section, replace the sentence that begins "If `HAS_DESIGN_JSON=false`, the extraction step invokes `stardust:extract` directly against the site's own EDS preview URL…" with:

```markdown
If `HAS_DESIGN_JSON=false`, the extraction step runs the `of1-extract-design` skill (inline via
the Skill tool) against the site's own EDS preview URL
(`https://<branch>--<repo>--<owner>.aem.page`) to produce `stardust/current/DESIGN.json` (plus
`DESIGN.md`, screenshots, and `deliverables/brand-review.html`). If `true`, the extraction step
is skipped entirely — of1-integration reports the extraction step's status as `"done"` either
way.
```

In the "## Step graph" ASCII block, change the `no → extraction (stardust:extract against the site's own preview URL)` line to `no → extraction (of1-extract-design against the site's own preview URL)`.

- [ ] **Step 7: Structural verification**

```bash
cd /Users/quentinvecchio/workspace/labs/of1/of1-demo-skills
grep -q '^name: of1-extract-design$' skills/of1-extract-design/SKILL.md && echo OK-name
grep -q 'of1-extract-design-status.json' skills/of1-extract-design/SKILL.md && echo OK-status
grep -q 'of1-extract-design' skills/of1-integration/SKILL.md && echo OK-integration-wired
! grep -q 'stardust:extract directly against the site' skills/of1-integration/SKILL.md && echo OK-old-prose-gone
node --check skills/of1-extract-design/assets/fill-brand-review.mjs && echo OK-mjs
```
Expected: `OK-name`, `OK-status`, `OK-integration-wired`, `OK-old-prose-gone`, `OK-mjs`.

- [ ] **Step 8: Commit**

```bash
git add skills/of1-extract-design skills/of1-integration/SKILL.md
git commit -m "feat(of1-extract-design): new stage-2a extraction skill; wire into of1-integration"
```

### Task A2: Port `of1-prototype` to skills-v5

**Files:**
- Create: `skills/of1-prototype/SKILL.md` (ported from `main`)

**Interfaces:**
- Consumes: Task A1's `stardust/current/DESIGN.json` + screenshots.
- Produces: skill id `of1-prototype` (stage 2); `stardust/prototypes/prototype-*.html` mirrored to `deliverables/prototype-*.html`; writes `$OF1_STATE_DIR/of1-prototype-status.json`. Consumed by Task A3 (of1-snowflake).

- [ ] **Step 1: Seed from main**

```bash
cd /Users/quentinvecchio/workspace/labs/of1/of1-demo-skills
git show main:skills/of1-prototype/SKILL.md > skills/of1-prototype/SKILL.md
```

- [ ] **Step 2: Apply v5 adaptations**

Edit `skills/of1-prototype/SKILL.md`:
- Frontmatter `name: of1-prototype`, `user-invocable: false`; keep the description (generate pixel-perfect HTML prototypes via `stardust:prototype`).
- Env table: replace any `step-5-status.json` reference with `of1-prototype-status.json`.
- Inputs: consumes `stardust/current/DESIGN.json` + screenshots from `of1-extract-design` (was "step 4 extraction" on main); prototypes are the source-of-truth for the snowflake overlay (Task A3).
- Replace the v4 Completion/status block with the v5 convention:

```markdown
## Completion

```bash
cat > "$OF1_STATE_DIR/of1-prototype-status.json" <<EOF
{
  "stage": 2,
  "skill": "of1-prototype",
  "status": "review",
  "deliverables": [ { "url": "https://${BRANCH}--${REPO}--${OWNER}.aem.page/deliverables/prototype-home.html", "label": "Home prototype" } ],
  "summary": "[N] prototypes generated and mirrored to deliverables/."
}
EOF
```
```

- [ ] **Step 3: Structural verification**

```bash
grep -q '^name: of1-prototype$' skills/of1-prototype/SKILL.md && echo OK-name
grep -q 'of1-prototype-status.json' skills/of1-prototype/SKILL.md && echo OK-status
grep -q 'stardust:prototype' skills/of1-prototype/SKILL.md && echo OK-wraps
! grep -q 'step-5-status.json' skills/of1-prototype/SKILL.md && echo OK-no-v4-status
```
Expected: all four `OK-*`.

- [ ] **Step 4: Commit**

```bash
git add skills/of1-prototype
git commit -m "feat(of1-prototype): port stage-2b prototype skill from main to skills-v5"
```

### Task A3: Port `of1-snowflake` to skills-v5 (writes the Stage-2 done file)

**Files:**
- Create: `skills/of1-snowflake/SKILL.md` (ported from `main`)

**Interfaces:**
- Consumes: Task A2's prototypes.
- Produces: skill id `of1-snowflake` (stage 2); EDS overlay artifacts; writes `$OF1_STATE_DIR/of1-snowflake-status.json` AND the Stage-2 done file `$OF1_STAGE2_DONE_FILE` (default basename `stage2-done.json`, shape `{"stage":2,"status":"done"}`). The done file is the gate the Stage-3 site-integration track waits on.

- [ ] **Step 1: Seed from main**

```bash
git show main:skills/of1-snowflake/SKILL.md > skills/of1-snowflake/SKILL.md
```

- [ ] **Step 2: Apply v5 adaptations**

Edit `skills/of1-snowflake/SKILL.md`:
- Frontmatter `name: of1-snowflake`, `user-invocable: false`; keep "thin per-prototype wrapper around the `snowflake` skill" description.
- Keep the per-prototype loop over `aem-edge-delivery-services:snowflake` and the branch-handling override (artifacts land on the demo branch).
- Env table: replace `step-6-status.json` with `of1-snowflake-status.json`; add `OF1_STAGE2_DONE_FILE` (path to the Stage-2 done file the orchestrator exports).
- Add the done-file write + v5 Completion at the tail:

```markdown
## Completion

```bash
cat > "$OF1_STATE_DIR/of1-snowflake-status.json" <<EOF
{ "stage": 2, "skill": "of1-snowflake", "status": "review",
  "deliverables": [ { "url": "https://${BRANCH}--${REPO}--${OWNER}.aem.page/", "label": "EDS site" } ],
  "summary": "[N] prototypes converted to EDS overlay pages." }
EOF

# Stage-2 done file — the Stage-3 site-integration track gates on this.
printf '{"stage":2,"status":"done"}' > "${OF1_STAGE2_DONE_FILE:?OF1_STAGE2_DONE_FILE unset}"
```
```

- [ ] **Step 3: Structural verification**

```bash
grep -q '^name: of1-snowflake$' skills/of1-snowflake/SKILL.md && echo OK-name
grep -q 'OF1_STAGE2_DONE_FILE' skills/of1-snowflake/SKILL.md && echo OK-donefile
grep -q 'of1-snowflake-status.json' skills/of1-snowflake/SKILL.md && echo OK-status
grep -qi 'snowflake' skills/of1-snowflake/SKILL.md && echo OK-wraps
```
Expected: all four `OK-*`.

- [ ] **Step 4: Commit**

```bash
git add skills/of1-snowflake
git commit -m "feat(of1-snowflake): port stage-2c snowflake skill from main; write OF1_STAGE2_DONE_FILE"
```

### Task A4: Rewire the orchestrator + shared knowledge docs for the three-substep Stage 2

**Files:**
- Modify: `skills/of1-demo-orchestrator/SKILL.md`
- Modify: `skills/of1-demo-orchestrator/knowledge/pipeline-contract.md`
- Modify: `skills/of1-demo-orchestrator/knowledge/dispatch-cc.md`
- Modify: `skills/of1-demo-orchestrator/knowledge/dispatch-slicc.md`
- Modify: `skills/of1-demo-orchestrator/knowledge/design-tokens-resolution.md`
- Modify: `skills/of1-demo-orchestrator/knowledge/common-pitfalls.md`
- Modify: `skills/of1-demo-orchestrator/of1-demo-orchestrator.shtml`
- Modify: `skills/of1-check-dependencies/SKILL.md` (+ `scripts/verify.sh`)
- Modify: `skills/of1-demo-orchestrator/assets/README.md`
- Delete: `skills/of1-demo-orchestrator/assets/check-replica-artifacts.mjs`

**Interfaces:**
- Consumes: skill ids `of1-extract-design` / `of1-prototype` / `of1-snowflake` (Tasks A1–A3) and the env var `OF1_STAGE2_DONE_FILE`.
- Produces: the branch's authoritative Stage-2 contract — three sequential substeps 2a→2b→2c, done-file `OF1_STAGE2_DONE_FILE`, no replica fidelity gate.

- [ ] **Step 1: Orchestrator SKILL.md — Stage 2 diagram + table**

In `skills/of1-demo-orchestrator/SKILL.md`:
- Update the frontmatter `description` and the "3 stages" prose: Stage 2 is now `extract → prototype → snowflake`, not `stardust:replica`.
- In the ASCII 3-stage diagram, replace the `Stage 2: stardust:replica --pages …` node with the three sequential substeps (2a `of1-extract-design` → 2b `of1-prototype` → 2c `of1-snowflake`), and change the gate the site-integration track waits on from `replica-done.json` to `$OF1_STAGE2_DONE_FILE`.
- In the "Stage → skill mapping" table, replace the single Stage-2 `stardust:replica` row with three rows (2a/2b/2c) naming the three skills and their outputs.
- In "What Stage 2 & 3 own", replace the "Pixel fidelity is owned by Stage 2 (`stardust:replica`) — it runs its own source-fidelity comparison/fix loop" paragraph with: fidelity owned by the sub-skills (`stardust:prototype`'s visual-diff loop; `snowflake`'s content checks); the orchestrator does an artifact-existence check after 2c; `of1-extract-design` fails loud on a blocked capture.

- [ ] **Step 2: pipeline-contract.md**

In `skills/of1-demo-orchestrator/knowledge/pipeline-contract.md`:
- 3-stage model table: Stage 2 = three substeps.
- State-files inventory: remove `replica-done.json` and `stardust/replica/progress.json`; add `stage2-done.json` (produced by 2c) and the extract/prototype/snowflake status files + outputs.
- Delete the "Stage 2 artifact gate" section; replace with the artifact-existence check + the 2a fail-loud note.
- Env-var table: `OF1_REPLICA_DONE_FILE` → `OF1_STAGE2_DONE_FILE`.
- Audit `skill` examples: `stardust:replica` → `stardust:extract` / `stardust:prototype` / `snowflake`.

- [ ] **Step 3: dispatch-cc.md and dispatch-slicc.md**

In both files: Stage 2 becomes three sequential dispatches (2a→2b→2c) instead of one replica dispatch (CC: three Agent dispatches; SLICC: three scoops). Rename `OF1_REPLICA_DONE_FILE` → `OF1_STAGE2_DONE_FILE` and set it to point at `stage2-done.json`. Update any "Stage 2 (replica) and the content track dispatch concurrently" prose to name the extract→prototype→snowflake chain.

- [ ] **Step 4: design-tokens-resolution.md + common-pitfalls.md**

- `design-tokens-resolution.md`: drop the replica `bounded-single` provenance case; DESIGN.json now always comes from `stardust:extract` (via `of1-extract-design`) at `stardust/current/`.
- `common-pitfalls.md`: repoint any replica-specific pointers to the extract/prototype/snowflake substeps.

- [ ] **Step 5: Progress UI (.shtml)**

In `skills/of1-demo-orchestrator/of1-demo-orchestrator.shtml`, render Stage 2 as three substep rows (extract / prototype / snowflake) in place of the single replica row.

- [ ] **Step 6: of1-check-dependencies + verify.sh**

In `skills/of1-check-dependencies/SKILL.md` and `skills/of1-check-dependencies/scripts/verify.sh`: require the `snowflake` skill (and `stardust:extract` / `stardust:prototype`); update any "incl. `stardust:replica`" line to name the three Stage-2 skills. Then:

```bash
bash -n skills/of1-check-dependencies/scripts/verify.sh && echo OK-verify-syntax
```
Expected: `OK-verify-syntax`.

- [ ] **Step 7: Delete the replica gate helper + its README entry**

```bash
git rm skills/of1-demo-orchestrator/assets/check-replica-artifacts.mjs
```
Remove the `check-replica-artifacts.mjs` row from `skills/of1-demo-orchestrator/assets/README.md`.

- [ ] **Step 8: Repo-wide dangling-reference sweep**

```bash
cd /Users/quentinvecchio/workspace/labs/of1/of1-demo-skills
grep -rn 'OF1_REPLICA_DONE_FILE\|check-replica-artifacts' skills/ | grep -v 'docs/superpowers'
grep -rn 'replica-done.json' skills/
```
Expected: no matches on `skills-v5` outside historical design docs. Fix any remaining Stage-2-boundary `replica` references (leave genuinely replica-specific text alone — none expected on this branch).

- [ ] **Step 9: Commit**

```bash
git add -A skills/of1-demo-orchestrator skills/of1-check-dependencies
git commit -m "refactor(orchestrator): skills-v5 Stage 2 = extract->prototype->snowflake; drop replica gate"
```

---

## Part B — of1-labs (branch `skills-v5-support`)

Repo root: `/Users/quentinvecchio/workspace/labs/of1/of1-labs`. TypeScript with Vitest. Run container tests with `npm test` inside `container/` (or `npx vitest run tests/step-tracker.test.ts`). Run `npx biome check --write` before each commit. The `service/` and `container/` are separate build roots — mirror shared types by hand.

### Task B1: service `pipeline-map.ts` — third variant + prototype skill set + variant-aware reverse map

**Files:**
- Modify: `service/src/lib/pipeline-map.ts`
- Test: `service/src/lib/pipeline-map.test.ts` (create if absent; otherwise extend)

**Interfaces:**
- Produces: `type SkillsVersion = "v4" | "v5" | "v5-prototype"`; `skillsVersion(skillsBranch): SkillsVersion`; `PROTOTYPE_PIPELINE_SKILLS: SkillInfo[]`; `SKILL_SET` widened to the union; `legacyStepToSkill(step, version): {stage, skill, legacy} | null` (now variant-aware). Consumed by Tasks B4 (store), B5 (pipelineLayout), B6 (StepTracker), B7 (of1-prompt), and the ingest handler.

- [ ] **Step 1: Write failing tests for the widened predicate + prototype reverse-map**

Create/append `service/src/lib/pipeline-map.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { skillsVersion, legacyStepToSkill, SKILL_SET } from "./pipeline-map";

describe("skillsVersion (three variants)", () => {
  it("maps bare skills-v5 to the prototype variant", () => {
    expect(skillsVersion("skills-v5")).toBe("v5-prototype");
    expect(skillsVersion("skills-v5-prototype")).toBe("v5-prototype");
  });
  it("keeps skills-v5-replica and other skills-v5* as replica v5", () => {
    expect(skillsVersion("skills-v5-replica")).toBe("v5");
    expect(skillsVersion("skills-v5-next")).toBe("v5");
  });
  it("defaults main/unset/other to v4", () => {
    expect(skillsVersion("main")).toBe("v4");
    expect(skillsVersion(undefined)).toBe("v4");
  });
});

describe("legacyStepToSkill (variant-aware Stage 2)", () => {
  it("maps prototype steps 3/4/5 to extract/prototype/snowflake", () => {
    expect(legacyStepToSkill(3, "v5-prototype")?.skill).toBe("of1-extract-design");
    expect(legacyStepToSkill(4, "v5-prototype")?.skill).toBe("of1-prototype");
    expect(legacyStepToSkill(5, "v5-prototype")?.skill).toBe("of1-snowflake");
  });
  it("keeps replica-v5 step 3 = stardust:replica and shares Stage 3 (6-12)", () => {
    expect(legacyStepToSkill(3, "v5")?.skill).toBe("stardust:replica");
    expect(legacyStepToSkill(6, "v5")?.skill).toBe("of1-build-templates");
    expect(legacyStepToSkill(6, "v5-prototype")?.skill).toBe("of1-build-templates");
  });
  it("includes the prototype Stage-2 skills in the union SKILL_SET", () => {
    expect(SKILL_SET.has("of1-extract-design")).toBe(true);
    expect(SKILL_SET.has("of1-prototype")).toBe(true);
    expect(SKILL_SET.has("of1-snowflake")).toBe(true);
    expect(SKILL_SET.has("stardust:replica")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd service && npx vitest run src/lib/pipeline-map.test.ts`
Expected: FAIL — `skillsVersion("skills-v5")` returns `"v5"`, `legacyStepToSkill` has arity 1, prototype skills absent from `SKILL_SET`.

- [ ] **Step 3: Widen the type + predicate**

In `service/src/lib/pipeline-map.ts`, replace lines 57 and 64–66:

```ts
export type SkillsVersion = "v4" | "v5" | "v5-prototype";

// A single of1-labs deploy serves several of1-demo-skills lines, selected by
// skillsBranch. `main`/other → v4. Among skills-v5* branches: bare `skills-v5`
// (and `skills-v5-prototype*`) is the extract->prototype->snowflake line
// ("v5-prototype"); `skills-v5-replica` and any other skills-v5* keep the
// replica line ("v5"). "v5" continues to mean the replica maps everywhere.
export function skillsVersion(skillsBranch?: string): SkillsVersion {
  const b = skillsBranch ?? "";
  if (!/^skills-v5/.test(b)) return "v4";
  if (/^skills-v5$/.test(b) || /^skills-v5-prototype/.test(b)) return "v5-prototype";
  return "v5";
}
```

- [ ] **Step 4: Add the prototype skill list + union SKILL_SET**

After `PIPELINE_SKILLS` (line 47), add the prototype list — identical to `PIPELINE_SKILLS` except Stage 2 has three skills instead of `stardust:replica`:

```ts
// Prototype v5 line: Stage 2 is extract -> prototype -> snowflake (mirrors main/v4).
// Stage 3 (of1-build-templates … of1-publish) is identical to PIPELINE_SKILLS.
export const PROTOTYPE_PIPELINE_SKILLS: SkillInfo[] = [
  PIPELINE_SKILLS[0], // of1-check-dependencies (stage 0)
  PIPELINE_SKILLS[1], // of1-discovery (stage 1)
  { skill: "of1-extract-design", stage: 2, label: "Extraction", desc: "Design tokens, brand surface, screenshots" },
  { skill: "of1-prototype", stage: 2, label: "Prototype", desc: "Pixel-perfect HTML reproductions of key pages" },
  { skill: "of1-snowflake", stage: 2, label: "Snowflake", desc: "Convert prototypes to EDS overlay pages" },
  ...PIPELINE_SKILLS.slice(3), // stage-3 skills, unchanged
];
```

Replace the `SKILL_SET` definition (line 49) with the union so the ingest gate accepts prototype skills regardless of variant:

```ts
export const SKILL_SET: Set<string> = new Set(
  [...PIPELINE_SKILLS, ...PROTOTYPE_PIPELINE_SKILLS].map((s) => s.skill),
);
```

- [ ] **Step 5: Make `legacyStepToSkill` variant-aware**

Replace `LEGACY_STEP_TO_SKILL` (lines 91–103) and `legacyStepToSkill` (lines 105–111) with a per-variant reverse map. Note prototype steps 3/4/5 map to its Stage-2 skills; Stage 3 (6–12) is shared:

```ts
const LEGACY_STEP_TO_SKILL_V5: Record<number, string> = {
  1: "of1-check-dependencies", 2: "of1-discovery", 3: "stardust:replica",
  4: "of1-extract-content", // "extraction" — no dedicated skill; representative
  6: "of1-build-templates", 7: "of1-style-generative-block",
  8: "of1-extract-brand-voice", 9: "of1-build-quick-suggestions",
  10: "of1-build-cta-template", 11: "config-review", 12: "of1-publish",
};

const LEGACY_STEP_TO_SKILL_PROTOTYPE: Record<number, string> = {
  1: "of1-check-dependencies", 2: "of1-discovery",
  3: "of1-extract-design", 4: "of1-prototype", 5: "of1-snowflake",
  6: "of1-build-templates", 7: "of1-style-generative-block",
  8: "of1-extract-brand-voice", 9: "of1-build-quick-suggestions",
  10: "of1-build-cta-template", 11: "config-review", 12: "of1-publish",
};

export function legacyStepToSkill(
  step: number,
  version: SkillsVersion = "v5",
): { stage: Stage; skill: string; legacy: true } | null {
  const map = version === "v5-prototype" ? LEGACY_STEP_TO_SKILL_PROTOTYPE : LEGACY_STEP_TO_SKILL_V5;
  const skill = map[step];
  if (!skill) return null;
  const info = BY_SKILL.get(skill);
  if (!info) return null;
  return { stage: info.stage, skill, legacy: true };
}
```

Note: `BY_SKILL` must include the prototype Stage-2 skills. Change its definition (line 51) to build from the union:

```ts
const BY_SKILL: Map<string, SkillInfo> = new Map(
  [...PIPELINE_SKILLS, ...PROTOTYPE_PIPELINE_SKILLS].map((s) => [s.skill, s]),
);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd service && npx vitest run src/lib/pipeline-map.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/quentinvecchio/workspace/labs/of1/of1-labs
npx biome check --write service/src/lib/pipeline-map.ts service/src/lib/pipeline-map.test.ts
git add service/src/lib/pipeline-map.ts service/src/lib/pipeline-map.test.ts
git commit -m "feat(service): add v5-prototype variant, prototype skill set, variant-aware legacyStepToSkill"
```

### Task B2: container `step-tracker.ts` — mirror the variant + prototype maps

**Files:**
- Modify: `container/src/step-tracker.ts`
- Test: `container/tests/step-tracker.test.ts`

**Interfaces:**
- Consumes: nothing from B1 (separate build root — mirror by hand).
- Produces: `SkillsVersion` widened to `"v4" | "v5" | "v5-prototype"`; exported `V5P_SKILL_TO_STEP`, `V5P_TASK_STEP_MAP`, `V5P_PREDECESSORS`, `V5P_STATUS_FILE_TO_STEP`; selectors (`taskStepMap`/`predecessors`/`maxStep`/`terminalStep`/`validSteps`) and skill/status/metadata lookups all handle the prototype variant. Consumed by Task B3 (server.ts).

- [ ] **Step 1: Write failing tests**

Append to `container/tests/step-tracker.test.ts`:

```ts
import {
  V5P_TASK_STEP_MAP, V5P_PREDECESSORS,
} from "../src/step-tracker";

describe("v5-prototype step maps", () => {
  it("maps the prototype Stage-2 skills to steps 3/4/5", () => {
    expect(stepFromSkillName("You are executing the **of1-extract-design skill**", "v5-prototype")).toBe(3);
    expect(stepFromSkillName("You are executing the **of1-prototype skill**", "v5-prototype")).toBe(4);
    expect(stepFromSkillName("You are executing the **of1-snowflake skill**", "v5-prototype")).toBe(5);
  });
  it("shares Stage 3 numbering with replica v5", () => {
    expect(stepFromSkillName("of1-build-templates", "v5-prototype")).toBe(6);
    expect(stepFromSkillName("of1-publish", "v5-prototype")).toBe(12);
  });
  it("resolves prototype status files", () => {
    expect(stepFromStatusFile("of1-extract-design-status.json", "v5-prototype")).toBe(3);
    expect(stepFromStatusFile("of1-snowflake-status.json", "v5-prototype")).toBe(5);
    expect(stepFromStatusFile("stage2-done.json", "v5-prototype")).toBe(5);
  });
  it("treats prototype as contiguous 1-12 with terminal 12 and no stray step 5 rejection", () => {
    expect(terminalStep("v5-prototype")).toBe(12);
    expect(isValidStepForVersion(5, "v5-prototype")).toBe(true);
    expect(isValidStepForVersion(5, "v5")).toBe(false);
  });
  it("auto-completes prototype Stage-2 predecessors 3->4->5", () => {
    const t = new StepTracker("v5-prototype");
    t.reportStep(3, "running");
    const emitted = t.reportStep(5, "running");
    expect(emitted.some((e) => e.step === 4 && e.status === "completed")).toBe(true);
  });
});
```

Also add `isValidStepForVersion` and `stepFromStatusFile` to the existing import at the top of the test file if not already present.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd container && npx vitest run tests/step-tracker.test.ts`
Expected: FAIL — `V5P_*` exports undefined; `"v5-prototype"` not assignable to `SkillsVersion`.

- [ ] **Step 3: Widen the type + add prototype maps**

In `container/src/step-tracker.ts`:

Line 17:
```ts
export type SkillsVersion = "v4" | "v5" | "v5-prototype";
```

After `V5_SKILL_TO_STEP` / `V5_SKILL_IDS` (line 50), add:

```ts
// v5-prototype: Stage 2 = extract(3) -> prototype(4) -> snowflake(5); Stage 3
// (6-12) identical to replica v5. Contiguous 1-12, terminal 12.
const V5P_SKILL_TO_STEP: Record<string, number> = {
  "of1-check-dependencies": 1, "of1-discovery": 2,
  "of1-extract-design": 3, "of1-prototype": 4, "of1-snowflake": 5,
  "of1-build-templates": 6, "of1-style-generative-block": 7,
  "of1-extract-brand-voice": 8, "of1-extract-content": 8,
  "of1-build-quick-suggestions": 9, "of1-build-cta-template": 10,
  "config-review": 11, "of1-publish": 12,
};
const V5P_SKILL_IDS = Object.keys(V5P_SKILL_TO_STEP).sort((a, b) => b.length - a.length);
```

- [ ] **Step 4: Route skill-id / task / status / metadata lookups through the variant**

Update `stepFromSkillName` (lines 56–63) to admit both v5 variants and pick the map:

```ts
export function stepFromSkillName(text: string, version: SkillsVersion): number | null {
  if (version === "v4") return null;
  const lower = text.toLowerCase();
  const [ids, map] = version === "v5-prototype"
    ? [V5P_SKILL_IDS, V5P_SKILL_TO_STEP]
    : [V5_SKILL_IDS, V5_SKILL_TO_STEP];
  for (const id of ids) if (lower.includes(id)) return map[id];
  return null;
}
```

Add `V5P_TASK_STEP_MAP` after `V5_TASK_STEP_MAP` (line 112) — same as `V5_TASK_STEP_MAP` but Stage 2 keys map to the prototype numbering:

```ts
export const V5P_TASK_STEP_MAP: Record<string, number> = {
  setup: 1, install: 1, "check-dependencies": 1, "check dependencies": 1,
  collect: 2, discovery: 2, "discover-narrative": 2, "discover narrative": 2,
  extraction: 3, "extract-design": 3, "design tokens": 3,
  prototype: 4, snowflake: 5,
  templates: 6, template: 6, "template-base": 6, "template-assemble": 6,
  "intent-comparison": 6, "intent-recommendation": 6, "intent-deep-dive": 6,
  "intent-budget": 6, "intent-discovery": 6,
  "of1 styling": 7, "of1-styling": 7, styling: 7, "block styling": 7, "style-generative-block": 7,
  "brand voice": 8, "brand-voice": 8, "extract-brand-voice": 8,
  "content meta": 8, "content metadata": 8, "content-metadata": 8, "extract-content": 8,
  suggestions: 9, "quick-suggestions": 9, "quick suggestions": 9, "build-quick-suggestions": 9,
  "cta template": 10, "cta-template": 10, "cta templates": 10, cta: 10, "build-cta-template": 10,
  "config review": 11, "config-review": 11, "generate-config-review": 11,
  deploy: 12, publish: 12, "of1-publish": 12,
};
```

Add `V5P_PREDECESSORS` after `V5_PREDECESSORS` (line 183):

```ts
// Stage 2 is a strict 3->4->5 chain; Stage-3 site-track (6/7/10) gates on
// snowflake (5); content track (8) gates on discovery (2), NOT Stage 2.
export const V5P_PREDECESSORS: Record<number, number[]> = {
  2: [1], 3: [2], 4: [3], 5: [4],
  6: [5], 7: [5], 8: [2], 9: [8], 10: [5],
  11: [8, 9, 10], 12: [6, 7, 11],
};
```

Add `V5P_STATUS_FILE_TO_STEP` after `V5_STATUS_FILE_TO_STEP` (line 289):

```ts
const V5P_STATUS_FILE_TO_STEP: Record<string, number> = {
  "stage2-done.json": 5,
  "of1-check-dependencies-status.json": 1, "of1-discovery-status.json": 2,
  "of1-extract-design-status.json": 3, "of1-prototype-status.json": 4,
  "of1-snowflake-status.json": 5,
  "of1-build-templates-status.json": 6, "of1-style-generative-block-status.json": 7,
  "of1-extract-brand-voice-status.json": 8, "of1-extract-content-status.json": 8,
  "of1-build-quick-suggestions-status.json": 9, "of1-build-cta-template-status.json": 10,
  "of1-publish-status.json": 12,
};
```

- [ ] **Step 5: Update the selectors to three-way**

Update `taskStepMap` (line 200), `predecessors` (line 204), `maxStep` (line 208):

```ts
function taskStepMap(version: SkillsVersion): Record<string, number> {
  if (version === "v5-prototype") return V5P_TASK_STEP_MAP;
  return version === "v5" ? V5_TASK_STEP_MAP : V4_TASK_STEP_MAP;
}
function predecessors(version: SkillsVersion): Record<number, number[]> {
  if (version === "v5-prototype") return V5P_PREDECESSORS;
  return version === "v5" ? V5_PREDECESSORS : V4_PREDECESSORS;
}
function maxStep(version: SkillsVersion): number {
  if (version === "v5-prototype") return 12;
  return version === "v5" ? 12 : 13;
}
```

Update `stepFromStatusFile` (lines 293–296) and the `stepFromMetadata`/`stepFromText` version guards so `"v5-prototype"` is admitted:

```ts
export function stepFromStatusFile(basename: string, version: SkillsVersion): number | null {
  if (version === "v4") return null;
  const map = version === "v5-prototype" ? V5P_STATUS_FILE_TO_STEP : V5_STATUS_FILE_TO_STEP;
  return map[basename] ?? null;
}
```

(`validSteps` already derives from `taskStepMap(version)`, so it works for the prototype variant automatically once `taskStepMap` returns `V5P_TASK_STEP_MAP`. `terminalStep` delegates to `maxStep`, so it is correct once `maxStep` handles the variant.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd container && npx vitest run tests/step-tracker.test.ts`
Expected: PASS (new prototype block + all pre-existing v4/v5 cases still green).

- [ ] **Step 7: Commit**

```bash
cd /Users/quentinvecchio/workspace/labs/of1/of1-labs
npx biome check --write container/src/step-tracker.ts container/tests/step-tracker.test.ts
git add container/src/step-tracker.ts container/tests/step-tracker.test.ts
git commit -m "feat(container): mirror v5-prototype variant with prototype step/predecessor/status maps"
```

### Task B3: container `server.ts` — detect the prototype variant

**Files:**
- Modify: `container/bin/server.ts` (line ~460, the `skillsVersion` predicate; and the `pollStatusFiles` v5 guard ~line 553)
- Test: covered by Task B2's `StepTracker`/selector tests; no new server test unless `server.test.ts` already exercises the predicate (check and mirror its style if so).

**Interfaces:**
- Consumes: B2's `SkillsVersion` type + selectors.
- Produces: the container computes the same three-way variant as the service and constructs `new StepTracker(version)` with it.

- [ ] **Step 1: Replace the coarse predicate**

At `container/bin/server.ts:460`, replace:

```ts
const skillsVersion: "v4" | "v5" = /^skills-v5/.test(body.skillsBranch ?? "") ? "v5" : "v4";
```

with the three-way predicate (identical logic to B1 Step 3; import `SkillsVersion` from `../src/step-tracker` if not already):

```ts
const b = body.skillsBranch ?? "";
const skillsVersion: SkillsVersion = !/^skills-v5/.test(b)
  ? "v4"
  : /^skills-v5$/.test(b) || /^skills-v5-prototype/.test(b)
    ? "v5-prototype"
    : "v5";
const tracker = new StepTracker(skillsVersion);
```

- [ ] **Step 2: Admit the prototype variant in the status-file poller**

At `container/bin/server.ts:~553`, the `pollStatusFiles` guard is v5-only (e.g. `if (skillsVersion !== "v5") return;`). Change it to admit both v5 variants:

```ts
if (skillsVersion === "v4") return;
```

(Verify the exact current guard expression and mirror the change; the poller must run for `v5-prototype` since prototype skills write status files too.)

- [ ] **Step 3: Verify build + full container test suite**

Run: `cd container && npx tsc --noEmit && npx vitest run`
Expected: type-checks clean; all tests PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/quentinvecchio/workspace/labs/of1/of1-labs
npx biome check --write container/bin/server.ts
git add container/bin/server.ts
git commit -m "feat(container): detect v5-prototype branch and run status poller for it"
```

### Task B4: service store — thread the variant into the legacy reverse-map

**Files:**
- Modify: `service/src/lib/experiments-db.ts` (`recordExperimentEvent`, `normalizeEventIdentity`)
- Modify: `service/src/handlers/experiments-events.ts` (pass the variant into `recordExperimentEvent`)
- Test: `service/src/lib/experiments-db.test.ts` (extend if present; else add a focused test)

**Interfaces:**
- Consumes: B1's `legacyStepToSkill(step, version)` and `skillsVersion`.
- Produces: `recordExperimentEvent(db, experimentId, event, version)` — legacy `{step}` events now reverse-map with the experiment's variant, so a prototype job's step 3/4/5 persist as `of1-extract-design`/`of1-prototype`/`of1-snowflake`.

- [ ] **Step 1: Write a failing test**

Append to `service/src/lib/experiments-db.test.ts` (mirror the file's existing DB-setup helper; if none exists, follow the pattern in a sibling `*.test.ts`):

```ts
it("reverse-maps a prototype legacy step to its Stage-2 skill", async () => {
  const id = await createTestExperiment(db, { skillsBranch: "skills-v5" });
  await recordExperimentEvent(db, id, { step: 4, status: "running", at: 1 }, "v5-prototype");
  const exp = await getExperiment(db, id);
  expect(exp.currentSkill).toBe("of1-prototype");
  expect(exp.currentStage).toBe(2);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd service && npx vitest run src/lib/experiments-db.test.ts`
Expected: FAIL — `recordExperimentEvent` has arity 3, and step 4 maps to the replica representative skill.

- [ ] **Step 3: Thread the variant**

In `service/src/lib/experiments-db.ts`:
- `normalizeEventIdentity` (lines ~279–292): add a `version: SkillsVersion` parameter and pass it to `legacyStepToSkill(event.step, version)`.
- `recordExperimentEvent` (lines ~335–361): add a trailing `version: SkillsVersion = "v5"` parameter; pass it to `normalizeEventIdentity`.
- Import `SkillsVersion` and `skillsVersion` from `./pipeline-map` if not already imported.

- [ ] **Step 4: Pass the variant from the events handler**

In `service/src/handlers/experiments-events.ts` (`experimentsEvents`, lines ~58–84), after `getExperiment` resolves and before `recordExperimentEvent`, compute the variant from the experiment config and pass it:

```ts
const version = skillsVersion(experiment.config?.skillsBranch as string | undefined);
await recordExperimentEvent(c.env.DB, experiment.id, parsed.event, version);
```

Import `skillsVersion` from `../lib/pipeline-map`.

- [ ] **Step 5: Run to verify pass + full service suite**

Run: `cd service && npx vitest run`
Expected: the new test PASSES; the pre-existing suite stays green (the default `version = "v5"` preserves current replica behavior for callers not yet updated).

- [ ] **Step 6: Commit**

```bash
cd /Users/quentinvecchio/workspace/labs/of1/of1-labs
npx biome check --write service/src/lib/experiments-db.ts service/src/handlers/experiments-events.ts
git add service/src/lib/experiments-db.ts service/src/handlers/experiments-events.ts service/src/lib/experiments-db.test.ts
git commit -m "feat(service): thread skills variant into recordExperimentEvent legacy reverse-map"
```

### Task B5: dashboard `pipelineLayout.ts` — prototype stage groups

**Files:**
- Modify: `service/app/routes/of1/pipelineLayout.ts`

**Interfaces:**
- Consumes: B1's `PROTOTYPE_PIPELINE_SKILLS`, `legacyStepToSkill`.
- Produces: `PROTOTYPE_STAGE_GROUPS: StageGroup[]`; `legacyStepToSkillId(step, version)` (variant-aware). Consumed by Task B6.

- [ ] **Step 1: Add prototype stage groups**

In `service/app/routes/of1/pipelineLayout.ts`, import `PROTOTYPE_PIPELINE_SKILLS` alongside `PIPELINE_SKILLS`. Factor the `STAGE_GROUPS` IIFE (lines 33–44) into a helper and derive both:

```ts
function buildStageGroups(skills: typeof PIPELINE_SKILLS): StageGroup[] {
  const groups = new Map<Stage, StageGroup>();
  for (const info of skills) {
    let group = groups.get(info.stage);
    if (!group) {
      group = { stage: info.stage, label: STAGE_LABELS[info.stage], skills: [] };
      groups.set(info.stage, group);
    }
    group.skills.push({ skill: info.skill, label: info.label, desc: info.desc });
  }
  return [...groups.values()].sort((a, b) => a.stage - b.stage);
}

export const STAGE_GROUPS: StageGroup[] = buildStageGroups(PIPELINE_SKILLS);
export const PROTOTYPE_STAGE_GROUPS: StageGroup[] = buildStageGroups(PROTOTYPE_PIPELINE_SKILLS);
```

Stage 2's label is `STAGE_LABELS[2] = "Replica"`. For the prototype groups, override the stage-2 group label to `"Build site"` after building (so the replica layout keeps "Replica"):

```ts
const s2 = PROTOTYPE_STAGE_GROUPS.find((g) => g.stage === 2);
if (s2) s2.label = "Build site";
```

- [ ] **Step 2: Make `legacyStepToSkillId` variant-aware**

Replace `legacyStepToSkillId` (lines 50–52):

```ts
export function legacyStepToSkillId(step: number, version: SkillsVersion = "v5"): string | null {
  return legacyStepToSkill(step, version)?.skill ?? null;
}
```

Import `SkillsVersion` from `../../../src/lib/pipeline-map`.

- [ ] **Step 3: Type-check**

Run: `cd service && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/quentinvecchio/workspace/labs/of1/of1-labs
npx biome check --write service/app/routes/of1/pipelineLayout.ts
git add service/app/routes/of1/pipelineLayout.ts
git commit -m "feat(dashboard): prototype stage groups + variant-aware legacyStepToSkillId"
```

### Task B6: dashboard `StepTracker.tsx` — 3-way render branch

**Files:**
- Modify: `service/app/routes/of1/StepTracker.tsx`

**Interfaces:**
- Consumes: B1's `skillsVersion`; B5's `PROTOTYPE_STAGE_GROUPS`, `STAGE_GROUPS`, `legacyStepToSkillId(step, version)`.
- Produces: prototype jobs render the extract/prototype/snowflake Stage-2 cards.

- [ ] **Step 1: Pass stage groups into the v5 tracker + resolve the variant**

In `StepTracker.tsx`:
- Import `PROTOTYPE_STAGE_GROUPS` and `STAGE_GROUPS` from `./pipelineLayout`.
- At line ~278, `version` is already `skillsVersion(job.config?.skillsBranch)`. Update the `currentSkill` legacy fallback (line ~279) to pass the variant: `legacyStepToSkillId(job.currentStep, version)`.
- Update `skillIdOf` (lines 12–27) to accept and use the variant, OR resolve `currentSkill`/history skill ids at the call site with `version`. Simplest: give `V5PipelineTracker` a `stageGroups` prop and a `version` prop, and inside its history bucketing call `legacyStepToSkillId(ev.step, version)`.

- [ ] **Step 2: Make the render branch three-way**

Replace the binary at lines ~299–303:

```tsx
{version === "v4" ? (
  <V4PipelineTracker history={history} currentStep={job.currentStep} jobStatus={job.status} now={now} />
) : (
  <V5PipelineTracker
    history={history}
    currentSkill={currentSkill}
    version={version}
    stageGroups={version === "v5-prototype" ? PROTOTYPE_STAGE_GROUPS : STAGE_GROUPS}
    jobStatus={job.status}
    now={now}
  />
)}
```

Update `V5PipelineTracker`'s props (line ~218) to take `stageGroups: StageGroup[]` and `version: SkillsVersion`, render `stageGroups` instead of the imported `STAGE_GROUPS`, and pass `version` through its history bucketing (`skillIdOf`).

- [ ] **Step 3: Type-check + build**

Run: `cd service && npx tsc --noEmit && npm run build`
Expected: clean build.

- [ ] **Step 4: Commit**

```bash
cd /Users/quentinvecchio/workspace/labs/of1/of1-labs
npx biome check --write service/app/routes/of1/StepTracker.tsx
git add service/app/routes/of1/StepTracker.tsx
git commit -m "feat(dashboard): render v5-prototype Stage-2 cards (extract/prototype/snowflake)"
```

### Task B7: SLICC start prompt — prototype step table

**Files:**
- Modify: `service/src/lib/of1-prompt.ts`

**Interfaces:**
- Consumes: B1's `skillsVersion`.
- Produces: prototype jobs get a Stage-2 step table (3=Extraction, 4=Prototype, 5=Snowflake) in the SLICC start prompt; edit/admin prompts treat both v5 variants like v5.

- [ ] **Step 1: Add the prototype step map + widen the coarse checks**

In `service/src/lib/of1-prompt.ts`:

Add after `V4_STEP_MAP` (line 36):

```ts
const V5P_STEP_MAP = `| Step | Name |
|------|------|
| 1 | Check dependencies |
| 2 | Discover narrative |
| 3 | Extraction (design tokens) |
| 4 | Prototype |
| 5 | Snowflake |
| 6 | Templates |
| 7 | OF1 Styling |
| 8 | Brand Voice + Content Metadata |
| 9 | Quick Suggestions |
| 10 | CTA Template |
| 11 | Config Review |
| 12 | Publish (deploy) |`;
```

`buildEditPrompt` (line 70): `skillsVersion(skillsBranch) === "v5"` → `skillsVersion(skillsBranch) !== "v4"` (both v5 variants use the orchestrator, so "do not run the orchestrator again").

`buildAdminEditPrompt` (line 87): `=== "v5" ? "of1-demo-orchestrator" : "of1-demo"` → `!== "v4" ? "of1-demo-orchestrator" : "of1-demo"`.

`buildStartPrompt` (lines 101–111): replace the `isV5` binary with variant-aware selection:

```ts
const version = skillsVersion(skillsBranch);
const isV4 = version === "v4";
const skill = isV4 ? "of1-demo" : "of1-demo-orchestrator";
const stepRange = isV4 ? "1-13" : "1-12";
const stepMap = isV4 ? V4_STEP_MAP : version === "v5-prototype" ? V5P_STEP_MAP : V5_STEP_MAP;
const dispatchRef = isV4
  ? "Read its SKILL.md in full and follow it exactly"
  : "Read its SKILL.md in full, then read `knowledge/dispatch-slicc.md` (it detects SLICC via `scoop_scoop`/`sprinkle` and follows that reference) and follow it exactly";
const inlineNote = isV4
  ? "never do a step's work in your own agent loop."
  : "never do a step's work in your own agent loop, except steps 11 (config review) and 12 (deploy), which `dispatch-slicc.md` runs inline in your own context.";
const finalStep = isV4 ? "step 13 (deploy)" : "step 12 (publish)";
```

- [ ] **Step 2: Type-check**

Run: `cd service && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/quentinvecchio/workspace/labs/of1/of1-labs
npx biome check --write service/src/lib/of1-prompt.ts
git add service/src/lib/of1-prompt.ts
git commit -m "feat(service): v5-prototype start-prompt step table; treat both v5 variants as orchestrator"
```

### Task B8: CreateModal — relabel the skills-v5 option

**Files:**
- Modify: `service/app/routes/of1/CreateModal.tsx` (dropdown, lines 107–111)

- [ ] **Step 1: Relabel**

Replace the `skills-v5` / `skills-v5-replica` options (lines 108–109):

```tsx
<option value="skills-v5">skills-v5 (prototype + snowflake)</option>
<option value="skills-v5-replica">skills-v5-replica (replica)</option>
```

- [ ] **Step 2: Type-check + commit**

```bash
cd /Users/quentinvecchio/workspace/labs/of1/of1-labs
npx tsc --noEmit -p service && npx biome check --write service/app/routes/of1/CreateModal.tsx
git add service/app/routes/of1/CreateModal.tsx
git commit -m "feat(dashboard): label skills-v5 as prototype+snowflake in create modal"
```

---

## Cross-repo verification (after all tasks)

- [ ] **of1-demo-skills:** `grep -rn 'OF1_REPLICA_DONE_FILE\|check-replica-artifacts\|replica-done.json' skills/ | grep -v docs/superpowers` returns nothing on `skills-v5`. The orchestrator SKILL.md, pipeline-contract.md, and both dispatch files all describe Stage 2 as extract→prototype→snowflake. `of1-extract-design`, `of1-prototype`, `of1-snowflake` each have valid frontmatter and reference their upstream skill.
- [ ] **of1-labs:** `cd container && npx vitest run` and `cd service && npx vitest run` both pass; `npx tsc --noEmit` clean in both roots; `npx biome check` clean. The prototype step numbering (3/4/5 Stage 2, 6–12 Stage 3, terminal 12) is identical in `V5P_SKILL_TO_STEP` (container), `LEGACY_STEP_TO_SKILL_PROTOTYPE` (service), and `V5P_STEP_MAP` (of1-prompt).
- [ ] **End-to-end sanity (manual):** start a `skills-v5` experiment on a dev deploy; confirm the dashboard step tracker shows three Stage-2 rows (Extraction / Prototype / Snowflake) advancing, and a `skills-v5-replica` experiment still shows the single Replica card.
```
