/**
 * OF1 Demo Pipeline — Claude Code Workflow
 *
 * Turns any website into a branded OF1 generative-search demo on Adobe Edge Delivery Services.
 *
 * Input (args): { domain: string, branch?: string, repo?: string }
 *   - domain (required): bare hostname, e.g. "wknd.site"
 *   - branch (optional): git branch to use. Defaults to domain without TLD (e.g. "wknd")
 *   - repo (optional): absolute path to existing clone. Defaults to cwd.
 *
 * Dependency graph (matches of1-demo-cc):
 *   2 → 3 ∥ 4 → 5 → ┬─ 6 → ┬─ 7-base → 7a–7e → 7-assemble ─┐
 *                     │      └─ 8                               │
 *                     └─ 9a ∥ 9b ∥ 11 → 10 → 12 ───────────────┴─→ 13
 */

export const meta = {
  name: 'of1-demo',
  description: 'Full OF1 demo pipeline: site → branded EDS generative-search demo',
  whenToUse: 'When the user wants to create an OF1 demo for a website domain',
  phases: [
    { title: 'Setup', detail: 'Verify dependencies and tools' },
    { title: 'Repo setup', detail: 'Create demo branch and config' },
    { title: 'Discovery & Extraction', detail: 'Crawl site + extract design tokens (parallel)' },
    { title: 'Prototype', detail: 'Pixel-perfect HTML prototypes' },
    { title: 'Snowflake + Config', detail: 'EDS conversion + brand/content extraction (parallel)' },
    { title: 'Track A: Templates + Styling', detail: 'OF1 styling + template generation' },
    { title: 'Track B: Config', detail: 'Suggestions + config review' },
    { title: 'Deploy & verify', detail: 'Adversarial verify + deploy + pre-launch checklist' },
  ],
}

// ─── Parse args ───────────────────────────────────────────────────────────────

const parsed = typeof args === 'string' ? { domain: args } : args
const DOMAIN = parsed?.domain
if (!DOMAIN) throw new Error('Usage: args = { domain: "wknd.site", branch?: "...", repo?: "/path/to/clone" }')

const BRANCH = parsed.branch || DOMAIN.replace(/\.[^.]+$/, '')
const REPO_PATH = parsed.repo || null

const SKILLS_ROOT = parsed.skillsRoot || 'skills'

// ─── Shared prompt fragments ───────────────────────────────────────────────────

const REPO_CONTEXT = `
## Repository
- Path: ${REPO_PATH || '(use OF1_DEMO_REPO or cwd)'}
- Branch: ${BRANCH}
- The repo is already cloned. Read repo-config.json for owner, repo, branch, and domain.
- All AEM/DA URLs MUST use the owner and repo from repo-config.json — never hardcode an org or repo name.
`

const ENV_BLOCK = (stepNum, skillDir, extras) => `
## Environment
export OF1_DEMO_REPO="${REPO_PATH || '/workspace/of1-demo'}"
export SKILL_DIR="${SKILLS_ROOT}/${skillDir}"
export BRANCH="${BRANCH}"
${extras || ''}
${REPO_CONTEXT}

## Domain
${DOMAIN}

## Output contract
End your last message with EXACTLY this fenced block:
\`\`\`json
{"step": ${stepNum}, "status": "done" | "failed", "summary": "<one sentence>", "deliverables": [{"url": "...", "label": "..."}]}
\`\`\`
If status is "failed", explain what broke and what to retry.
`

const SKILL_INSTRUCTION = (skillDir) =>
  `Read the skill file at ${SKILLS_ROOT}/${skillDir}/SKILL.md and follow it exactly.`

const STAY_ON_TASK = (stepName) =>
  `You are executing ONLY step "${stepName}". Do NOT perform any other pipeline step. Do NOT explore unrelated code. If you feel uncertain, re-read the skill file — it is your sole authority.`

// ─── Phase 0: Setup ───────────────────────────────────────────────────────────

