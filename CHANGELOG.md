# Changelog

## 0.3.0

Breaking: requires `of1-skills` 0.3.0 or later.

- Stage 3 is one inline `of1-skills:of1-integration content-source=<DOMAIN> non-interactive cta-template` call; the orchestrator no longer dispatches individual `of1-skills` skills and reads `$OF1_STATE_DIR/of1-integration-result.json` for the outcome.
- `OF1_PIPELINE_MODE` is gone. `OF1_STAGE2_DONE_FILE` (`stage2-done.json`) is still written by `of1-deploy` for external progress tooling but no longer gates Stage 3.
- The Phase 0a wipe is now `skills/of1-demo-orchestrator/scripts/wipe.sh` (tested, still fail-closed, requires `OF1_DEMO_WIPE=1`). It also removes the OF1-owned DA (`/of1/**`, `/templates/**`) and git (`blocks/of1/`) paths that `of1-check-dependencies` no longer removes.
- SLICC support removed (runtime detection, `dispatch-slicc.md`, the sprinkle UI template). Claude Code only.
- Removed stale audit files and rewrote the README for the current pipeline; added `AGENTS.md` and a docs index.
- `pipeline-version` now holds the plugin version (`0.3.0`) instead of the graph name `v5-deploy`, and a test keeps it equal to `plugin.json`. The lab must run the release that understands semver (of1-labs `feat/pipeline-version-semver`) before this lands: a harness that only knows `v4|v5|v5-prototype|v5-deploy` falls back to guessing from the skills branch name.

## 0.2.0

Earlier releases: see git history.
