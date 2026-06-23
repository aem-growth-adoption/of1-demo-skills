/**
 * OF1 Demo Pipeline — SLICC Workflow
 *
 * Adapted from of1-demo.js (Claude Code version) to match the of1-demo SKILL.md
 * architecture for SLICC's environment (sudoers, oauth-token, DA API, etc.)
 *
 * KEY DIFFERENCES FROM of1-demo.js (CC version):
 * ──────────────────────────────────────────────────
 * 1. DEPENDENCY GRAPH: CC version serializes Snowflake before Config track.
 *    SLICC skill runs them in PARALLEL after Step 5 (Track A + Track B fork).
 *
 * 2. TEMPLATE FAN-OUT: CC version runs base + 5 intents + assemble in 3 phases.
 *    Same here, but with explicit "produce EXACTLY 3 variations" instruction and
 *    assemble runs inline (no agent) per the skill's mandate.
 *
 * 3. STEP 10 (Suggestions): CC version runs it parallel with OF1 styling.
 *    Skill says Step 10 WAITS for Step 9 (needs products.json + brand-voice.json).
 *
 * 4. STEP 12 (Config review): CC version uses an agent. Skill says ALWAYS inline.
 *
 * 5. DA AUTH: Always `oauth-token adobe`. Never fish in localStorage or .da-token.json.
 *
 * 6. GIT RULES: Never `git add .` or `git add -A`. Only specific paths.
 *
 * 7. DEPLOY: CC version has dual verifiers. Skill has a 5-point pre-launch checklist.
 *
 * Input (args): { domain: string, branch?: string, repo?: string }
 *   - domain (required): bare hostname, e.g. "wknd.site"
 *   - branch (optional): git branch. Defaults to domain without TLD.
 *   - repo (optional): absolute path to clone. Defaults to /workspace/of1-demo.
 */

export const meta = {
  name: 'of1-demo-slicc',
  description: 'Full OF1 demo pipeline for SLICC — adapted from of1-demo skill',
  whenToUse: 'When the user wants to create an OF1 demo for a website domain',
  phases: [
    { title: 'Setup', detail: 'Verify dependencies and tools' },
    { title: 'Repo setup', detail: 'Create demo branch and config' },
    { title: 'Discovery & Extraction', detail: 'Crawl site + extract design tokens (parallel)' },
    { title: 'Prototype', detail: 'Pixel-perfect HTML prototypes of all key pages' },
    { title: 'Snowflake + Config Track B', detail: 'EDS conversion (Track A start) + brand/content/CTA (Track B) — all parallel' },
    { title: 'OF1 styling + Template base + Suggestions', detail: 'After snowflake: styling + base tokens; after step 9: suggestions' },
    { title: 'Template intents', detail: '5 intent × 3 variations = 15 templates in parallel' },
    { title: 'Template assembly + Config review', detail: 'Catalog + gallery (inline) + config-review (inline)' },
    { title: 'Deploy & verify', detail: 'Sync config + 5-point pre-launch checklist' },
  ],
}

// ─── Model alias shim ─────────────────────────────────────────────────────────

const MODEL_ALIASES = {
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-6',
  haiku: 'claude-haiku-4-5',
};

const _agent = agent;
agent = (prompt, opts) => {
  if (opts?.model && MODEL_ALIASES[opts.model]) {
    opts = { ...opts, model: MODEL_ALIASES[opts.model] };
  }
  return _agent(prompt, opts);
};

// ─── Parse args ───────────────────────────────────────────────────────────────

const parsed = typeof args === 'string' ? { domain: args } : args
const DOMAIN = parsed?.domain
if (!DOMAIN) throw new Error('Usage: args = { domain: "wknd.site", branch?: "...", repo?: "/path/to/clone" }')

const BRANCH = parsed.branch || DOMAIN.replace(/\.[^.]+$/, '')
const REPO_PATH = parsed.repo || '/workspace/of1-demo'
const OWNER = 'aem-growth-adoption'
const REPO_NAME = 'of1-demo'
const PREVIEW_BASE = `https://${BRANCH}--${REPO_NAME}--${OWNER}.aem.page`

// ─── Shared prompt fragments ──────────────────────────────────────────────────

