# Remove Snowflake, Adopt stardust:deploy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `of1-snowflake` (the Adobe `snowflake` skill wrapper — DOM-preserving, `data-slot`-marked overlay conversion) with a new `of1-stardust-deploy` skill wrapping `stardust:deploy` (real EDS block-based conversion), update every downstream skill/orchestrator that referenced snowflake's output shape, and unlock the pipeline parallelism this unblocks (step 7 no longer needs to wait on step 6).

**Architecture:** This is a docs/instructions repo — every "file" is a Markdown skill definition (`SKILL.md`) or a small orchestration script consumed by an LLM agent, not compiled code. There is no unit-test harness; "tests" in this plan are grep/structural assertions that (a) new required content exists in each edited file and (b) no stale references to the removed skill or its old output paths remain. Each task edits one skill/doc and ends with a verification grep.

**Tech Stack:** Markdown skill files (Claude Code / SLICC plugin format), bash, python3, `jq`, `grep`.

## Global Constraints

- `stardust:deploy` (at `adobe-skills/plugins/stardust/skills/deploy/SKILL.md`) is the skill being adopted — it produces `blocks/<name>/{name.js,name.css}` (one per distinct prototype section), `content/<page>.html` (per-page, DA-sourced), `content/fragments/{nav,footer}.html` (shared chrome), and `styles/styles.css` (foundation tokens/reset/buttons/fonts) — NOT `templates/<slug>.html` + `styles/<slug>.css` + `fragments/<slug>/{header,footer}.html` (the old snowflake shape).
- Brand-review.html and all of Change 2 (DA.live config authoring) are explicitly out of scope for this plan — see the companion plan for that.
- Step numbering in the pipeline stays the same (still 13 steps) — only step 6's skill and step 7's dependency change.
- New dependency graph: `5 → {6, 7} parallel → 8` (8 still depends on 6 for shared nav/footer fragments; 7 no longer depends on 6; 8 no longer depends on 7).
- Every skill/doc that says "snowflake" in a pipeline-structural sense (skill name, dependency, output path) must be updated. Mentions of `stardust:deploy`/`stardust` (the replacement) are correct and should stay.
- `stardust:deploy`'s own SKILL.md has an internal naming inconsistency between "the navigation lives in nav.html, not header.html" (content-fragment naming) and "postlcp.js fetches fragments/header.html and fragments/footer.html" (loader naming) — do not guess which is authoritative. Task 4 includes a runtime-discovery step to confirm actual on-disk paths before wiring `of1-generative-block-styler` to them.

---

## File Structure

