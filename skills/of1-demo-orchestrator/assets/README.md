# of1-demo-orchestrator assets

- `check-replica-artifacts.mjs` — Stage 2 artifact gate. Run after `replica-done.json`
  appears and **before** dispatching the Stage 3 site-integration track or deploying.
  Reads `stardust/replica/progress.json` and hard-stops (exit 2) on blocked-capture
  signatures: an unmeasured source-fidelity gate marked `pass:true`, and/or
  placeholder/gradient imagery standing in for real photography (the apple.com/Akamai
  failure mode). Exit 0 = demo-grade, exit 1 = missing ledger. See
  `../knowledge/pipeline-contract.md` § "Stage 2 artifact gate".
