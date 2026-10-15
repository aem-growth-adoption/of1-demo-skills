# of1-demo-skills

Claude Code plugin: skills that build an OF1 demo for a domain. `CLAUDE.md` is a symlink to this file.

## Layout

- `skills/of1-demo-orchestrator/` - entry skill. `SKILL.md` (flow), `knowledge/` (`dispatch-cc.md` Stage 1/2 dispatch, `pipeline-contract.md`, `common-pitfalls.md`), `scripts/wipe.sh` (+ test).
- `skills/of1-discovery`, `of1-prototype`, `of1-deploy` - Stage 1 and Stage 2b/2c (2a `of1-extract-design` ships in `of1-skills`). `of1-signals` is standalone.
- `docs/` - specs and plans (index: `docs/README.md`). `pipeline-version` is read by of1-labs and holds the plugin semver (keep equal to `.claude-plugin/plugin.json`); do not change it casually.

## Conventions

- Claude Code only; no runtime detection and no pipeline-mode env flag.
- Stage 3 is exactly one inline `Skill` call to `of1-skills:of1-integration` (never via `Agent`; subagents cannot dispatch subagents). Do not dispatch or read internals of individual `of1-skills` skills; the only interface is `$OF1_STATE_DIR/of1-integration-result.json`. Pass `publish-live` (older `of1-skills` ignore it; tolerate that). Tenant config lives in DA sheets, not git; tenant id is `org/repo`.
- Requires `of1-skills` >= 0.4.0 (step 0b checks the installed version when discoverable; otherwise it is a manual precondition).
- `of1-skills` skills cite `common-pitfalls.md` §2, §3, §6, §9: keep those numbers stable.
- `scripts/wipe.sh` is destructive. Keep every fail-closed guard and the `da_delete_tree` two-root guard (`/of1`, `/templates`); `OF1_DEMO_WIPE=1` must be set by the caller in the same invocation, never inside the script.
- Skill ids and the orchestrator name `of1-demo-skills:of1-demo-orchestrator` are a stable caller contract; the orchestrator writes no result file.
- Docs: new specs/plans carry a `Status:` header and get a row in `docs/README.md`.

## Tests

`node --test skills/of1-demo-orchestrator/scripts/*.test.mjs skills/*/assets/*.test.mjs`
