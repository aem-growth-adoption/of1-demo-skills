# Changelog

## Unreleased

## 0.3.1

- Stage 3 passes `publish-live` (`of1-skills:of1-integration content-source=<DOMAIN> non-interactive cta-template publish-live`); older `of1-skills` ignore it.
- Fixed stale docs: tenant id is `org/repo`, proxy host `<branch>--<repo>--<owner>.of1.live`, config lives in DA sheets.
- `wipe.sh` sends the DA token via `curl -K -` (stdin) instead of a command-line header.
- `pipeline-version` and plugin version bumped to 0.3.1.

- `pipeline-version` is now the plugin semver (`0.3.0`) instead of the graph name `v5-deploy`. of1-labs (prod since 2026-10-13, #233) maps 0.N.x with N >= 3 to the v5-deploy graph. Keep it equal to `.claude-plugin/plugin.json` on each release.

## 0.3.0

Breaking: requires `of1-skills` 0.3.0 or later.

- Stage 3 is one inline `of1-skills:of1-integration content-source=<DOMAIN> non-interactive cta-template` call; the orchestrator no longer dispatches individual `of1-skills` skills and reads `$OF1_STATE_DIR/of1-integration-result.json` for the outcome.
- `OF1_PIPELINE_MODE` is gone. `OF1_STAGE2_DONE_FILE` (`stage2-done.json`) is still written by `of1-deploy` for external progress tooling but no longer gates Stage 3.
- The Phase 0a wipe is now `skills/of1-demo-orchestrator/scripts/wipe.sh` (tested, still fail-closed, requires `OF1_DEMO_WIPE=1`). It also removes the OF1-owned DA (`/of1/**`, `/templates/**`) and git (`blocks/of1/`) paths that `of1-check-dependencies` no longer removes.
- SLICC support removed (runtime detection, `dispatch-slicc.md`, the sprinkle UI template). Claude Code only.
- Removed stale audit files and rewrote the README for the current pipeline; added `AGENTS.md` and a docs index.
- `pipeline-version` is unchanged (`v5-deploy`).

## 0.2.0

Earlier releases: see git history.
