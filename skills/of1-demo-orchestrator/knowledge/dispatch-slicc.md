# Dispatch mechanics — SLICC runtime

Read this when `of1-demo-orchestrator` detects it is running in **SLICC** (the `scoop_scoop` /
`sprinkle` primitives are available; `Agent`/`TaskCreate` are not). It supplies the SLICC-specific
*how*; the runtime-agnostic *what* (stage model, step graph, nesting cap, audit schema) lives in
`SKILL.md` and `pipeline-contract.md`.

## Required model versions

- `claude-opus-4-8` → Opus 4.8 (`us.anthropic.claude-opus-4-8`)
- `claude-sonnet-5` → Sonnet 5 1M context (`us.anthropic.claude-sonnet-5`)

Model per skill: Stage 1 + Stage 2 = `claude-opus-4-8`. Stage 3 = adopt-site's table — Opus for
`of1-style-generative-block` and the extraction step when it runs; omit `model` (Sonnet) for the rest.

## Setup — open the sprinkle

```
scoop_scoop({
  name: "of1-demo-orchestrator",
  writablePaths: ["/scoops/of1-demo-orchestrator/", "/shared/sprinkles/of1-demo-orchestrator/"],
  prompt: "You own the sprinkle 'of1-demo-orchestrator'. Copy /workspace/skills/of1-demo-orchestrator/of1-demo-orchestrator.shtml to /shared/sprinkles/of1-demo-orchestrator/of1-demo-orchestrator.shtml, then run: sprinkle open of1-demo-orchestrator. Stay ready for feed_scoop updates."
})
```

The sprinkle must stay open and receiving updates throughout. After each step completes, push its
status via `sprinkle send of1-demo-orchestrator '<json>'`. **Only this cone calls `sprinkle send`** —
step scoops write files; the cone reads them and pushes.

## Lick events (sprinkle → cone)

Licks arrive as a single `action` string with colon-delimited fields.

- **`set-domain:<domain>`** — store the domain. Setting a new domain resets ALL step states
  client-side (the sprinkle wipes steps/deliverables when `data.domain` ≠ `state.domain`). So always
  send `set-domain` FIRST before pushing any step status for a new run; no manual per-step reset needed.