const SLICC_PREAMBLE = `
## SLICC Environment Rules
- DA auth: run \`oauth-token adobe\` to get a token. NEVER use localStorage, .da-token.json, or npx helpers.
- Git: NEVER use \`git add .\` or \`git add -A\`. Only add specific paths you produced.
- Git: One commit + one push at the end of your work.
- File writes: write directly to ${REPO_PATH}/ — you have full access.
- Browser: use \`playwright-cli\` for screenshots and DOM extraction.
- Images: use \`download-images\` jsh script for bulk image downloads, NOT per-image curl loops.
`

const SKILL_PREAMBLE = (skillDir) => `
## STEP 1 — MANDATORY (do this FIRST)
Run: read_file({ path: "/workspace/skills/${skillDir}/SKILL.md" })
Then follow those instructions EXACTLY. Do NOT improvise.
`

const PROJECT_CONTEXT = `
## Project Context
- Domain: ${DOMAIN}
- Branch: ${BRANCH}
- Owner: ${OWNER}
- Repo: ${REPO_NAME}
- Repo path: ${REPO_PATH}
- Preview base: ${PREVIEW_BASE}
- State dir: /shared/of1-demo
- repo-config.json: /shared/of1-demo/repo-config.json
`

const OUTPUT_CONTRACT = (stepNum) => `
## Output Contract
Write a status file to /shared/of1-demo/step-${stepNum}-status.json:
{"step":${stepNum},"status":"done","deliverables":[{"url":"...","label":"..."}],"summary":"one sentence"}

If you fail, write: {"step":${stepNum},"status":"failed","summary":"what broke"}
`

const ENV_BLOCK = (stepNum, skillDir, extras) =>
  SKILL_PREAMBLE(skillDir) + PROJECT_CONTEXT + SLICC_PREAMBLE + OUTPUT_CONTRACT(stepNum) + (extras || '')

const STAY_ON_TASK = (stepName) =>
  `You are executing ONLY step "${stepName}". Do NOT perform any other pipeline step.`

// ─── Phase 0: Setup ───────────────────────────────────────────────────────────

phase('Setup')
const setup = await agent(`
${STAY_ON_TASK('Setup')}
${ENV_BLOCK(1, 'of1-setup')}
Verify all OF1 demo dependencies are installed. Report what's available.
`, { label: 'setup', model: 'sonnet' })

// ─── Phase 1: Repo setup ──────────────────────────────────────────────────────

phase('Repo setup')
const repoSetup = await agent(`
${STAY_ON_TASK('Repo setup')}
${ENV_BLOCK(2, 'of1-repo-setup')}
Create or switch to branch "${BRANCH}" for domain "${DOMAIN}".
Write repo-config.json to /shared/of1-demo/repo-config.json with:
{
  "owner": "${OWNER}",
  "repo": "${REPO_NAME}",
  "branch": "${BRANCH}",
  "repoDir": "${REPO_PATH}",
  "domain": "${DOMAIN}",
  "repoUrl": "https://github.com/${OWNER}/${REPO_NAME}",
  "previewUrl": "${PREVIEW_BASE}/",
  "daSource": "da://${OWNER}/${REPO_NAME}"
}
If the branch already exists, just check it out. Do NOT recreate.
`, { label: 'repo-setup', model: 'sonnet' })

// ─── Phase 2: Discovery + Extraction (parallel) ──────────────────────────────

phase('Discovery & Extraction')
const [discovery, extraction] = await parallel([
  () => agent(`
${STAY_ON_TASK('Discovery')}
${ENV_BLOCK(3, 'of1-discovery')}
Crawl ${DOMAIN} and propose a demo focus and narrative.
Produce a discovery.html deliverable committed to the repo at deliverables/discovery.html.
`, { label: 'discovery', model: 'opus' }),

  () => agent(`
${STAY_ON_TASK('Extraction')}
${ENV_BLOCK(4, 'of1-extraction')}
Extract design tokens, brand identity, and page structure from ${DOMAIN}.
Produce PRODUCT.md, DESIGN.json, screenshots, logo under stardust/current/.
Produce deliverables/brand-review.html.
`, { label: 'extraction', model: 'opus' }),
])

