# OF1 Demo Skills

## Purpose

Claude Code plugin: a 13-step Claude Code skill pipeline that turns any website into a branded OF1 generative-search demo. See `README.md` for the full pipeline diagram, step→skill table, and prerequisites — read it first.

## Entry Points

- `skills/of1-demo/` - orchestrator skill, drives the pipeline step-by-step via sprinkle UI (`/of1-demo`)
- `skills/<step-skill>/SKILL.md` - one skill per pipeline step (see `README.md` table for step order/deps)
- `.claude-plugin/marketplace.json` / `plugin.json` - plugin manifest for `claude plugins install`

## Contracts & Invariants

- Skills are ordered by data dependency, not file order — check the `Depends on` column in `README.md` before assuming a skill can run standalone.
- `of1-signals` is standalone, not a pipeline step — it authors `signals.json`, which is the **of1-preview-extension** repo's own config format, not this repo's.
- Consumes generation via the OF1 client SDK served by `of1-gen-web-service` (separate repo) — a change to that SDK's shape is a breaking change here, not a local bug.
- Plugin requires companion plugins (`adobe/skills` for EDS/stardust, `pbakaus/impeccable`) installed via `upskill` — see README `Prerequisites`.

## Related Context

- Consumer of: `of1-gen-web-service` (client SDK) — `../of1-gen-web-service/AGENTS.md`
- Sibling config for: `of1-preview-extension` (`signals.json` format) — `../of1-preview-extension/AGENTS.md`
- Umbrella repo root: `../AGENTS.md`
