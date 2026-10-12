# of1-demo-skills cleanup: call of1-integration once

Date: 2026-10-09
Status: draft, awaiting review
Repos: `of1-demo-skills` (primary), `of1-skills` (see its cleanup spec). The automation harness that runs this pipeline is changed in its own repo's spec.
Related: `of1-skills/docs/superpowers/specs/2026-10-09-of1-skills-cleanup-design.md`

## Intent

`of1-demo-skills` turns a domain into a demo: discovery, then migration (Stage 2:
extract design, prototype, deploy), then OF1 integration. It treats `of1-skills` as an
opaque dependency and calls `of1-integration` once after Stage 2, the way it calls
`stardust`. It no longer dispatches individual `of1-skills` skills, no longer reads their
internals, and no longer carries SLICC.

Success criteria:

1. A run of the demo produces the same experiment as today (same hub, same
   `/of1` page, same progress files) with `of1-skills` on its new driver.
2. The orchestrator never mentions an `of1-skills` skill other than `of1-integration`
   and `of1-check-dependencies`' outputs it needs.
3. No SLICC code, no `OF1_PIPELINE_MODE`, no `OF1_STAGE2_DONE_FILE` gate for Stage 3.
4. Dead files are gone and the README describes the real pipeline.
5. The caller contract below stays stable for any harness that runs the orchestrator.

## Decisions taken

- **Sequential content track.** The orchestrator runs Stage 1, Stage 2, then one call
  `of1-skills:of1-integration content-source=<DOMAIN> non-interactive cta-template`.
  The content track (brand voice, content, suggestions) no longer overlaps Stage 2; the
  build gets longer by that track's duration. (Chosen over a two-call interface.)
- **One call, top level.** `of1-integration` dispatches subagents, and a Claude Code
  subagent cannot dispatch subagents, so the orchestrator invokes it inline with the
  `Skill` tool in its own (top-level) context, never through an `Agent`.
- **Claude Code only.** SLICC is dropped.

## Changes in of1-demo-skills

### Orchestrator (`skills/of1-demo-orchestrator/SKILL.md`)

- Remove runtime detection, the "nesting cap" section and the Stage 3 dispatch graph.
- Stage 3 becomes one step: invoke `of1-skills:of1-integration` with the three arguments
  above, then read `$OF1_STATE_DIR/of1-integration-result.json`
  (`status`, `summary`, `deliverables`, `checks`). `done` finishes the pipeline;
  anything else is reported and fails the run.
- Keep writing `$OF1_STAGE2_DONE_FILE` (`stage2-done.json`) from `of1-deploy`: a harness uses
  it for progress. It is no longer a gate for anything in `of1-skills`.
- Phase 0b stays: the orchestrator still runs `of1-skills:of1-check-dependencies` first
  (inline, `Skill` tool). It fails fast before Stage 1, writes `setup.json` and
  `repo-config.json` that Stage 1/2 skills read, and is the first progress file a caller sees. The driver runs the
  same skill again as its own step 1; that re-run is idempotent and cheap (spec of1-skills,
  stage 5 makes it skip the verification when `setup.json` is fresh).

### Phase 0a wipe (required by the Restart removal in of1-skills 0.2.0)

`of1-check-dependencies` no longer removes OF1-owned content, and no longer asks
Continue/Restart. The orchestrator's fail-closed wipe block gains the removal it used
to rely on:

- DA: recursive delete of `/of1/**` and `/templates/**` (use the `da_delete_tree` walk from
  `of1-skills` commit `245f282^`, `skills/of1-check-dependencies/SKILL.md` step 3, with its
  path guard that refuses anything outside those two roots).
- git: remove `blocks/of1/` and `of1/config/` (the existing `rm -rf ... of1/config/`
  already covers `of1/config/`; add `blocks/of1/`).
- Stop forwarding a Continue/Restart choice to `of1-check-dependencies`.
- All existing fail-closed guards stay as they are.

### Files removed or rewritten

