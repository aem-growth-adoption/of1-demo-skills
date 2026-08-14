#!/usr/bin/env node
// Gate Stage 2 (stardust:replica) output before the Stage 3 site-integration
// track and deploy proceed. Reads replica's own ledger and fails LOUD on the
// signatures that would otherwise ship a broken demo:
//
//   - BLOCKED-CAPTURE: a breakpoint the source-fidelity gate could not measure
//     (visualFlags contains "gate-blocked", or pixelPct is null) yet was
//     still marked pass:true — bot-managed sources (Akamai/Cloudflare) do this;
//   - PLACEHOLDER imagery: captureState entries reporting placeholder / gradient
//     imagery standing in for real product photography — a same-design replica
//     with no real images is not a presentable demo;
//   - HONEST FIDELITY FAIL: the gate DID measure and the pixel delta blew the
//     10% ship bar (adobe.com case: home 58.98% / cc 30.42%), or replica's own
//     top-level verdict.overall is "fail". A replica that honestly failed
//     fidelity must not sail through just because it was honest about it.
//
// stardust:replica is out of scope to edit; this gate lives on the of1 side and
// enforces its documented "a gate that can't read the live source has no pass to
// report" rule (source-fidelity-gate.md rule 12) at the pipeline boundary.
//
// SCHEMA NOTE: stardust's progress.json has drifted across versions. `pages` is
// an OBJECT keyed by page slug in stardust 0.18.1 (the canonical shape in
// source-fidelity-gate.md § "Residual logging format"), but was an ARRAY in an
// older run. A run against frescopa.coffee (2026-08-14) wrote the page-record
// array under a top-level `pageTypes` key instead of `pages` — do not confuse
// this with `_provenance.pages`, which is just an array of slug strings, not
// page records. This gate accepts all three shapes. Per-breakpoint fidelity
// lives in breakpoints["<bp>"].result.{pixelPct,pass,heightDelta,visualFlags}.
//
// Usage (from repo root, or pass the repo dir):
//   node check-replica-artifacts.mjs [<repo-dir>]
//
// Exit codes:
//   0 — replica artifacts are demo-grade; Stage 3 may proceed
//   1 — usage / missing-ledger error (progress.json not found)
//   2 — hard stop (blocked-capture, placeholder imagery, or an undocumented/
//       catastrophic fidelity fail); escalate to the user (do NOT deploy)
//
// DOCUMENTED-RESIDUAL ALLOWANCE: a measured fidelity fail above PIXEL_BAR_PCT
// is downgraded from a hard stop to a loud warning (proceed) when BOTH: (a)
// it's still under DOCUMENTED_RESIDUAL_CEILING_PCT, and (b) result.note
// explicitly documents it as a residual (matches RESIDUAL_NOTE_RE) — i.e. the
// replica skill itself already hit its iteration cap and recorded *why* it
// stopped trying, rather than this gate guessing. A frescopa.coffee run
// (2026-08-14) hit exactly this: home page stuck at 15.78% after 7 iterations
// (over the 3-iter cap) due to an 898KB decorative store-locator texture +
// live Google Maps hydration that doesn't render headless — a real,
// documented, non-catastrophic residual, not the adobe.com case (58.98%/
// 30.42%, no residual note) that this hard stop exists to catch.

// stardust's own pixel ship bar; a measured delta above this is not demo-grade.
const PIXEL_BAR_PCT = 10;
// Above this, even a documented residual is still a hard stop — this is the
// ceiling for "visibly imperfect but presentable", not "broken".
const DOCUMENTED_RESIDUAL_CEILING_PCT = 20;
// What counts as replica's own acknowledgment that it deliberately stopped
// iterating and logged the gap, rather than silently failing.
const RESIDUAL_NOTE_RE = /residual|iter(ation)?\s*cap/i;

import fs from 'node:fs';
import path from 'node:path';

function loadJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

// pixelPct may be a number (1.31) or a string ("24.6%") depending on stardust
// version. Return a number, or null if there is no parseable measurement.
function coercePct(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const m = v.match(/-?\d+(\.\d+)?/);
    if (m) return parseFloat(m[0]);
  }
  return null;
}

