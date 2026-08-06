#!/usr/bin/env node
/**
 * Strategie C TEST-MODE live signal checker (30.07.2026, user-requested) —
 * NOT a trading strategy running in run.mjs/production. "Strategie C" is
 * the live-naming slot in the A/B/(C)/D framework (A/B are the DE40 S/D-
 * zone strategies) — freed up because the earlier UT-Bot+SMI+EMA build
 * (originally also called "Strategie C" in Teil 14) never went live and
 * was shelved (negative expectancy). User (30.07.2026): "Nenn diese
 * Strategie C. Es gibt bisher keine andere aktive C Strategie." So this
 * slot is now Kaspareit-Trading's "S1", reimplemented in backtests/s1_engine.mjs.
 *
 * Purpose: collect real, live signal data over the coming weeks, since the
 * JS backtest (backtests/strategy_s1.mjs, sweep_s1*.mjs) could not find a
 * robust out-of-sample edge despite fixing two real bugs (BE-step-pct
 * scaling, missing trailing-till-BE) — see STRATEGIE_OPTIMIERUNG_HANDOVER.md
 * Teil 16. A live/tick-based signal stream is the most direct way to check
 * whether the bar-level backtest was simply too coarse (can't see intrabar
 * price paths) or whether the strategy genuinely lacks edge on this
 * instrument.
 *
 * Reuses the exact DE40/GER40 H1 LONG config from backtests/s1_engine.mjs
 * (BASE_CONFIGS.de40.LONG) — the only S1 preset actually published for this
 * instrument (S1/Archiv, no SHORT variant exists). Runs on the SAME live
 * DE40 chart as the rest of the automation (GBEBROKERS:DE40) — no symbol
 * switching, so this cannot collide with de40-ms-check/scenario-check like
 * the historical data fetch did.
 *
 * Every alert is clearly prefixed "🧪 STRATEGIE C TEST-SIGNAL" and states
 * explicitly that this is NOT a live trade recommendation — purely for data
 * collection. Dedup is per-bar (entryTime), so a signal only alerts once,
 * the run it first appears on a freshly closed H1 bar.
 *
 * Meant to run every ~15 min via its own launchd job
 * (com.boogy.de40-strategie-c-check), self-guarded by isXetraOpen() like the
 * other frequent checkers.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { evaluate, disconnect } from '../../src/connection.js';
import { ensureTradingViewReady, isXetraOpen, fetchBars, sleep } from './utils.mjs';
import { setTimeframe } from '../../src/core/chart.js';
import { sendTelegramBriefing } from './telegram.mjs';
import { BASE_CONFIGS, runDirection } from '../../backtests/s1_engine.mjs';

const STATE_DIR = '/Users/boogy/tradingview-mcp/state';
const SIGNALS_LOG_PATH = `${STATE_DIR}/strategie_c_signals.json`;
const DEDUP_PATH = `${STATE_DIR}/strategie_c_dedup.json`;
const FETCH_BARS = 600;
// Just above the longest EMA warmup (period 330) used by BASE_CONFIGS.de40.LONG.
// The live chart's default in-memory buffer is only ~300 bars — below this,
// EMA(330) never gets a chance to converge — so this checker lazy-loads more
// history first (same requestMoreData() mechanism as the backtests/fetch_*
// scripts) rather than silently running on too little data every run.
const MIN_BARS = 450;
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
    console.log('Außerhalb Xetra-Zeiten — kein Strategie-C-Test-Check.');
    return;
  }

  await ensureTradingViewReady({ onLog: console.log });
  await setTimeframe({ timeframe: '60' });
  await sleep(1500);
  await ensureMinBars(MIN_BARS);
  const bars = await fetchBars(60, FETCH_BARS);
  if (bars.length < MIN_BARS) {
    console.log(`Zu wenig H1-Historie geladen (${bars.length}) — überspringe diesen Lauf.`);
    await setTimeframe({ timeframe: '1' });
    await disconnect();
    return;
  }

  const trades = runDirection(bars, 'LONG', BASE_CONFIGS.de40.LONG, true);
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
      '🧪 STRATEGIE C TEST-SIGNAL (DE40, H1) — NUR Datensammlung, KEIN Live-Trade',
      '',
      `Richtung: ${t.direction}`,
      `Entry: ${fmt(t.entry)}`,
      `SL: ${fmt(t.sl)} (Risiko: ${fmt(t.risk)} Pkt)`,
      `TP1: ${fmt(t.tp1Price)} (33%) | TP2: ${fmt(t.tp2Price)} (33%) | Final: ${fmt(t.tpFinalPrice)} (Rest)`,
      '',
      'Hintergrund: Backtest zeigt hohe Win-Rate (65-91%) aber Out-of-Sample-Expectancy nahe null — dieser Testmodus sammelt echte Live-Daten, um zu prüfen ob Tick-Ausführung das Bild ändert. Siehe STRATEGIE_OPTIMIERUNG_HANDOVER.md.',
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
  console.log(`Strategie-C-Test-Check fertig. ${fresh.length} frische Signale, ${sent} neu gemeldet (${signalsLog.length} insgesamt geloggt).`);
  // Leave the chart on 1m after analysis (user-specified, 06.08.2026).
  await setTimeframe({ timeframe: '1' });
  await disconnect();
}

main().catch(async (e) => {
  console.error('FATAL', e.stack || e.message);
  await disconnect().catch(() => {});
  process.exit(1);
});