| File | Responsibility |
|---|---|
| `skills/of1-stardust-deploy/SKILL.md` | **New.** Thin wrapper around `stardust:deploy`, replacing `of1-snowflake`. Owns branch-override, per-page invocation loop (if stardust:deploy needs one — see Task 1), artifact verification gate, deliverables status file. |
| `skills/of1-snowflake/` | **Deleted** entirely (directory + `SKILL.md`). |
| `skills/of1-setup/SKILL.md`, `skills/of1-setup/scripts/verify.sh` | Drop the standalone Adobe `snowflake` dependency check/install; rename `of1-snowflake` → `of1-stardust-deploy` in the required-skills list. |
| `skills/of1-template-generation/SKILL.md` | Repoint "component palette" + base-CSS-source reads from snowflake's `templates/prototype-*.html`/`styles/prototype-*.css`/`deliverables/eds-prototype-*.png` to step 5's `deliverables/prototype-*.html` (inline `<style>`, screenshotted directly, no EDS render needed). Drop the step-6 dependency note. |
| `skills/of1-generative-block-styler/SKILL.md` | Repoint fragment source from `fragments/prototype-home/{header,footer}.html` to stardust:deploy's shared fragment output (path confirmed at runtime per Task 4); update "snowflake (step 6)" references to the new skill name. |
| `skills/of1-deploy/SKILL.md`, `skills/of1-deploy/assets/fill-demo-hub.py`, `skills/of1-deploy/assets/fill-demo-hub.jsh` | Update Check 2 (nav/footer) path references; update the DA-page-discovery fallback from `.snowflake/projects/*/da/*.html` to stardust:deploy's `content/*.html`. |
| `skills/of1-demo/SKILL.md` (SLICC orchestrator) | Dependency graph, parallelism table, step name, pre-fan-out screenshot source. |
| `skills/of1-demo-cc/SKILL.md` (Claude Code orchestrator) | Same, for the CC-specific dispatch table + model-assignment table. |
| `skills/of1-demo/of1-demo.shtml` | `STEPS` array: rename step 6, fix `requires` indices for Templates (now requires Prototype, not Snowflake). |
| `skills/of1-demo/knowledge/common-pitfalls.md` | Canonical-reference pointers from `of1-snowflake` → `of1-stardust-deploy` (or to `stardust:deploy` itself where the pitfall is stardust's, not ours). |
| `README.md` | Pipeline table, skill list, ASCII flow diagram. |

---

### Task 1: Create `of1-stardust-deploy`, delete `of1-snowflake`

**Files:**
- Create: `skills/of1-stardust-deploy/SKILL.md`
- Delete: `skills/of1-snowflake/SKILL.md` (and the now-empty `skills/of1-snowflake/` directory)

**Interfaces:**
- Consumes: `$OF1_STATE_DIR/repo-config.json` (owner/repo/branch/domain — same contract as before), `deliverables/prototype-*.html` (step 5 output, unchanged).
- Produces: `$OF1_STATE_DIR/step-6-status.json` (same shape as before: `{step, status, deliverables:[{url,label}], summary}`), and on disk: `blocks/*/*.{js,css}`, `content/*.html`, `content/fragments/{nav,footer}.html` (or whatever path Task 4's runtime discovery confirms — see note below), `styles/styles.css`.

- [ ] **Step 1: Read the current `of1-snowflake/SKILL.md` in full for structural reference**

```bash
cat /Users/quentinvecchio/workspace/labs/of1-demo-skills/skills/of1-snowflake/SKILL.md
```

Note what to keep the *shape* of (env var table, branch-override table, artifact-verification gate, completion status-file block) even though the *content* of each changes.

- [ ] **Step 2: Write `skills/of1-stardust-deploy/SKILL.md`**

```markdown
---
name: of1-stardust-deploy
description: Convert the step-5 prototypes into EDS blocks + content pages by invoking the adobe `stardust:deploy` skill. Thin wrapper — stardust:deploy owns the conversion methodology (naming, block extraction, foundation CSS, fonts, buttons, DA upload, verification); this skill supplies OF1-specific inputs and overrides stardust's branch handling so artifacts land on the demo branch.
user-invocable: false
---

# OF1 Stardust Deploy

Pure delegation to the `stardust:deploy` skill (`stardust` plugin). Convert every prototype committed by step 5 into real EDS blocks + content pages — one block per distinct prototype `<section>` (deduped via stardust's variant-class rule where sections repeat with the same treatment), one EDS content page per prototype page, shared `content/fragments/{nav,footer}.html` chrome, and a `styles/styles.css` foundation (tokens, reset, button system, self-hosted fonts) — then push to the demo branch.

The `/of1` personalization page is NOT converted here — its DOM-preserving passthrough overlay is owned entirely by step 8 (`of1-generative-block-styler`), since the OF1 search block must stay live-DOM and can never be authored as a static EDS block.

## Env — orchestrator exports these (see `of1-setup`)

| Var | Purpose |
|-----|---------|
| `OF1_STATE_DIR` | state + IPC dir; receives `step-6-status.json` |
| `OF1_DEMO_REPO` | absolute path to the local `of1-demo` git clone |
| `ADOBE_IMS_TOKEN` | raw DA token (preferred — stardust:deploy reads this from env automatically) |
| `OF1_TOKEN_FILE` | path to a `{"access_token":"…"}` JSON (fallback) |

Resolve `DA_TOKEN` (stardust:deploy honors `$DA_TOKEN`) and read repo config once at the top:

```bash
export DA_TOKEN="${ADOBE_IMS_TOKEN:-$(jq -r .access_token "$OF1_TOKEN_FILE")}"
[ -n "$DA_TOKEN" ] || { echo "FAIL: no DA token available" >&2; exit 1; }

REPO_CONFIG=$(cat "$OF1_STATE_DIR/repo-config.json")
OWNER=$(jq -r .owner   <<<"$REPO_CONFIG")
REPO=$(jq -r .repo     <<<"$REPO_CONFIG")
BRANCH=$(jq -r .branch <<<"$REPO_CONFIG")
DOMAIN=$(jq -r .domain <<<"$REPO_CONFIG")
```

## Process

### 1. Determine the prototypes to convert

```bash
cd "$OF1_DEMO_REPO"
PROTOTYPES=$(ls deliverables/prototype-*.html 2>/dev/null \
  | xargs -n1 basename | sed 's/\.html$//')
[ -n "$PROTOTYPES" ] || { echo "FAIL: no prototypes in deliverables/" >&2; exit 1; }
echo "Converting: $PROTOTYPES"
```

### 2. Invoke the `stardust:deploy` skill

Invoke `stardust:deploy` once for the whole prototype set — unlike the old snowflake wrapper, stardust:deploy's own Step 7 ("Blocks — parallel agents") already fans out internally across page-archetype clusters. Do NOT loop and invoke it once per prototype; that duplicates its own internal parallelism and risks duplicate/conflicting block names across invocations.

**How to invoke in each runtime:**

- **Claude Code:** use the `Skill` tool:
  ```
  Skill: stardust:deploy
  ```

- **SLICC:** read the skill and execute it inline:
  ```bash
  # 1. Read the skill instructions
  read_file /workspace/skills/deploy/SKILL.md
  # 2. Follow those instructions directly — the skill IS the procedure.
  #    It handles the runtime-detection probe, naming lock, block extraction,
  #    foundation CSS, fonts, buttons, static fragments, DA upload, and the
  #    Local-QA + content-diff verification gates.
  ```
  Do NOT reimplement stardust:deploy's steps by hand. The skill owns the entire prototype-to-EDS-blocks conversion methodology.

Supply these values upfront (do NOT let it prompt):

| stardust:deploy input | Our value |
|---|---|
| Prototypes | `$OF1_DEMO_REPO/deliverables/prototype-*.html` (self-contained, inline `<style>`) |
| Target EDS repo | `${OWNER}/${REPO}` (local clone at `$OF1_DEMO_REPO`) |
| DA token | stardust:deploy reads `$DA_TOKEN` from env automatically |
| Runtime | run the Runtime-detection probe (stardust:deploy § "Runtime-detection probe") — if the repo is vanilla `aem-boilerplate` rather than AuthorKit, run the Runtime bootstrap first (`bootstrap-authorkit.mjs`) |

**DA auth note:** All calls to `admin.da.live` or `admin.hlx.page` MUST include BOTH `Authorization: Bearer $DA_TOKEN` AND `x-content-source-authorization: Bearer $DA_TOKEN` headers.

### ⚠️ Critical override of stardust:deploy's branch handling

stardust:deploy's deploy stage (§ "Deploy (DA Source API, from a local agent)") pushes to whatever branch is currently checked out and does not itself create a feature branch — confirm this by checking `git branch --show-current` before invoking. If any phase of stardust:deploy prompts to create or push to a new branch, override it: substitute `${BRANCH}` (already checked out by `of1-repo-setup`) wherever it would create a new one, and push there:

```bash
git checkout "${BRANCH}"   # should already be current — verify, don't assume
git push origin "${BRANCH}"
```

Preview/content URLs must resolve at `https://${BRANCH}--${REPO}--${OWNER}.aem.page/…` — if stardust:deploy's own examples show a different branch name, substitute `${BRANCH}`.

### 3. Verify critical artifacts exist (hard gate)

**Step 7 (template generation) and step 8 (OF1 styling) both depend on this step's output** — step 8 specifically needs `content/fragments/nav.html` and `content/fragments/footer.html` (or the path confirmed by `of1-generative-block-styler`'s own runtime-discovery step — see that skill for the exact path, since stardust:deploy's own docs are inconsistent about whether shared fragments live under `content/fragments/` or repo-root `fragments/`).

```bash
cd "$OF1_DEMO_REPO"
FAIL=false

# At least one block + one content page must exist
BLOCK_COUNT=$(find blocks -mindepth 1 -maxdepth 1 -type d 2>/dev/null | grep -v '^blocks/of1$' | grep -v '^blocks/fragment$' | grep -v '^blocks/section-metadata$' | wc -l | tr -d ' ')
[ "$BLOCK_COUNT" -ge 1 ] || { echo "✗ MISSING: no blocks/ directories were created" >&2; FAIL=true; }

for SLUG in $PROTOTYPES; do
  PAGE_SLUG="${SLUG#prototype-}"
  [ -f "content/${PAGE_SLUG}.html" ] || { echo "✗ MISSING: content/${PAGE_SLUG}.html" >&2; FAIL=true; }
done

[ -f styles/styles.css ] || { echo "✗ MISSING: styles/styles.css" >&2; FAIL=true; }

# Shared chrome fragments — REQUIRED by step 8. Check both candidate locations
# since stardust:deploy's own docs disagree on the path.
if [ -f content/fragments/nav.html ] || [ -f fragments/header.html ]; then
  echo "✓ nav/header fragment found"
else
  echo "✗ MISSING: neither content/fragments/nav.html nor fragments/header.html exists" >&2
  FAIL=true
fi
if [ -f content/fragments/footer.html ] || [ -f fragments/footer.html ]; then
  echo "✓ footer fragment found"
else
  echo "✗ MISSING: neither content/fragments/footer.html nor fragments/footer.html exists" >&2
  FAIL=true
fi

if [ "$FAIL" = true ]; then
  echo "" >&2
  echo "FAIL: stardust:deploy was NOT invoked correctly — critical artifacts missing." >&2
  echo "Read /workspace/skills/deploy/SKILL.md (or the Skill tool's stardust:deploy)" >&2
  echo "and re-invoke. Do not hand-author blocks/content pages to work around this." >&2
  exit 1
fi
echo "✓ Blocks, content pages, foundation CSS, and chrome fragments present"
```

### 4. Verify all pages render on EDS preview

```bash
for SLUG in $PROTOTYPES; do
  PAGE_SLUG="${SLUG#prototype-}"
  URL="https://${BRANCH}--${REPO}--${OWNER}.aem.page/${PAGE_SLUG}"
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$URL")
  echo "  ${PAGE_SLUG}: ${CODE}"
done
```

All should return `200`. If anything 404s, re-run stardust:deploy's own verification gates (Local-QA harness, `content-diff`) for the failing page before retrying.

## Completion

Build the deliverables array — one entry per converted page (label is the slug, title-cased):

```bash
PREVIEW_BASE="https://${BRANCH}--${REPO}--${OWNER}.aem.page"

DELIVERABLES=$(python3 - <<PYEOF
import json
base = "${PREVIEW_BASE}"
slugs = """${PROTOTYPES}""".split()
slugs = [s.removeprefix("prototype-") for s in slugs]
slugs.sort(key=lambda s: 0 if s == 'home' else 1)
out = [
    {"url": f"{base}/{s}",
     "label": s.replace("-", " ").title()}
    for s in slugs
]
print(json.dumps(out))
PYEOF
)

COUNT=$(echo "$PROTOTYPES" | wc -w | tr -d ' ')

cat > "$OF1_STATE_DIR/step-6-status.json" <<EOF
{
  "step": 6,
  "status": "review",
  "deliverables": ${DELIVERABLES},
  "summary": "stardust:deploy conversion complete: ${COUNT} EDS page(s) on demo branch, block-authored with branded chrome."
}
EOF
```

The orchestrator (CC: agent-return parsing; SLICC: sprinkle polling) handles the approve/done transition.
```

- [ ] **Step 3: Delete the old skill**

```bash
rm -rf /Users/quentinvecchio/workspace/labs/of1-demo-skills/skills/of1-snowflake
```

- [ ] **Step 4: Verify — new skill exists, old skill is gone, name/description are wired correctly**

```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
[ -f skills/of1-stardust-deploy/SKILL.md ] || { echo "FAIL: new skill missing"; exit 1; }
[ ! -d skills/of1-snowflake ] || { echo "FAIL: old skill still present"; exit 1; }
grep -q "^name: of1-stardust-deploy$" skills/of1-stardust-deploy/SKILL.md || { echo "FAIL: name frontmatter wrong"; exit 1; }
grep -q "stardust:deploy" skills/of1-stardust-deploy/SKILL.md || { echo "FAIL: doesn't reference stardust:deploy"; exit 1; }
echo "✓ Task 1 verified"
```

- [ ] **Step 5: Commit**

```bash
git add skills/of1-stardust-deploy skills/of1-snowflake
git commit -m "feat: replace of1-snowflake with of1-stardust-deploy"
```

---

### Task 2: Update `of1-setup` to stop requiring the standalone Adobe `snowflake` skill

**Files:**
- Modify: `skills/of1-setup/SKILL.md:28-29`
- Modify: `skills/of1-setup/scripts/verify.sh:50-56,87-104,118-128`

**Interfaces:**
- Consumes: nothing new.
- Produces: `verify.sh`'s `REQUIRED_SKILLS` array (consumed by the rest of the script's existence checks) now lists `of1-stardust-deploy` instead of `of1-snowflake`; `ADOBE_EDS_SKILLS` drops `snowflake` entirely (stardust:deploy lives under the already-required `stardust` plugin).

- [ ] **Step 1: Edit `skills/of1-setup/SKILL.md`**

Find:
```markdown
1. The 13 OF1 step skills are installed (`of1-discovery`, `of1-snowflake`, …)
2. The Adobe EDS skills `stardust`, `snowflake`, `impeccable` are installed
```

Replace with:
```markdown
1. The 13 OF1 step skills are installed (`of1-discovery`, `of1-stardust-deploy`, …)
2. The Adobe EDS skills `stardust`, `impeccable` are installed
```

Find:
```markdown
- **SLICC:** the script auto-installs missing Adobe EDS skills (`stardust`, `snowflake`, `impeccable`) via `upskill` — SLICC can activate skills mid-session. If auto-install fails, it reports the error and exits.
```

Replace with:
```markdown
- **SLICC:** the script auto-installs missing Adobe EDS skills (`stardust`, `impeccable`) via `upskill` — SLICC can activate skills mid-session. If auto-install fails, it reports the error and exits.
```

- [ ] **Step 2: Edit `skills/of1-setup/scripts/verify.sh` — `REQUIRED_SKILLS`**

Find:
```bash
REQUIRED_SKILLS=(
  of1-repo-setup of1-discovery of1-extraction of1-prototype
  of1-snowflake of1-template-generation of1-generative-block-styler
  of1-brand-voice-extractor of1-content-metadata of1-quick-suggestions
  of1-cta-template-builder of1-config-review of1-deploy
)
```

Replace with:
```bash
REQUIRED_SKILLS=(
  of1-repo-setup of1-discovery of1-extraction of1-prototype
  of1-stardust-deploy of1-template-generation of1-generative-block-styler
  of1-brand-voice-extractor of1-content-metadata of1-quick-suggestions
  of1-cta-template-builder of1-config-review of1-deploy
)
```

- [ ] **Step 3: Edit `skills/of1-setup/scripts/verify.sh` — `ADOBE_EDS_SKILLS` and install/fail logic**

Find:
```bash
ADOBE_EDS_SKILLS=(stardust snowflake impeccable)

install_skill_slicc() {
  local name="$1"
  case "$name" in
    stardust)
      # Install ALL stardust skills (extract, prototype, direct, etc.)
      upskill adobe/skills --path plugins/stardust --all 2>&1 | tail -1 ;;
    snowflake)
      upskill adobe/skills --path plugins/aem/edge-delivery-services --all 2>&1 | tail -1 ;;
    impeccable)
      upskill pbakaus/impeccable --all 2>&1 | tail -1 ;;
  esac
}
```

Replace with:
```bash
ADOBE_EDS_SKILLS=(stardust impeccable)