- **`run:<domain>`** — dispatch Stage 1.
- **`approve:<skill>:<domain>`** — the user approved a review-gated Stage 3 skill; the sprinkle
  auto-marks it done. If it unblocks downstream skills (per adopt-site's dependency table), dispatch
  the next eligible batch now.
- **`revise:<skill>:<domain>`** — ask in chat what to change, then re-dispatch just that skill's scoop
  with feedback appended.
- **`reset`** — clean up any running scoops.

## Scoop naming

`of1-s1-discovery`, `of1-s2-replica`, and one per Integrate-stage skill — `of1-s3-<skill>[-<phase>]`
(e.g. `of1-s3-brand`, `of1-s3-content`, `of1-s3-styling`, `of1-s3-suggest`, `of1-s3-cta`). The
`of1-build-templates` phases become `of1-s3-templates-base`, `of1-s3-templates-intent-comparison`,
… `of1-s3-templates-intent-discovery`, `of1-s3-templates-assemble`. The skill (and phase) keeps the
sprinkle subStep mapping unambiguous.

## Stage 1 dispatch

```
scoop_scoop({
  name: "of1-s1-discovery",
  model: "claude-opus-4-8",
  writablePaths: ["/scoops/of1-s1-discovery/", "/shared/", "/workspace/{REPO_NAME}/"]
})
```

System prompt MUST include, in this order:

```
## FIRST — MANDATORY (do this before anything else)
Run: read_file /workspace/skills/of1-discovery/SKILL.md
Then follow those instructions EXACTLY. Do NOT improvise your own implementation.

## Project context
- Domain: {DOMAIN}
- Branch: {BRANCH}
- Repo: /workspace/of1-demo-orchestrator (owner and repo read from repo-config.json)
- State dir: /shared/of1-demo-orchestrator
- repo-config.json: /shared/of1-demo-orchestrator/repo-config.json (read it for all paths)

## Output contract
Write status to /shared/of1-demo-orchestrator/of1-discovery-status.json (the skill's own Completion
section documents this exact filename/shape):
{"stage":1,"skill":"of1-discovery","status":"review","deliverables":[{"url":"...","label":"..."}],"summary":"..."}
Also write /shared/of1-demo-orchestrator/narrative.json per the skill's §4b.
Do NOT call sprinkle send — only the orchestrator cone does that.
```

After Stage 1 returns:

```bash
NARRATIVE=$(cat /shared/of1-demo-orchestrator/narrative.json)
SLUGS=$(jq -r '.keyPages[].slug' <<<"$NARRATIVE" | paste -sd, -)
DOMAIN=$(jq -r .domain <<<"$NARRATIVE")
```

## Stage 2 + Stage 3 content track (same turn)

```
scoop_scoop({
  name: "of1-s2-replica",
  model: "claude-opus-4-8",
  writablePaths: ["/scoops/of1-s2-replica/", "/shared/", "/workspace/{REPO_NAME}/"]
})
```

Stage 2 prompt: invoke `stardust:replica https://<DOMAIN> --pages <SLUGS>` (bounded mode). Follow it
exactly. On success: `echo '{"stage":2,"status":"done"}' > /shared/of1-demo-orchestrator/replica-done.json`.
End with a `{"stage":2,"skill":"stardust:replica",...}` status block — the sprinkle renders it under the Replica stage.

In the SAME turn, dispatch the two content-track scoops (need only the live site; omit `model`):

```
scoop_scoop({ name: "of1-s3-brand",   writablePaths: ["/scoops/of1-s3-brand/", "/shared/", "/workspace/{REPO_NAME}/"],   env: { OF1_PIPELINE_MODE: "1", OF1_CONTENT_SOURCE: "<DOMAIN>" } })
scoop_scoop({ name: "of1-s3-content", writablePaths: ["/scoops/of1-s3-content/", "/shared/", "/workspace/{REPO_NAME}/"], env: { OF1_PIPELINE_MODE: "1", OF1_CONTENT_SOURCE: "<DOMAIN>" } })
```

## Stage 3 dispatch (Integrate skills)

Use `of1-integration` (its "Dispatch → SLICC" column + dependency-trigger table) as the
reference for what each skill does and its dependency edges — the cone is the dispatcher.

- Each Integrate-stage skill (and each `of1-build-templates` phase) is its own `scoop_scoop()`
  (writablePaths incl. repo + `/shared/`, env `OF1_PIPELINE_MODE=1`, plus
  `OF1_CONTENT_SOURCE=<DOMAIN>` for `of1-build-quick-suggestions`).
- **When `replica-done.json` exists, run the Stage 2 artifact gate BEFORE fanning out the
  site-integration track.** `replica-done.json` only means the Stage 2 scoop finished, not that the
  replica is demo-grade. In the cone's own context run:

  ```bash
  node "<orchestratorSkillDir>/assets/check-replica-artifacts.mjs" "/workspace/{REPO_NAME}"
  ```

  - **exit 0** — proceed (may print `⚠` warnings for under-bar residuals or legacy-shape pages; note
    them but proceed). **exit 2** — HARD STOP: replica NOT demo-grade — BLOCKED-CAPTURE (bot-protected,
    unmeasured "pass"), placeholder imagery, FIDELITY FAIL (measured pixel diff above the 10% bar), or
    VERDICT FAIL (`verdict.overall: "fail"`). Do not dispatch Stage 3 or deploy; surface the gate's
    escalation options via `sprinkle` and wait for the user. **exit 1** — replica ledger missing;
    re-dispatch Stage 2. See `pipeline-contract.md` § "Stage 2 artifact gate".

- **Fan out at every eligible point** once the gate passes (exit 0), following the dependency edges
  in `of1-integration` § "Pipeline-mode timing" — do not re-derive them here. The site track's first
  fan-out is the extraction step (if `DESIGN.json` absent) → `of1-build-templates`(base) ∥
  `of1-style-generative-block` ∥ `of1-build-cta-template`; the content track (`of1-extract-brand-voice`
  ∥ `of1-extract-content` → `of1-build-quick-suggestions`) was already dispatched in the Stage 2 turn
  above. `of1-generate-config-review` and `of1-publish` run inline.
- Each scoop reads its own skill first and writes `of1-<skill>-status.json` (phase scoops of
  `of1-build-templates` write `of1-build-templates-<phase>-status.json`); does NOT call
  `sprinkle send`.

## Handling completions (event-driven, NOT polling)

Every scoop notifies the cone on completion. On each notification:
1. Read the scoop's `of1-<skill>-status.json` / deliverable output.
2. Push it to the sprinkle immediately (do NOT batch completions).
3. Check whether it unblocks the next dispatch (per adopt-site's dependency table) and fan out the
   next eligible batch in the same turn.
4. The pipeline is complete when `of1-publish` (deploy) returns `done`.

**Do NOT use `while/sleep` polling loops** — they block your turn and prevent you from receiving
other licks. The platform notifies you; yield and wait.

## Stage 3 sub-progress (cone → sprinkle)

The cone owns the step scoops, so it drives the sprinkle's Stage-3 sub-step rows directly. On each
completion, read `$SKILL_OR_PHASE` from the status file's `.skill` field (`jq -r .skill <of1-<skill>-status.json>`
— NOT the scoop slug, which is shortened) and status S, then map it to the subStep key and push:

```bash
case "$SKILL_OR_PHASE" in
  of1-build-templates*)        KEY=templates ;;   # base | intent-* | assemble | main
  of1-style-generative-block)  KEY=styling ;;
  of1-extract-brand-voice)     KEY=brand ;;
  of1-extract-content)         KEY=content ;;
  of1-build-quick-suggestions) KEY=suggest ;;
  of1-build-cta-template)      KEY=cta ;;
  of1-generate-config-review)  KEY=config ;;
  of1-publish)                 KEY=deploy ;;
  *)                           KEY="" ;;
esac
[ -n "$KEY" ] && sprinkle send of1-demo-orchestrator "{\"stage\":3,\"subStep\":\"$KEY\",\"status\":\"$S\"}"
```

- When the cone dispatches a skill, push `{"stage":3,"subStep":"$KEY","status":"active"}` so the row
  animates; on completion push the terminal status.
- Keep pushing the top-level `{"stage":3,"status":...}` (active when the first skill starts, done when
  `of1-publish` returns).
- **subStep keys are EXACTLY** `brand, content, suggest, templates, styling, cta, config, deploy` —
  they must match the sprinkle's `subSteps[]` keys or the row won't update.

## scoop_wait timeout policy

For long-running scoops (Stage 2 replica, the OF1-styling `of1-style-generative-block`) set a generous timeout:

```
scoop_wait({ scoop_names: ["of1-s2-replica"], timeout_ms: 1800000 })  // 30 minutes
```

`timeout_ms` does NOT kill the scoop — it only wakes the cone. When it fires:
1. Do NOT immediately `drop_scoop` — the scoop is likely still working.
2. Check whether expected output files exist (`ls stardust/current/` for Stage 2; `ls of1/config/`
   for the content track).
3. If files exist but the status file doesn't: it's in its final steps (commit/push/status-write) —
   wait another minute or let the notify lick arrive.
4. Only `drop_scoop` if silent for 5+ minutes AND no output files.

There is no hard scoop execution timeout in SLICC; the 30-minute wait is just the cone's patience.

## One-shot mode / auto-approve

Default is auto-approve: on `"status":"review"`, push the review status (so the user CAN review),
immediately treat it as approved, and proceed. If the user later clicks "Revise", handle reactively.
"One shot" (triggered by "one shot a demo of X" etc.) is the same behavior made explicit — zero
approval gates, all deliverables still generated/committed (`of1-publish`'s checklist still runs), sprinkle
still updated with every step status + deliverable URLs, Stage 2 + the content track concurrent. Only
pause between steps if the user explicitly says "pause"/"wait for my review".

## State files (SLICC)

The complete state-file inventory lives in `pipeline-contract.md` § "State files". On SLICC they
sit under `/shared/of1-demo-orchestrator/` (same file names as CC). Do not write
`stage-<N>-summary.json` or `pipeline.log` — those were never real; the audit + per-step status
files are the only run records.

## Audit capture (SLICC-specific)

Write the audit per `pipeline-contract.md` § "Pipeline audit schema". SLICC has no `<usage>` block:
- Timing: stamp start at `scoop_scoop()`, end when the status file appears.
  ```bash
  STAGE_START=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  # …on completion notification:
  STAGE_END=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  STAGE_DURATION_MS=$(( $(date +%s -d "$STAGE_END") - $(date +%s -d "$STAGE_START") ))
  ```
- Token counts: from `list_scoops` if available, else `null`.
- Skill version: `SKILL_PLUGIN_DIR="/workspace/skills"`, then `git rev-parse --short HEAD` /
  `git branch --show-current`.

Push the audit as a final sprinkle event:
```bash
sprinkle send of1-demo-orchestrator '{"type":"audit","file":"/shared/of1-demo-orchestrator/pipeline-audit.json"}'
```

## SLICC inline-execution gotchas

The cone itself runs little inline (reading `narrative.json`, building the slug list, pushing
sprinkle status, inline `of1-generate-config-review`/`of1-publish`). For those:
1. **`set -o pipefail` is not supported** — execute commands manually.
2. **`python3` heredocs must use a quoted delimiter** (`python3 << 'EOF'`) — see `common-pitfalls.md` §7.4; `node`/`jq` are also fine. The shipped build tools are `.mjs` run via `node` (§7.1). Don't rely on synchronous subprocess calls inside a script.
3. **Sprinkle valid statuses** — only `pending`, `active`, `done`, `review`, `failed`. Anything else
   corrupts the UI state.

For the IMS token, DA upload commands, and preview-trigger curls, follow `common-pitfalls.md`
§5, §7, §8 (they carry both `[SLICC]` and `[CC]` variants).