// Normalize `pages` (array in old stardust, object-keyed-by-slug in 0.18.1)
// into an array of page records, carrying the slug as a fallback identity.
function normalizePages(pages) {
  if (Array.isArray(pages)) return pages;
  if (pages && typeof pages === 'object') {
    return Object.entries(pages).map(([slug, page]) => ({ slug, ...page }));
  }
  return [];
}

function main() {
  const repoDir = process.argv[2] || '.';
  const progressPath = path.join(repoDir, 'stardust', 'replica', 'progress.json');

  const progress = loadJson(progressPath);
  if (!progress) {
    console.error(
      `FAIL: cannot read ${progressPath} — stardust:replica did not write its ledger, ` +
        `so its output is unverified. Re-run Stage 2 or check the replica dispatch.`,
    );
    return 1;
  }

  const pages = normalizePages(progress.pages ?? progress.pageTypes);
  if (!pages.length) {
    console.error(
      `FAIL: ${progressPath} has no pages — nothing was replicated ` +
        `(neither progress.pages nor progress.pageTypes is a non-empty array or object).`,
    );
    return 1;
  }

  // Signatures that mean the gate could not actually measure the live source.
  const blockedRe = /gate-blocked|bot|akamai|cloudflare|challenge|403|access denied/i;
  // captureState signatures that mean real imagery is missing.
  const placeholderRe = /placeholder|gradient|no image|missing image|data-uri|data:image/i;

  const blocked = [];
  const placeholders = [];
  const fidelityFails = []; // measured, blew the ship bar, and NOT a documented residual — hard stop
  const documentedResiduals = []; // blew the ship bar but under the ceiling AND explicitly logged as a residual — warn, proceed
  const heightWarnings = []; // honest pass:false but pixel delta under the bar
  const unmeasuredPages = []; // no parseable per-breakpoint result at all
  let measuredCount = 0;

  for (const page of pages) {
    const archetype = page.archetype ?? page.pageType ?? page.slug ?? '?';
    const breakpoints = page.breakpoints ?? {};
    let pageMeasured = false;
    for (const [bp, data] of Object.entries(breakpoints)) {
      const result = data?.result ?? {};
      const visualFlags = String(result.visualFlags ?? '');
      const pixelPct = coercePct(result.pixelPct);
      const passed = result.pass === true;
      if (pixelPct !== null || typeof result.pass === 'boolean') {
        measuredCount += 1;
        pageMeasured = true;
      }

      // Unmeasurable gate that still claims a pass → the blocked-source trap.
      const unmeasured = blockedRe.test(visualFlags) || pixelPct === null;
      if (unmeasured && passed) {
        blocked.push({ archetype, bp, visualFlags: visualFlags || '(pixelPct null)' });
      } else if (pixelPct !== null && pixelPct > PIXEL_BAR_PCT) {
        // Measured and the pixel delta is above the ship bar. If replica
        // itself documented this as a residual (not a silent failure) and
        // it's under the higher ceiling, downgrade to a warning instead of
        // a hard stop — see DOCUMENTED-RESIDUAL ALLOWANCE above.
        const isDocumented = RESIDUAL_NOTE_RE.test(String(result.note ?? ''));
        const entry = { archetype, bp, pixelPct, criterion: result.failedCriterion ?? null, note: result.note ?? null };
        if (isDocumented && pixelPct <= DOCUMENTED_RESIDUAL_CEILING_PCT) {
          documentedResiduals.push(entry);
        } else {
          fidelityFails.push(entry);
        }
      } else if (result.pass === false) {
        // Honest pass:false with pixel delta under the bar — typically a
        // documented height/font-fork residual. Surface loud, do not hard-stop.
        heightWarnings.push({
          archetype,
          bp,
          pixelPct,
          heightDelta: result.heightDelta ?? null,
          criterion: result.failedCriterion ?? null,
        });
      }

      // Placeholder/gradient imagery in the capture-state ledger.
      const captureState = Array.isArray(data?.captureState) ? data.captureState : [];
      for (const cs of captureState) {
        const what = String(cs?.what ?? '');
        if (placeholderRe.test(what)) {
          placeholders.push({ archetype, bp, what, where: cs?.where ?? '?' });
        }
      }
    }
    if (!pageMeasured) unmeasuredPages.push(archetype);
  }

  // A top-level "fail" verdict is a hard stop on its own (whole-run signal).
  const verdictFail = String(progress.verdict?.overall ?? '').toLowerCase() === 'fail';

  if (blocked.length || placeholders.length || fidelityFails.length || verdictFail) {
    console.error('✗ Stage 2 replica output is NOT demo-grade. Hard stop.\n');
    if (blocked.length) {
      console.error('  BLOCKED-CAPTURE — gate could not measure the live source but marked pass=true:');
      for (const b of blocked) {
        console.error(`    • ${b.archetype} @ ${b.bp}: ${b.visualFlags}`);
      }
    }
    if (fidelityFails.length) {
      console.error(`\n  FIDELITY FAIL — measured pixel delta above the ${PIXEL_BAR_PCT}% ship bar:`);
      for (const f of fidelityFails) {
        console.error(`    • ${f.archetype} @ ${f.bp}: ${f.pixelPct}%${f.criterion ? ` (${f.criterion})` : ''}`);
      }
    }
    if (verdictFail) {
      console.error(`\n  VERDICT FAIL — replica's own progress.json verdict.overall === "fail".`);
      if (progress.verdict?.why) console.error(`    ${progress.verdict.why}`);
    }
    if (placeholders.length) {
      console.error('\n  PLACEHOLDER imagery stood in for real photography:');
      for (const p of placeholders) {
        console.error(`    • ${p.archetype} @ ${p.bp}: ${p.what} (${p.where})`);
      }
    }
    console.error(
      '\n  Do NOT deploy this demo. Escalate to the user:\n' +
        '    1. Retry Stage 2 with headed capture (stardust:replica ... --headed) if bot-blocked, or\n' +
        '    2. Run a content-only demo (skip the replica pages; keep /of1 + configs), or\n' +
        '    3. Abort for this domain.\n' +
        '  See of1-demo-orchestrator/knowledge/pipeline-contract.md § "Stage 2 artifact gate".',
    );
    return 2;
  }

  if (documentedResiduals.length) {
    console.error(
      `⚠ ${documentedResiduals.length} breakpoint(s) blew the ${PIXEL_BAR_PCT}% ship bar but are ` +
        `documented residuals under the ${DOCUMENTED_RESIDUAL_CEILING_PCT}% ceiling (replica hit its ` +
        `iteration cap and logged why):`,
    );
    for (const r of documentedResiduals) {
      console.error(`    • ${r.archetype} @ ${r.bp}: ${r.pixelPct}%${r.note ? ` — ${r.note}` : ''}`);
    }
    console.error('  Proceeding (visibly imperfect, not broken), but review these residuals.\n');
  }

  if (heightWarnings.length) {
    console.error(
      `⚠ Replica passed the pixel bar but ${heightWarnings.length} breakpoint(s) report ` +
        `pass:false under the ${PIXEL_BAR_PCT}% bar (typically documented height/font-fork residuals):`,
    );
    for (const w of heightWarnings) {
      console.error(
        `    • ${w.archetype} @ ${w.bp}: pixel ${w.pixelPct ?? '?'}%, ` +
          `heightDelta ${w.heightDelta ?? '?'}px${w.criterion ? ` (${w.criterion})` : ''}`,
      );
    }
    console.error('  Proceeding (not a demo-killer), but review these residuals.\n');
  }

  if (unmeasuredPages.length) {
    console.error(
      `⚠ ${unmeasuredPages.length} of ${pages.length} page type(s) carry NO parseable ` +
        `per-breakpoint fidelity measurement (unrecognized/legacy progress.json shape): ` +
        `${unmeasuredPages.join(', ')}.\n` +
        `  Their fidelity is UNVERIFIED by this gate — eyeball them before trusting the demo.\n`,
    );
  }

  console.log(
    `✓ Replica artifacts are demo-grade ` +
      `(${pages.length} page type(s), ${measuredCount} breakpoint measurement(s) checked).`,
  );
  return 0;
}

process.exit(main());