phase('Setup')
const setup = await agent(`
${SKILL_INSTRUCTION('of1-setup')}
${STAY_ON_TASK('Setup')}
${ENV_BLOCK(0, 'of1-setup')}
Run the verify.sh script. Report the paths from setup.json.
`, { label: 'setup', model: 'sonnet' })

// ─── Phase 1: Repo setup ──────────────────────────────────────────────────────

phase('Repo setup')
const repoSetup = await agent(`
${SKILL_INSTRUCTION('of1-repo-setup')}
${STAY_ON_TASK('Repo setup')}
${ENV_BLOCK(2, 'of1-repo-setup')}
Create or switch to branch "${BRANCH}" for domain "${DOMAIN}". Write repo-config.json.
If the branch already exists locally or on origin, just check it out — do NOT recreate it.
`, { label: 'repo-setup', model: 'sonnet' })

// ─── Phase 2: Discovery + Extraction (parallel) ──────────────────────────────

phase('Discovery & Extraction')
const [discovery, extraction] = await parallel([
  () => agent(`
${SKILL_INSTRUCTION('of1-discovery')}
${STAY_ON_TASK('Discovery')}
${ENV_BLOCK(3, 'of1-discovery')}
Crawl ${DOMAIN} and propose a demo focus and narrative.
`, { label: 'discovery', model: 'opus' }),

  () => agent(`
${SKILL_INSTRUCTION('of1-extraction')}
${STAY_ON_TASK('Extraction')}
${ENV_BLOCK(4, 'of1-extraction')}
Extract design tokens, brand identity, and page structure from ${DOMAIN}.
`, { label: 'extraction', model: 'opus' }),
])

// ─── Phase 3: Prototype ───────────────────────────────────────────────────────

phase('Prototype')
const prototype = await agent(`
${SKILL_INSTRUCTION('of1-prototype')}
${STAY_ON_TASK('Prototype')}
${ENV_BLOCK(5, 'of1-prototype')}
Generate pixel-perfect HTML prototypes of key pages from ${DOMAIN}.
Use the discovery narrative and extraction tokens from prior steps.
`, { label: 'prototype', model: 'opus' })

// ─── Phase 4: Fork — Snowflake + Config track (parallel) ─────────────────────
// After step 5, dispatch: 6 (snowflake) AND 9a, 9b, 11 (config track)
// These are independent — no barrier needed between tracks.

phase('Snowflake + Config')
const [snowflake, brandVoice, contentMeta, ctaTemplate] = await parallel([
  () => agent(`
${SKILL_INSTRUCTION('of1-snowflake')}
${STAY_ON_TASK('Snowflake')}
${ENV_BLOCK(6, 'of1-snowflake')}
Convert the step-5 prototypes into EDS overlay pages.
`, { label: 'snowflake', model: 'opus' }),

  () => agent(`
${SKILL_INSTRUCTION('of1-brand-voice-extractor')}
${STAY_ON_TASK('Brand voice extraction')}
${ENV_BLOCK('9a', 'of1-brand-voice-extractor')}
Extract brand voice from ${DOMAIN} and generate brand-voice.json.
`, { label: 'brand-voice', model: 'sonnet' }),

  () => agent(`
${SKILL_INSTRUCTION('of1-content-metadata')}
${STAY_ON_TASK('Content metadata')}
${ENV_BLOCK('9b', 'of1-content-metadata')}
Scrape product data, personas, use cases, features, and FAQs from ${DOMAIN}.
`, { label: 'content-metadata', model: 'sonnet' }),

  () => agent(`
${SKILL_INSTRUCTION('of1-cta-template-builder')}
${STAY_ON_TASK('CTA template')}
${ENV_BLOCK(11, 'of1-cta-template-builder')}
Extract the site's visual design system and generate cta-template.json.
`, { label: 'cta-template', model: 'sonnet' }),
])