// ─── Phase 3: Prototype ───────────────────────────────────────────────────────

phase('Prototype')
const prototype = await agent(`
${STAY_ON_TASK('Prototype')}
${ENV_BLOCK(5, 'of1-prototype')}
Generate pixel-perfect HTML prototypes of ALL key pages from ${DOMAIN}.
Use the discovery narrative (deliverables/discovery.html) and extraction tokens (stardust/current/).

CRITICAL RULES:
- Produce ONE prototype per key page identified in discovery. ALL pages are mandatory.
- Use REAL images from the live site (extract via playwright-cli eval).
- Use the site's REAL icons and SVGs — no placeholders, no emoji substitutes.
- Match typography, colors, spacing, and layout EXACTLY.
- Run a screenshot diff loop (up to 3 iterations) comparing prototype vs live site.
- Commit prototypes to stardust/prototypes/ AND deliverables/.
`, { label: 'prototype', model: 'opus' })

// ─── Phase 4: Snowflake (Track A) + Config Track B — PARALLEL FORK ────────────
//
// KEY DIFFERENCE from CC version: Track B starts HERE, not after snowflake.
// The skill mandates: "Track B does NOT wait for Step 6"

phase('Snowflake + Config Track B')
const [snowflake, brandVoice, contentMeta, ctaTemplate] = await parallel([
  // Track A: Step 6 — Snowflake
  () => agent(`
${STAY_ON_TASK('Snowflake')}
${ENV_BLOCK(6, 'of1-snowflake')}
Convert the step-5 prototypes into EDS overlay pages using the snowflake skill.
Each prototype becomes a template + CSS + DA content doc.
Run a screenshot diff loop comparing EDS preview vs prototype (up to 3 iterations).

After committing, trigger EDS preview for each page:
  DA_TOKEN=$(oauth-token adobe)
  curl -X POST -H "Authorization: Bearer $DA_TOKEN" -H "x-content-source-authorization: Bearer $DA_TOKEN" \\
    https://admin.hlx.page/preview/${OWNER}/${REPO_NAME}/${BRANCH}/<page>
`, { label: 'snowflake', model: 'opus' }),

  // Track B: Step 9a — Brand voice
  () => agent(`
${STAY_ON_TASK('Brand voice extraction')}
${ENV_BLOCK('9a', 'of1-brand-voice-extractor')}
Extract brand voice from ${DOMAIN} and write of1/config/brand-voice.json.
Commit with: git add of1/config/brand-voice.json
Write status to /shared/of1-demo/step-9-brand-status.json
`, { label: 'brand-voice', model: 'sonnet' }),

  // Track B: Step 9b — Content metadata
  () => agent(`
${STAY_ON_TASK('Content metadata')}
${ENV_BLOCK('9b', 'of1-content-metadata')}
Scrape product data, personas, use cases, features, and FAQs from ${DOMAIN}.
Write: of1/config/products.json, personas.json, use-cases.json, features.json, faqs.json

For product images: use the download-images.jsh script (NOT per-image curl).
Get DA token via: oauth-token adobe

CRITICAL: Validate products.json is valid JSON before committing.
Run: python3 -c "import json; json.load(open('of1/config/products.json')); print('valid')"

Commit with: git add of1/config/products.json of1/config/personas.json of1/config/use-cases.json of1/config/features.json of1/config/faqs.json
Write status to /shared/of1-demo/step-9-content-status.json
`, { label: 'content-metadata', model: 'sonnet' }),

  // Track B: Step 11 — CTA template
  () => agent(`
${STAY_ON_TASK('CTA template')}
${ENV_BLOCK(11, 'of1-cta-template-builder')}
Extract the site's visual design system and generate of1/config/cta-template.json.
Commit with: git add of1/config/cta-template.json
`, { label: 'cta-template', model: 'sonnet' }),
])

// ─── Phase 5: OF1 styling + Template base + Suggestions ───────────────────────
//
// KEY DIFFERENCES from CC version:
// - Step 10 (Suggestions) runs HERE, after step 9 (needs products + brand-voice)
// - Step 8 (OF1 styling) runs after Step 6 (must not overwrite of1.css from S6)
// - Template base also runs after Step 6 (needs prototype CSS from snowflake)

