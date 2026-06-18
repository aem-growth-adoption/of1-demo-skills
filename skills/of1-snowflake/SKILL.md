---
name: of1-snowflake
description: Convert the step-5 prototypes into EDS overlay pages by invoking the adobe `snowflake` skill once per prototype. Thin wrapper — snowflake owns the methodology; this skill orchestrates the per-prototype loop and overrides snowflake's branch handling so artifacts land on the demo branch.
user-invocable: false
---

# OF1 Snowflake

Pure delegation to the `snowflake` skill (`aem-edge-delivery-services` plugin). For each prototype committed by step 5, invoke snowflake to produce the EDS overlay artifacts — `templates/<slug>.html`, `fragments/<slug>/{header,footer}.html`, `styles/<slug>.css`, and the DA-source body — and push them to the demo branch.

The OF1-specific extension to the overlay engine (the `data-slot-passthrough` mechanism needed by the `/of1` page) is owned by **step 8**, not here. Step 6 stays a pure snowflake wrapper.

## Env — orchestrator exports these (see `of1-setup`)

| Var | Purpose |
|-----|---------|
| `OF1_STATE_DIR` | state + IPC dir; receives `step-6-status.json` |
| `OF1_DEMO_REPO` | absolute path to the local `of1-demo` git clone |
| `ADOBE_IMS_TOKEN` | raw DA token (preferred — snowflake reads this from env automatically) |
| `OF1_TOKEN_FILE` | path to a `{"access_token":"…"}` JSON (fallback) |

Resolve `DA_TOKEN` (snowflake honors `$DA_TOKEN`) and read repo config once at the top:

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

### 2. For each prototype, invoke the `snowflake` skill

Invoke the `snowflake` skill once per prototype. Snowflake runs its 7 phases (Phase 0 substrate install runs only on the first invocation — subsequent runs are no-ops). The prototypes from step 5 are already hosted on EDS preview (static HTML in `/deliverables/*` is served directly from the code bus), so pass that URL as `SOURCE_URL`.

**How to invoke in each runtime:**

- **Claude Code:** use the `Skill` tool:
  ```
  Skill: snowflake
  ```

- **SLICC:** read the skill and execute it inline:
  ```bash
  # 1. Read the skill instructions
  read_file /workspace/skills/snowflake/SKILL.md
  # 2. Follow those instructions directly — the skill IS the procedure.
  #    It handles capture, analysis, artifact generation, DA upload, and preview.
  ```
  Do NOT reimplement snowflake's phases by hand. The skill owns the entire static-to-EDS conversion methodology.

Snowflake gathers prerequisites at the start of each run. Supply these values (do NOT let it prompt — provide them upfront in the invocation context):

| Snowflake input | Our value |
|---|---|
| `SOURCE_URL` | `https://${BRANCH}--${REPO}--${OWNER}.aem.page/deliverables/${SLUG}.html` |
| Target EDS repo | `${OWNER}/${REPO}` (local clone at `$OF1_DEMO_REPO`) |
| `DA_ROOT` | `/` |
| `PAGE_SLUG` | `${SLUG}` (e.g. `prototype-home`) |
| `TEMPLATE_NAME` | `${SLUG}` (matches the fragment path step 8 reads) |
| `level` | `page` (overlay — preserves the prototype DOM byte-for-byte) |
| `assetStrategy` | `da-media` (binaries uploaded to DA media bus; URLs branch-independent and reusable across runs) |
| DA token | snowflake reads `$DA_TOKEN` from env automatically |

**DA auth note:** All calls to `admin.da.live` or `admin.hlx.page` MUST include BOTH `Authorization: Bearer $DA_TOKEN` AND `x-content-source-authorization: Bearer $DA_TOKEN` headers. If snowflake's instructions only show one header, add the second yourself.

### ⚠️ Critical override of snowflake's branch handling

Snowflake's Phase 5 default is to create a **per-run feature branch** named `${branchPrefix}${NNN}` (e.g. `snowflake-001`, `snowflake-002`) and push artifacts there. **DO NOT FOLLOW THAT.** Our demo needs every prototype on the existing `${BRANCH}` (e.g. `frescopa`) so the preview URLs resolve at `https://${BRANCH}--${REPO}--${OWNER}.aem.page/…`.