// ─── Tracks A + B (parallel) ──────────────────────────────────────────────────
// After the phase 4 barrier, both tracks can run concurrently:
//   Track A: EDS screenshots → 8 ∥ 7-base → 7a–7e → 7-assemble
//   Track B: 10 → 12
// Step 8 depends only on step 6.
// Step 10 depends on 9a + 9b (both done in phase 4).
// Step 12 depends on 9a + 9b + 10 + 11 (all done by the time 10 finishes).
// Step 13 needs 7-assemble + 8 + 12 — i.e. both tracks complete.

const INTENTS = ['comparison', 'recommendation', 'deep-dive', 'budget', 'discovery']

const [trackAResult, trackBResult] = await parallel([
  // ─── Track A: Templates + Styling ───────────────────────────────────────────
  async () => {
    phase('Track A: Templates + Styling')

    // Take EDS screenshots of prototype pages for intent agents (visual reference)
    const edsScreenshots = await agent(`
${STAY_ON_TASK('EDS screenshots')}
${ENV_BLOCK('6-post', 'of1-snowflake')}
After snowflake completed, take full-page screenshots of each prototype page as rendered by EDS.
Read repo-config.json to get OWNER and REPO.

For each prototype HTML file in deliverables/prototype-*.html:
1. Derive the page slug (e.g. "prototype-home")
2. Build the EDS URL: https://\${BRANCH}--\${REPO}--\${OWNER}.aem.page/\${SLUG}
3. Use playwright-cli to screenshot the full page
4. Save to deliverables/eds-\${SLUG}.png

Do NOT commit these PNGs. They are local reference material for template intent agents.
If any screenshot fails, log a warning but continue — intent agents fall back to HTML/CSS alone.
`, { label: 'eds-screenshots', model: 'sonnet', phase: 'Track A: Templates + Styling' })

    // Dispatch 8 (OF1 styling) and 7-base in parallel — both only need step 6
    const [of1Styling, templateBase] = await parallel([
      () => agent(`
${SKILL_INSTRUCTION('of1-generative-block-styler')}
${STAY_ON_TASK('OF1 styling')}
${ENV_BLOCK(8, 'of1-generative-block-styler')}
Generate polished CSS for the OF1 generative block AND set up the /of1 page end-to-end.
`, { label: 'of1-styling', model: 'opus', phase: 'Track A: Templates + Styling' }),

      () => agent(`
${SKILL_INSTRUCTION('of1-template-generation')}
${STAY_ON_TASK('Template generation — base mode')}
${ENV_BLOCK('7-base', 'of1-template-generation', 'export OF1_TG_MODE="base"')}
Generate the shared design-token stylesheet (of1-template-base.css) from prototype CSS.
Follow the skill's "Mode: base" section ONLY.
`, { label: 'template-base', model: 'sonnet', phase: 'Track A: Templates + Styling' }),
    ])

    // 7a–7e: 5 intent agents in parallel (need 7-base done)
    const intentResults = await parallel(
      INTENTS.map((intent) => () => agent(`
${SKILL_INSTRUCTION('of1-template-generation')}
${STAY_ON_TASK(`Template generation — intent: ${intent}`)}
${ENV_BLOCK(`7-${intent}`, 'of1-template-generation', `export OF1_TG_MODE="intent"\nexport OF1_TG_INTENT="${intent}"`)}
Generate templates for the "${intent}" intent ONLY.
Follow the skill's "Mode: intent" section. Do NOT generate base CSS, the catalog, the gallery, or commit anything.
`, { label: `intent-${intent}`, model: 'sonnet', phase: 'Track A: Templates + Styling' }))
    )

    // 7-assemble: needs all 7a–7e done
    const templateAssembly = await agent(`
${SKILL_INSTRUCTION('of1-template-generation')}
${STAY_ON_TASK('Template generation — assemble mode')}
${ENV_BLOCK('7-assemble', 'of1-template-generation', 'export OF1_TG_MODE="assemble"')}
Assemble the fully-inlined catalog from all 15 templates, run fill-template scripts,
install the gallery, and commit everything. Follow the skill's "Mode: assemble" section.
Precondition: all 15 templates + styles must exist. Fail fast if missing.
`, { label: 'template-assemble', model: 'sonnet', phase: 'Track A: Templates + Styling' })

    return { of1Styling, templateAssembly }
  },

  // ─── Track B: Suggestions → Config review ─────────────────────────────────
  async () => {
    phase('Track B: Config')

    // Step 10: needs 9a + 9b done (guaranteed by phase 4 barrier)
    const suggestions = await agent(`
${SKILL_INSTRUCTION('of1-quick-suggestions')}
${STAY_ON_TASK('Quick suggestions')}
${ENV_BLOCK(10, 'of1-quick-suggestions')}
Generate domain-specific quick suggestion chips and search UI copy.
Uses products.json and brand-voice.json from prior steps.
`, { label: 'suggestions', model: 'sonnet', phase: 'Track B: Config' })

    // Step 12: needs 9a + 9b + 10 + 11 — all guaranteed done at this point
    const configReview = await agent(`
${SKILL_INSTRUCTION('of1-config-review')}
${STAY_ON_TASK('Config review')}
${ENV_BLOCK(12, 'of1-config-review')}
Generate the config-review.html deliverable showing all OF1 config data for ${DOMAIN}.
Commit and push it.
`, { label: 'config-review', model: 'sonnet', phase: 'Track B: Config' })

    return { suggestions, configReview }
  },
])

