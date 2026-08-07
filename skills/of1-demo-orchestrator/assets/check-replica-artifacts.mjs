#!/usr/bin/env node
// Gate Stage 2 (stardust:replica) output before the Stage 3 site-integration
// track and deploy proceed. Reads replica's own ledger and fails LOUD on the
// blocked-capture signatures that would otherwise ship a broken demo:
//
//   - a breakpoint the source-fidelity gate could not measure
//     (visualFlags contains "gate-blocked", or pixelPct is null) yet was
//     still marked pass:true — bot-managed sources (Akamai/Cloudflare) do this;
//   - captureState entries reporting placeholder / gradient imagery standing in
//     for real product photography — a same-design replica with no real images
//     is not a presentable demo.
//
// stardust:replica is out of scope to edit; this gate lives on the of1 side and
// enforces its documented "a gate that can't read the live source has no pass to
// report" rule (source-fidelity-gate.md rule 12) at the pipeline boundary.
//
// Usage (from repo root, or pass the repo dir):
//   node check-replica-artifacts.mjs [<repo-dir>]
//
// Exit codes:
//   0 — replica artifacts are demo-grade; Stage 3 may proceed
//   1 — usage / missing-ledger error (progress.json not found)
//   2 — BLOCKED-CAPTURE: hard stop; escalate to the user (do NOT deploy)

import fs from 'node:fs';
import path from 'node:path';

function loadJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
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

  const pages = Array.isArray(progress.pages) ? progress.pages : [];
  if (!pages.length) {
    console.error(`FAIL: ${progressPath} has no pages[] — nothing was replicated.`);
    return 1;
  }

  // Signatures that mean the gate could not actually measure the live source.
  const blockedRe = /gate-blocked|bot|akamai|cloudflare|challenge|403|access denied/i;
  // captureState signatures that mean real imagery is missing.
  const placeholderRe = /placeholder|gradient|no image|missing image|data-uri|data:image/i;

  const blocked = [];
  const placeholders = [];

  for (const page of pages) {
    const archetype = page.archetype ?? page.pageType ?? '?';
    const breakpoints = page.breakpoints ?? {};
    for (const [bp, data] of Object.entries(breakpoints)) {
      const result = data?.result ?? {};
      const visualFlags = String(result.visualFlags ?? '');
      const pixelPct = result.pixelPct;
      const passed = result.pass === true;

      // Unmeasurable gate that still claims a pass → the blocked-source trap.
      const unmeasured = blockedRe.test(visualFlags) || pixelPct === null || pixelPct === undefined;
      if (unmeasured && passed) {
        blocked.push({ archetype, bp, visualFlags: visualFlags || '(pixelPct null)' });
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
  }

  if (blocked.length || placeholders.length) {
    console.error('✗ BLOCKED-CAPTURE — Stage 2 replica output is NOT demo-grade. Hard stop.\n');
    if (blocked.length) {
      console.error('  Gate could not measure the live source but marked pass=true:');
      for (const b of blocked) {
        console.error(`    • ${b.archetype} @ ${b.bp}: ${b.visualFlags}`);
      }
    }
    if (placeholders.length) {
      console.error('\n  Placeholder/gradient imagery stood in for real photography:');
      for (const p of placeholders) {
        console.error(`    • ${p.archetype} @ ${p.bp}: ${p.what} (${p.where})`);
      }
    }
    console.error(
      '\n  The source is almost certainly bot-protected (Akamai/Cloudflare), so replica\n' +
        '  captured nothing usable. Do NOT deploy this demo. Escalate to the user:\n' +
        '    1. Retry Stage 2 with headed capture (stardust:replica ... --headed), or\n' +
        '    2. Run a content-only demo (skip the replica pages; keep /of1 + configs), or\n' +
        '    3. Abort for this domain.\n' +
        '  See of1-demo-orchestrator/knowledge/pipeline-contract.md § "Stage 2 artifact gate".',
    );
    return 2;
  }

  console.log(`✓ Replica artifacts are demo-grade (${pages.length} page type(s), all gates measured).`);
  return 0;
}

process.exit(main());