When snowflake's Phase 5 prompt directs you to:

| Snowflake says | You do instead |
|---|---|
| `git checkout -b "snowflake-${NNN}"` | `git checkout "${BRANCH}"` (already on it) |
| `git push -u origin "snowflake-${NNN}"` | `git push origin "${BRANCH}"` |
| Preview URL host `snowflake-${NNN}--${REPO}--${OWNER}.aem.page` | `${BRANCH}--${REPO}--${OWNER}.aem.page` |
| `admin.hlx.page/preview/${OWNER}/${REPO}/snowflake-${NNN}/...` | `admin.hlx.page/preview/${OWNER}/${REPO}/${BRANCH}/...` |

In short: substitute `${BRANCH}` wherever snowflake's prompts use `snowflake-${NNN}`. Everything else in Phase 5 (DA PUT, preview trigger, verification curl on the branch host) stays exactly as snowflake describes it.

Loop over all prototypes, applying this override on every invocation.

### 3. Verify critical artifacts exist (hard gate)

After snowflake completes for every prototype, verify the most important outputs exist. **Step 7 (template generation) depends on `templates/prototype-*.html`** — if these are missing, step 7 has no reference for how `data-slot` markers work and will produce degraded templates.

```bash
cd "$OF1_DEMO_REPO"
FAIL=false

for SLUG in $PROTOTYPES; do
  # Slot-marked overlay template — THE critical output for step 7
  [ -f "templates/${SLUG}.html" ] || { echo "✗ MISSING: templates/${SLUG}.html"; FAIL=true; }
  # Per-template CSS
  [ -f "styles/${SLUG}.css" ] || { echo "✗ MISSING: styles/${SLUG}.css"; FAIL=true; }
  # Header/footer fragments — step 8 reads these for /of1 page chrome
  [ -f "fragments/${SLUG}/header.html" ] || { echo "✗ MISSING: fragments/${SLUG}/header.html"; FAIL=true; }
  [ -f "fragments/${SLUG}/footer.html" ] || { echo "✗ MISSING: fragments/${SLUG}/footer.html"; FAIL=true; }
done

if [ "$FAIL" = true ]; then
  echo "" >&2
  echo "FAIL: snowflake was NOT invoked correctly — critical artifacts missing." >&2
  echo "The snowflake skill (read_file /workspace/skills/snowflake/SKILL.md) produces" >&2
  echo "templates/, styles/, and fragments/ as its Phase 3 output. If they're missing," >&2
  echo "you likely improvised the conversion by hand instead of following the skill." >&2
  echo "Go back and invoke snowflake properly." >&2
  exit 1
fi
echo "✓ All templates, styles, and fragments present"
```

### 4. Verify all pages render on EDS preview

```bash
for SLUG in $PROTOTYPES; do
  URL="https://${BRANCH}--${REPO}--${OWNER}.aem.page/${SLUG}"
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$URL")
  echo "  ${SLUG}: ${CODE}"
done
```

All should return `200`. If anything 404s, inspect `.snowflake/projects/*/state.json` for the failing page to see where snowflake stopped, fix, and re-invoke just that prototype.

## Completion

Build the deliverables array — one entry per converted page (label is the slug, title-cased):

```bash
PREVIEW_BASE="https://${BRANCH}--${REPO}--${OWNER}.aem.page"

DELIVERABLES=$(python3 - <<PYEOF
import json, os
base   = "${PREVIEW_BASE}"
slugs  = """${PROTOTYPES}""".split()
slugs.sort(key=lambda s: 0 if s == 'prototype-home' else 1)
out = [
    {"url": f"{base}/{s}",
     "label": s.removeprefix("prototype-").replace("-", " ").title()}
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
  "summary": "Snowflake overlay conversion complete: ${COUNT} EDS page(s) on demo branch, with branded chrome + slot-keyed text content."
}
EOF
```

The orchestrator (CC: agent-return parsing; SLICC: sprinkle polling) handles the approve/done transition.