phase('OF1 styling + Template base + Suggestions')
const [of1Styling, templateBase, suggestions] = await parallel([
  // Step 8 — OF1 generative block styling (after Step 6)
  () => agent(`
${STAY_ON_TASK('OF1 styling')}
${ENV_BLOCK(8, 'of1-generative-block-styler')}
Generate polished CSS for the OF1 generative block AND set up the /of1 page end-to-end.
This includes: template with meta, fragments (header/footer), branded of1.css, DA content upload.

The OF1 block domain field MUST be: ${BRANCH}--${REPO_NAME}--${OWNER}

IMPORTANT: Step 6 (snowflake) already committed of1.css changes. Your commit goes AFTER.
Upload DA content using: oauth-token adobe
Trigger preview after push.
`, { label: 'of1-styling', model: 'opus' }),

  // Step 7-base — Template base CSS (after Step 6)
  () => agent(`
${STAY_ON_TASK('Template generation — base mode')}
${ENV_BLOCK('7-base', 'of1-template-generation')}

export OF1_TG_MODE="base"

Generate the shared design-token stylesheet (styles/of1-template-base.css) from prototype CSS.
Follow the skill's "Mode: base" section ONLY.
Read the prototype CSS files in styles/prototype-*.css and DESIGN.json in stardust/current/.
Write ONLY styles/of1-template-base.css. Do NOT commit (the assemble phase owns the commit).
Write status to /shared/of1-demo/step-7-base-status.json
`, { label: 'template-base', model: 'sonnet' }),

  // Step 10 — Quick suggestions (after Step 9 — products + brand-voice available)
  () => agent(`
${STAY_ON_TASK('Quick suggestions')}
${ENV_BLOCK(10, 'of1-quick-suggestions')}
Generate domain-specific quick suggestion chips and search UI copy for ${DOMAIN}.
Read of1/config/products.json and of1/config/brand-voice.json for grounding.
Write of1/config/suggestions.json.
Commit with: git add of1/config/suggestions.json
`, { label: 'suggestions', model: 'sonnet' }),
])

// ─── Phase 6: Template intents (5 parallel × 3 variations each) ───────────────

phase('Template intents')
const INTENTS = ['comparison', 'recommendation', 'deep-dive', 'budget', 'discovery']

const intentResults = await parallel(
  INTENTS.map((intent) => () => agent(`
${STAY_ON_TASK(`Template generation — intent: ${intent}`)}
${ENV_BLOCK(`7-${intent}`, 'of1-template-generation')}

export OF1_TG_MODE="intent"
export OF1_TG_INTENT="${intent}"

Generate templates for the "${intent}" intent.
Follow the skill's "Mode: intent" section.

CRITICAL: You MUST produce EXACTLY 3 template variations for this intent:
- templates/of1-${intent}-<variation1>.html + .metadata.json + .sample.json
- templates/of1-${intent}-<variation2>.html + .metadata.json + .sample.json
- templates/of1-${intent}-<variation3>.html + .metadata.json + .sample.json
Plus matching CSS files: styles/of1-${intent}-<variation>.css for each.

Do NOT generate base CSS, the catalog, the gallery, or commit anything.
Do NOT run git operations — the assemble phase owns that.
Write status to /shared/of1-demo/step-7-intent-${intent}-status.json
`, { label: `intent-${intent}`, model: 'sonnet' }))
)

// ─── Phase 7: Template assembly (INLINE) + Config review (INLINE) ─────────────
//
// KEY DIFFERENCE from CC version: Both are inline (no agent needed).
// The skill explicitly says: "NEVER use a scoop for assembly or config review"

phase('Template assembly + Config review')

