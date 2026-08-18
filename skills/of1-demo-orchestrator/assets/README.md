# of1-demo-orchestrator assets

- `check-liftoff-artifacts.mjs` — Stage 2 artifact gate (current, v6). Run after
  `liftoff-done.json` appears and **before** dispatching the Stage 3 site-integration track
  or deploying. Reads `stardust/liftoff/progress.json` and hard-stops (exit 2) if any page
  failed to render, failed lint, threw a JS error, or was never human-approved. Exit 0 =
  demo-grade, exit 1 = missing/empty ledger. See `../knowledge/pipeline-contract.md`
  § "Stage 2 artifact gate".
- `fixtures/liftoff-clean.json` — sample clean `stardust/liftoff/progress.json` ledger used to
  sanity-check `check-liftoff-artifacts.mjs`'s wiring.
- `check-replica-artifacts.mjs` — **retired (v5, `stardust:replica`-era gate).** Stage 2 is now
  `of1-liftoff`, which never produces `stardust/replica/progress.json`; nothing in the current
  contract invokes this script. Left in place for history; do not wire it back up.