install_skill_slicc() {
  local name="$1"
  case "$name" in
    stardust)
      # Install ALL stardust skills (extract, prototype, direct, deploy, etc.)
      upskill adobe/skills --path plugins/stardust --all 2>&1 | tail -1 ;;
    impeccable)
      upskill pbakaus/impeccable --all 2>&1 | tail -1 ;;
  esac
}
```

Find:
```bash
      case "$S" in
        snowflake)
          fail "Adobe EDS skill 'snowflake' not installed — fix: /plugin install aem-edge-delivery-services@adobe-skills" ;;
        stardust)
          fail "Adobe EDS skill 'stardust' not installed — fix: /plugin install stardust@adobe-skills" ;;
        impeccable)
          fail "Adobe EDS skill 'impeccable' not installed — fix: /plugin install impeccable@impeccable" ;;
      esac
```

Replace with:
```bash
      case "$S" in
        stardust)
          fail "Adobe EDS skill 'stardust' not installed — fix: /plugin install stardust@adobe-skills" ;;
        impeccable)
          fail "Adobe EDS skill 'impeccable' not installed — fix: /plugin install impeccable@impeccable" ;;
      esac
```

- [ ] **Step 4: Verify**

```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
grep -q "of1-stardust-deploy" skills/of1-setup/scripts/verify.sh || { echo "FAIL"; exit 1; }
grep -q "of1-snowflake" skills/of1-setup/scripts/verify.sh && { echo "FAIL: old ref remains"; exit 1; }
grep -q "snowflake" skills/of1-setup/scripts/verify.sh && { echo "FAIL: adobe snowflake skill still referenced"; exit 1; }
bash -n skills/of1-setup/scripts/verify.sh || { echo "FAIL: syntax error"; exit 1; }
echo "✓ Task 2 verified"
```

- [ ] **Step 5: Commit**

```bash
git add skills/of1-setup/SKILL.md skills/of1-setup/scripts/verify.sh
git commit -m "chore: drop Adobe snowflake dependency, require of1-stardust-deploy"
```

---

### Task 3: Repoint `of1-template-generation` to step 5, drop its step-6 dependency

**Files:**
- Modify: `skills/of1-template-generation/SKILL.md:43-53,140-176`

**Interfaces:**
- Consumes: `deliverables/prototype-*.html` (step 5 output — self-contained HTML with inline `<style>`). No longer consumes `templates/prototype-*.html`, `styles/prototype-*.css`, or `deliverables/eds-prototype-*.png`.
- Produces: unchanged (`of1/config/templates.json`, `templates/templates-catalog.json`, 15× template HTML/CSS/metadata/sample, `gallery/index.html`).

- [ ] **Step 1: Edit the "Inputs" section**

Find (`skills/of1-template-generation/SKILL.md`):
```markdown
## Inputs

Available before invocation, in addition to the env above:

- Design tokens → `$OF1_DEMO_REPO/stardust/current/DESIGN.json` (from step 4)
- Demo narrative → `$OF1_STATE_DIR/step-3-output.md` (from step 3)
- Slot-marked overlay templates → `$OF1_DEMO_REPO/templates/prototype-*.html` (from step 6 / snowflake) — real examples of the `<section>` + `data-slot` pattern your 15 templates will follow
- Prototype CSS → `$OF1_DEMO_REPO/styles/prototype-*.css` (from step 6 / snowflake) — extracted styling rules (padding, radius, hover states, exact values)
- EDS-rendered screenshots → `$OF1_DEMO_REPO/deliverables/eds-prototype-*.png` (captured by orchestrator before fan-out)
```

Replace with:
```markdown
## Inputs

Available before invocation, in addition to the env above:

- Design tokens → `$OF1_DEMO_REPO/stardust/current/DESIGN.json` (from step 4)
- Demo narrative → `$OF1_STATE_DIR/step-3-output.md` (from step 3)
- Pixel-perfect prototypes → `$OF1_DEMO_REPO/deliverables/prototype-*.html` (from step 5) — self-contained HTML with inline `<style>`; this is the sole visual/structural reference, read directly (no step 6 dependency)
- Prototype screenshots → captured by the orchestrator directly from the static `deliverables/prototype-*.html` files (see "Pre-fan-out" in the orchestrator skill) — no EDS render or step 6 output required
```

- [ ] **Step 2: Edit the "Reference — Component palette" section**

Find:
```markdown
## Reference — Component palette (extract from prototypes)

Templates render INSIDE the EDS preview — they live within the full stylesheet stack (snowflake substrate + OF1 chrome + EDS base). Inferring style only from one prototype produces templates that look subtly wrong when EDS renders them.

**Read every prototype, not just home.** Each contributes different patterns; combine the slot-marked overlay templates (`templates/prototype-*.html`), the extracted CSS (`styles/prototype-*.css`), and the EDS-rendered screenshots (`deliverables/eds-prototype-*.png`):
```

Replace with:
```markdown
## Reference — Component palette (extract from prototypes)

Templates render INSIDE the EDS preview — they live within the full stylesheet stack (OF1 chrome + EDS base). Inferring style only from one prototype produces templates that look subtly wrong when EDS renders them.

**Read every prototype, not just home.** Each contributes different patterns; read the prototype HTML's inline `<style>` block directly (each `deliverables/prototype-*.html` is self-contained) and the prototype screenshots (`deliverables/eds-prototype-*.png` — captured by the orchestrator from the static prototype file, see Pre-fan-out):
```

- [ ] **Step 3: Edit the "Process — Mode: base" "Sources of truth" list**

Find:
```markdown
**Sources of truth, priority order:**

1. Prototype CSS — `$OF1_DEMO_REPO/styles/prototype-*.css` (search `:root { … }` + custom-property declarations). Snowflake extracted these from the prototype HTML, so they're the canonical token source.
2. `DESIGN.json` — `$OF1_DEMO_REPO/stardust/current/DESIGN.json`. Tiebreaker / fill-in for tokens not in the prototypes. Schema drifts between extraction runs; tolerate variation.
```

Replace with:
```markdown
**Sources of truth, priority order:**

1. Prototype inline CSS — the `<style>` block inside `$OF1_DEMO_REPO/deliverables/prototype-*.html` (search `:root { … }` + custom-property declarations). This is the canonical token source — extract it directly, no intermediate conversion step produces it.
2. `DESIGN.json` — `$OF1_DEMO_REPO/stardust/current/DESIGN.json`. Tiebreaker / fill-in for tokens not in the prototypes. Schema drifts between extraction runs; tolerate variation.
```

Find the verify block right after and update its file glob:
```bash
# Accent must match prototype — spot check
grep -A1 ":root" styles/of1-template-base.css | grep accent
grep -A1 ":root" styles/prototype-*.css       | grep -i accent | head -3
```

Replace with:
```bash
# Accent must match prototype — spot check
grep -A1 ":root" styles/of1-template-base.css | grep accent
grep -A1 ":root" deliverables/prototype-*.html | grep -i accent | head -3
```

- [ ] **Step 4: Verify**

```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
grep -q "styles/prototype-\*.css" skills/of1-template-generation/SKILL.md && { echo "FAIL: stale ref remains"; exit 1; }
grep -q "templates/prototype-\*.html" skills/of1-template-generation/SKILL.md && { echo "FAIL: stale ref remains"; exit 1; }
grep -q "from step 6 / snowflake" skills/of1-template-generation/SKILL.md && { echo "FAIL: stale step-6 dependency note remains"; exit 1; }
grep -q "deliverables/prototype-\*.html" skills/of1-template-generation/SKILL.md || { echo "FAIL: new source not referenced"; exit 1; }
echo "✓ Task 3 verified"
```

- [ ] **Step 5: Commit**

```bash
git add skills/of1-template-generation/SKILL.md
git commit -m "refactor: of1-template-generation reads step-5 prototypes directly, drops step-6 dependency"
```

---

### Task 4: Repoint `of1-generative-block-styler`'s fragment source to stardust:deploy's chrome, with a runtime-discovery step

**Files:**
- Modify: `skills/of1-generative-block-styler/SKILL.md:41,67,289-297,412-419,469-477`

**Interfaces:**
- Consumes: whichever of `content/fragments/{nav,footer}.html` or repo-root `fragments/{header,footer}.html` stardust:deploy actually wrote (confirmed by an `ls`/`find` check written into this skill, since the upstream skill's own docs are internally inconsistent about the path — see Global Constraints).
- Produces: unchanged (`blocks/of1/{of1.js,of1.css}`, `styles/of1.css`, `templates/of1.html`, `fragments/of1/{header,footer}.html`, DA content for `/of1`, `/nav`, `/footer`).

- [ ] **Step 1: Edit the "Why this skill exists" paragraph (line ~41-43) to drop the snowflake reference**

Find:
```markdown
## Why this skill exists

