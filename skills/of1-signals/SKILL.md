---
name: of1-signals
description: This skill should be used when the user asks to "simulate an acquisition signal", "fake a ChatGPT referral", "fake a Google Ads click", "add a signal to signals.json", "set up an email nurture demo", "test entry context detection", "configure signals.json", or otherwise wants the OF1 preview extension to pretend a demo visitor arrived via email, ads, an LLM app, or any other channel for a specific URL/param combination.
user-invocable: true
---

# OF1 Signals Configurator

**Standalone operator tool — NOT part of the demo pipeline.** Invoke it directly; no orchestrator
dispatches it, no step graph includes it, and `of1-check-dependencies`/`verify.sh` intentionally
does not check for it. It authors config (a DA sheet) that the sync/deploy pipeline and the OF1
worker never read. Being off the step graph is deliberate — do not wire it in.

Author and verify the `of1/config/signals` DA sheet (served as `of1/config/signals.json`) — config read by the **OF1 preview
extension** and the **OF1 edge proxy** (not the OF1 worker) that lets a demo operator fake how a visitor "arrived" at the
site, without a real email campaign, ad click, or LLM referral ever happening.

## What signals.json is for

The extension normally classifies how a visitor arrived (`EntryContext.source`/`label`) from real
signals: `document.referrer`, UTM params, `gclid`/`fbclid`/`msclkid`. The signals sheet lets a demo
operator override or supplement that classification for a URL param, purely by editing config in DA
— no code change, no real ad campaign needed.

All OF1 config lives in DA, so this is a **DA sheet at `of1/config/signals`**, never a file committed
to git. It is read by the extension's background service worker from
`https://main--<repo>--<owner>.aem.page/of1/config/signals.json`, and by the OF1 edge proxy (see of1-edge-proxy
"Edge context enrichment") from the EDS origin behind the proxy host: `aem.page` (preview) for `prev--…of1.live`
hosts, but **`aem.live` (publish) for every other host** (`main--<repo>--<owner>.of1.live`, `…--dev.of1.live`) — so the sheet must be
both previewed and published (step 5). It is not
synced to the OF1 worker/R2, not read by `/api/generate` or `/api/personalize` server-side, and does not appear
in of1-skills' `of1-integration/knowledge/worker-config-schemas.md`. (A bare JSON array committed to git is still
accepted by both readers during the transition, but must no longer be authored.)

## Priority order (highest wins)

1. **Settings "forced entry source" dev override** in the extension's side panel — always wins;
   `signals.json` is never consulted when this is active.
2. **`signals.json` match** — checked before anything else the extension would otherwise detect.
   A demo-configured signal can override even a real ads/social/search classification.
3. **Native `llm_app_ctx` query param** — if present and no `signals.json` entry matched, the
   extension classifies `source: 'ai'`, `label: 'ChatGPT'`, and uses the param's value directly as
   the free-text context. No config file involved — this is built into the extension for LLM app
   integrations that redirect back with `?llm_app_ctx=<context text>`.
4. **Referrer/UTM/click-id heuristics** (`gclid`, `fbclid`, `msclkid`, `utm_medium=email`, known AI
   referrer hosts, etc.) — the extension's built-in fallback classification.

Understanding this order matters when authoring an entry: a signals row with no
`source` (see Schema) still lets real detection (step 4) run and set those fields — the
entry only *adds* free-text context on top. A row that does set `source`
*replaces* whatever step 4 would have produced.

## Schema

The sheet has the columns `param,value,source,context`, one row per entry:

| Column | Required | Notes |
|--------|----------|-------|
| `param` | yes | URL query param name to match, e.g. `mkt_tok`, `gclid`, `demo_signal` |
| `value` | yes | Exact value that param must equal (string equality, no wildcards) |
| `source` | no | Free-form string overriding the classified acquisition source (e.g. `email`, `ads`, `ai`, or any new channel name). Empty keeps whatever real detection determines. |
| `context` | no | Free-text string shown in the side panel's "Signal context" card, and forwarded to the OF1 worker as the `injected_context` acquisition param on Personalize/Generate. |

All cells are plain strings (an empty cell means "not set"). Cells may contain `\n` newlines but no other
control characters; the writer rejects them. First row whose `param`+`value` match wins; list more specific
rows first if a URL could match more than one. Authoring uses a JSON array of entries
`{param, value, source?, context?}` (the converter turns it into rows). The older `pathPattern` and `label`
fields are not authored any more.

**Two entry shapes:**

```json
{
  "param": "mkt_tok",
  "value": "demo-q3-nurture-multientity",
  "source": "email",
  "context": "Existing customer, Q3 nurture campaign, evaluating multi-entity consolidation."
}
```
Full override — sets source and context. Use this for a channel that has no real detection path (email,
most demo-only params) or when the demo needs a specific source regardless of real detection.

```json
{
  "param": "gclid",
  "value": "Cj0KCQjwk96lBhDHARIsAEKO4xZyfbWi5R9a1Q2jr5glBHkFimC_K49jFdIuzJc_jiVcOlShev2DA98aAvFFEALw_wcB",
  "context": "WKND Adventures | Guided Trips for Every Explorer\nStop scrolling generic travel sites — get itineraries matched to your pace, budget, and terrain preference in minutes, not hours."
}
```
Context-only — no `source`. `gclid` already triggers real ads detection; this entry just attaches specific
ad-copy context on top, keyed to one known ad's click ID. Use this shape whenever the param already triggers
correct real detection and the demo only needs richer context text.

