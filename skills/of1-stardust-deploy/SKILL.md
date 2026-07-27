---
name: of1-stardust-deploy
description: Convert the step-4 prototypes into EDS blocks + content pages by invoking the adobe `stardust:deploy` skill. Thin wrapper — stardust:deploy owns the conversion methodology (naming, block extraction, foundation CSS, fonts, buttons, DA upload, verification); this skill supplies OF1-specific inputs and overrides stardust's branch handling so artifacts land on the demo branch.
user-invocable: false
---

# OF1 Stardust Deploy

Pure delegation to the `stardust:deploy` skill (`stardust` plugin). Convert every prototype committed by step 4 into real EDS blocks + content pages — one block per distinct prototype `<section>` (deduped via stardust's variant-class rule where sections repeat with the same treatment), one EDS content page per prototype page, shared `content/fragments/{nav,footer}.html` chrome, and a `styles/styles.css` foundation (tokens, reset, button system, self-hosted fonts) — then push to the demo branch.

The `/of1` personalization page is NOT converted here — its DOM-preserving passthrough overlay is owned entirely by step 7 (`of1-generative-block-styler`), since the OF1 search block must stay live-DOM and can never be authored as a static EDS block.

## Env — orchestrator exports these (see `of1-setup`)

| Var | Purpose |
|-----|---------|
| `OF1_STATE_DIR` | state + IPC dir; receives `step-5-status.json` |
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

stardust:deploy's deploy stage (§ "Deploy (DA Source API, from a local agent)") pushes to whatever branch is currently checked out and does not itself create a feature branch — confirm this by checking `git branch --show-current` before invoking. If any phase of stardust:deploy prompts to create or push to a new branch, override it: substitute `${BRANCH}` (already checked out by `of1-setup`) wherever it would create a new one, and push there:

```bash
git checkout "${BRANCH}"   # should already be current — verify, don't assume
git push origin "${BRANCH}"
```

Preview/content URLs must resolve at `https://${BRANCH}--${REPO}--${OWNER}.aem.page/…` — if stardust:deploy's own examples show a different branch name, substitute `${BRANCH}`.

### 3. Verify critical artifacts exist (hard gate)

**Step 6 (template generation) and step 7 (OF1 styling) both depend on this step's output** — step 7 specifically needs `content/fragments/nav.html` and `content/fragments/footer.html` (or the path confirmed by `of1-generative-block-styler`'s own runtime-discovery step — see that skill for the exact path, since stardust:deploy's own docs are inconsistent about whether shared fragments live under `content/fragments/` or repo-root `fragments/`).

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

# Shared chrome fragments — REQUIRED by step 7. Check both candidate locations
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

cat > "$OF1_STATE_DIR/step-5-status.json" <<EOF
{
  "step": 5,
  "status": "review",
  "deliverables": ${DELIVERABLES},
  "summary": "stardust:deploy conversion complete: ${COUNT} EDS page(s) on demo branch, block-authored with branded chrome."
}
EOF
```

The orchestrator (CC: agent-return parsing; SLICC: sprinkle polling) handles the approve/done transition.
