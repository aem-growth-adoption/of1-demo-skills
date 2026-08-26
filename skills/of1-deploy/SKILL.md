---
name: of1-deploy
description: Convert of1-prototype's prototypes into a block-based EDS site by invoking the adobe `stardust:deploy` skill. Thin wrapper — stardust:deploy owns the methodology (prototype sections → authorable EDS blocks + content pages, chrome, and DA deploy); this skill orchestrates it against the demo repo/branch and gates the Stage-2 output.
user-invocable: false
---

# OF1 Deploy

Pure delegation to the `stardust:deploy` skill (`stardust` plugin). It takes the pixel-perfect prototypes committed by `of1-prototype` and produces a **block-based** EDS site — one EDS block per distinct prototype pattern, one content page per prototype page, authored `/nav` + `/footer` documents, `blocks/header` + `blocks/footer`, and a rebranded `styles/styles.css` — then deploys via the DA Source API.

This is the Stage-2c site-recreation engine for the **prototype+deploy** pipeline (the sibling of `of1-snowflake` in the prototype+snowflake pipeline and of `stardust:replica` in the replica pipeline). Where snowflake produces a byte-for-byte overlay of each prototype's DOM, `stardust:deploy` re-interprets each prototype into **authorable** EDS blocks + content pages — a realer, editable EDS site, at replica-style (not pixel-copy) fidelity.

**Scope boundary:** the OF1-specific `/of1` generative-search page (templates, generative block, quick suggestions, CTA) is owned by the Stage-3 site-integration skills (`of1-build-templates`, `of1-style-generative-block`, `of1-build-cta-template`), not here. Those skills read the **prototypes** (`deliverables/prototype-*.html`) + `DESIGN.json` + the deployed site chrome — never this stage's internal block artifacts — so this stage is a clean, self-contained site build.

## Env — orchestrator exports these (see `of1-setup`)

| Var | Purpose |
|-----|---------|
| `OF1_STATE_DIR` | state + IPC dir; receives `of1-deploy-status.json` |
| `OF1_STAGE2_DONE_FILE` | path to the Stage-2 done file the orchestrator exports; Stage-3 site-integration waits on this |
| `OF1_DEMO_REPO` | absolute path to the local `of1-demo` git clone (an aem-boilerplate EDS project) |
| `ADOBE_IMS_TOKEN` | raw DA token (preferred — stardust reads `$DA_TOKEN` from env automatically) |
| `OF1_TOKEN_FILE` | path to a `{"access_token":"…"}` JSON (fallback) |

Resolve `DA_TOKEN` and read repo config once at the top:

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

The `deliverables/prototype-*.html` files are self-contained (inline `<style>` + `:root` tokens) — the ideal `stardust:deploy` input shape. It reads them directly; no pre-render step is needed.

### ⚠️ Branch — stay on the demo branch (no per-run branch)

Unlike `snowflake`, `stardust:deploy` does **not** create a per-run feature branch — its Code stage `git push`es whatever branch is currently checked out, and its content deploy targets `${BRANCH}--${REPO}--${OWNER}.aem.page`. So the one thing to guarantee is that the repo is on the demo `${BRANCH}` before you invoke it:

```bash
cd "$OF1_DEMO_REPO"
git checkout "${BRANCH}" 2>/dev/null || git checkout -b "${BRANCH}"
```

Everything else in stardust:deploy's Deploy section (git push → Code Sync build, DA `PUT`, `preview`/`live` POSTs, the atomic per-page delivery contract) stays exactly as it describes it — it already parameterizes org/repo/branch.

### 2. Invoke the `stardust:deploy` skill

Invoke `stardust:deploy` **once** — it owns the full multi-page conversion + deploy (its bundled `deploy-batch.mjs` driver handles all pages with a persistent ledger). Do NOT loop it per prototype, and do NOT reimplement its phases by hand.

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
  #    It handles audit, block naming, foundation, chrome, blocks, content
  #    scaffold, DA deploy, and post-deploy reconciliation.
  ```
  Do NOT reimplement the conversion by hand. The skill owns the entire prototype-to-EDS-blocks methodology.

Supply these values upfront (do NOT let it prompt — provide them in the invocation context):

| stardust:deploy input | Our value |
|---|---|
| Prototypes location | `${OF1_DEMO_REPO}/deliverables/prototype-*.html` (self-contained single-file prototypes — discover, don't scaffold) |
| Target EDS project | the repo root at `$OF1_DEMO_REPO` (already a vanilla aem-boilerplate clone — do NOT re-scaffold) |
| `org` / `repo` / `branch` | `${OWNER}` / `${REPO}` / `${BRANCH}` (for `git push` + the DA `deploy-batch.mjs --org --repo --branch` call) |
| Content root | `content/` — one content page per prototype page, named after the prototype slug (drop the `prototype-` prefix; `prototype-home` → `index`) so the recreated pages serve at clean paths |
| DA token | stardust reads `$DA_TOKEN` from env automatically |

**DA auth note:** All calls to `admin.da.live` or `admin.hlx.page` MUST include BOTH `Authorization: Bearer $DA_TOKEN` AND `x-content-source-authorization: Bearer $DA_TOKEN` headers. If stardust's instructions only show one header, add the second yourself.

**Token lifecycle:** stardust:deploy preflights and re-checks `$DA_TOKEN`; a mid-batch `401` is a legitimate hard stop (refresh `.env`, re-run — its ledger skips already-delivered pages). Surface that to the orchestrator rather than marking Stage 2 done.

### 3. Verify critical site artifacts exist (hard gate)

After stardust:deploy completes, verify the outputs the Stage-3 site-integration skills depend on. **`of1-style-generative-block` and `of1-publish` need the deployed site chrome** — `content/nav.html`, `content/footer.html`, `blocks/header`, `blocks/footer`, and a rebranded `styles/styles.css`. If these are missing, the `/of1` page renders chromeless and Stage 3 degrades.

```bash
cd "$OF1_DEMO_REPO"
FAIL=false

