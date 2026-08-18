# of1-demo-orchestrator assets

- `check-replica-artifacts.mjs` — Stage 2 artifact gate. Run after `replica-done.json`
  appears and **before** dispatching the Stage 3 site-integration track or deploying.
  Reads `stardust/replica/progress.json` and hard-stops (exit 2) on blocked-capture
  signatures: an unmeasured source-fidelity gate marked `pass:true`, and/or
  placeholder/gradient imagery standing in for real photography (the apple.com/Akamai
  failure mode). Exit 0 = demo-grade, exit 1 = missing ledger. See
  `../knowledge/pipeline-contract.md` § "Stage 2 artifact gate".
- `rehost-page-images.mjs` — Stage 2 image self-hosting. Run after `stardust:replica`
  and **before** writing `replica-done.json`. Replica leaves content-page `<img src>`
  hotlinked to the customer CDN; this downloads each external image, uploads it to DA
  media, previews it into the Media Bus, rewrites the srcs to the site's `/media/` URL,
  and re-authors the pages. Exits non-zero if any image can't be self-hosted (gate the
  step on it). Invoke from inside the repo:
  `node "$SKILL_DIR/assets/rehost-page-images.mjs" --owner "$OWNER" --repo "$REPO" --branch "$BRANCH"`.
  See `../knowledge/common-pitfalls.md` §2.6 and `../knowledge/dispatch-cc.md`.
