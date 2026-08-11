# OF1 Skills Review — Checklist (2026-08-11)

Branch: `skills-v5-next`. Recurring anti-patterns to watch: cloned-from-sibling boilerplate,
dead extracted vars, re-deriving upstream artifacts, DRY-violating pasted commands, correctness
rules living in soft-referenced prose instead of executed code.

## Phase 1 — Knowledge files (the contract; do first, it's the yardstick)
- [x] `knowledge/pipeline-contract.md` — audited. Gate is wired into both dispatch files (not soft). BUT found + fixed 2 real bugs in the gate script it cites (`check-replica-artifacts.mjs`): (1) assumed `progress.pages` is an array; stardust 0.18.1 writes an object keyed by slug → gate parsed nothing → normalizePages() now accepts both; (2) af1bb1a3 honest-fail bug — now exits 2 on pixelPct>10% OR verdict.overall==='fail', warns (not stops) on under-bar height/font-fork residuals. Legacy no-result shapes now flagged "fidelity UNVERIFIED". Contract exit table + both dispatch exit-2 descriptions updated.
- [x] `knowledge/dispatch-cc.md` — no live bugs (dep graph internally consistent, pipeline-mode timing correct). Fixed anti-pattern: Stage-3 dependency graph + model list were re-stated here (triple-dup w/ of1-integration + dispatch-slicc). Trimmed both to pointers at `of1-integration` § "Pipeline-mode timing" / model-assignment rule. Open: playwright-cli syntax prose (lines ~119) — check overlap w/ common-pitfalls in item 4.
- [x] `knowledge/dispatch-slicc.md` — same trim (was self-contradictory: said "use of1-integration as reference" then re-listed edges). Model line already terse/referenced, left. No live bugs.
- [x] `knowledge/common-pitfalls.md` — no live bugs: "min 4 images" threshold consistent across all enforcers (of1-extract-content gate + of1-publish Check 3), spec path §7.1 valid, curl/runtime/domain rules sound. Added canonical §9 "playwright-cli syntax" (was duplicated verbatim in ~5 skills w/ no home; copies agreed, no drift). dispatch-cc now points at §9. TODO in each skill's review (items 8-13): swap its playwright one-liner for a §9 pointer. Minor deferred: §2.2 says "up to 8 images" but download-images.mjs default maxPerProduct=5 (harmless, ≥4) → note for item 9; §7.6 token order omits OF1_TOKEN_FILE vs contract (partial).
- [x] `knowledge/worker-config-schemas.md` — validated every schema against real emitted configs. Fixed 1 real drift: line 102 said `template-select.js` picks "the 25 templates" (stale 5×5 era; of1-demo-lab-retro still has 25) — skill now makes 15 (5×3) and worker picks by intent from catalog candidates → reworded count-agnostic. Verified conformant: cta slots exactly [title,description,buttonText]; personas intentProfile 6-key vocab (explore/research/compare/purchase/deals/support) distinct-by-design from the 5 template intents (doc explains the bridge at L97-104); suggestions type enum matches of1-build-quick-suggestions (the `type:'explore'` seen in an old config is a pre-fix artifact, field is inert — not our bug). Required/optional table matches.
- [x] `knowledge/design-tokens-resolution.md` — clean, and the GOOD pattern: canonical home, all 4 citers (of1-integration, of1-build-templates, of1-build-cta-template, of1-style-generative-block) reference it and stay consistent (styles.css-canonical-for-live-site rule correctly encoded in templates Mode B). No live bug. Added the one implicit precondition the snippet omitted: paths are repo-root-relative (cd $OF1_DEMO_REPO first).
- [x] Cross-cutting: correctness-critical rules are mostly already in EXECUTED code, good posture:
  Stage 2 gate (check-replica-artifacts.mjs, now fixed), min-4-images (2 python gates: extract-content + publish Check 3), catalog=15 (publish Check 4), token resolution (publish/check-deps shell), and — strongest — publish Check 6 end-to-end generation test, which functionally validates emitted worker configs (so no separate field-level config-schema validator is warranted). The soft-referenced problems found were duplication/drift, now fixed: dep graph → canonical in of1-integration; playwright-cli → canonical common-pitfalls §9; "25 templates" → count-agnostic. Remaining follow-ups: (a) per-skill playwright pointer swaps during skill reviews (items 8-13); (b) lint-skills.sh deferred; (c) common-pitfalls §7.6 token order omits OF1_TOKEN_FILE vs contract — minor.

## Phase 2 — Skills not yet quality-reviewed
- [~] `of1-build-templates` FIRST PASS + user review done. Fixed: (1) base-CSS "owned by assemble" contradiction → base; (2) "~5×"→"~3×"; (3) user-invocable false→true; (4) stale "adopt-site" → of1-integration (also swept 5 other files repo-wide — adopt-site is not a real name); (5) sample.json image-URL rule now prefers of1/config/products.json images (real .aem.page/media URLs) over prototype HTML. Assets sound (deeper=item 19); fill-template cosmetic itemKeys item-6 vs item-9 log count. RELATED FIND: user-invocable still false on of1-discovery + of1-publish — same reasoning likely makes them true (decide during items 11/13).
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