# Site chrome + foundation — what Stage 3 reads
[ -f "content/nav.html" ]       || { echo "✗ MISSING: content/nav.html"; FAIL=true; }
[ -f "content/footer.html" ]    || { echo "✗ MISSING: content/footer.html"; FAIL=true; }
[ -d "blocks/header" ]          || { echo "✗ MISSING: blocks/header/"; FAIL=true; }
[ -d "blocks/footer" ]          || { echo "✗ MISSING: blocks/footer/"; FAIL=true; }
[ -f "styles/styles.css" ]      || { echo "✗ MISSING: styles/styles.css"; FAIL=true; }

# At least one converted content page and at least one block
CONTENT_PAGES=$(find content -name '*.html' ! -name 'nav.html' ! -name 'footer.html' 2>/dev/null | wc -l | tr -d ' ')
[ "$CONTENT_PAGES" -ge 1 ] || { echo "✗ MISSING: no converted content pages under content/"; FAIL=true; }
BLOCK_DIRS=$(find blocks -mindepth 1 -maxdepth 1 -type d ! -name header ! -name footer ! -name fragment 2>/dev/null | wc -l | tr -d ' ')
[ "$BLOCK_DIRS" -ge 1 ] || { echo "✗ MISSING: no prototype-derived blocks under blocks/"; FAIL=true; }

if [ "$FAIL" = true ]; then
  echo "" >&2
  echo "FAIL: stardust:deploy was NOT invoked correctly — critical artifacts missing." >&2
  echo "The stardust:deploy skill (read_file /workspace/skills/deploy/SKILL.md) produces" >&2
  echo "blocks/, content/ pages, content/nav.html + content/footer.html chrome, and a" >&2
  echo "rebranded styles/styles.css. If they're missing, you likely improvised the" >&2
  echo "conversion by hand instead of following the skill. Go back and invoke it properly." >&2
  exit 1
fi
echo "✓ Chrome, foundation, ${CONTENT_PAGES} content page(s), and ${BLOCK_DIRS} block(s) present"
```

### 4. Verify all pages render on EDS preview

Derive the deployed page paths from the content tree, then confirm each returns `200` on the branch host:

```bash
cd "$OF1_DEMO_REPO"
PAGE_PATHS=$(find content -name '*.html' ! -name 'nav.html' ! -name 'footer.html' 2>/dev/null \
  | sed -e 's#^content/##' -e 's#\.html$##' -e 's#/index$##' -e 's#^index$##')

for P in $PAGE_PATHS; do
  URL="https://${BRANCH}--${REPO}--${OWNER}.aem.page/${P}"
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$URL")
  echo "  /${P}: ${CODE}"
done
```

All should return `200`. If anything 404s, inspect `content/.deploy-ledger.json` for the failing page to see where stardust:deploy stopped, fix, and re-run its batch driver (idempotent — it skips already-delivered pages).

## Completion

Build the deliverables array — one entry per deployed content page (label is the path, title-cased; home first):

```bash
PREVIEW_BASE="https://${BRANCH}--${REPO}--${OWNER}.aem.page"

DELIVERABLES=$(cd "$OF1_DEMO_REPO" && python3 - <<PYEOF
import json, glob, os
base  = "${PREVIEW_BASE}"
paths = []
for f in glob.glob("content/**/*.html", recursive=True):
    rel = os.path.relpath(f, "content")
    if rel in ("nav.html", "footer.html"):
        continue
    p = rel[:-5]                       # strip .html
    if p.endswith("/index"): p = p[:-6]
    if p == "index":         p = ""
    paths.append(p)
paths.sort(key=lambda p: 0 if p == "" else 1)
def label(p):
    return "Home" if p == "" else p.replace("-", " ").replace("/", " ").title()
print(json.dumps([{"url": f"{base}/{p}", "label": label(p)} for p in paths]))
PYEOF
)

COUNT=$(echo "$DELIVERABLES" | jq 'length')

cat > "$OF1_STATE_DIR/of1-deploy-status.json" <<EOF
{
  "stage": 2,
  "skill": "of1-deploy",
  "status": "review",
  "deliverables": ${DELIVERABLES},
  "summary": "Block-based EDS deploy complete: ${COUNT} authorable EDS page(s) on the demo branch, with branded chrome, reusable blocks, and rebranded foundation CSS."
}
EOF

# Stage-2 done file — the Stage-3 site-integration track gates on this.
printf '{"stage":2,"status":"done"}' > "${OF1_STAGE2_DONE_FILE:?OF1_STAGE2_DONE_FILE unset}"
```

The orchestrator (CC: agent-return parsing; SLICC: sprinkle polling) handles the approve/done transition.