| Path | Action |
|---|---|
| `skills/of1-demo-orchestrator/knowledge/dispatch-slicc.md` (327 lines) | delete |
| `skills/of1-demo-orchestrator/of1-demo-orchestrator.shtml.tpl` (1090 lines, SLICC sprinkle UI) | delete |
| `skills/of1-demo-orchestrator/knowledge/dispatch-cc.md` (214 lines) | keep only Stage 1 and Stage 2 dispatch; drop the "Skill dispatch template (Integrate skills)" and Stage 3 sections |
| `skills/of1-demo-orchestrator/knowledge/pipeline-contract.md` | drop SLICC rows, Integrate-skill dispatch contract, `OF1_PIPELINE_MODE`; keep env vars, state files, the Stage 1/2 status contract |
| `skills/of1-demo-orchestrator/knowledge/common-pitfalls.md` | drop `[SLICC]` items and the section numbers nobody cites any more; keep §2, §3, §6, §9 numbering because `of1-skills` skills still cite them until their own cleanup lands |
| `FINDINGS-2026-08-04.md`, `SCRIPT-AUDIT-2026-08-05.md`, `SKILLS-AUDIT-2026-08-05.md`, `logs.txt` | delete (tracked, unreferenced) |
| `README.md` | rewrite for the current 3-stage pipeline (not `stardust:replica`, not `skills-v3`) |
| `docs/superpowers/**` (about 12.5k lines) | add `Status:` headers and a `docs/README.md` index; do not delete |
| `AGENTS.md` | add (a `CLAUDE.md` symlink already exists but its target is missing) |
| `pipeline-version` | unchanged value `v5-deploy` (external tooling reads it) |

## Caller contract (stable)

A harness that runs the orchestrator may rely on:

- Progress: `<state dir>/<skill>-status.json` with `status` and `skill` (the `of1-skills`
  progress contract, `docs/contract.md` there) for the Stage 3 skills, and for this repo's
  own: `of1-discovery`, `of1-extract-design`, `of1-prototype`, `of1-deploy`, plus
  `stage2-done.json`.
- The caller sets `OF1_STATE_DIR`, `OF1_DEMO_REPO` and the token env vars, pre-writes
  `repo-config.json` (`owner, repo, branch, domain` at least) and says in its own system
  prompt where to write its result. The orchestrator writes no result file of its own; it
  ends by reporting `of1-integration-result.json` (`done|review|failed`, `summary`,
  `deliverables`).
- `pipeline-version` stays one of `v4|v5|v5-prototype|v5-deploy`; branch names are not
  renamed.
- Skill ids and the orchestrator name `of1-demo-skills:of1-demo-orchestrator` stay.
- Hub link `<preview>/deliverables/index.html`.
- Nothing sets `OF1_PIPELINE_MODE` any more.

## Verification

1. Markdown/link checks on the changed knowledge docs; the wipe block is extracted to a
   script with a test that runs its fail-closed guards against a fake state dir.
2. The `of1-skills` contract test.
3. A full run on a throwaway repo with both repos on their PR branches: all progress files
   appear, hub loads, worker `/status` is `ready`, `of1-integration-result.json` is
   `done`. Capture the baseline shape (`of1-skills` `scripts/baseline`) from that run; it
   becomes the golden run for later changes.

## Order and release

1. `of1-skills` PR #13 (hygiene) merges.
2. The harness repo's PR (its own spec) merges and ships first; it only relaxes a check.
3. `of1-skills` stages 3-6 on a branch; `main` stays untouched until a full run passes.
4. This repo's PR, run on branches of both repos, then merged together.

## Risks

- Sequential content track increases wall-clock time; measure it in the first run.
- The wipe block is the only destructive piece left; all guards stay and its new DA
  deletion keeps a two-root path guard.

## Out of scope

`of1-discovery`, `of1-extract-design`, `of1-prototype`, `of1-deploy` internals; the
worker template-publish fix; the portal; editing `of1-skills` skills (their own spec);
the harness repo's changes (its own spec).