EDS block CSS is designed for statically-authored pages. When the LLM generates sections dynamically, the raw block CSS often looks too plain — no visual hierarchy between sections, cards render as flat lists, heroes lack full-bleed treatment, tables are unstyled, no transitions, no cohesive container. This skill bridges that gap by writing `blocks/of1/of1.css` (block-level styles for generated content) and `styles/of1.css` (page chrome for the `/of1` page itself).
```

This paragraph doesn't mention snowflake by name — leave it as-is. (No change needed here; confirmed while reading for context.)

- [ ] **Step 2: Edit Step 0's explanatory paragraph (was line ~67) referencing snowflake's overlay engine install**

Find:
```markdown
**Then patch `scripts/scripts.js` to add passthrough support to the overlay engine.** Snowflake (step 6) installs a stock overlay engine whose `applyTemplateOverlay()` always replaces `<main>.innerHTML` with the template's content. That's wrong for the `/of1` page — its `<main>` contains the OF1 search block (an active component with running JS that would be destroyed by an innerHTML swap). The passthrough mode lets the engine load the branded chrome + the page CSS while leaving the existing `<main>` content intact.
```

Replace with:
```markdown
**Then patch `scripts/scripts.js` to add passthrough support to the overlay engine.** stardust:deploy (step 6) installs the AuthorKit runtime's overlay engine whose `applyTemplateOverlay()` always replaces `<main>.innerHTML` with the template's content. That's wrong for the `/of1` page — its `<main>` contains the OF1 search block (an active component with running JS that would be destroyed by an innerHTML swap). The passthrough mode lets the engine load the branded chrome + the page CSS while leaving the existing `<main>` content intact.
```

- [ ] **Step 3: Replace the fragment-copy step (was Step 6, lines ~288-298) with a runtime-discovery version**

Find:
```markdown
# OF1 page uses the same header/footer chrome as the prototype-home page.
# These files MUST exist — step 6 (snowflake) commits them to git.
# If they're missing, step 6 did not run correctly.
[ -f fragments/prototype-home/header.html ] || {
  echo "FAIL: fragments/prototype-home/header.html not found in git." >&2
  echo "Step 6 (snowflake) did not commit fragments. Re-run step 6." >&2
  exit 1
}
cp fragments/prototype-home/header.html fragments/of1/header.html
cp fragments/prototype-home/footer.html fragments/of1/footer.html
```

Replace with:
```markdown
# OF1 page uses the same nav/footer chrome as the rest of the site.
# stardust:deploy (step 6) commits shared chrome fragments — but its own
# docs are inconsistent about the exact path (content/fragments/{nav,footer}.html
# vs repo-root fragments/{header,footer}.html). Discover the real path instead
# of assuming one.
NAV_SRC=""
FOOTER_SRC=""
for CANDIDATE in "content/fragments/nav.html:content/fragments/footer.html" "fragments/header.html:fragments/footer.html" "content/fragments/header.html:content/fragments/footer.html"; do
  NAV_CANDIDATE="${CANDIDATE%%:*}"
  FOOTER_CANDIDATE="${CANDIDATE##*:}"
  if [ -f "$NAV_CANDIDATE" ] && [ -f "$FOOTER_CANDIDATE" ]; then
    NAV_SRC="$NAV_CANDIDATE"
    FOOTER_SRC="$FOOTER_CANDIDATE"
    break
  fi
done

if [ -z "$NAV_SRC" ]; then
  echo "FAIL: could not find stardust:deploy's shared nav/footer fragments." >&2
  echo "Checked: content/fragments/{nav,footer}.html, fragments/{header,footer}.html, content/fragments/{header,footer}.html" >&2
  echo "Step 6 (of1-stardust-deploy) did not commit chrome fragments as expected. Re-run step 6 or inspect its actual output paths with: find . -iname '*nav*' -o -iname '*footer*' -path '*fragments*'" >&2
  exit 1
