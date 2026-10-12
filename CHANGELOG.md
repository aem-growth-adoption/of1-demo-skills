# Changelog

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