## Authoring a new signal (guided)

When a user wants to simulate a new arrival scenario:

1. Ask what the scenario is (a specific email campaign, a specific paid ad, an LLM app referral,
   or a wholly invented future channel) and what free-text context should show.
2. Decide `param`/`value`:
   - Reuse a real, already-detected click-id param (`gclid`, `fbclid`, `msclkid`) or
     `utm_medium=email` when the scenario should keep real classification and only add context —
     use the context-only shape (no `source`/`label`).
   - Use an arbitrary custom param (e.g. `demo_signal`, or a campaign-specific param like
     `mkt_tok`) with a demo-chosen value when the scenario needs a channel real detection can't
     produce, or needs a specific label regardless of real signals — use the full-override shape.
   - Do not use `llm_app_ctx` as the `param` in a `signals.json` entry — it is already natively
     handled by the extension (priority 3 above) and does not need a config entry. To simulate an
     LLM app referral, send the visitor to `?llm_app_ctx=<context text>` directly.
3. Collect the entries to author (existing ones plus the new one). To keep existing entries, fetch the
   current sheet first:
   ```bash
   curl -s "https://main--<repo>--<owner>.aem.page/of1/config/signals.json" | jq '[.data[] | {param,value,source,context}]'
   ```
   (a 404 just means no sheet yet). Write the full array of entries, most specific first, to a temp file,
   e.g. `$OF1_STATE_DIR/signals-entries.json` or `$(mktemp)`.
4. Upload, preview on `main`, and verify with the bundled writer. It converts entries to sheet rows, rejects
   cells a sheet cannot hold, refuses an empty list, uploads `of1/config/signals` to DA, previews it, then
   fetches `https://main--<repo>--<owner>.aem.page/of1/config/signals.json` and checks it parses as a sheet
   with exactly the rows written. Token comes from `DA_TOKEN`, `ADOBE_IMS_TOKEN` or `OF1_TOKEN_FILE`.
   ```bash
   node "${CLAUDE_SKILL_DIR}/assets/write-signals.mjs" --owner <owner> --repo <repo> --rows <entries.json>
   ```
   It exits non-zero with a `FAIL`/`FATAL` message on any problem; do not report success otherwise. Nothing
   is committed to git (a stale `of1/config/signals.json` file in the repo should be removed in a normal commit).
5. Publish the sheet too. The writer only previews, which is enough for the extension and for
   `prev--main--<repo>--<owner>.of1.live`, but the edge proxy on the live hosts
   (`main--<repo>--<owner>.of1.live`, also with `--dev`) reads `aem.live` and keeps serving the last *published* sheet (or none)
   until you publish. Either click **Publish** on `/of1/config/signals` in DA, or trigger it via the admin
   API with both auth headers (same token as step 4; `common-pitfalls.md` §8.1):
   ```bash
   curl -fsS -X POST -H "Authorization: Bearer $DA_TOKEN" -H "x-content-source-authorization: Bearer $DA_TOKEN" \
     "https://admin.hlx.page/live/<owner>/<repo>/main/of1/config/signals.json"
   curl -s "https://main--<repo>--<owner>.aem.live/of1/config/signals.json" | jq '.data | length'
   ```
   (`of1-skills:of1-publish` with `publish-live` / `OF1_PUBLISH_LIVE=1` also publishes `signals` with the other
   config sheets, but it is a full sync — overkill for a signals-only edit.) Skip this only if the demo is
   exercised exclusively through the extension or `prev--` hosts.
6. Hand the user the exact test URL: `https://main--<repo>--<owner>.aem.page/<path>?<param>=<value>` for the
   extension, or `https://main--<repo>--<owner>.of1.live/<path>?<param>=<value>` for the edge proxy (published sheet)
   (include any other params the scenario narrative needs, e.g. `&utm_medium=email` alongside a
   `mkt_tok` value, purely for narrative realism — the extension and proxy only check the configured
   `param`/`value`, not surrounding params).

If `$OF1_STATE_DIR/repo-config.json` exists (this skill is running inside an `of1-demo-orchestrator` pipeline
session), read `previewUrl`/`repoDir` from it instead of asking the user for the repo/branch/owner:
```bash
REPO_CONFIG=$(cat "$OF1_STATE_DIR/repo-config.json" 2>/dev/null)
if [ -n "$REPO_CONFIG" ]; then
  PREVIEW_URL=$(jq -r .previewUrl <<<"$REPO_CONFIG")
  REPO_DIR=$(jq -r .repoDir <<<"$REPO_CONFIG")
fi
```
Otherwise ask the user for the repo path/URL directly — this skill runs standalone as often as it
runs inside the pipeline.

## Verifying the extension picks it up

Entry context is captured once per domain and cached until cleared — a signal added or edited
after a domain was already visited will NOT retroactively apply. Before testing:

1. In the extension's side panel, open **Settings** for the domain and click **Clear data**.
2. Navigate to the test URL from step 6 above.
3. Confirm the **Insights** tab shows the expected "Arrived via" label and a "Signal context" card
   with the expected text.
4. To confirm the context actually reaches the worker (not just the side panel display), open
   `chrome://extensions` → the extension's **service worker** link → **Network** tab, click
   Personalize/Generate, and inspect the `POST /api/personalize` request body for
   `acquisition.injected_context`. (Using "Open OF1" instead of Personalize forwards it as a
   `injected_context` URL query param on the opened tab instead — visible directly in the address
   bar.)
