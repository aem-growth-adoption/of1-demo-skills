# OF1 demo-skills — Skills Audit (SKILL.md prose & contracts)

**Date:** 2026-08-05
**Scope:** the 14 `SKILL.md` files in `of1-demo-skills/skills/` — their prose, contracts, dependency graphs, and cross-skill consistency. **3,624 lines total.**
**Companion documents:**
- `SCRIPT-AUDIT-2026-08-05.md` — the 8 executable scripts (findings 46–56)
- `FINDINGS-2026-08-04.md` — the run log from the `frescopa.coffee` test (items 1–45)

**Relationship to `FINDINGS-2026-08-04.md`:** that document is *chronological* — what broke, in the order it broke, during one run. **This document is *structural*** — it audits the skills as a body of specification, independent of any run. It re-frames run findings as contract defects where relevant (cross-referenced as `[item N]`), and adds **12 new findings (S1–S12)** that a single run could not surface, six of which were found by cross-skill diffing rather than by execution.

**Method:** every SKILL.md read or grepped; all structural claims verified against the filesystem, the on-disk skill set, and the artifacts of the `frescopa.coffee` run. Claims are marked **VERIFIED** where a command backs them.

---

## 1. Executive summary

The skills are substantively good — the contracts are detailed, the worker schemas are documented, and the step graph is thought through. The problems are almost entirely **at the seams between skills**, not inside them. Four themes:

**A. ~~Two skills' contracts are mutually unsatisfiable~~ — RESOLVED 2026-08-05 (Option 1, both runtimes).** Each orchestrator mandated Stage 3 be a *single* delegation with a HARD RULE against re-implementing steps 6–12, while `of1-adopt-existing-site` declared "**Parallelism is mandatory**" and fanned out ~14 steps — impossible, since **neither** a CC subagent (no Agent tool) **nor** a SLICC scoop (can't call `scoop_scoop`) can nest. The audit originally called the SLICC path "coherent"; that was wrong. Fixed in **both** orchestrators: the top level owns and dispatches steps 6–12 directly (HARD RULEs deleted), the nesting cap is stated in each, and SLICC's fictional sub-progress relay was rewritten. See S3.

**B. ~~The fabricated-pricing incident is a skill defect~~ — DOWNGRADED 2026-08-05.** The original theme claimed a fabricated price sheet shipped for a real company. On review this was wrong: templates are **slot-based shells** filled with real content by the worker at runtime, so the invented values lived only in the **gallery preview** (`sample.json`), not in customer-facing output. `products.json` grounding is nice-to-have preview realism, not a correctness gate. **S1** is resolved with a small prose edit (optional best-effort sample-data source); **S2**'s abort gate is withdrawn as backwards. See S1/S2 below.