// ─── Phase: Deploy + Verify ──────────────────────────────────────────────────
// Step 13 needs: 7-assemble + 8 + 12 all done (guaranteed by the parallel barrier above).

phase('Deploy & verify')
const [verifier1, verifier2] = await parallel([
  () => agent(`
You are a verification agent for the OF1 demo pipeline for ${DOMAIN}.
${STAY_ON_TASK('Pre-deploy verification (agent 1)')}
Check the following independently — do NOT trust prior step summaries, verify on disk:
1. OF1 page HTML exists and references the correct CSS
2. Template catalog has 15 of1-* entries across all 5 intents
3. products.json has products with >=2 images each
4. brand-voice.json, suggestions.json, cta-template.json all exist and are valid JSON
5. All prototype pages exist as EDS overlay HTML

Report pass/fail for each check with evidence.
\`\`\`json
{"step": "verify-1", "status": "done" | "failed", "summary": "<pass/fail details>", "deliverables": []}
\`\`\`
`, { label: 'verifier-1', model: 'sonnet' }),

  () => agent(`
You are an independent verification agent for the OF1 demo pipeline for ${DOMAIN}.
${STAY_ON_TASK('Pre-deploy verification (agent 2)')}
Verify these independently — assume nothing from prior steps:
1. repo-config.json exists with correct domain and branch
2. Config review HTML is committed and pushed
3. of1-template-base.css exists and is imported by all 15 template CSS files
4. The /of1 page fragments (header, footer) exist
5. All deliverable URLs in step summaries would resolve (check file paths)

Report pass/fail for each check with evidence.
\`\`\`json
{"step": "verify-2", "status": "done" | "failed", "summary": "<pass/fail details>", "deliverables": []}
\`\`\`
`, { label: 'verifier-2', model: 'sonnet' }),
])

log(`Verification: agent1=${verifier1 ? 'pass' : 'null'}, agent2=${verifier2 ? 'pass' : 'null'}`)

const deploy = await agent(`
${SKILL_INSTRUCTION('of1-deploy')}
${STAY_ON_TASK('Deploy')}
${ENV_BLOCK(13, 'of1-deploy')}
Both verification agents confirmed readiness. Deploy now:
- Commit config to git
- Sync to OF1 worker via EDS
- Generate demo hub
- Run the 5-point pre-launch checklist

Verification summaries for context:
- Verifier 1: ${verifier1 || 'skipped'}
- Verifier 2: ${verifier2 || 'skipped'}
`, { label: 'deploy', model: 'sonnet' })

// ─── Final report ─────────────────────────────────────────────────────────────

return {
  domain: DOMAIN,
  branch: BRANCH,
  summary: `OF1 demo pipeline complete for ${DOMAIN}. Deploy: ${deploy || 'done'}`,
}