fi
echo "Using chrome fragments: $NAV_SRC / $FOOTER_SRC"
cp "$NAV_SRC" fragments/of1/header.html
cp "$FOOTER_SRC" fragments/of1/footer.html
```

- [ ] **Step 4: Update the "Common failures" table (was lines ~469-477)**

Find:
```markdown
| `HEADER MISSING` / `FOOTER MISSING` | `fragments/of1/{header,footer}.html` didn't get pushed, or `scripts/scripts.js` is missing passthrough support (Step 6 of the snowflake skill) |
```

Replace with:
```markdown
| `HEADER MISSING` / `FOOTER MISSING` | `fragments/of1/{header,footer}.html` didn't get pushed, or `scripts/scripts.js` is missing passthrough support (Step 6, `of1-stardust-deploy`, installs the AuthorKit runtime this patch sits on top of) |
```

- [ ] **Step 5: Verify**

```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
grep -qi "snowflake" skills/of1-generative-block-styler/SKILL.md && { echo "FAIL: snowflake reference remains"; exit 1; }
grep -q "fragments/prototype-home" skills/of1-generative-block-styler/SKILL.md && { echo "FAIL: stale fragment path remains"; exit 1; }
grep -q "content/fragments/nav.html" skills/of1-generative-block-styler/SKILL.md || { echo "FAIL: discovery candidates not present"; exit 1; }
echo "✓ Task 4 verified"
```

- [ ] **Step 6: Commit**

```bash
git add skills/of1-generative-block-styler/SKILL.md
git commit -m "refactor: of1-generative-block-styler discovers stardust:deploy's chrome fragment paths at runtime"
```

---

### Task 5: Update `of1-deploy`'s gates and demo-hub DA-page discovery

**Files:**
- Modify: `skills/of1-deploy/SKILL.md` (Check 2, Check 5)
- Modify: `skills/of1-deploy/assets/fill-demo-hub.py`
- Modify: `skills/of1-deploy/assets/fill-demo-hub.jsh`

**Interfaces:**
- Consumes: same `repo-config.json` contract, plus stardust:deploy's `content/*.html` (instead of `.snowflake/projects/*/da/*.html`) as the DA-page-discovery fallback source.
- Produces: unchanged (`deliverables/index.html` demo hub, `step-13-status.json`).

- [ ] **Step 1: Edit Check 2 in `skills/of1-deploy/SKILL.md`** — the check itself queries live DOM selectors (`.site-header`, `.site-footer`) which are unaffected by the snowflake→stardust:deploy swap (those class names come from the prototype, not from the conversion engine). No change needed to the check's assertions. Confirm this by re-reading it:

```bash
sed -n '/Check 2: OF1 nav\/footer/,/### Check 3/p' /Users/quentinvecchio/workspace/labs/of1-demo-skills/skills/of1-deploy/SKILL.md
```

Confirm the check references `.site-header`/`.site-footer`/`.announcement-bar` (prototype-authored class names) and not any snowflake-specific path. If confirmed, no edit needed for Check 2 — record this as a no-op in the commit message.

- [ ] **Step 2: Edit Check 5's URL list** — remove any URL specific to the old per-slug snowflake overlay naming and confirm the list still matches stardust:deploy's page-slug convention (`content/<page>.html` → served at `/<page>`, no `prototype-` prefix, matching Task 1's `PAGE_SLUG="${SLUG#prototype-}"` convention)

Find (`skills/of1-deploy/SKILL.md`):
```markdown
```bash
LINKS=(
  "${PREVIEW_BASE}/deliverables/discovery.html"
  "${PREVIEW_BASE}/deliverables/brand-review.html"
  "${PREVIEW_BASE}/prototype-home"
  "${PREVIEW_BASE}/gallery/index.html"
  "${PREVIEW_BASE}/of1"
  "${PREVIEW_BASE}/deliverables/config-review.html"
  "${PREVIEW_BASE}/deliverables/index.html"
)
```
```

Replace with:
```markdown
```bash
LINKS=(
  "${PREVIEW_BASE}/deliverables/discovery.html"
  "${PREVIEW_BASE}/deliverables/brand-review.html"
  "${PREVIEW_BASE}/home"
  "${PREVIEW_BASE}/gallery/index.html"
  "${PREVIEW_BASE}/of1"
  "${PREVIEW_BASE}/deliverables/config-review.html"
  "${PREVIEW_BASE}/deliverables/index.html"
)
```
```

(`/prototype-home` was the static self-contained prototype file at `deliverables/prototype-home.html`, served without EDS conversion. `/home` is the stardust:deploy-converted EDS content page. Both still exist as separate deliverables — this list should check the converted page since that's what step 13 gates on being live; the static prototype was already checked in step 5's own completion.)

- [ ] **Step 3: Edit `fill-demo-hub.py`'s DA-page discovery fallback**

```bash
grep -n "snowflake_dir\|\.snowflake" /Users/quentinvecchio/workspace/labs/of1-demo-skills/skills/of1-deploy/assets/fill-demo-hub.py
```

Find the block around line 176-178:
```python
        snowflake_dir = Path(repo_dir) / '.snowflake' / 'projects'
        if snowflake_dir.exists():
            for project in sorted(snowflake_dir.iterdir()):
```

Replace with:
```python
        content_dir = Path(repo_dir) / 'content'
        if content_dir.exists():
            for page_file in sorted(content_dir.glob('*.html')):
```

Read the surrounding function body (`find_eds_pages`, lines ~151-190) in full before editing to make sure the replacement's loop body matches what it iterates over (a directory of project subfolders vs. a flat list of `.html` files) — adjust the inner logic accordingly:

```bash
sed -n '151,195p' /Users/quentinvecchio/workspace/labs/of1-demo-skills/skills/of1-deploy/assets/fill-demo-hub.py
```

The inner loop previously walked `project / 'da' / '*.html'` per project subdirectory; since stardust:deploy's `content/*.html` is already a flat list of page files (no per-project subdirectory), replace the per-project inner walk with directly collecting `page_file.stem` as the page slug from the `content_dir.glob('*.html')` result — do not keep the old nested-directory-walk structure.

- [ ] **Step 4: Apply the equivalent edit to `fill-demo-hub.jsh`**

```bash
grep -n "snowflake" /Users/quentinvecchio/workspace/labs/of1-demo-skills/skills/of1-deploy/assets/fill-demo-hub.jsh
```

Find (around line 148-152):
```javascript
  // Fallback: check snowflake projects
  ...
      const { stdout: result } = await exec(`find ${repoDir}/.snowflake/projects -name '*.html' -path '*/da/*' 2>/dev/null || true`);
```

Replace the fallback logic with the equivalent flat-directory scan:
```javascript
  // Fallback: check stardust:deploy's content/ directory
  ...
      const { stdout: result } = await exec(`find ${repoDir}/content -maxdepth 1 -name '*.html' 2>/dev/null || true`);
```

(Read the full surrounding function in `fill-demo-hub.jsh` first — same caveat as Step 3: the JS variant may post-process `result` assuming nested `da/` paths; strip that assumption since `content/*.html` is flat.)

- [ ] **Step 5: Verify**

```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
grep -q "\.snowflake" skills/of1-deploy/assets/fill-demo-hub.py && { echo "FAIL: stale snowflake ref in .py"; exit 1; }
grep -q "\.snowflake" skills/of1-deploy/assets/fill-demo-hub.jsh && { echo "FAIL: stale snowflake ref in .jsh"; exit 1; }
grep -q "prototype-home" skills/of1-deploy/SKILL.md && { echo "FAIL: stale slug in Check 5"; exit 1; }
python3 -c "import ast; ast.parse(open('skills/of1-deploy/assets/fill-demo-hub.py').read())" || { echo "FAIL: python syntax error"; exit 1; }
echo "✓ Task 5 verified"
```

- [ ] **Step 6: Commit**

```bash
git add skills/of1-deploy/SKILL.md skills/of1-deploy/assets/fill-demo-hub.py skills/of1-deploy/assets/fill-demo-hub.jsh
git commit -m "refactor: of1-deploy reads stardust:deploy's content/ pages instead of .snowflake/ projects"
```

---

### Task 6: Update the SLICC orchestrator (`of1-demo/SKILL.md`) — dependency graph, parallelism, pre-fan-out screenshot source

**Files:**
- Modify: `skills/of1-demo/SKILL.md`

**Interfaces:**
- Consumes: nothing new structurally — this task only changes *when* things are dispatched and *what URL* the pre-fan-out screenshot step opens.
- Produces: the updated dependency table/graph that all future pipeline runs follow.

- [ ] **Step 1: Update the "When to spawn what" table**

Find:
```markdown
| Trigger | Spawn immediately |
|---------|-------------------|
| Step 5 (Prototype) approved | **Track A:** Step 6 (Snowflake) AND **Track B:** Steps 9a, 9b, 11 (three scoops at once) |
| Steps 9a + 9b done | Step 10 (Suggestions — needs products.json + brand-voice.json) |
| Step 6 (Snowflake) done | Step 8 (OF1 styling) AND Steps 7a–7e (5 intent scoops in parallel) — 6 scoops at once |
| Steps 7a–7e ALL complete | Step 7-assemble — run INLINE in orchestrator (no scoop) |
| Steps 9-11 ALL complete | Step 12 (Config review) — run inline by the cone |
| Steps 7-assemble + 8 done AND Step 12 approved | Step 13 (Deploy) |
```

Replace with:
```markdown
| Trigger | Spawn immediately |
|---------|-------------------|
| Step 5 (Prototype) approved | **Track A:** Step 6 (stardust:deploy) AND Step 7-base (Templates) AND **Track B:** Steps 9a, 9b, 11 (five scoops at once) |
| Step 7-base done | Steps 7a–7e (5 intent scoops in parallel) |
| Steps 9a + 9b done | Step 10 (Suggestions — needs products.json + brand-voice.json) |
| Step 6 (stardust:deploy) done | Step 8 (OF1 styling) |
| Steps 7a–7e ALL complete | Step 7-assemble — run INLINE in orchestrator (no scoop) |
| Steps 9-11 ALL complete | Step 12 (Config review) — run inline by the cone |
| Steps 7-assemble + 8 done AND Step 12 approved | Step 13 (Deploy) |
```

- [ ] **Step 2: Update the dependency graph ASCII diagram**

Find:
```markdown
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
```

Replace with:
```markdown
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
    ┌────┴──────────────────────┐
    ↓                           ↓
┌───┴────┐          Track B (S9+S10+S11)
S6       S7-base               ↓
↓        ↓                 Step 12
S8   S7a∥7b∥7c∥7d∥7e
↓        ↓
↓    S7-assemble       ← runs ONCE after S7a–7e all done
↓        ↓             ↓
└────────┴─────────────┘
         ↓
    Step 13 (Deploy)
```
```

- [ ] **Step 3: Update "Key rules"**

Find:
```markdown
### Key rules:
1. **Track B does NOT wait for Step 6** — it starts immediately after Step 5 is approved
2. **Step 8 (OF1 styling) runs AFTER Step 6** — it must not overwrite of1.css that S6 creates. S8 commits last.
3. **Step 7 (Templates) waits for Step 6** — it needs the template CSS structure from the snowflake conversion
4. **Step 7 is FANNED OUT into 5 parallel intent scoops (7a–7e) + 1 assemble scoop** — see "Step 7 fan-out detail" below
5. **Step 8 runs in parallel with Steps 7a–7e** — 6 scoops at once after Step 6
6. **Steps 9a, 9b, 11 run at once** — spawn all 3 scoops simultaneously. **Step 10 waits for step 9 to finish** (it needs products.json + brand-voice.json to ground suggestions in real content)
7. **Push each status as it arrives** — don't wait for all parallel steps to finish before updating the sprinkle
```

Replace with:
```markdown
### Key rules:
1. **Track B does NOT wait for Step 6** — it starts immediately after Step 5 is approved
2. **Step 7 (Templates) no longer waits for Step 6** — it reads step 5's prototype HTML/CSS directly, so Step 6 (stardust:deploy) and Step 7-base dispatch together right after Step 5 is approved
3. **Step 8 (OF1 styling) runs AFTER Step 6** — it needs stardust:deploy's shared nav/footer chrome fragments and must not overwrite of1.css that S6 creates. S8 commits last. Step 8 does NOT wait for Step 7.
4. **Step 7 is FANNED OUT into 5 parallel intent scoops (7a–7e) + 1 assemble scoop** — see "Step 7 fan-out detail" below
5. **Steps 6, 7-base run in parallel; Step 8 dispatches once Step 6 alone finishes** (not gated on Step 7's progress)
6. **Steps 9a, 9b, 11 run at once** — spawn all 3 scoops simultaneously. **Step 10 waits for step 9 to finish** (it needs products.json + brand-voice.json to ground suggestions in real content)
7. **Push each status as it arrives** — don't wait for all parallel steps to finish before updating the sprinkle
```

- [ ] **Step 4: Update the "Step 7 fan-out detail" section's pre-fan-out reference and the "Pre-fan-out: capture EDS visual reference" section**

Find:
```markdown
### Step 7 fan-out detail

Step 7 (template generation) is split into 7 scoops across 3 phases plus a small inline screenshot step:

- **Pre-fan-out (inline, orchestrator):** capture EDS-rendered visual references of all prototypes so the intent scoops see the actual rendered design system (see "Pre-fan-out: capture EDS visual reference" below).
- **7-base (sequential, 1 scoop):** named `of1-s7-base`. Runs `of1-template-generation` with `OF1_TG_MODE=base`. Generates `styles/of1-template-base.css` from the prototype CSS — the shared design tokens all per-template CSS files `@import`. Writes `/shared/of1-demo/step-7-base-status.json`. Must finish before intent scoops start.
```

Replace with:
```markdown
### Step 7 fan-out detail

Step 7 (template generation) is split into 7 scoops across 3 phases plus a small inline screenshot step. Step 7 dispatches immediately alongside Step 6 — it no longer waits for stardust:deploy to finish:

- **Pre-fan-out (inline, orchestrator):** capture visual references of all prototypes directly from the static `deliverables/prototype-*.html` files so the intent scoops see the real design system, without needing an EDS render (see "Pre-fan-out: capture visual reference" below). Dispatch this immediately after Step 5 is approved, in parallel with Step 6.
- **7-base (sequential, 1 scoop):** named `of1-s7-base`. Runs `of1-template-generation` with `OF1_TG_MODE=base`. Generates `styles/of1-template-base.css` from the prototype's inline CSS — the shared design tokens all per-template CSS files `@import`. Writes `/shared/of1-demo/step-7-base-status.json`. Must finish before intent scoops start. Dispatches in parallel with Step 6 (stardust:deploy), not after it.
```

Find:
```markdown
### Pre-fan-out: capture EDS visual reference (inline)

After step 6 returns `done` and before spawning 7a–7e, the orchestrator captures the EDS-rendered prototype-home and writes it to a known local path that all 5 intent scoops will read. This gives the agents the actual rendered styling stack (snowflake + OF1 + EDS base) instead of just the standalone prototype HTML.

```bash
EDS_HOME_URL="https://${BRANCH}--${REPO}--${OWNER}.aem.page/prototype-home"
REF_PATH="/workspace/of1-demo/deliverables/eds-prototype-home.png"

playwright-cli open "$EDS_HOME_URL"
sleep 6
playwright-cli screenshot --fullPage=true --filename "$REF_PATH"
playwright-cli tab-close "$(playwright-cli tab-list | grep -oE '[0-9]+' | tail -1)"

[ -s "$REF_PATH" ] && [ "$(stat -c%s "$REF_PATH" 2>/dev/null)" -gt 51200 ] \
  && echo "EDS reference saved: $REF_PATH" \
  || echo "WARN: EDS screenshot looks empty/missing — intent scoops will fall back to prototype-only reference"
```

Do NOT commit this PNG — it's local reference material for the intent scoops only. If the screenshot fails, intent scoops fall back to the prototype HTML + snowflake CSS files (degraded fidelity but still functional).

Spawn 7a–7e and Step 8 in the **same orchestrator turn** (6 scoops total). After all 5 intent status files exist, run assemble **inline** (no scoop). The sprinkle UI shows a single "Step 7" row; the orchestrator only pushes the step-7 status after the inline assemble writes `step-7-status.json`.
```

Replace with:
```markdown
### Pre-fan-out: capture visual reference (inline)

Right after step 5 is approved, and in parallel with dispatching step 6, the orchestrator screenshots the static prototype file directly (no EDS render needed — `deliverables/prototype-*.html` is served as-is from the code bus) and writes it to a known local path that 7-base and all 5 intent scoops will read.

```bash
PROTO_URL="${PREVIEW_BASE}/deliverables/prototype-home.html"
REF_PATH="/workspace/of1-demo/deliverables/eds-prototype-home.png"

playwright-cli open "$PROTO_URL"
sleep 3
playwright-cli screenshot --fullPage=true --filename "$REF_PATH"
playwright-cli tab-close "$(playwright-cli tab-list | grep -oE '[0-9]+' | tail -1)"

[ -s "$REF_PATH" ] && [ "$(stat -c%s "$REF_PATH" 2>/dev/null)" -gt 51200 ] \
  && echo "Reference saved: $REF_PATH" \
  || echo "WARN: screenshot looks empty/missing — 7-base and intent scoops will fall back to reading the prototype's inline <style> alone"
```

Do NOT commit this PNG — it's local reference material for 7-base and the intent scoops only. If the screenshot fails, they fall back to the prototype HTML's inline CSS alone (degraded fidelity but still functional).

Dispatch this pre-fan-out screenshot step, Step 6 (stardust:deploy), and Steps 9a/9b/11 all in the **same orchestrator turn** right after Step 5 is approved. Once the screenshot is ready, dispatch 7-base. Once 7-base finishes, dispatch 7a–7e. Once Step 6 alone finishes (independent of Step 7's progress), dispatch Step 8. After all 5 intent status files exist, run assemble **inline** (no scoop). The sprinkle UI shows a single "Step 7" row; the orchestrator only pushes the step-7 status after the inline assemble writes `step-7-status.json`.
```

- [ ] **Step 5: Rename the step-6 label wherever it says "Snowflake" as a display name** (leave step numbers unchanged)

```bash
grep -n "Snowflake" /Users/quentinvecchio/workspace/labs/of1-demo-skills/skills/of1-demo/SKILL.md
```

For each remaining hit not already covered by Steps 1-4 above, replace `Snowflake` with `stardust:deploy` and `of1-snowflake` with `of1-stardust-deploy` (check the "Step → Skill Mapping" table and "Track Summary" prose in particular).

- [ ] **Step 6: Verify**

```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
grep -qi "snowflake" skills/of1-demo/SKILL.md && { echo "FAIL: snowflake reference remains"; exit 1; }
grep -q "of1-stardust-deploy" skills/of1-demo/SKILL.md || { echo "FAIL: new skill not referenced"; exit 1; }
grep -q "7-base.*parallel with Step 6\|parallel with Step 6\|dispatches in parallel with Step 6" skills/of1-demo/SKILL.md || echo "WARN: double-check parallelism prose reads correctly (manual review)"
echo "✓ Task 6 verified"
```

- [ ] **Step 7: Commit**

```bash
git add skills/of1-demo/SKILL.md
git commit -m "refactor: SLICC orchestrator dispatches templates in parallel with stardust:deploy"
```

---

### Task 7: Update the Claude Code orchestrator (`of1-demo-cc/SKILL.md`) — same changes, CC-specific dispatch/model tables

**Files:**
- Modify: `skills/of1-demo-cc/SKILL.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: updated dispatch table, model-assignment table, task-list template, pre-fan-out screenshot section.

- [ ] **Step 1: Update Phase 1's task-list template**

Find:
```markdown
6.  Snowflake       — convert prototypes to EDS pages
7.  Templates       — 25 branded templates (base + fan-out: 5 intents + assemble)
8.  OF1 styling     — generative-block CSS + /of1 page setup (needs 6)
```

Replace with:
```markdown
6.  Stardust deploy — convert prototypes to EDS blocks + pages
7.  Templates       — 25 branded templates (base + fan-out: 5 intents + assemble; needs 5, NOT 6)
8.  OF1 styling     — generative-block CSS + /of1 page setup (needs 6)
```

- [ ] **Step 2: Update the dependency graph ASCII diagram**

Find:
```markdown
```
2  →  3 ∥ 4  →  5  →  ┬─ 6  →  ┬─ 7-base → 7a ∥ 7b ∥ 7c ∥ 7d ∥ 7e  →  7-assemble  ─┐
                      │        └─ 8                                                   │
                      └─ 9a ∥ 9b ∥ 11  →  10  →  12  ───────────────────────────────┴─→  13
```
```

Replace with:
```markdown
```
2  →  3 ∥ 4  →  5  →  ┬─ 6  →  8  ──────────────────────────────────────────────────┐
                      ├─ 7-base → 7a ∥ 7b ∥ 7c ∥ 7d ∥ 7e  →  7-assemble  ────────────┤
                      └─ 9a ∥ 9b ∥ 11  →  10  →  12  ───────────────────────────────┴─→  13
```
```

- [ ] **Step 3: Update the dispatch trigger table**

Find:
```markdown
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
```

Replace with:
```markdown
| Trigger (ALL must be done) | Dispatch in one message |
|---------|-------------------------|
| Step 2 done | Step 3 AND Step 4 |
| Steps 3 + 4 done | Step 5 |
| Step 5 done | Step 6 AND Step 7-base AND Steps 9a, 9b, 11 (5 agents in one message) |
| Step 6 done | Step 8 (independent of Step 7's progress) |
| Step 7-base done | Steps 7a–7e (5 intent agents in one message) |
| Steps 9a + 9b done | Step 10 (needs products.json + brand-voice.json) |
| Steps 7a–7e all done | Step 7-assemble (1 agent, sequential) |
| Steps 9a + 9b + 10 + 11 ALL done | Step 12 (inline — do NOT run until all four are confirmed done) |
| Steps 7-assemble + 8 + 12 ALL done | Step 13 |
```

- [ ] **Step 4: Update "Common mistakes to avoid"**

Find:
```markdown
**Common mistakes to avoid:**
- Do NOT run Step 12 as soon as 9a finishes — it needs 9a + 9b + 10 + 11 ALL completed.
- Do NOT run Step 7-base before Step 6 returns — 7 reads from 6's output files.
- Do NOT run Step 10 before BOTH 9a and 9b return — it needs both brand-voice.json and products.json.
```

Replace with:
```markdown
**Common mistakes to avoid:**
- Do NOT run Step 12 as soon as 9a finishes — it needs 9a + 9b + 10 + 11 ALL completed.
- Do NOT wait for Step 6 before dispatching Step 7-base — Step 7 now reads step 5's prototype output directly and is fully independent of Step 6. Dispatch both together right after Step 5.
- Do NOT dispatch Step 8 before Step 6 returns — Step 8 needs stardust:deploy's shared nav/footer chrome fragments. Step 8 does NOT need to wait for Step 7.
- Do NOT run Step 10 before BOTH 9a and 9b return — it needs both brand-voice.json and products.json.
```

- [ ] **Step 5: Update the "Pre-fan-out: capture EDS visual references" section**

Find:
```markdown
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
```

Replace with:
```markdown
### Pre-fan-out: capture visual references (inline, orchestrator turn)

Right after Step 5 returns `done` — in parallel with dispatching Step 6 — screenshot every static prototype page directly (no EDS render needed; `deliverables/prototype-*.html` is served as-is from the code bus). The intent agents read these from disk to match their templates to the design system.

```bash
PROTOTYPE_PAGES=$(ls "${OF1_REPO}/deliverables/"prototype-*.html 2>/dev/null \
  | xargs -n1 basename | sed 's/\.html$//')

OWNER=$(jq -r .owner "$OF1_STATE_DIR/repo-config.json")
REPO=$(jq -r .repo "$OF1_STATE_DIR/repo-config.json")

for PAGE in $PROTOTYPE_PAGES; do
  URL="https://${BRANCH}--${REPO}--${OWNER}.aem.page/deliverables/${PAGE}.html"
  REF="${OF1_REPO}/deliverables/eds-${PAGE}.png"
  playwright-cli open "$URL"
  sleep 3
  playwright-cli screenshot --fullPage=true --filename "$REF"

  if [ -s "$REF" ] && [ "$(stat -f%z "$REF" 2>/dev/null || stat -c%s "$REF")" -gt 51200 ]; then
    echo "Reference saved: $REF"
  else
    echo "WARN: screenshot for ${PAGE} empty/missing — intent agents fall back to the prototype's inline <style> alone"
  fi
done
```

Do NOT commit these PNGs. They're local reference material. If screenshots fail, intent agents fall back to the prototype's inline CSS alone — degraded fidelity but functional. This step no longer depends on Step 6 — dispatch it immediately after Step 5, alongside Step 6 and Steps 9a/9b/11.
```

- [ ] **Step 6: Update the "Model assignment per step" table**

Find:
```markdown
| 6 — snowflake | `opus` | Invokes the adobe snowflake skill. Complex multi-phase conversion requiring precise instruction-following. |
```

Replace with:
```markdown
| 6 — stardust deploy | `opus` | Invokes the adobe stardust:deploy skill. Complex multi-phase conversion (naming lock, block extraction, fonts, DA upload, verification gates) requiring precise instruction-following. |
```

- [ ] **Step 7: Verify**

```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
grep -qi "snowflake" skills/of1-demo-cc/SKILL.md && { echo "FAIL: snowflake reference remains"; exit 1; }
grep -q "stardust deploy\|stardust:deploy" skills/of1-demo-cc/SKILL.md || { echo "FAIL: new skill not referenced"; exit 1; }
grep -q "Step 6 AND Step 7-base" skills/of1-demo-cc/SKILL.md || { echo "FAIL: dispatch table not updated"; exit 1; }
echo "✓ Task 7 verified"
```

- [ ] **Step 8: Commit**

```bash
git add skills/of1-demo-cc/SKILL.md
git commit -m "refactor: CC orchestrator dispatches templates in parallel with stardust:deploy"
```

---

### Task 8: Update the sprinkle UI (`of1-demo.shtml`) — step name + `requires` index

**Files:**
- Modify: `skills/of1-demo/of1-demo.shtml`

**Interfaces:**
- Consumes: nothing new.
- Produces: the `STEPS` array the sprinkle UI renders — `requires` indices drive which steps show as "ready" vs "pending" in the UI.

- [ ] **Step 1: Edit the `STEPS` array**

Find:
```javascript
    { name: 'Snowflake', skill: 'of1-snowflake', review: true, desc: 'Convert prototypes to EDS overlay pages, publish to DA.live', reviewNote: 'Preview URL', track: 'A', requires: [4], openLabel: 'Preview' },
    { name: 'Templates', skill: 'of1-template-generation', review: true, desc: 'Generate 25 branded templates (5 intents × 5 variations)', reviewNote: 'Template gallery', track: 'A', requires: [5], openLabel: 'Gallery' },
    { name: 'OF1 styling', skill: 'generative-block-styler', review: true, desc: 'Style the generative search UI to match the brand', reviewNote: 'OF1 page', track: 'A', requires: [5], openLabel: 'OF1 Page' },
```

Replace with:
```javascript
    { name: 'Stardust Deploy', skill: 'of1-stardust-deploy', review: true, desc: 'Convert prototypes to EDS blocks + content pages, publish to DA.live', reviewNote: 'Preview URL', track: 'A', requires: [4], openLabel: 'Preview' },
    { name: 'Templates', skill: 'of1-template-generation', review: true, desc: 'Generate 25 branded templates (5 intents × 5 variations)', reviewNote: 'Template gallery', track: 'A', requires: [4], openLabel: 'Gallery' },
    { name: 'OF1 styling', skill: 'generative-block-styler', review: true, desc: 'Style the generative search UI to match the brand', reviewNote: 'OF1 page', track: 'A', requires: [5], openLabel: 'OF1 Page' },
```

Note: array indices are 0-based and unchanged — index `4` is still "Prototype" (step 5) and index `5` is still the renamed "Stardust Deploy" step (step 6). "Templates" now `requires: [4]` (Prototype) instead of `[5]` (the renamed step) — this is the concrete expression of "step 7 no longer depends on step 6". "OF1 styling" keeps `requires: [5]` since step 8 still depends on step 6.

- [ ] **Step 2: Verify**

```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
grep -qi "snowflake" skills/of1-demo/of1-demo.shtml && { echo "FAIL: snowflake reference remains"; exit 1; }
grep -q "Stardust Deploy" skills/of1-demo/of1-demo.shtml || { echo "FAIL: new step name missing"; exit 1; }
node -e "
const fs = require('fs');
const src = fs.readFileSync('skills/of1-demo/of1-demo.shtml', 'utf8');
const m = src.match(/var STEPS = (\[[\s\S]*?\]);/);
if (!m) { console.error('FAIL: could not locate STEPS array'); process.exit(1); }
const steps = eval(m[1]);
const templates = steps.find(s => s.name === 'Templates');
const styling = steps.find(s => s.name === 'OF1 styling');
if (JSON.stringify(templates.requires) !== '[4]') { console.error('FAIL: Templates.requires wrong:', templates.requires); process.exit(1); }
if (JSON.stringify(styling.requires) !== '[5]') { console.error('FAIL: OF1 styling.requires wrong:', styling.requires); process.exit(1); }
console.log('✓ requires indices correct');
"
echo "✓ Task 8 verified"
```

- [ ] **Step 3: Commit**

```bash
git add skills/of1-demo/of1-demo.shtml
git commit -m "refactor: sprinkle UI reflects stardust:deploy rename and templates' new dependency"
```

---

### Task 9: Update `common-pitfalls.md` canonical references

**Files:**
- Modify: `skills/of1-demo/knowledge/common-pitfalls.md:14,21,45`

**Interfaces:**
- Consumes/Produces: nothing structural — pointer text only.

- [ ] **Step 1: Edit the three canonical-reference lines**

Find:
```markdown
**Canonical reference:** `of1-snowflake` § "Template Gets EVERYTHING Visual".
```
Replace with:
```markdown
**Canonical reference:** `stardust:deploy` § "The ENCODE contract" (images/editorial-content rules).
```

Find:
```markdown
**Canonical reference:** `of1-snowflake` § "EDS Class Name Collisions" and `of1-prototype` § post-gen fixes.
```
Replace with:
```markdown
**Canonical reference:** `of1-prototype` § post-gen fixes (5b — CSS class naming) and `stardust:deploy` § "Naming rules" (never name a block after a reserved EDS class).
```

Find:
```markdown
**Canonical reference:** `of1-snowflake` § "DA Content Format".
```
Replace with:
```markdown
**Canonical reference:** `stardust:deploy` § "9. Content page scaffold".
```

Note: these three pitfalls (1.1, 1.2, 1.5) describe generic EDS/DA authoring constraints that apply regardless of which conversion engine produced the content — they are not specific to the old snowflake wrapper's behavior, so only the *pointer* changes, not the pitfall description itself.

- [ ] **Step 2: Verify**

```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
grep -qi "of1-snowflake" skills/of1-demo/knowledge/common-pitfalls.md && { echo "FAIL: stale reference remains"; exit 1; }
echo "✓ Task 9 verified"
```

- [ ] **Step 3: Commit**

```bash
git add skills/of1-demo/knowledge/common-pitfalls.md
git commit -m "docs: repoint common-pitfalls canonical references to stardust:deploy"
```

---

### Task 10: Update `README.md`

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes/Produces: nothing structural — top-level documentation only.

- [ ] **Step 1: Edit the pipeline flow ASCII diagram**

Find:
```markdown
```
Steps 1→2→3→4→5 (sequential)
                 ↓
         ┌───────┴───────┐
         ↓               ↓
    Track A          Track B
         ↓               ↓
    Step 6          Steps 9,10,11
    (Snowflake)     (all parallel)
         ↓               ↓
    Steps 7+8       Step 12
    (parallel)      (Config review)
         ↓               ↓
         └───────┬───────┘
                 ↓
            Step 13 (Deploy)
```
```

Replace with:
```markdown
```
Steps 1→2→3→4→5 (sequential)
                 ↓
         ┌───────┴───────┐
         ↓               ↓
    Track A          Track B
    ┌────┴────┐          ↓
    ↓         ↓     Steps 9,10,11
  Step 6   Step 7   (all parallel)
(Stardust  (Templates)   ↓
 Deploy)       ↓     Step 12
    ↓      (independent   (Config review)
  Step 8    of Step 6)    ↓
    └────┬────┘           ↓
         └───────┬────────┘
                 ↓
            Step 13 (Deploy)
```
```

- [ ] **Step 2: Edit the pipeline step table**

Find:
```markdown
| Step | Name | Skill | Depends on |
|------|------|-------|------------|
| 1 | Install dependencies | `of1-setup` | — |
| 2 | Repo setup | `of1-repo-setup` | Step 1 |
| 3 | Discovery | `of1-discovery` | Step 2 |
| 4 | Extraction | `of1-extraction` | Step 3 |
| 5 | Prototype | `of1-prototype` | Step 4 |
| 6 | Snowflake | `of1-snowflake` | Step 5 |
| 7 | Templates | `of1-template-generation` | Step 6 |
| 8 | OF1 styling | `of1-generative-block-styler` | Step 6 |
| 9 | Brand & content | `of1-brand-voice-extractor` + `of1-content-metadata` | Step 5 |
| 10 | Suggestions | `of1-quick-suggestions` | Step 5 |
| 11 | CTA template | `of1-cta-template-builder` | Step 5 |
| 12 | Config review | `of1-config-review` | Steps 9+10+11 |
| 13 | Deploy | `of1-deploy` | Steps 7+8+12 |
```

Replace with:
```markdown
| Step | Name | Skill | Depends on |
|------|------|-------|------------|
| 1 | Install dependencies | `of1-setup` | — |
| 2 | Repo setup | `of1-repo-setup` | Step 1 |
| 3 | Discovery | `of1-discovery` | Step 2 |
| 4 | Extraction | `of1-extraction` | Step 3 |
| 5 | Prototype | `of1-prototype` | Step 4 |
| 6 | Stardust Deploy | `of1-stardust-deploy` | Step 5 |
| 7 | Templates | `of1-template-generation` | Step 5 |
| 8 | OF1 styling | `of1-generative-block-styler` | Step 6 |
| 9 | Brand & content | `of1-brand-voice-extractor` + `of1-content-metadata` | Step 5 |
| 10 | Suggestions | `of1-quick-suggestions` | Step 5 |
| 11 | CTA template | `of1-cta-template-builder` | Step 5 |
| 12 | Config review | `of1-config-review` | Steps 9+10+11 |
| 13 | Deploy | `of1-deploy` | Steps 7+8+12 |
```

- [ ] **Step 3: Edit the "Skills" table**

Find:
```markdown
| `of1-snowflake` | Convert stardust prototypes to EDS pages and install the OF1 block |
```

Replace with:
```markdown
| `of1-stardust-deploy` | Convert stardust prototypes to EDS blocks + content pages via `stardust:deploy` |
```

- [ ] **Step 4: Edit the "Prerequisites" section's plugin list**

Find:
```markdown
- **Skills installed** — OF1 demo skills + Adobe EDS/snowflake skills (`adobe/skills`) + stardust (`adobe/skills`) + impeccable (`pbakaus/impeccable`)
```

Replace with:
```markdown
- **Skills installed** — OF1 demo skills + Adobe stardust skills (`adobe/skills`, includes `deploy`) + impeccable (`pbakaus/impeccable`)
```

Find:
```bash
upskill aem-growth-adoption/of1-demo-skills --all --branch skills-v3 --force
upskill adobe/skills --path plugins/aem/edge-delivery-services --all
upskill adobe/skills --path plugins/stardust --all
upskill pbakaus/impeccable --all
```

Replace with:
```bash
upskill aem-growth-adoption/of1-demo-skills --all --branch skills-v3 --force
upskill adobe/skills --path plugins/stardust --all
upskill pbakaus/impeccable --all
```

- [ ] **Step 5: Verify**

```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
grep -qi "snowflake" README.md && { echo "FAIL: snowflake reference remains"; exit 1; }
grep -q "of1-stardust-deploy" README.md || { echo "FAIL: new skill not referenced"; exit 1; }
grep -q "edge-delivery-services" README.md && { echo "FAIL: stale adobe EDS plugin install line remains"; exit 1; }
echo "✓ Task 10 verified"
```

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: README reflects stardust:deploy rename and new dependency graph"
```

---

### Task 11: Repo-wide sweep — confirm zero dangling references

**Files:** none modified — verification only.

**Interfaces:** none.

- [ ] **Step 1: Grep the entire skills repo for any remaining `snowflake` mention**

```bash
cd /Users/quentinvecchio/workspace/labs/of1-demo-skills
grep -rli "snowflake" skills/ README.md docs/ 2>/dev/null || echo "(no matches — clean)"
```

- [ ] **Step 2: For every match printed, open the file and confirm it is one of the two legitimate remaining categories, or fix it**

Legitimate remaining mentions (do NOT remove):
- References to `stardust:deploy` itself are fine — that skill is unrelated to the old Adobe `snowflake` skill and is the thing we're adopting.
- This plan document and the design spec (`docs/superpowers/specs/2026-07-22-of1-stardust-da-rework-design.md`) legitimately discuss the old skill by name as historical/design context — leave those untouched.

Anything else (a skill file, `verify.sh`, the orchestrators, the `.shtml`, `README.md`, `common-pitfalls.md`) referencing `of1-snowflake`, the Adobe `snowflake` skill, or snowflake's old output paths (`templates/<slug>.html`, `styles/<slug>.css`, `fragments/<slug>/`) is a miss from Tasks 1-10 — fix it using the same find/replace pattern as the relevant task above.

- [ ] **Step 3: Confirm the new skill directory is discoverable the same way the old one was**

```bash
ls -la skills/of1-stardust-deploy/
cat skills/of1-stardust-deploy/SKILL.md | head -5
```

- [ ] **Step 4: Run a final full-repo grep for the new skill name to confirm it's wired everywhere it needs to be**

```bash
grep -rl "of1-stardust-deploy" skills/ README.md 2>/dev/null
```

Expected files in the result: `skills/of1-stardust-deploy/SKILL.md`, `skills/of1-setup/SKILL.md`, `skills/of1-setup/scripts/verify.sh`, `skills/of1-demo/SKILL.md`, `skills/of1-demo-cc/SKILL.md`, `skills/of1-demo/of1-demo.shtml`, `README.md`. If any is missing, go back to that task.

- [ ] **Step 5: Commit (only if Step 2 required fixes)**

```bash
git add -A
git commit -m "fix: clean up remaining stale snowflake references" --allow-empty
```

(If Step 2 found nothing to fix, skip this commit — there's nothing to commit.)

---

## Self-Review Notes

- **Spec coverage:** Task 1 covers spec §1 (skill swap). Tasks 3, 6, 7, 8 cover spec §2 (parallelism: 7 independent of 6). Task 4 covers spec §3 (step 8 absorbs /of1 overlay ownership via fragment-source repointing — note the spec's "builds its own template/fragment pair from the step-5 prototype" already matches the *existing* skill's Step 6 behavior for the `/of1` template itself; what changes is only the *source* of the shared nav/footer chrome it copies, which Task 4 handles). Task 5 covers spec §4 (deploy gate updates). Tasks 9-10 are cleanup/documentation parity. Task 2 is a prerequisite (setup/verify) not explicitly named in the spec but required for the pipeline to function post-swap — added because `of1-setup`'s `verify.sh` would otherwise report a missing skill and a defunct Adobe dependency forever.
- **Out of scope, confirmed:** DA.live config authoring (spec §5-8) is entirely excluded from this plan — no task touches `of1-content-metadata`, `of1-brand-voice-extractor`, `of1-quick-suggestions`, `of1-cta-template-builder`, `of1-config-review`'s data-loading mechanism, or `of1-gen-web`.
- **Open risk flagged explicitly, not hidden:** Task 4's fragment-path discovery step is written defensively (checks three candidate paths) specifically because `stardust:deploy`'s own SKILL.md is internally inconsistent about where shared chrome fragments live. This is called out in Global Constraints and is not treated as a silent assumption.
