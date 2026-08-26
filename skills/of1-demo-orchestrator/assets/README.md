# of1-demo-orchestrator assets

No assets currently ship with this skill. Stage 2's fidelity/artifact checking now lives in the
sub-skills themselves (2a `of1-extract-design` fails loud on a blocked capture; 2b `of1-prototype`
runs its own visual-diff loop; 2c `of1-deploy` runs `stardust:deploy`'s delivery checks) plus a
lightweight artifact-existence check the orchestrator does inline — see
`../knowledge/pipeline-contract.md` § "Stage 2 completion check". There is no longer a standalone
gate script here.
