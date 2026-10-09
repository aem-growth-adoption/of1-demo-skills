# of1-demo-skills cleanup: call of1-integration once, keep the lab contract

Date: 2026-10-09
Status: draft, awaiting review
Repos: `of1-demo-skills` (primary), `of1-labs` (small, required), `of1-skills` (see its cleanup spec)
Related: `of1-skills/docs/superpowers/specs/2026-10-09-of1-skills-cleanup-design.md`

## Intent

`of1-demo-skills` turns a domain into a demo: discovery, then migration (Stage 2:
extract design, prototype, deploy), then OF1 integration. It treats `of1-skills` as an
opaque dependency and calls `of1-integration` once after Stage 2, the way it calls
`stardust`. It no longer dispatches individual `of1-skills` skills, no longer reads their
internals, and no longer carries SLICC.

Success criteria:

1. A lab run of the demo produces the same experiment as today (same hub, same
   `/of1` page, same step progress in the UI) with `of1-skills` on its new driver.
2. The orchestrator never mentions an `of1-skills` skill other than `of1-integration`
   and `of1-check-dependencies`' outputs it needs.
3. No SLICC code, no `OF1_PIPELINE_MODE`, no `OF1_STAGE2_DONE_FILE` gate for Stage 3.
4. Dead files are gone and the README describes the real pipeline.
5. The lab's progress tracking and completion check keep working (see "Lab contract").

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
- Keep writing `$OF1_STAGE2_DONE_FILE` (`stage2-done.json`) from `of1-deploy`: the lab maps
  it to a UI step. It is no longer a gate for anything in `of1-skills`.
- Phase 0b stays: the orchestrator still runs `of1-skills:of1-check-dependencies` first
  (inline, `Skill` tool). It fails fast before Stage 1, writes `setup.json` and
  `repo-config.json` that Stage 1/2 skills read, and is the lab's step 1. The driver runs the
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
| `skills/of1-demo-orchestrator/knowledge/pipeline-contract.md` | drop SLICC rows, Integrate-skill dispatch contract, `OF1_PIPELINE_MODE`; keep env vars, state files, the Stage 1/2 status contract and the lab contract below |
| `skills/of1-demo-orchestrator/knowledge/common-pitfalls.md` | drop `[SLICC]` items and the section numbers nobody cites any more; keep §2, §3, §6, §9 numbering because `of1-skills` skills still cite them until their own cleanup lands |
| `FINDINGS-2026-08-04.md`, `SCRIPT-AUDIT-2026-08-05.md`, `SKILLS-AUDIT-2026-08-05.md`, `logs.txt` | delete (tracked, unreferenced) |
| `README.md` | rewrite for the current 3-stage pipeline (not `stardust:replica`, not `skills-v3`) |
| `docs/superpowers/**` (about 12.5k lines) | add `Status:` headers and a `docs/README.md` index; do not delete |
| `AGENTS.md` | add (a `CLAUDE.md` symlink already exists but its target is missing) |
| `pipeline-version` | unchanged value `v5-deploy` (the lab reads it) |

## Lab contract (of1-labs reads this; must not change silently)

From the 2026-10-09 audit of of1-labs `origin/main`:

- Progress: the lab polls `<shared dir>/<skill>-status.json`, reads `status` and `skill`
  and acts only on `status:"done"`. Skill ids it knows: `of1-check-dependencies`,
  `of1-discovery`, `of1-extract-design`, `of1-prototype`, `of1-deploy` (and `stage2-done.json`),
  `of1-build-templates`, `of1-style-generative-block`, `of1-extract-brand-voice`,
  `of1-extract-content`, `of1-build-quick-suggestions`, `of1-build-cta-template`,
  `of1-publish`. The driver in `of1-skills` keeps writing these (its spec's lab contract).
- It also matches skill ids inside Agent/TaskCreate tool-call text; the driver's dispatches
  keep those ids.
- Completion: `/shared/of1-demo/result.json` `{status, branchName, experimentUrl, message,
  blockers}` is written by the orchestrator's final step, not by `of1-skills`. The
  orchestrator keeps writing it; the lab's system prompt still instructs this.
- `repo-config.json` is written by the lab before the run with fields `owner, repo, branch,
  branchName, repoDir, sharedDir, jobId, domain`; the orchestrator keeps reading it.
- `pipeline-version` stays one of `v4|v5|v5-prototype|v5-deploy`; branch names are
  not renamed.
- Hub link `https://<branch>--<repo>--<org>.aem.page/deliverables/index.html`.
- The lab sets no `OF1_PIPELINE_MODE`; today the orchestrator sets it itself. After this
  change nothing sets it.

## Required change in of1-labs (separate PR, same release)

The lab's post-run check requires `of1/config/{brand-voice,knowledge,personas,suggestions,
cta-template,templates}.json` in the shared dir (`container/bin/server.ts`,
`requiredConfigFiles`, around line 246) and fails the job `incomplete_pipeline` otherwise.
DA-first skills write only `of1/config/config.json` (+ `cta-template.json`) to git, so
this check fails today on `main` skills. Change:

- `requiredConfigFiles` returns `["config.json", "cta-template.json"]` for the knowledge-only
  contract (the default branch `main` and `skills-v5*`); the legacy list stays for
  other skill branches.
- `buildSystemPrompt`'s `configFilesBlock` and the "STEP 11 / STEP 12" paragraphs
  describe the DA-first deliverables and the single `of1-integration` call (step 11
  does not exist any more); the `result.json` rules stay.
- Add `of1-integration` to the lab's skill allow-list/step map only if its UI should show
  the driver as a card; otherwise leave the map alone (unknown ids are ignored by the
  tracker, but the events endpoint rejects unknown ids with 400, so never post them).
- Update `container/tests/server.test.ts` fixtures (`:613-666` area) for the new required
  list.
- Image rebuild is needed (the check lives in the image, not in the skills).

## Verification

1. Unit: markdown/link checks on the changed knowledge docs; `bash -n` on the wipe block
   (extract it to a script with a test that runs its guards against a fake state dir).
2. Contract: the `of1-skills` contract test (status-file names vs the lab's list).
3. Lab dry run before merge: run one experiment with `of1SkillsBranch` and `skillsBranch`
   set to the PR branches. Pass: all 12 UI steps complete, hub link loads, `ready: true`
   on the worker `/status`, `result.json` `ok`, no `incomplete_pipeline`. Capture the
   baseline shape (`of1-skills` `scripts/baseline`) from that run: it becomes the golden run
   that stages 3-5 are compared to.

## Order and release

1. `of1-skills` PR #13 (hygiene) merges.
2. `of1-labs` PR (required config) merges and the image is rebuilt (safe on its own:
   it only relaxes the check).
3. `of1-skills` stages 3-6 (branch `main` stays untouched until a lab run passes on the
   branch).
4. `of1-demo-skills` PR (this spec), run in the lab on branches of both repos, then merge
   both together.

## Risks

- The lab check fails every DA-first run today; the labs PR must land (or the lab run
  uses legacy skill branches) before any test run.
- Sequential content track increases wall-clock time; measure it in the lab run.
- The driver and the wipe block together are the only remaining destructive pieces;
  the wipe keeps all fail-closed guards and its new DA deletion keeps the two-root path
  guard.
- Status files land in a different directory than the lab polls if the default
  `OF1_STATE_DIR` changes (see the `of1-skills` open question); the lab dry run verifies it.

## Out of scope

`of1-discovery`, `of1-extract-design`, `of1-prototype`, `of1-deploy` internals; the
worker template-publish fix; the portal; editing `of1-skills` skills (their own spec).
