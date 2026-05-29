# OF1 skills audit — 2026-05-29

Audit of all 17 OF1 skills + supporting assets. Working doc — each finding has a `Status` line we update as we work through it.

## Scope

- All 17 `SKILL.md` files (~5,000 lines) read in full
- Asset inventory surveyed; helper scripts NOT read deeply (flagged where a second pass is warranted)
- Single representative pipeline run on `wknd.site` used for runtime/cost reference

## Guiding constraint (set by user 2026-05-29)

**Skills must work in BOTH SLICC and Claude Code.** No deprecation of either runtime. Every cleanup proposal in this document must preserve that.

## Headline diagnosis

The skills were written for SLICC and never fully migrated to be runtime-agnostic. Sixteen of the seventeen still reference `/shared/of1-demo`, sixteen still call SLICC tools (`oauth-token adobe`, `sprinkle send`, `scoop_scoop`, `feed_scoop`), fourteen hardcode `/workspace/` absolute paths. The `of1-demo-cc` orchestrator papers over this by injecting an ~80-line "PLATFORM OVERRIDES" block into every sub-agent prompt at dispatch time. The orchestrator itself acknowledges this is tech debt: *"the next step is to fold those overrides into a shared section inside each step skill so they apply regardless of runtime."* That step hasn't happened — and it's the single largest cleanup available.

The fix is **not** to pick one runtime, but to make every skill express its environment needs through env vars (`OF1_STATE_DIR`, `REPO_DIR`, `DA_TOKEN`, `SKILL_DIR`) that both runtimes set up before invocation. The overrides block then collapses to "set these env vars" and the skills work in both.

---

## Tier 1 — Structural (biggest wins)

### 1. Make step skills runtime-agnostic

The 13 step skills should never directly name SLICC or CC primitives. Replace with env-var indirection that each runtime sets up at the top of its dispatch:

| SLICC-specific | Replace with | Set by |
|---|---|---|
| `/shared/of1-demo/` | `${OF1_STATE_DIR}` | SLICC: scoop env. CC: orchestrator. |
| `/workspace/of1-demo` | `${REPO_DIR}` | `repo-config.json` (already exists) |
| `/workspace/skills/<skill>/assets/` | `${SKILL_DIR}/assets/` | Both runtimes |
| `oauth-token adobe` | `${DA_TOKEN}` (resolved by setup) | SLICC: setup wraps `oauth-token`. CC: setup-cc reads token file. |
| `/mnt/da/<branch>/page.html` | `curl PUT https://admin.da.live/source/...` only | Same in both — drop mount-optimism |
| `playwright-cli visit / --output / --tab=N` | `playwright-cli open / --filename / tab-select N` | Standard playwright agent CLI (CC native). For SLICC: shim translates back. |
| Write `step-N-status.json` + "do NOT call sprinkle send" | Return final JSON status block from agent; orchestrator owns IPC | Both — uniform agent contract |
| `serve --entry <file>` | `python3 -m http.server` | Both |
| `upskill ...` | Remove; setup verifier handles deps | Both |

**After this:** the orchestrator's "PLATFORM OVERRIDES" block (`of1-demo-cc/SKILL.md:163-180`) shrinks to a 2-line "set OF1_STATE_DIR and DA_TOKEN" reminder. SLICC orchestrator can drop its analogous prep section. Skills work in both runtimes from a single SKILL.md.

**Effort:** ~1 day. Touches all 13 step skills, but the changes are mechanical.

**Status:** open

---

### 2. Factor shared orchestration logic so both orchestrators stay thin

`of1-demo/SKILL.md` is **817 lines**; `of1-demo-cc/SKILL.md` is **310 lines**. Both describe:
- The same dependency graph (steps 2 → 3 ∥ 4 → 5 → fan-outs)
- The same Step 7 fan-out (5 intent agents + assemble)
- The same Step 9 split (brand-voice ∥ content-metadata)
- The same step → skill mapping table

Plus diverged details:
- SLICC hardcodes `claude-opus-4-6` for all scoops; CC has the per-step model table from commit `00f1c3b`
- SLICC has the sprinkle interaction model; CC has TaskCreate/AskUserQuestion

Proposal: extract the runtime-agnostic pipeline definition into a shared knowledge doc that both orchestrators reference.

```
.claude/skills/of1-demo/knowledge/pipeline.md
  - dependency graph
  - step → skill mapping table
  - per-step model assignment table (✅ from commit 00f1c3b)
  - Step 7 fan-out architecture
  - Step 9 split architecture
  - context-passing-between-steps table
```

Each orchestrator's SKILL.md keeps only the runtime-specific glue:
- `of1-demo` — sprinkle UI bindings, scoop spawning, polling loop, lick events
- `of1-demo-cc` — Agent tool dispatch, TaskCreate, AskUserQuestion

Reduces SLICC orchestrator from 817 → ~350 lines and keeps the two definitions of the pipeline in lockstep.

**Status:** open

---

### 3. Shrink `of1-snowflake` (782L) and `of1-content-metadata` (403L)

Both skills contain large "manual reference" blocks that duplicate what the helper scripts now do:

- `of1-snowflake/SKILL.md:234-374` — "Manual generation reference (if tool fails)". `snowflake-split.py` is the canonical path.
- `of1-snowflake/SKILL.md:399-489` — manual DA upload loop. `da-upload.sh` is the canonical path.
- `of1-content-metadata/SKILL.md:259-353` — manual image extraction + upload. `download-images.py` is the canonical path.

What to keep (the durable concepts):
- "Template gets EVERYTHING visual; DA only stores text overrides" + WHY (DA strips images)
- EDS class collision rules (`.header`, `.footer`)
- Required DA HTML format (the `<p>` wrapper rule)
- Required ≥2 images per product rule

What to drop:
- Step-by-step parallel manual recipes
- Stale auth flow descriptions (mount-first-then-API) since `da-upload.sh` and `download-images.py` handle this
- Verbose per-image upload boilerplate

Target: `of1-snowflake` ≤ 350 lines, `of1-content-metadata` ≤ 250 lines.

**Status:** open

---

## Tier 2 — Consistency (medium wins)

### 4. Define `repo-config.json` schema formally

`of1-branch-setup` (SLICC) writes: `daMount`, `daContentPath`.
Claude Code dispatch wrote: `daApiBase`, `daListBase` instead.
Downstream skills (`of1-deploy`, `of1-snowflake`) read these fields and behave differently depending on which runtime created the file.

Action:
1. Define the schema in `of1-branch-setup/SKILL.md` as a JSON Schema fragment
2. Require both runtimes to produce the same shape
3. Downstream skills MUST only depend on the documented subset

Required fields (proposed): `owner, repo, branch, contentPrefix, repoUrl, previewUrl, daSource, daApiBase, repoDir, domain`.
Optional/runtime-specific: `daMount, daContentPath` (SLICC only — both runtimes write them but CC ignores them).

**Status:** completed (2026-05-29). After grep audit, actual required-fields list narrowed to `owner, repo, branch, contentPrefix, repoDir, domain` (read by 1-12 skills). `repoUrl/previewUrl/daSource` declared optional. `daMount/daContentPath/daApiBase/daListBase` deprecated — downstream skills compute them. Schema written into `of1-branch-setup/SKILL.md`.

---

### 5. Knowledge file is hand-cited 6 times via broken absolute path

`.claude/skills/of1-demo/knowledge/worker-config-schemas.md` is referenced by `of1-branch-setup`, `of1-brand-voice-extractor`, `of1-content-metadata`, `of1-cta-template-builder`, `of1-quick-suggestions`, and `of1-template-generation`. Each cites it as `/workspace/skills/of1-demo/knowledge/...` — fine in SLICC, broken in CC.

Fix as part of Tier 1 #1 — use `${SKILL_DIR}/../of1-demo/knowledge/worker-config-schemas.md` (or define an `OF1_KNOWLEDGE_DIR` env var).

**Status:** completed (2026-05-29). All 6 skills updated to cite both runtime paths inline ("SLICC: `/workspace/skills/...`; Claude Code: `../of1-demo/knowledge/...`"). Full env-var resolution still pending Tier 1 #1; this is the runtime-tolerant interim fix.

---

### 6. "Common Mistakes" sections accumulating dead entries

Tables in: `of1-snowflake` (17 rows), `of1-generative-block-styler` (12 rows), `of1-content-metadata` (9 rows), plus shorter ones in `of1-config-review`, `of1-prototype`, `of1-extraction`.

Stale entries:
- "DA mount permission denied → use admin.da.live API as fallback" — `download-images.py` handles this
- "Using Node.js" appears in 5 skills — SLICC-only constraint
- "Running `npx da-auth-helper`" — SLICC-only
- DA mount path warnings — moot under CC

Proposal: consolidate into `of1-demo/knowledge/common-pitfalls.md`, prune runtime-specific entries OR tag them as `[SLICC only]` / `[CC only]`. Each step skill keeps maybe 3-5 rows specific to its own outputs.

**Status:** completed (2026-05-29). New file `of1-demo/knowledge/common-pitfalls.md` written (8 sections, ~180 lines), organized by topic with `[SLICC]`/`[CC]` tags. Trimmed tables in `of1-snowflake` (17 rows → 3), `of1-content-metadata` (9 → 2), `of1-generative-block-styler` (12 → 11), `of1-config-review` (5 → 4), `of1-prototype` (8 → 2), `of1-extraction` (4 → 1). Each surviving table prefixed with a link back to common-pitfalls.

---

### 7. Per-step model table needs to land in `of1-demo` (SLICC) too

`of1-demo/SKILL.md:52` still says *"ALL step scoops MUST use claude-opus-4-6. No exceptions."* — same mistake we just fixed in CC (commit `00f1c3b`).

When Tier 1 #2 happens, the model table moves to the shared pipeline doc and both orchestrators inherit it. Otherwise, a manual port to SLICC is needed.

**Status:** completed (2026-05-29). Per-step model table backported to `of1-demo/SKILL.md`. All `scoop_scoop()` examples updated from `claude-opus-4-6` to `claude-sonnet-4-6` for the 10 Sonnet-eligible steps. Steps 3, 4, 5 keep Opus.

