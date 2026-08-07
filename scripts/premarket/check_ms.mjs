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
 * that reuses the same checkAndAlertTrendResumptionMS() logic.
 *
 * Redesigned 29.07.2026 (Teil 11, user-specified): HTF reference moved off
 * 4H (choppy, no clear trend for weeks) to a dynamic pick between 15min/1H;
 * LTF moved from 5min down to 1min. See ms_alerts.mjs for the full design
 * rationale — kept here in check_ms.mjs, still deliberately minimal (no
 * zone/OB/FVG processing, no scenario logging, no screenshot) to stay cheap
 * enough for a 10-minute cadence.
 */
import { disconnect } from '../../src/connection.js';
import { setTimeframe } from '../../src/core/chart.js';
import { ensureTradingViewReady, isXetraOpen, fetchBars } from './utils.mjs';
import { checkAndAlertTrendResumptionMS, checkAndAlertCounterTrendMS } from './ms_alerts.mjs';

async function main() {
  if (!isXetraOpen()) {
    console.log('Außerhalb Xetra-Zeiten — kein Check.');
    return;
  }

  await ensureTradingViewReady({ onLog: console.log });

  const bars1 = await fetchBars(1, 300);
  const bars5 = await fetchBars(5, 300);
  const bars15 = await fetchBars(15, 300);
  const bars1h = await fetchBars(60, 300);

  const result = await checkAndAlertTrendResumptionMS({ bars15, bars1h, bars1 });
  // Counter-Trend-MS-Alert (Teil 40) — separate from the resumption alert
  // above, which by design never fires for a shift AGAINST the HTF bias.
  const counterTrend = await checkAndAlertCounterTrendMS({ bars5, bars15, bars1h });
  console.log(JSON.stringify({
    alertsSent: result.alertsSent,
    htfBias: result.htfBias,
    htfSource: result.htfSource,
    ltf: { status: result.ltfMs.status, direction: result.ltfMs.direction },
    counterTrend: { alertsSent: counterTrend.alertsSent, results: counterTrend.results },
  }));

  // Leave the chart on 1m after analysis (user-specified, 06.08.2026).
  await setTimeframe({ timeframe: '1' });
}

main()
  .catch(err => { console.error('FATAL:', err.message); process.exitCode = 1; })
  .finally(() => disconnect().catch(() => {}));