**C. ~~Silent-fallback contracts~~ — RESOLVED 2026-08-05 (S10).** Four skills hardcoded `stardust/current/DESIGN.json` and three silently guessed tokens when it was missing. Fixed: one shared `design-tokens-resolution.md` resolver (`stardust/current/` → `./`), fail-loudly when no source exists — and the "styles.css = guessing" framing was corrected (it's the deployed truth for a live site, not a guess).

**D. ~~State-file contracts drift and are partly fictional~~ — RESOLVED (S4, S5).** The promised-but-never-written `stage-<N>-summary.json`/`pipeline.log` are deleted; a canonical state-file inventory lives once in `pipeline-contract.md`. `fill-demo-hub.mjs` was reading `step-3-output.md` (never written; step 3 is extraction, step 2 is the narrative) — fixed to read `step-2-output.md`, parse the real format, and render it.

**One sentence for whoever fixes this:** the skills are individually well-written and collectively under-specified at the joins — every serious defect in this document lives in the gap between two skills that each look correct in isolation.

---

## 2. Skill inventory

**VERIFIED at audit time** — 14 skills on disk. **As of 2026-08-05 the two orchestrators were merged into one (`of1-demo-orchestrator`, S6), so there are now 13 skills** + the `-cc` skill deleted; the audit schema/step contract/dispatch mechanics live in `of1-demo-orchestrator/knowledge/`.

| Lines | Skill | Role | Audited verdict |
|---|---|---|---|
| 499 | `of1-build-templates` | 15 templates, 5 intents, 3 modes | S1 resolved / S2 withdrawn (sample data is preview-only); [25, 27, 28, 31, 32, 33, 36, 37] remain |
| — | `of1-demo-orchestrator` | **runtime-agnostic orchestrator** (was SLICC; CC merged in — S6) | S3 + S6 resolved; runtime split into `knowledge/dispatch-{cc,slicc}.md` |
| 408 | `of1-style-generative-block` | OF1 block + DA authoring | Good; only skill with a 401 contract |
| 376 | `of1-extract-content` | products/testimonials/etc. | Good fabrication guards; [9,10,11,12,13,14] |
| 320 | `of1-publish` | deploy + 6 verification checks | [40, 41, 42] + S7 |
| ~~276~~ | ~~`of1-demo-orchestrator-cc`~~ | ~~CC orchestrator~~ | **DELETED (S6 merge)** — folded into `of1-demo-orchestrator` |
| 260 | `of1-check-dependencies` | prereq gate | [1, 3, 5, 23] + S8 |
| 211 | `of1-discover-narrative` | narrative + key pages | **Best-performing.** [8] |
| 164 | `of1-adopt-existing-site` | 14-step OF1 integration | **Structurally broken** (S3) + [7] |
| 145 | `of1-signals` | signals.json authoring | **Orphan** (S9) |
| 141 | `of1-extract-brand-voice` | brand-voice.json | Clean |
| 130 | `of1-build-cta-template` | cta-template.json | [17, 27] |
| 125 | `of1-build-quick-suggestions` | suggestion chips | Clean; ran well [item ✅ Step 9] |
| 109 | `of1-generate-config-review` | review gallery | Clean, thin |

---

## 3. New findings

### 🟢 S1 (DOWNGRADED — RESOLVED) — `of1-build-templates` didn't name `products.json` as a sample-data source

**Downgraded 2026-08-05 after user review.** The original finding (below, struck through in spirit) treated the values baked into templates as *shipped facts*. They are not. The templates are **slot-based shells**; the OF1 worker fills every slot with real, per-request content at runtime, so `sample.json` values never reach a customer — their only role is to make the **review gallery** render a close-to-reality preview. `products.json` grounding is therefore **nice-to-have realism, not a correctness gate**, and the "fabricated price sheet shipped to a real brand" framing was wrong: the fabricated values lived in a gallery preview, not in customer-facing output.

**Fix applied (prose only):** `of1-build-templates` now lists `products.json` in Inputs as an *optional, best-effort* sample-data source (explicitly "never a blocker", produced by parallel step 8b so may be absent), and a **"Sample data — realistic gallery previews"** section replaces the hard Grounding rules: always generate all 15 templates; prefer real values when `products.json` is present, plausible placeholders otherwise. No mechanical assert and no abort gate were added (see S2).

---

<details><summary>Original 🔴 finding (retained for the record — premise now known to be wrong)</summary>

**VERIFIED** — the Inputs section (lines 43–53) lists exactly five sources:

1. `stardust/current/DESIGN.json` (design tokens)
2. `$OF1_STATE_DIR/step-2-output.md` (narrative)
3. `deliverables/prototype-*.html` (when they exist)
4. prototype screenshots (when they exist)
5. fallback: `DESIGN.json` + live screenshots + `styles/styles.css`

Every one is about **visual design**. Not one is a source of **facts**. Then:

```
$ grep -n "products.json" of1-build-templates/SKILL.md
53:Worker-side schemas: of1-demo-orchestrator/knowledge/worker-config-schemas.md § templates.json, § products.json.

$ grep -n "price\|currency" of1-build-templates/SKILL.md
290:| `budget` | `price-tiers`, `cost-breakdown`, `roi-story` |
```

Two mentions, in 499 lines. The only `products.json` reference points at a *schema document*, not at the file as an input. The only "price" is an intent-name table row.

So a skill that instructs an agent to author `of1-budget-price-tiers`, `of1-budget-cost-breakdown` and `of1-budget-roi-story` — three templates whose entire subject is money — **never tells it where the real prices are**. It has a narrative and design tokens and no catalog.

Compare `of1-extract-content`, which gets this right (**VERIFIED**, lines 131, 255, 354, 357): *"never invent them"*, *"hallucinated social proof is unacceptable"*, *"if not on the page, omit it"*. That skill has strong, repeated, specific fabrication guards. `of1-build-templates` has **one** — line 349, about *image URLs* only.

This reframes [item 32]. The prior conclusion was "a prompt-level 'don't invent' is demonstrably insufficient." True, but incomplete: **the skill never provided the grounding to comply with.** The dispatch prompt said "use the REAL prices" while the skill pointed the agent at zero sources containing any. The agent sourced $3.99/$14.99 correctly (from the narrative context) and invented around them — the exact behavior [item 34] predicts when grounding is absent.

**Fix — three parts, all needed:**

1. **Add `of1/config/products.json` to the Inputs list as a first-class *factual* source**, with its real shape stated inline (it's a **bare array**, not `{"products":[…]}` — see [item 10]; the obvious `jq '.products|length'` probe errors). List the per-item keys: `id, name, category, currency, description, features, highlights, images, keywords, persona, price, url, useCase`.
2. **Add a Grounding section** mirroring `of1-extract-content`'s discipline, stating the rule that skill already embodies: *every factual claim — price, count, timeframe, guarantee, shipping term — must trace to `products.json`, the narrative, or live page copy. If the intent has no factual substrate, report that and stop.* Note prices are stored as **numbers** (`14.99`), so `$`-prefixed string matching alone will miss them.
3. **Add the mechanical assert** [items 32/36 + script-audit 55b] to `assemble-catalog.mjs`, covering `sample.json`, `.html` slot defaults, **and** the catalog's embedded `htmlContent`. Test it against a `$999.99` fixture first [item 45].

**Ordering note:** part 1 is a ~10-line edit and is the highest value-per-line change in this entire audit. Do it even if nothing else gets done.

</details>

### ⚪ S2 (WITHDRAWN) — budget "grounding-absence escape hatch"

**Withdrawn 2026-08-05 after user review.** S2 proposed aborting the `budget` intent (write `status: "review"`, skip the templates) when the catalog lacks relevant prices. Given S1's correction — templates are shells and sample values are gallery-preview realism only — **blocking generation over missing preview data is backwards.** All 15 templates should always be generated; the budget shells are as valid as any other. The `of1-build-templates` "Sample data" section now states this explicitly: generate the budget templates regardless, use real prices for the preview when available and placeholders otherwise. No abort path was added.

<details><summary>Original 🟠 finding (retained for the record)</summary>

`of1-build-templates` defines five intents as peers in one table (line 290). But they are not peers epistemically: `deep-dive` and `comparison` describe things the site *says*, while `budget` asserts **commercial terms**. [item 6d] proved the asymmetry empirically — same prompt, same model, same fan-out: the deep-dive agent grounded 12/12 claims against a real `/sustainability` page; the budget agent, whose subject (subscription pricing) **has no source page at all** (live `/subscription` publishes zero prices), fabricated a tier sheet.

The skill offers no way to say "this intent has no factual substrate." An agent told to produce three budget templates will produce three budget templates.

**Fix.** Give the budget intent (and any intent making commercial claims) an explicit **abort-and-report** path: if fewer than N catalog prices are relevant to the narrative focus, write `status: "review"` with a summary naming the gap, and do not author the templates. This is [item 34] promoted from an orchestrator concern to a per-intent contract. Related: `of1-discover-narrative` should flag focus areas with no priced product backing them, so the gap is known *before* fan-out.

</details>

### 🟢 S3 (RESOLVED — Option 1, BOTH runtimes) — the dispatch contract was unsatisfiable on CC *and* SLICC

**Fixed 2026-08-05, per user decision: Option 1 — applied to both orchestrators.**

**Correction to the original finding:** the audit claimed this was "specific to the CC column" and that "the SLICC column of the same file is **coherent**, because `scoop_scoop` nests." **That premise is false** — the user confirmed **scoops do not nest either** (a scoop cannot call `scoop_scoop()`). So the SLICC orchestrator had the *identical* unsatisfiable contract: a HARD RULE that Stage 3 is a single `of1-s3-adopt` scoop, plus a `of1-adopt-existing-site` that needed to fan out steps 6–12 as scoops from inside that one scoop. Worse, the SLICC file's entire **"Stage 3 sub-progress relay"** machinery was fictional — it relayed status from adopt-site's *internal sub-step scoops*, which could never have existed. Both orchestrators now have the top level own steps 6–12.

Changes:
- **`of1-demo-orchestrator-cc`:** added an "Agent nesting cap" note; **deleted the HARD RULE** and the single-delegation Stage-3 dispatch; rewrote Phase 1 task list, Phase 2 diagram, and the dispatch sequence so the orchestrator kicks off the content track + replica, then fans out the site-integration track per adopt-site's dependency table; added a "Stage 3 dispatch (steps 6–12)" section; moved per-step model selection to the orchestrator; made the pipeline audit record every step 6–12 (no black-box Stage 3, incl. inline 11/12).
- **`of1-demo-orchestrator` (SLICC):** added a "Scoop nesting cap" note; **deleted the HARD RULE**; replaced the single `of1-s3-adopt` scoop with per-step scoop dispatch (`of1-s3-<id>-<slug>`); rewrote the dispatch/completion sections so the cone dispatches 8a/8b with the replica and fans out 6–12 on `replica-done.json`; **rewrote the fictional "sub-progress relay" into direct sub-progress** (the cone owns the step scoops, so it pushes their status directly); updated scoop naming, context passing, deliverable URLs, audit granularity, one-shot/approve/revise handling, and completion to per-step; scoop_wait example no longer references the nonexistent `of1-s3-adopt`.
- **`of1-adopt-existing-site`:** the "who dispatches" note now covers **both** runtimes (neither nests; the top-level orchestrator dispatches on each); the SLICC column reframed from self-dispatching to step-definition reference; "parallelism is mandatory" attributes the fan-out to the top level.

The SLICC path is untouched — it nests via `scoop_scoop` and was already coherent.

<details><summary>Original 🔴 finding (retained for the record)</summary>

**the CC dispatch contract is unsatisfiable (contract-level statement of [items 2/6j])**

Both halves, **VERIFIED** in the current text:

`of1-demo-orchestrator-cc/SKILL.md:90-92`:
> **HARD RULE:** do NOT re-implement steps 6–12 here. Stage 3 is a single delegation to `of1-adopt-existing-site`.

`of1-adopt-existing-site/SKILL.md:126` (Claude Code column):
> **Parallelism is mandatory** at each fan-out point — dispatch all eligible Agents in a single message with multiple Agent tool-use blocks.

Same file also mandates `TaskCreate` "with one task per step (1, 3, 6-base, 6a–6e, 6-assemble, 7, 8a, 8b, 9, 10, 11, 12)" — **14 dispatches from inside a subagent**. In Claude Code the Agent tool is withheld one level down. Adopt-site, dispatched as an Agent, cannot dispatch anything.

The two rules cannot both hold. There is no runtime resolution except for the orchestrator to disobey one — which is what happened.

Note the SLICC column of the same file is **coherent**, because `scoop_scoop` nests. The defect is specific to the CC column, and it reads as though the CC column was written by analogy to the SLICC one without accounting for the nesting cap. **[CORRECTION 2026-08-05: this paragraph is wrong — scoops do NOT nest. The SLICC column had the identical defect. See the resolution note at the top of S3.]**

**Fix — pick one and make it explicit in both files:**

1. **(Recommended)** On CC, the top-level orchestrator owns steps 6–12 directly. Delete the HARD RULE and the single-delegation requirement from the CC path; move adopt-site's CC column to a *step-definition reference* the orchestrator reads, not a dispatcher. Chosen for this run at the user's direction, and it worked — the fan-out produced all 60 template files in 23 minutes.
2. Keep the delegation, have adopt-site detect the absent Agent tool, and **document that CC runs sequentially** — honest, but forfeits the parallelism it calls mandatory, and [item 2] measured that cost as material wall-clock.
3. Split adopt-site into a thin CC-orchestrator half plus step definitions the top level dispatches.

**Whichever is chosen, state the nesting cap explicitly in both files.** Its absence is why the contradiction survived authoring: neither file is wrong on its own terms.

</details>

### 🟢 S4 (RESOLVED) — fictional state files removed; real inventory single-homed

**Fixed 2026-08-07.** The never-written `stage-<N>-summary.json` and `pipeline.log` are deleted from all docs. A canonical **State files** inventory now lives once in `pipeline-contract.md` (setup.json, repo-config.json, narrative.json, step-2-output.md, replica-done.json, step-<id>-status.json, pipeline-audit.json — with writer/reader/purpose for each); both `dispatch-cc.md` and `dispatch-slicc.md` cite it and explicitly say "do not write `stage-<N>-summary.json` or `pipeline.log`." Resume-across-sessions stays unimplemented, but it no longer depends on files that don't exist — the honest fix per the user's call.

<details><summary>Original 🟠 finding (retained for the record)</summary>

**the CC orchestrator's State-files table is partly fictional**

`of1-demo-orchestrator-cc/SKILL.md:153-165` documents four state files. **VERIFIED** against `.of1/state/` after a *successful* run:

| Promised | Actual |
|---|---|
| `setup.json` | ✅ present |
| `repo-config.json` | ✅ present |
| `stage-<N>-summary.json` | ❌ **absent (all 3)** |
| `pipeline.log` | ❌ **absent** |

Also absent: `discovery.html`, referenced by `of1-check-dependencies`' cleanup step and `of1-publish`'s check 5 [item 41].

The skill says "You parse each Agent's final JSON block and write it to `stage-<N>-summary.json` yourself" — an instruction with no enforcing step and no downstream consumer, so nothing notices when it's skipped. Its own Notes section concedes resume "is not yet implemented (state files exist but resume logic would need to read `stage-<N>-summary.json`)" — but those files **don't exist**, so the stated prerequisite for resumability is itself unmet. That matters directly: [item 4i] documents a mid-stage death that required filesystem archaeology to recover from.

**Fix.** Either delete the unwritten files from the table, or make writing them a numbered step in the dispatch sequence rather than a parenthetical. Prefer the latter and append-only — see S5 and [item 38].

</details>

### 🟢 S5 (consumer bug FIXED) — one consumer read a file nobody writes; naming grammar still open

**Fixed 2026-08-05 — `fill-demo-hub.mjs`.** The dead read was worse than a wrong filename: `extractNarrative()` (a) read `step-3-output.md` (never written; **step 3 is extraction, step 2 is discovery/narrative**), (b) parsed `**Persona:**`/`**Journey:**` bold markers that `step-2-output.md` doesn't use (its format is a `## Narrative` heading), and (c) its result was discarded via `void narrative` — the hub never showed a narrative at all. All three fixed:
- Reads `$OF1_STATE_DIR/step-2-output.md`; warns loudly (not silently) when absent.
- New `extractSection()` parses the real `## <heading>` format; `extractNarrative`/`extractFocus` use it.
- Added a **Demo Narrative** section to `demo-hub.html` (`{{FOCUS}}` + `{{NARRATIVE}}`), so the narrative is now rendered. Verified end-to-end against a fixture (real narrative) and a missing-file case (graceful defaults + WARN).

**Still open:** the broader naming-grammar recommendation (one canonical `step-<id>-status.json` grammar + an orchestrator assert that the expected status-file set is complete). That's part of the S6 shared-reference work; tracked there.

<details><summary>Original 🟠 finding (consumer bug now fixed; grammar portion open)</summary>

**state-file naming is inconsistent, and one consumer reads a file nobody writes**

**VERIFIED** — three separate naming conventions coexist:

| Pattern | Examples |
|---|---|
| `step-N-status.json` | 1, 2, 3, 6, 7, 9, 10, 11, 12 |
| `step-N-<track>-status.json` | `step-8-brand-`, `step-8-content-` |
| `step-6-intent-<name>-status.json` | `comparison`, `discovery`, `recommendation` |

Plus `step-N-output.md` (`step-2-output.md`) as a parallel content channel.

**The consumer defect:** `of1-publish/assets/fill-demo-hub.mjs:293` reads `$OF1_STATE_DIR/step-3-output.md`. **VERIFIED: no skill writes that file** — the only two hits for `step-3-output` in the entire plugin are the reader itself and its own header comment. `loadText()` swallows the failure and returns `''`, so `extractNarrative()` returns the literal string `"Demo narrative not available."`. The narrative is in `step-2-output.md`, which does exist. This is an off-by-one in a filename that fails silently — the same class as script-audit finding 46 (`stages` vs `steps`).

Note also only **3 of 5** intent status files exist (`comparison`, `discovery`, `recommendation` — missing `budget` and `deep-dive`) while the catalog **VERIFIED** contains all 5 intents × 3 templates. The templates shipped; two status files didn't. Nothing detected the gap, because nothing reads them as a set.

**Fix.** Publish one canonical naming grammar in a shared reference (`step-<id>-status.json` where `<id>` is the exact task id from the step graph), have every skill cite it, and make the orchestrator assert the expected status-file set is complete before advancing a stage. Fix `fill-demo-hub.mjs` to read `step-2-output.md` and warn when absent.

</details>

### 🟢 S6 (RESOLVED — full merge, exceeds original fix) — two orchestrators merged into one runtime-agnostic skill

**Fixed 2026-08-05, per user decision.** The finding proposed extracting a shared reference both orchestrators cite. We went further and did what that implies: **merged the two orchestrators into a single `of1-demo-orchestrator` skill**, eliminating the duplication at the source rather than de-duplicating around it.

Structure now:
- **`of1-demo-orchestrator/SKILL.md`** — runtime-agnostic: entry, Phase 0, the 3-stage model, the nesting cap, the stage→skill map, and a **"Runtime detection — do this FIRST"** section that branches by tool availability (`scoop_scoop` → SLICC; `Agent`/`TaskCreate` → CC).
- **`knowledge/dispatch-cc.md`** — Claude Code mechanics (Agent + TaskCreate, `mode: bypassPermissions`, `<usage>` audit capture, step dispatch template, failure recovery).
- **`knowledge/dispatch-slicc.md`** — SLICC mechanics (scoop_scoop + sprinkle, lick events, sub-progress push, scoop_wait policy, valid sprinkle statuses, `list_scoops` audit).
- **`knowledge/pipeline-contract.md`** — the runtime-independent spec (3-stage model, nesting cap, status/output contract, deliverable URLs, **audit schema**) that both dispatch files cite.
- **`of1-demo-orchestrator-cc` was deleted.** `plugin.json`, `README.md`, `extending-an-of1-demo.md`, `of1-adopt-existing-site`, and `pipeline-contract.md` were updated to reference the single skill.

**The drift the audit named is now impossible two ways:** (1) the `stages`/`stageCount` audit key lives once in `pipeline-contract.md` (canonical, matching `fill-demo-hub.mjs`), and (2) there is no longer a second orchestrator to drift *from*. This also subsumes S6's "CC doesn't get the SLICC-only sections" complaint — there's one skill, so both runtimes get everything.

<details><summary>Original 🟡 finding + the interim "scoped extraction" fix (both superseded by the merge)</summary>

**the SLICC orchestrator is 460 lines of untested divergent logic**

`of1-demo-orchestrator` (SLICC, 460 lines) and `of1-demo-orchestrator-cc` (276 lines) are separate implementations of one pipeline. **VERIFIED** — their section structures barely overlap: the SLICC file has `Lick Events`, `scoop_wait timeout policy`, `Scoop Naming`, `Pixel Fidelity`, `Deliverable URLs — ALWAYS Include Them`, `Reference — pitfalls & schemas`; the CC file has none of these. Conversely the CC file's `Failure recovery` and `Auto-approve vs review mode` have no SLICC counterparts.

The SLICC path was **not exercised at all** in this run. Two consequences: its 460 lines are unverified, and material guidance exists in only one of the two files. `Reference — pitfalls & schemas` and `Deliverable URLs — ALWAYS Include Them` look runtime-independent and valuable — CC agents don't get them.

Also **VERIFIED**, the audit-schema drift that produced script-audit finding 46 is *duplicated* across both: `of1-demo-orchestrator-cc:227` and `of1-demo-orchestrator:401` both specify `"stages"`, and `fill-demo-hub.mjs` reads `steps` — so fixing one orchestrator would not have surfaced it. **Duplicated specs drift silently; a shared one cannot.**

**Fix.** Extract everything runtime-independent (step graph, dependency triggers, output contract, audit schema, pitfalls, deliverable-URL rules) into one shared reference both orchestrators cite. Keep only genuinely runtime-specific mechanics (Agent vs `scoop_scoop`, TaskCreate vs licks) in the per-runtime files. This directly prevents S4, S5, and script-audit 46 from recurring.

</details>

### ⚪ S7 (WON'T FIX — user decision 2026-08-07) — no shared 401/token-expiry contract

**Deferred by the user.** The gap is real (only `of1-style-generative-block` documents a 401-means-token-expiry contract; the run's graceful degradation came from ad-hoc dispatch-prompt instructions), but the user chose not to address it now. Left as-is.

<details><summary>Original 🟡 finding (retained; not actioned)</summary>

**no skill except one documents a 401/token-expiry contract**

**VERIFIED:** `grep -rln "401\|expir" */SKILL.md` matches **exactly one** skill — `of1-style-generative-block`.

Yet [item 5] is the most expensive failure of the run: the token expired mid-pipeline and every `admin.da.live`/`admin.hlx.page` call returned 401 with ~50 minutes of work still to do. Multiple skills make authenticated calls. The reason the run degraded *gracefully* is that the **dispatch prompts** told agents to treat 401 as token expiry — an ad-hoc instruction from me, not from any skill. That knowledge lives nowhere durable and will be lost on the next run.

**Fix.** Add a one-paragraph shared contract to every skill making authenticated calls: *a 401/403 from `admin.da.live` or `admin.hlx.page` means the DA token expired. Do not retry, do not attempt an alternate auth path. Write `status: "failed"` naming token expiry, and stop.* Pairs with [item 5]'s absolute-expiry-time fix in `of1-check-dependencies`.

</details>

### 🟢 S8 (RESOLVED) — `verify.sh` skill list corrected & count derived

**Fixed 2026-08-07.** Added `of1-demo-orchestrator` to `REQUIRED_SKILLS` (post-merge there's one orchestrator, not two — simpler than the original fix). The count is now derived from the array (`TOTAL=${#REQUIRED_SKILLS[@]}`), not hardcoded "10". Added a total-miss branch: "found 0 of N OF1 skills — is this a local checkout with the plugin not installed to a searched root?" per [item 1]. `of1-signals` is intentionally excluded (standalone tool — S9) and `of1-check-dependencies` is the running skill; both are documented as comments in the array. The SKILL.md "10 OF1 skills" prose is rewritten to derive from the array.

<details><summary>Original 🟡 finding (retained for the record)</summary>

**VERIFIED** — on disk but absent from `REQUIRED_SKILLS`:

```
of1-check-dependencies      ← the skill running the check
of1-demo-orchestrator
of1-demo-orchestrator-cc
of1-signals
```

`of1-check-dependencies` omitting itself is harmless (it's running). But **neither orchestrator is verified**, and the SKILL.md prose says "The 10 OF1 skills are installed" as though 10 were the complete set. A partial install missing `of1-demo-orchestrator-cc` would pass Phase 0 cleanly. Combined with [item 1] — where a bad *detector* reported all 10 missing — the count is doing more rhetorical work than the check earns.

**Fix.** Verify all skills the pipeline actually invokes (add both orchestrators; decide on `of1-signals` per S9), derive the count from the array rather than hardcoding "10" in the prose, and on a total miss print "found 0 of N — is this a local checkout?" per [item 1].

</details>

### 🟢 S9 (RESOLVED — confirmed deliberate) — `of1-signals` declared standalone

**Fixed 2026-08-07, user confirmed it's intentional.** `of1-signals`' intro now states it plainly: "**Standalone operator tool — NOT part of the demo pipeline.** No orchestrator dispatches it, no step graph includes it, `verify.sh` intentionally does not check it… Being off the step graph is deliberate — do not wire it in." `verify.sh`'s `REQUIRED_SKILLS` documents the exclusion in a comment. Prevents a future agent from wiring it in or deleting it as dead.

<details><summary>Original 🟡 finding (retained for the record)</summary>

**VERIFIED:** referenced only in `README.md`, `docs/extending-an-of1-demo.md`, and itself. No orchestrator dispatches it; no step graph includes it; `verify.sh` doesn't check it. It's also the only skill with **no output-contract JSON block** (**VERIFIED**: 0 hits for `"step":`/`"status":`).

It is `user-invocable: true` and self-contained, so this is plausibly deliberate — a standalone operator tool, not a pipeline step. But nothing *says* that, so it reads as a step someone forgot to wire up.

</details>

**Fix.** State its status explicitly in its own frontmatter/intro ("standalone operator tool — not part of the demo pipeline; invoke directly"), and mention it in the orchestrators' Notes as an available post-demo add-on. Cheap clarity; prevents a future agent wiring it into the graph or deleting it as dead.

### 🟢 S10 (RESOLVED, scoped) — one shared `DESIGN.json` resolver; "silent guessing" framing corrected

**Fixed 2026-08-05.** Created `of1-demo-orchestrator/knowledge/design-tokens-resolution.md` (one resolver, cited by all 4 skills, per "one spec many citers"). All 4 now resolve `stardust/current/DESIGN.json` → `./DESIGN.json`, and fail loudly only when **neither** `DESIGN.json` location **nor** `styles/styles.css` exists.

**Two corrections to the original finding, both verified against the current `stardust:replica`:**

1. **The path claim was half-stale.** Current `stardust:replica` writes `DESIGN.json` to `stardust/current/` on a **full** run AND promotes a copy to project-root `./DESIGN.json` (`preserve-direction.md:32`). So on the full path the 4 consumers find it fine. The real gap is only the **bounded-single** path (`stardust:extract --single`/`--pages`), where `current/` is not produced and the synthesized spec lands at `./DESIGN.json` with `_provenance.mode: bounded-single`. The resolver addresses exactly that.
2. **The "silent guessing → off-brand" framing was wrong for one source.** The audit lumped the `styles/styles.css` fallback in with guessing. But `of1-build-templates:197` correctly states that for an **already-live EDS site, `styles/styles.css` IS the deployed brand truth** — using it is not a guess. The fix therefore keeps `styles.css` as a valid source and fails loudly only when there is genuinely no source (no `DESIGN.json`, no `styles.css`). Inventing tokens from memory remains forbidden.

<details><summary>Original 🟠 finding (retained; premise partly corrected above)</summary>

**the `DESIGN.json` path defect is a *contract* defect in 4 skills, and 3 fail silently**

**VERIFIED** — still unfixed. Four skills hardcode `stardust/current/DESIGN.json`:

```
of1-adopt-existing-site   of1-build-templates
of1-build-cta-template    of1-style-generative-block
```

`stardust:replica` writes `./DESIGN.json` [item 17]. Failure modes differ, and the difference is what makes this dangerous:

| Skill | Failure mode |
|---|---|
| `of1-adopt-existing-site` | **Loud-ish** — reports `HAS_DESIGN_JSON=false`, re-runs an expensive Opus extraction |
| `of1-build-templates` | **Silent** — guesses tokens from `styles/styles.css` |
| `of1-style-generative-block` | **Silent** — guesses tokens |
| `of1-build-cta-template` | **Silent** — guesses tokens |

Three of four produce **off-brand output with no warning**. In this run I hand-injected "the spec is at `./DESIGN.json`" into three dispatch prompts to avoid it — again, knowledge that lives nowhere durable.

The contract-level point beyond [item 17]: **four independent path literals for one artifact is the defect**, not the wrong path. Any single-site fix leaves three.

**Fix.** One shared resolver: check `stardust/current/DESIGN.json`, then `./DESIGN.json`, and **fail loudly if neither exists** — never fall back to guessing tokens silently. A skill that cannot find its brand spec should refuse, not improvise. Note `of1-adopt-existing-site` already anticipates `_provenance.mode: bounded-single` as valid input, so consuming the replica's file is clearly the intent.

</details>

### 🟢 S11 (RESOLVED) — `of1-build-templates` presents both token-source modes as equal

**Fixed 2026-08-07.** The token-source section now opens with the `HAS_PROTOTYPES` probe and presents **Mode A (prototypes)** and **Mode B (no prototypes — the common adopt-site path)** as equally-valid peers, with Mode B explicitly flagged: "`deliverables/prototype-*.html` is legitimately absent, NOT a blocker. Do not hunt for prototypes or wait on them." The "Required tokens" instruction no longer says "using prototype values verbatim" (which had no referent in Mode B) — it now says "verbatim from your mode's canonical source (Mode A: the prototype's `:root`; Mode B: `styles/styles.css`)", and the `--color-accent` comment names both sources. Addresses [items 25, 28].

<details><summary>Original 🟡 finding (retained for the record)</summary>

[item 25], restated as a contract issue. ~10 lines (49–50, 144–148, 163, 176–183) call `deliverables/prototype-*.html` the "canonical token source" and "visual ground truth"; 2 lines (51, 185) provide the no-prototype fallback. **The adopt-site path never produces prototypes** — `stardust/prototypes/` was empty (0 files, verified in the run). So the *dominant* path is a footnote and the *impossible* path is the headline. An agent reading top-to-bottom hunts for prototypes and can read `ls deliverables/prototype-*.html` failing as a blocker.

**Fix.** Hoist a `HAS_PROTOTYPES` branch to the top of the Inputs section and present both as first-class modes. While there, address [item 28] — state the required `:root` token list independently of the prototype source, since "use prototype values verbatim" has no referent on the fallback path.

</details>

### 🟢 S12 (RESOLVED) — one canonical env-var table in the shared contract

**Fixed 2026-08-07.** `pipeline-contract.md` now has an **Environment variables** table: canonical name, who sets it, who reads it, notes — covering `OF1_STATE_DIR`, `OF1_DEMO_REPO`, `SKILL_DIR`, `ADOBE_IMS_TOKEN` (canonical credential), `OF1_TOKEN_FILE`, `OF1_PIPELINE_MODE`, `OF1_CONTENT_SOURCE`, `OF1_REPLICA_DONE_FILE`, `STRICT`. **`DA_TOKEN` is explicitly marked NOT an input** — it's a shell local derived as `${ADOBE_IMS_TOKEN:-$(jq -r .access_token "$OF1_TOKEN_FILE")}`, with the full resolution order documented. `of1-publish` and `of1-check-dependencies` (the two skills that derive `DA_TOKEN`) now cite the table at the point of derivation. `download-images.mjs` accepting `DA_TOKEN` (script-audit §8) is consistent with "derived local, then passed to the script."

<details><summary>Original 🟡 finding (retained for the record)</summary>

**env-var vocabulary is inconsistent across skills**

**VERIFIED** occurrence counts across the 14 SKILL.md files:

```
DA_TOKEN          19
ADOBE_IMS_TOKEN   13
OF1_TOKEN_FILE    10
```

Three names for one credential. `verify.sh` resolves `ADOBE_IMS_TOKEN` → `OF1_TOKEN_FILE` → `.hlx/.da-token.json` and records the choice in `setup.json`; `DA_TOKEN` is a *derived shell local* in `of1-check-dependencies`' Part 2 — but 19 mentions across skills make it look like a first-class env var. `download-images.mjs` accepts `DA_TOKEN` as an env var too (script-audit §8), so the ambiguity is real, not just cosmetic.

Also: `OF1_PIPELINE_MODE` appears in only 3 skills (both orchestrators + adopt-site), and `STRICT` only in `of1-check-dependencies` — fine, but neither is documented in a shared place, so a step skill can't know what it may rely on.

**Fix.** One env-var table in a shared reference: canonical name, who sets it, who reads it, resolution order. Mark `DA_TOKEN` explicitly as "shell local derived from `setup.json`, never an input."

</details>

---

## 4. What the skills get right

Worth recording so a fixing agent doesn't regress it.

- **`of1-discover-narrative` is the strongest skill in the set.** [items ✅ 4d, 8] Its page-exclusion reasoning verified every candidate returns 200 *and* proactively excluded GraphQL-rendered routes and a live-404 `/tea`, recording a per-page `reason`. That's the class of failure that otherwise burns a downstream fidelity-gate retry. **`excludedPages` should be a first-class contract passed to every downstream stage** — [item 13] happened because it wasn't.
- **`of1-extract-content` has the fabrication discipline the whole plugin needs.** Four separate guards, specific and consequence-stating ("hallucinated social proof is unacceptable"). **This is the model S1 should copy verbatim into `of1-build-templates`.**
- **Per-step status files made a mid-flight abort cheap** [item 2 salvage note]. Step 8a's output survived the Stage 3 kill and was reused as-is; 8b had written nothing and was cleanly re-dispatchable. The per-step-artifact design is sound — S5 is about *naming*, not about the pattern.
- **`of1-adopt-existing-site`'s dependency trigger table** (lines 81–88) is genuinely well-specified, including the non-obvious call that step 7 does *not* depend on step 6. The step *graph* is right; only its CC *dispatch mechanism* is impossible (S3).
- **`of1-style-generative-block` is the only skill with a 401 contract** — which is why S7 asks the others to copy it.
- **`verify.sh`'s ok/warn/fail + `RESULT:` summary** made the real blockers obvious at a glance once detection was fixed [item ✅].
- **The end state was genuinely good**: `ready: true`, 10 configs synced, 33 vectors, 0 errors, correct template selection per intent, all 22 images resolving. The skills do work.

---

## 5. Cross-cutting: the pattern behind every serious finding

Six of the twelve new findings, and the worst of the old ones, share one shape: **a contract that fails silently at a seam between two skills.**

| Finding | Silent failure |
|---|---|
| ~~S1~~ | ~~Missing input → agent invents facts~~ — withdrawn; invented values were gallery-preview only, not shipped |
| S4 | Promised state files never written → resume impossible |
| ~~S5~~ | ~~`step-3-output.md` unread → literal "Demo narrative not available."~~ — FIXED; reads `step-2-output.md`, parses real format, renders narrative + warns when absent |
| ~~S10~~ | ~~`DESIGN.json` not found → 3 skills silently guess~~ — RESOLVED; shared resolver + fail-loudly; `styles.css` is a valid source, not a guess |
| script-audit 46 | `stages` vs `steps` → whole audit section vanishes |
| [item 17] | same, across 4 path literals |

None of these errors. None sets a non-zero exit. Each presents identically to success.

**The structural cause is duplicated specification.** Two orchestrators specified the same audit schema; four skills hardcoded the same path; three skills name the same token differently. Every duplicate is a place where drift is invisible until something downstream reads nothing and shrugs. **[2026-08-05: the first two are now fixed — the audit schema is single-homed in `knowledge/pipeline-contract.md` (S6), and the `DESIGN.json` path in `knowledge/design-tokens-resolution.md` (S10). The token-naming case is S12, still open.]**

**Two rules I'd put at the top of a contributing guide:**

1. **One spec, many citers.** Anything named in more than one skill — paths, env vars, state-file names, audit schema, step graph — lives in one shared reference the others cite. S4/S5/S6/S10/S12 and script-audit 46 all reduce to violations of this.
2. **A missing input is a failure, never a fallback.** Where a skill currently guesses (brand tokens, prices, narrative text), it must instead fail loudly. Guessing converts a missing input into plausible wrong output — the most expensive failure class in this pipeline, and exactly what shipped a fabricated price sheet for a real company to a public CDN.

---

## 6. Recommended fix order

Sequenced by (impact × confidence) ÷ effort. Items 1–3 are small and high-value.

| # | Finding | Effort | Why |
|---|---|---|---|
| ~~1~~ | **S1** — ✅ DONE (prose): `products.json` added as optional best-effort sample-data source; Sample-data section replaces hard Grounding rules. **S2 withdrawn.** | done | Reclassified: sample values are gallery-preview realism, not shipped facts — no assert or abort gate needed |
| ~~2~~ | **S10** — ✅ DONE: shared `design-tokens-resolution.md` cited by all 4 skills; resolves `current/`→`./`; fails loudly only when no `DESIGN.json` AND no `styles.css` | done | Scoped: real gap was the bounded-single path; `styles.css` kept as a valid live-site source |
| ~~3~~ | **S5** — ✅ DONE (consumer): `fill-demo-hub.mjs` reads `step-2-output.md`, parses the real `## Narrative` format, renders it, warns when absent. Naming-grammar portion folded into S6. | done | Was a triple bug: wrong file + wrong format + discarded result |
| ~~4~~ | **S3** — ✅ DONE (Option 1, BOTH runtimes): each top-level orchestrator owns steps 6–12; HARD RULEs deleted; nesting cap stated in both; SLICC's fictional relay rewritten | done | Was a structural blocker on CC *and* SLICC (scoops don't nest either — audit's "SLICC coherent" claim was wrong) |
| ~~5~~ | **S7** — ⚪ WON'T FIX (user deferred) | — | Gap is real but not actioned this pass |
| ~~6~~ | ~~**S2** — grounding-absence abort path~~ **WITHDRAWN** | — | Backwards: templates are shells, sample values are preview-only; always generate all 15 |
| 7 | **S4** — make state-file writes numbered steps, or delete the fiction | ~10 lines | Unblocks resumability [item 4i] |
| ~~8~~ | **S6** — ✅ DONE (full merge): two orchestrators → one `of1-demo-orchestrator` with runtime detection + `knowledge/dispatch-{cc,slicc}.md` + `pipeline-contract.md`; `-cc` skill deleted | done | Exceeded the proposed fix — removed the duplication at the source; nothing left to drift |
| ~~9~~ | **S11** — ✅ DONE: Mode A/Mode B presented as equal peers; token values sourced per-mode | done | Adopt-site's no-prototype path is no longer a footnote |
| ~~10~~ | **S8** — ✅ DONE: orchestrator added to REQUIRED_SKILLS; count derived; total-miss message | done | Simplified by the merge (one orchestrator) |
| ~~11~~ | **S12** — ✅ DONE: canonical env-var table in pipeline-contract.md; DA_TOKEN marked derived-not-input | done | Three-name ambiguity resolved |
| ~~12~~ | **S9** — ✅ DONE: declared standalone in its intro + verify.sh comment | done | User confirmed intentional |

### Verification checklist

- [x] `of1-build-templates` Inputs names `products.json` as an optional best-effort sample-data source (S1)
- [x] ~~Budget templates contain no price absent from `products.json`~~ — N/A; sample values are gallery-preview only, real prices used when available (S1/S2)
- [x] `DESIGN.json` resolver: all 4 skills cite `design-tokens-resolution.md`; resolve `stardust/current/` → `./`; fail loudly only when no `DESIGN.json` AND no `styles/styles.css` (`styles.css` is a valid live-site source, not a guess)
- [x] `fill-demo-hub.mjs` renders a real narrative, not "Demo narrative not available." (verified against a fixture + missing-file case)
- [ ] After a full CC run, every file in the orchestrator's State-files table exists — or the table no longer lists it
- [ ] `grep -rln "401" */SKILL.md` matches every skill making authenticated calls (currently 1 of ~6)
- [ ] `verify.sh` fails when either orchestrator is absent
- [ ] No skill's Inputs section names an artifact no skill writes (the S5 class) — worth a CI grep

---

## 7. Open questions for the user

1. ~~**S3 resolution is a design decision, not a bug fix.**~~ **RESOLVED 2026-08-05** — user chose Option 1 (orchestrator owns 6–12 on CC). Applied; the clean Stage-3 encapsulation is intentionally traded away, per that decision.
2. **The retro's timing findings are not in any document yet.** The dead-air analysis — 114 min of the 316-min run (36%) spent with no compute happening, from a subagent death at ~13:30 that the orchestrator learned about at 14:27 — is a skill defect (no liveness/heartbeat contract) and belongs here as an S-finding or in `FINDINGS` as items 46+. Still awaiting your direction from the previous turn.
3. ~~**S6's shared-reference refactor is the only item that is genuinely a refactor.**~~ **RESOLVED 2026-08-05** — went beyond the proposed extraction and **merged the two orchestrators into one** `of1-demo-orchestrator` that detects its runtime and follows `knowledge/dispatch-{cc,slicc}.md`, with the shared spec in `pipeline-contract.md`. The `-cc` skill was deleted.
