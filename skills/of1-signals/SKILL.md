---
name: of1-signals
description: This skill should be used when the user asks to "simulate an acquisition signal", "fake a ChatGPT referral", "fake a Google Ads click", "add a signal to signals.json", "set up an email nurture demo", "test entry context detection", "configure signals.json", or otherwise wants the OF1 preview extension to pretend a demo visitor arrived via email, ads, an LLM app, or any other channel for a specific URL/param combination.
user-invocable: true
---

# OF1 Signals Configurator

Author and verify `of1/config/signals.json` — a config file read directly by the **OF1 preview
extension** (not the OF1 worker) that lets a demo operator fake how a visitor "arrived" at the
site, without a real email campaign, ad click, or LLM referral ever happening.

## What signals.json is for

The extension normally classifies how a visitor arrived (`EntryContext.source`/`label`) from real
signals: `document.referrer`, UTM params, `gclid`/`fbclid`/`msclkid`. `signals.json` lets a demo
operator override or supplement that classification for one specific URL, purely by editing a
JSON file on the EDS site — no code change, no real ad campaign needed.

This is **extension-only config**. It is fetched directly by the extension's background service
worker from `https://<branch>--<repo>--<owner>.aem.page/of1/config/signals.json` — it is never
synced to the OF1 worker/R2, never read by `/api/generate` or `/api/personalize` server-side, and
does not appear in `of1-demo-orchestrator`'s worker-config-schemas.md.

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

Understanding this order matters when authoring an entry: a `signals.json` entry with no
`source`/`label` (see Schema) still lets real detection (step 4) run and set those fields — the
entry only *adds* free-text context on top. A `signals.json` entry that does set `source`/`label`
*replaces* whatever step 4 would have produced.

## Schema

`of1/config/signals.json` is a flat JSON array. Each entry:

| Field | Required | Notes |
|-------|----------|-------|
| `param` | yes | URL query param name to match, e.g. `mkt_tok`, `gclid`, `demo_signal` |
| `value` | yes | Exact value that param must equal (string equality, no wildcards) |
| `pathPattern` | no | Regex string tested against `location.pathname` via `new RegExp(pathPattern).test(pathname)` — plain, unanchored (write `^/pricing` explicitly for a prefix match). Omit to match any path. |
| `source` | no | Free-form string overriding the classified acquisition source (e.g. `email`, `ads`, `ai`, or any new channel name — not restricted to a fixed enum). Omit to keep whatever real detection determines. |
| `label` | no | Free-form display label shown in the side panel's "Arrived via" row (e.g. `E-Mail`, `Google Ads`). Omit alongside `source`. |
| `context` | yes | Free-text string shown in the side panel's "Signal context" card, and forwarded to the OF1 worker as the `injected_context` acquisition param when the user clicks Personalize/Generate. |

First entry whose `param`+`value` (and `pathPattern`, if present) match wins — list more specific
entries first if a URL could match more than one.

**Two entry shapes:**

```json
{
  "param": "mkt_tok",
  "value": "demo-q3-nurture-multientity",
  "source": "email",
  "label": "E-Mail",
  "context": "Existing customer, Q3 nurture campaign, evaluating multi-entity consolidation."
}
```
Full override — sets source, label, and context. Use this for a channel that has no real
detection path (email, most demo-only params) or when the demo needs a specific label regardless
of what real detection would say.

```json
{
  "param": "gclid",
  "value": "Cj0KCQjwk96lBhDHARIsAEKO4xZyfbWi5R9a1Q2jr5glBHkFimC_K49jFdIuzJc_jiVcOlShev2DA98aAvFFEALw_wcB",
  "context": "WKND Adventures | Guided Trips for Every Explorer\nStop scrolling generic travel sites — get itineraries matched to your pace, budget, and terrain preference in minutes, not hours."
}
```
Context-only — no `source`/`label`. `gclid` already triggers real ads detection (source `ads`,
label `Google Ads`); this entry just attaches specific ad-copy context on top of that real
classification, keyed to one known ad's click ID. Use this shape whenever the param already
triggers correct real detection and the demo only needs to add richer context text.

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
3. Add `pathPattern` only if the signal should apply on some pages but not others (e.g. an email
   campaign that only makes sense landing on `/pricing`).
4. Read the current file (if it exists) at `of1/config/signals.json` in the target repo, append
   the new entry (don't clobber existing entries — list more specific/narrower entries first if
   overlap is possible), and write it back with `python3 -m json.tool <file> > /dev/null` to
   confirm valid JSON before committing.
5. Commit and push. Confirm live with:
   ```bash
   curl -s https://<branch>--<repo>--<owner>.aem.page/of1/config/signals.json
   ```
   (a 404 means the push hasn't propagated to EDS preview yet, or the path is wrong — check
   `of1/config/signals.json` is committed at the repo root, not nested).
6. Hand the user the exact test URL: `https://<branch>--<repo>--<owner>.aem.page/<path>?<param>=<value>`
   (include any other params the scenario narrative needs, e.g. `&utm_medium=email` alongside a
   `mkt_tok` value, purely for narrative realism — the extension only checks the configured
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