---

## Tier 3 — Housekeeping (small wins)

### 8. Stale "Speed Priority — Target: N minutes" claims

Compared to the wknd.site run actuals:

| Skill | Claimed | Actual | Status |
|---|---|---|---|
| `of1-discovery` | 3 min | 15 min | wildly optimistic |
| `of1-extraction` | 5 min | 9 min | optimistic |
| `of1-prototype` | 8 min | 11 min | optimistic |
| `of1-content-metadata` | 5 min | 9.5 min | optimistic |
| `of1-snowflake` | 5 min | 3 min | accurate |
| `of1-brand-voice-extractor` | 3 min | 1.3 min | conservative |

Either remove the targets (they bias agents into corner-cutting) or replace with `# Typical runtime: X-Y min` based on real measurements.

**Status:** open

---

### 9. Skill frontmatter is inconsistent

- Some have `user-invocable: false`, some don't
- `of1-setup-cc` is missing it entirely
- `of1-config-review`, `of1-brand-voice-extractor`, `of1-content-metadata`, `of1-cta-template-builder`, `of1-quick-suggestions`, `of1-generative-block-styler` are `user-invocable: true` — but most are pipeline-only

Decide which skills should be discoverable via `/<skill>` and set frontmatter consistently. Probably only the two orchestrators (`of1-demo`, `of1-demo-cc`) and a handful of standalone-useful skills (`of1-brand-voice-extractor`, `of1-cta-template-builder` arguably) should be invocable.

**Status:** open

---

### 10. "do NOT call `sprinkle send`" boilerplate in every step skill

Every step skill ends with 1-3 lines of "do not call sprinkle send — only the of1-demo orchestrator may do that." In CC this is meaningless boilerplate; in SLICC it's defensive against a real footgun.

When Tier 1 #1 lands (uniform agent contract — "return a JSON status block, the orchestrator owns IPC"), this disclaimer becomes unnecessary in both runtimes. Drop from step skills entirely.

**Status:** open

---

### 11. `of1-snowflake` creates a stub `styles/of1.css` "for now"

Lines 681-684: copies `prototype-home.css` to `styles/of1.css` as a placeholder, expecting Step 8 to overwrite. With the new fan-out (Step 8 parallel with Steps 7a-7e), there's no race risk — but the stub is still dead weight. Either drop it (and let Step 8 own the file) or document Step 6's responsibility for it explicitly.

**Status:** open

---

### 12. `of1-base.css` name collision

Two files called `of1-base.css`:
- `blocks/of1/of1-base.css` — base CSS for the OF1 *search block* (input/chips UI)
- `styles/of1-base.css` — base CSS for the 25 *generative templates* (utility classes)

Same filename, different content, different directory, different generator. `of1-generative-block-styler` reads the first; `gen-base-css.py` produces the second. Constant confusion when reading skills.

Rename one — e.g. `of1-block-base.css` (in `blocks/of1/`) and `of1-templates-base.css` (in `styles/`). Or move one into a clearer naming scheme.

**Status:** open

---

## Concerns worth thinking through (not concrete fixes)

### A. `of1-prototype` and `of1-extraction` are mostly stardust wrappers

Both <200 lines. Mostly "invoke `stardust:extract` / `stardust:prototype`" plus a post-gen-fixes section. If stardust handles its own bugs, these could collapse into 50-line wrappers. If post-gen fixes keep recurring, those issues should be filed against stardust rather than papered over in OF1 skills.

### B. `of1-config-review` could be a script call instead of a skill

Its entire job: read 7 JSON files, run `fill-config-review.py`, commit, push. No LLM reasoning. Both orchestrators already run it inline as bash. The skill file mostly documents the script. Could delete the skill and inline the same docs in both orchestrators (or keep as a docs-only stub).

### C. Shared-crawl optimization (parked from earlier discussion)

`of1-discovery` and `of1-extraction` both crawl the site independently for ~24 min combined wall-clock (~15 min critical path). A pre-crawl orchestrator step + parallel reasoning agents would save 6-8 min wall-clock. Discussed and parked 2026-05-29 — revisit after Tier 1 work.

---

## Caveats

- Read SKILL.md files in full; **skimmed the assets**. There may be additional bugs in `snowflake-split.py`, `fill-template.py`, `gen-base-css.py`, `assemble-catalog.py`, `download-images.py` that an asset-level audit would surface. Ask if you want a second pass.
- Single-run sample (`wknd.site`). Some "stale target time" claims may calibrate differently across domains with very different page counts.

---

## Suggested working order

1. **Tier 1 #1** — strip SLICC residue, make skills runtime-agnostic. Single biggest improvement; unblocks #2 and most of Tier 2.
2. **Tier 1 #2** — factor shared pipeline doc; both orchestrators get thinner.
3. **Tier 1 #3** — shrink `of1-snowflake` + `of1-content-metadata`.
4. Tier 2 (#4-#7) — consistency cleanups.
5. Tier 3 (#8-#12) — housekeeping. Mostly mechanical.

Concerns (A-C) get revisited after Tier 1.
