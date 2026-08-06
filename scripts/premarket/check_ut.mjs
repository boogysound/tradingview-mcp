#!/usr/bin/env node
/**
 * Strategie UT TEST-MODE live signal checker (30.07.2026, user-requested) —
 * NOT a trading strategy running in run.mjs/production. Analogous to
 * check_strategie_c.mjs (Kaspareit S1's live test mode, Teil 16) but for
 * Kaspareit UT-Bot 2.0, reimplemented in backtests/ut_engine.mjs.
 *
 * Purpose: collect real, live signal data for the ONE config that survived
 * both the exit/risk sweep (sweep_ut.mjs) and the combined exit+entry sweep
 * (sweep_ut_combined.mjs) — DE40 15m, the only timeframe/instrument out of
 * everything tested across S1/S5/UT that showed a broad, train+test-positive,
 * monthly-mostly-stable neighborhood instead of a single overfit spike. Still
 * only ONE train/test split and no .set file for UT exists at all — this
 * live/tick-based signal stream is the most direct way to gather independent,
 * out-of-time evidence before deciding whether the backtest finding is real.
 * See STRATEGIE_OPTIMIERUNG_HANDOVER.md Teil 19/20.
 *
 * Config used (the "minimal deviation from documented/researched baseline"
 * candidate from Teil 20 — only ema1Period/riskScale/targetScale changed,
 * utKey/utAtrPeriod/smiK stay at their researched public-indicator defaults):
 *   { ...BASE_CONFIG, ema1Period: 300, riskScale: 0.5, targetScale: 1.5, beMultR: 0 }
 *
 * Runs on the SAME live DE40 chart as the rest of the automation
 * (GBEBROKERS:DE40) — no symbol switching, so this cannot collide with
 * de40-ms-check/scenario-check/strategie-c-check like the historical data
 * fetch did. Every alert is clearly prefixed "🧪 STRATEGIE UT TEST-SIGNAL"
 * and states explicitly that this is NOT a live trade recommendation.
 * Dedup is per-bar (entryTime), so a signal only alerts once, the run it
 * first appears on a freshly closed 15m bar.
 *
 * Meant to run every ~15 min via its own launchd job
 * (com.boogy.de40-ut-check), self-guarded by isXetraOpen() like the other
 * frequent checkers.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { evaluate, disconnect } from '../../src/connection.js';
import { ensureTradingViewReady, isXetraOpen, fetchBars, sleep } from './utils.mjs';
import { setTimeframe } from '../../src/core/chart.js';
import { sendTelegramBriefing } from './telegram.mjs';
import { BASE_CONFIG, runBacktest } from '../../backtests/ut_engine.mjs';

const STATE_DIR = '/Users/boogy/tradingview-mcp/state';
const SIGNALS_LOG_PATH = `${STATE_DIR}/ut_signals.json`;
const DEDUP_PATH = `${STATE_DIR}/ut_dedup.json`;
const FETCH_BARS = 600;
// Just above the longest warmup this config needs (EMA1 period 300 —
// Teil 20's candidate raised it from the documented default 200). The live
// chart's default in-memory buffer is only ~300 bars — below this, EMA(300)
// never gets a chance to converge — so this checker lazy-loads more history
// first (same requestMoreData() mechanism as check_strategie_c.mjs).
const MIN_BARS = 450;
const CFG = { ...BASE_CONFIG, ema1Period: 300, riskScale: 0.5, targetScale: 1.5, beMultR: 0 };
const CHART = 'window.TradingViewApi._activeChartWidgetWV.value()';
const BARS = `${CHART}._chartWidget.model().mainSeries().bars()`;

async function currentBarCount() {
  const info = await evaluate(`(function(){ var b = ${BARS}; return b ? b.size() : 0; })()`);
  return info || 0;
}

async function ensureMinBars(min, maxIters = 15) {
  for (let k = 0; k < maxIters; k++) {
    const n = await currentBarCount();
    if (n >= min) return n;
    await evaluate(`(function(){
      var s = ${CHART}._chartWidget.model().mainSeries();
      if (typeof s.requestMoreData === 'function') s.requestMoreData(1000);
    })()`);
    await sleep(1500);
  }
  return currentBarCount();
}

function fmt(n) {
  return Number(n).toFixed(1);
}

async function main() {
  if (!isXetraOpen()) {
    console.log('Außerhalb Xetra-Zeiten — kein Strategie-UT-Test-Check.');
    return;
  }

  await ensureTradingViewReady({ onLog: console.log });
  await setTimeframe({ timeframe: '15' });
  await sleep(1500);
  await ensureMinBars(MIN_BARS);
  const bars = await fetchBars(15, FETCH_BARS);
  if (bars.length < MIN_BARS) {
    console.log(`Zu wenig 15m-Historie geladen (${bars.length}) — überspringe diesen Lauf.`);
    await setTimeframe({ timeframe: '1' });
    await disconnect();
    return;
  }

  const trades = runBacktest(bars, CFG, {});
  const lastBarIdx = bars.length - 1;
  // Only a signal whose entry is the LAST bar is "fresh" this run — anything
  // earlier was either already alerted on a prior run or occurred before
  // this checker started tracking it (backfill is intentionally not sent).
  const fresh = trades.filter(t => t.entryIdx === lastBarIdx);

  mkdirSync(STATE_DIR, { recursive: true });
  const dedup = existsSync(DEDUP_PATH) ? JSON.parse(readFileSync(DEDUP_PATH, 'utf8')) : {};
  const signalsLog = existsSync(SIGNALS_LOG_PATH) ? JSON.parse(readFileSync(SIGNALS_LOG_PATH, 'utf8')) : [];

  let sent = 0;
  for (const t of fresh) {
    const key = `${t.direction}_${t.entryTime}`;
    if (dedup[key]) continue;
    dedup[key] = true;

    const text = [
      '🧪 STRATEGIE UT TEST-SIGNAL (DE40, 15m) — NUR Datensammlung, KEIN Live-Trade',
      '',
      `Richtung: ${t.direction}`,
      `Entry: ${fmt(t.entry)}`,
      `SL: ${fmt(t.sl)} (Risiko: ${fmt(t.risk)} Pkt)`,
      `TP1: ${fmt(t.tp1Price)} (33%) | TP2: ${fmt(t.tp2Price)} (33%) | Final: ${fmt(t.tpFinalPrice)} (Rest)`,
      '',
      'Hintergrund: kombinierter Exit+Entry-Sweep zeigt eine breite, monoton strukturierte Train+Test-positive Nachbarschaft (5/6 Monate positiv) — aber nur EIN Train/Test-Split und kein .set-File für UT. Dieser Testmodus sammelt echte Live-Daten zur unabhängigen Prüfung. Siehe STRATEGIE_OPTIMIERUNG_HANDOVER.md Teil 19/20.',
    ].join('\n');

    const r = await sendTelegramBriefing(text);
    signalsLog.push({
      loggedAt: new Date().toISOString(), entryTime: t.entryTime, direction: t.direction,
      entry: t.entry, sl: t.sl, risk: t.risk,
      tp1Price: t.tp1Price, tp2Price: t.tp2Price, tpFinalPrice: t.tpFinalPrice,
      telegramSent: !!r.sent,
    });
    sent++;
  }

  writeFileSync(DEDUP_PATH, JSON.stringify(dedup, null, 2));
  writeFileSync(SIGNALS_LOG_PATH, JSON.stringify(signalsLog, null, 2));
  console.log(`Strategie-UT-Test-Check fertig. ${fresh.length} frische Signale, ${sent} neu gemeldet (${signalsLog.length} insgesamt geloggt).`);
  // Leave the chart on 1m after analysis (user-specified, 06.08.2026).
  await setTimeframe({ timeframe: '1' });
  await disconnect();
}

main().catch(async (e) => {
  console.error('FATAL', e.stack || e.message);
  await disconnect().catch(() => {});
  process.exit(1);
});