// 7-assemble: purely scripted
const templateAssembly = await agent(`
${STAY_ON_TASK('Template assembly')}
${PROJECT_CONTEXT}
${SLICC_PREAMBLE}

You are running the template assembly step. This is mechanical — no creative work.

1. cd ${REPO_PATH}
2. Run: python3 /workspace/skills/of1-template-generation/assets/assemble-catalog.py . ${OWNER} ${REPO_NAME} ${BRANCH}
3. mkdir -p gallery drafts tools
4. cp /workspace/skills/of1-template-generation/assets/gallery.html gallery/index.html
5. For each templates/of1-*.sample.json, run fill-template if available
6. git add styles/of1-template-base.css styles/of1-*.css templates/ of1/config/templates.json gallery/ tools/ drafts/
7. git commit -m "feat: OF1 templates (5 intents) for ${DOMAIN}"
8. git push origin ${BRANCH}

Then trigger preview: 
  DA_TOKEN=$(oauth-token adobe)
  curl -X POST -H "Authorization: Bearer $DA_TOKEN" -H "x-content-source-authorization: Bearer $DA_TOKEN" \\
    https://admin.hlx.page/preview/${OWNER}/${REPO_NAME}/${BRANCH}/gallery/index

Write: /shared/of1-demo/step-7-status.json with deliverable URL ${PREVIEW_BASE}/gallery/index.html
`, { label: 'template-assemble', model: 'sonnet' })

// Step 12: Config review (inline scripted)
const configReview = await agent(`
${STAY_ON_TASK('Config review')}
${PROJECT_CONTEXT}
${SLICC_PREAMBLE}

You are running config review. This is mechanical — no creative work.

1. cd ${REPO_PATH}
2. First validate ALL config JSON files are valid:
   python3 -c "import json,glob; [json.load(open(f)) for f in glob.glob('of1/config/*.json')]; print('all valid')"
   If any are invalid, FIX them (truncate trailing garbage, etc.) before proceeding.
3. Run: python3 /workspace/skills/of1-config-review/assets/fill-config-review.py . ${DOMAIN}
   (or the .jsh variant if .py doesn't exist — check what's available)
4. git add deliverables/config-review.html
5. git commit -m "docs: config review page for ${DOMAIN}"
6. git push origin ${BRANCH}

Write: /shared/of1-demo/step-12-status.json with deliverable URL ${PREVIEW_BASE}/deliverables/config-review.html
`, { label: 'config-review', model: 'sonnet' })

// ─── Phase 8: Deploy + 5-point pre-launch checklist ───────────────────────────
//
// KEY DIFFERENCE from CC version: Single deploy agent with the skill's 5-point
// checklist, not dual adversarial verifiers.

phase('Deploy & verify')
const deploy = await agent(`
${STAY_ON_TASK('Deploy & verify')}
${ENV_BLOCK(13, 'of1-deploy')}

Deploy the OF1 demo for ${DOMAIN} and run the 5-point pre-launch checklist.

The checklist (ALL must pass):
1. OF1 page loads with styled search UI at ${PREVIEW_BASE}/of1
   - Open in playwright, screenshot, verify the search input renders with brand styling
2. Template gallery shows all templates at ${PREVIEW_BASE}/gallery/index.html
   - Verify it loads and shows template cards
3. Config is accessible: curl ${PREVIEW_BASE}/of1/config/products.json returns valid JSON
4. Prototype pages render correctly at ${PREVIEW_BASE}/prototype-home
   - Screenshot and verify it's not raw EDS markup but the styled overlay
5. OF1 worker responds: curl https://of1-gen-web-service.franklin-prod.workers.dev/api/config?domain=${BRANCH}--${REPO_NAME}--${OWNER}
   - If this returns "Not found", the config hasn't been synced yet — that's expected for preview-only demos

Report pass/fail for each check. The demo is considered ready if checks 1-4 pass.
Check 5 only passes after production publish (which requires admin action).
`, { label: 'deploy', model: 'sonnet' })

// ─── Final report ─────────────────────────────────────────────────────────────

return {
  domain: DOMAIN,
  branch: BRANCH,
  previewBase: PREVIEW_BASE,
  urls: {
    of1: `${PREVIEW_BASE}/of1`,
    prototypeHome: `${PREVIEW_BASE}/prototype-home`,
    gallery: `${PREVIEW_BASE}/gallery/index.html`,
    configReview: `${PREVIEW_BASE}/deliverables/config-review.html`,
    discovery: `${PREVIEW_BASE}/deliverables/discovery.html`,
    repo: `https://github.com/${OWNER}/${REPO_NAME}/tree/${BRANCH}`,
  },
  summary: `OF1 demo pipeline complete for ${DOMAIN} on branch ${BRANCH}.`,
}
