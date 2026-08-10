# Skill-name pipeline identity — design

**Date:** 2026-08-10
**Status:** approved (brainstorming) → ready for implementation plan
**Repos:** `of1-demo-skills` (this repo) + `of1-labs` (`/Users/quentinvecchio/workspace/labs/of1-labs`)

## Problem

The OF1 demo pipeline identifies every unit by a **flat step number (1–13)**. That numbering
is brittle and dishonest:

- It skips 5, folds `6-base`/`6a`–`6e`/`6-assemble` and `8a`/`8b` onto parent numbers, and uses
  `13` as a fake terminal-failure sentinel that isn't even a real step.
- Step numbers do not reflect the true pipeline shape — Stage 3 is a **DAG** (parallel content
  and site-integration tracks), not a 1→12 ladder. A debugged run showed `step_history`
  transitioning `… 6 → 13 → 12 → 13 → 5`, which is meaningless as an ordering.
- The number lives in ~11 skills, the orchestrator, the container inference table, the labs
  webhook, D1, and the progress UI — scattered, with no single source of truth.

The vocabulary the team actually wants: **stage** = big pipeline phase; **skill** = the unit that
runs inside a stage. Identify units by `{stage, skill}`, drop numbers from the skills entirely.

## Identity model

Every pipeline unit is `{stage, skill}`:

| Stage | Name | Skills (units) |
|---|---|---|
| 0 | Setup | `of1-check-dependencies` |
| 1 | Discover | `of1-discovery` |
| 2 | Replica | `stardust:replica` |
| 3 | Integrate | `of1-build-templates`, `of1-style-generative-block`, `of1-extract-brand-voice`, `of1-extract-content`, `of1-build-quick-suggestions`, `of1-build-cta-template`, `of1-generate-config-review`, `of1-publish` |

- **Status files:** `of1-<skill>-status.json` (e.g. `of1-build-templates-status.json`). `of1-discovery`
  already migrated to this in a prior pass (`of1-discovery-output.md` / `of1-discovery-status.json`).
- **Status JSON body:** the `"step": N` field becomes `"stage": <n>, "skill": "<skill-name>"`.
- **Sub-units are skill-internal.** `6-base`/`6a`–`6e`/`6-assemble`/`8a`/`8b` never appear on the
  wire or in status files — they are phases inside a single skill, visible only in logs. Progress is
  **skill-level**: `of1-build-templates` is `running` when it starts and `completed` when it finishes.
- **Stage 3 is documented as a DAG, not a sequence** — dependency edges, not an order.

## Wire format (of1-labs webhook)

`POST /api/experiments/:id/events` body — **new shape**:

```json
{ "stage": 3, "skill": "of1-build-templates", "status": "running|completed|failed", "at": 1786000000000 }
```

Job-level terminal failure is **explicit** (no magic number):

```json
{ "stage": 3, "skill": "of1-publish", "status": "failed", "terminal": true, "detail": "…" }
```

### Dual-format transition (REQUIRED — not optional)

Routine `of1-labs` deploys pass `--containers-rollout none` (see of1-labs `AGENTS.md`), so the
**old container image keeps emitting legacy numeric `{"step": N}` events until someone manually
triggers a container rollout**. In-flight jobs during that window would break under a hard replace.
Therefore the webhook accepts **BOTH** shapes for the transition:

- **New:** `{ stage, skill, status, at, terminal? }`
- **Legacy:** `{ step: <number>, status, at }` — still valid.

A **normalizer** in the events handler maps legacy `step → {stage, skill}` using the reverse of the
number map that `container/src/step-tracker.ts` uses today, producing **one internal representation**
downstream. Ambiguous legacy numbers (e.g. `8` = two skills) map to a representative skill and set a
`legacy: true` marker on the stored event.

