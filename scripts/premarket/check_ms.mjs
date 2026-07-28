#!/usr/bin/env node
/**
 * Lightweight, frequent Market-Shift-only check — separate from the
 * twice-daily full run.mjs (zones/scenarios/screenshot/decluttering).
 *
 * User-specified, 28.07.2026: "ich möchte immer eine MS Nachricht erhalten,
 * sobald sie entsteht" — the old twice-daily-only cadence structurally
 * cannot deliver that; MS structure can (and does) shift within minutes.
 * Meant to run every ~10 minutes during Xetra hours via its own launchd job
 * (com.boogy.de40-ms-check) — see run.mjs for the equivalent full-run path
 * that reuses the same checkAndAlertMarketShifts() logic.
 *
 * Kept deliberately minimal (no zone/OB/FVG processing, no scenario
 * logging, no screenshot) to stay cheap enough for a 10-minute cadence.
 */
import { disconnect } from '../../src/connection.js';
import { ensureTradingViewReady, isXetraOpen, fetchBars } from './utils.mjs';
import { checkAndAlertMarketShifts } from './ms_alerts.mjs';

async function main() {
  if (!isXetraOpen()) {
    console.log('Außerhalb Xetra-Zeiten — kein Check.');
    return;
  }

  await ensureTradingViewReady({ onLog: console.log });

  const bars5 = await fetchBars(5, 300);
  const bars1h = await fetchBars(60, 300);
  const bars4h = await fetchBars(240, 300);

  const result = await checkAndAlertMarketShifts({ bars5, bars1h, bars4h });
  console.log(JSON.stringify({
    alertsSent: result.alertsSent,
    ltf: { status: result.ltfMs.status, direction: result.ltfMs.direction },
    htf: { status: result.htfMs.status, direction: result.htfMs.direction },
    htf4h: { status: result.htf4hMs.status, direction: result.htf4hMs.direction },
  }));
}

main()
  .catch(err => { console.error('FATAL:', err.message); process.exitCode = 1; })
  .finally(() => disconnect().catch(() => {}));
