# OF1 Skills Review — Checklist (2026-08-11)

Branch: `skills-v5-next`. Recurring anti-patterns to watch: cloned-from-sibling boilerplate,
dead extracted vars, re-deriving upstream artifacts, DRY-violating pasted commands, correctness
rules living in soft-referenced prose instead of executed code.

## Phase 1 — Knowledge files (the contract; do first, it's the yardstick)
- [x] `knowledge/pipeline-contract.md` — audited. Gate is wired into both dispatch files (not soft). BUT found + fixed 2 real bugs in the gate script it cites (`check-replica-artifacts.mjs`): (1) assumed `progress.pages` is an array; stardust 0.18.1 writes an object keyed by slug → gate parsed nothing → normalizePages() now accepts both; (2) af1bb1a3 honest-fail bug — now exits 2 on pixelPct>10% OR verdict.overall==='fail', warns (not stops) on under-bar height/font-fork residuals. Legacy no-result shapes now flagged "fidelity UNVERIFIED". Contract exit table + both dispatch exit-2 descriptions updated.
- [ ] `knowledge/dispatch-cc.md`
- [ ] `knowledge/dispatch-slicc.md`
- [ ] `knowledge/common-pitfalls.md` (204 lines, "consult when relevant" = most-skipped tier)
- [ ] `knowledge/worker-config-schemas.md` (337 lines)
- [ ] `knowledge/design-tokens-resolution.md`
- [ ] Cross-cutting: flag "correctness-critical + soft-referenced" rules → move inline or into a script

## Phase 2 — Skills not yet quality-reviewed
- [ ] `of1-build-templates` (largest; migrated + dead-var only)
- [ ] `of1-extract-content` (partial: DOMAIN/source fixed; no full pass; image pipeline)
- [ ] `of1-generate-config-review` (migrated only)
- [ ] `of1-publish` (partial: Check-5 cleanup; 360 lines never fully audited)
- [ ] `of1-style-generative-block` (largest, ~470 lines; migrated only)
- [ ] `of1-discovery` (renamed at start; never quality-reviewed)
- [ ] `of1-signals` (never touched this session)
- [ ] `of1-demo-orchestrator` SKILL body (structural glance only)

## Phase 3 — Executed code (the reliable tier — bugs here actually run)
- [ ] `of1-publish/assets/fill-demo-hub.mjs` (touched, not audited)
- [ ] `of1-generate-config-review/assets/fill-config-review.mjs`
- [ ] `of1-extract-content/assets/download-images.mjs`
- [ ] `of1-build-templates/assets/assemble-catalog.mjs`, `fill-template.mjs`
- [ ] `of1-style-generative-block/assets/ensure-nav-footer.mjs`
- [ ] `of1-check-dependencies/scripts/verify.sh` (final-review found 2 glob bugs in SKILL; audit script)

## Already done (do NOT redo)
- of1-extract-brand-voice (dead DOMAIN, source block) ✓
- The skill-name identity migration (all skills) ✓
- of1-integration structural cleanup ✓
- Playwright shim removal, of1-adopt→of1-integration rename ✓

## Deferred (named so they don't get lost)
- `scripts/lint-skills.sh` — enforcement gate; write AFTER reviews so it encodes findings
- of1-labs rollout stage 3 — container step-tracker + suggest.js still emit numeric/"explore"