**Validation:** `stage` is a number 0–3; `skill` is a string validated against the known-skill set
(reject unknowns so a typo can't silently vanish); `status ∈ {running, completed, failed}`;
`terminal` optional boolean. Legacy branch validates `step` as a number as today.

## D1 (additive — no drops)

- **Keep** `current_step INTEGER` — legacy emitters keep writing it (via the normalizer).
- **Add** `current_stage INTEGER` + `current_skill TEXT` — written on every event.
- `step_history` stores the normalized `{stage, skill, status, at}` shape going forward; historical
  rows keep their numeric shape untouched (**no backfill**).
- Terminal-failure detection in `recordExperimentEvent` accepts **either** `event.terminal === true`
  **or** the legacy `step === 13 && status === "failed"` — both live until the old container retires.
- The `experiments` table is shared across experiment types, but `/events` +
  `step_history`/`current_step` are exercised by the **of1 pipeline only** (stardust/liftoff push
  progress via SLICC sprinkle, not this webhook), so this change is of1-scoped in practice.

## Labs progress UI

`service/app/routes/of1/pipelineLayout.ts` + `StepTracker.tsx`: rebuild as **3 stage groups**
(Discover / Replica / Integrate; plus Setup) with a **card per skill** inside each group, keyed by
`skill` id. Stage 3's cards render as a group (parallel-friendly), not a strict ladder.

- `useExperimentShell.tsx` / `experiment-shell/types.ts`: expose `currentStage` / `currentSkill`.
- **Fallback:** when `current_skill` is absent (legacy / in-flight-on-old-image rows), read
  `current_step` → number-map → card, so old runs still render.

## CC emission (container inference)

On CC the skills do not self-report; the container infers progress from agent labels/task text via
`container/src/step-tracker.ts`, emits webhook events, and auto-completes predecessors.

- Rewrite `step-tracker.ts` to map agent labels → `{stage, skill}` instead of numbers. Same
  mechanism, re-keyed. The orchestrator already labels agents by skill name
  (`style-generative-block`, `extract-content`, …), so no new orchestrator burden.
- Predecessor auto-complete becomes a **skill-DAG** keyed by skill id.
- Emits the new event shape. (SLICC path: the orchestrator/cone POSTs the new shape directly per
  `service/src/lib/of1-prompt.ts`, replacing its numeric step-map documentation.)

## Rollout order

Skills and labs can ship independently because labs tolerates both formats:

1. **of1-labs, additive:** migration adds `current_stage`/`current_skill`; webhook + normalizer
   accept both shapes; `recordExperimentEvent` dual terminal detection; UI stage-grouped with
   legacy fallback. Deploy (worker only; `--containers-rollout none` as usual).
2. **of1-demo-skills:** every skill's status file → `of1-<skill>-status.json`; status JSON body →
   `{stage, skill}`; audit schema `stage` field carries skill ids; orchestrator dispatch labels +
   `dispatch-cc.md`/`dispatch-slicc.md`/`pipeline-contract.md`/`of1-prompt.ts` docs updated.
3. **Container image:** rewrite `step-tracker.ts` + `webhook.ts` to the new shape; build, push,
   **manual `workflow_dispatch` rollout** (gradual) per of1-labs `AGENTS.md`.
4. **Retirement (separate later change, tracked — do NOT do now):** once the new image is rolled
   out and no in-flight legacy jobs remain, drop the legacy branch in the
   validator/normalizer/`recordExperimentEvent` and the `current_step` column + UI fallback.

## Scope boundaries

- `of1-discovery` is already on the new file convention — this generalizes it to the rest.
- Other skills' internal step-numbered *status files* (`step-7-status.json`, `step-8-*-status.json`,
  etc.) are what this migrates; their skill-internal phase names (base/assemble/intent-*) stay.
- No change to stardust/liftoff/launchpad experiment types.
- The `stage: "1"` vs `"step": N` vocabulary mismatch in the audit schema is resolved here (audit
  `stage` field holds the stage number; a sibling `skill` field holds the skill id).

## Open risks

- **Legacy number → skill ambiguity** (`8` → brand-voice vs content): normalizer picks a
  representative + `legacy:true`. Acceptable because affected rows are old/in-flight display only.
- **Container rollout lag:** the whole reason for dual-format; retirement is gated on it.
