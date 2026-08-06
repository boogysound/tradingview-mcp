#!/usr/bin/env node
/**
 * Strategie S3 TEST-MODE live signal checker (30.07.2026, user-requested) —
 * NOT a trading strategy running in run.mjs/production. Analogous to
 * check_strategie_c.mjs (Kaspareit S1) / check_ut.mjs (Kaspareit UT), but
 * for Kaspareit S3, reimplemented in backtests/s3_engine.mjs.
 *
 * Purpose: collect real, live signal data for the ONE config that survived
 * the combined exit+entry sweep (sweep_s3_combined.mjs, Teil 25) AND a
 * dedicated 15m fine-granularity re-verification of its one open concern
 * (Teil 26 — SL smaller than DE40's average H1 bar range; re-checked
 * against 15m bars, concern did NOT hold up: 0/117 trades still ambiguous,
 * result even slightly better on the finer replay). Most thoroughly
 * checked Kaspareit finding after UT (Teil 20) — but still only ONE
 * train/test split, and the earliest ~2.2 months of the backtest window
 * could not be 15m-reverified (no historical 15m data that far back). This
 * live signal stream is the next independent check.
 *
 * Config (the representative sweep-neighborhood candidate from Teil 25/26):
 *   { ...BASE_CONFIG, stPeriod: 3, stMultiplier: 1, slPoints: 42.5, tpRMultiple: 2.1 }
 * (requireMagicTrend defaults to true in s3_engine.mjs's runBacktest.)
 *
 * UNLIKE S1/UT, S3's entry filter is genuinely multi-timeframe (SuperTrend
 * entry on H1, Dual-Magic-Trend filter on H4) — this checker fetches BOTH
 * timeframes each run (fetchBars() switches resolution internally). Runs
 * on the SAME live DE40 chart as the rest of the automation
 * (GBEBROKERS:DE40) — no symbol switching. Every alert is clearly prefixed
 * "🧪 STRATEGIE S3 TEST-SIGNAL" and states this is NOT a live trade
 * recommendation. Dedup is per-bar (entryTime), so a signal only alerts
 * once, the run it first appears on a freshly closed H1 bar.
 *
 * Meant to run every ~15 min via its own launchd job
 * (com.boogy.de40-s3-check), self-guarded by isXetraOpen() like the other
 * frequent checkers.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { disconnect } from '../../src/connection.js';
import { setTimeframe } from '../../src/core/chart.js';
import { ensureTradingViewReady, isXetraOpen, fetchBars } from './utils.mjs';
import { sendTelegramBriefing } from './telegram.mjs';
import { BASE_CONFIG, runBacktest } from '../../backtests/s3_engine.mjs';

const STATE_DIR = '/Users/boogy/tradingview-mcp/state';
const SIGNALS_LOG_PATH = `${STATE_DIR}/s3_signals.json`;
const DEDUP_PATH = `${STATE_DIR}/s3_dedup.json`;
// Warmup for this config is trivial (max indicator period is 7, MT2) —
// generous bar counts here are just to give alignHtf() a comfortable H4
// history margin ahead of the H1 window, not for indicator convergence.
const H1_BARS = 300;
const H4_BARS = 300;
const CFG = { ...BASE_CONFIG, stPeriod: 3, stMultiplier: 1, slPoints: 42.5, tpRMultiple: 2.1 };

function fmt(n) {
  return Number(n).toFixed(1);
}

async function main() {
  if (!isXetraOpen()) {
    console.log('Außerhalb Xetra-Zeiten — kein Strategie-S3-Test-Check.');
    return;
  }

  await ensureTradingViewReady({ onLog: console.log });
  const bars = await fetchBars(60, H1_BARS);
  const htfBars = await fetchBars(240, H4_BARS);
  if (bars.length < 20 || htfBars.length < 20) {
    console.log(`Zu wenig Historie geladen (H1=${bars.length}, H4=${htfBars.length}) — überspringe diesen Lauf.`);
    await setTimeframe({ timeframe: '1' });
    await disconnect();
    return;
  }

  const trades = runBacktest(bars, htfBars, CFG);
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
      '🧪 STRATEGIE S3 TEST-SIGNAL (DE40, H1) — NUR Datensammlung, KEIN Live-Trade',
      '',
      `Richtung: ${t.direction}`,
      `Entry: ${fmt(t.entry)}`,
      `SL: ${fmt(t.sl)} (${CFG.slPoints} Pkt) | TP: ${fmt(t.tp)} (${CFG.tpRMultiple}x SL)`,
      '',
      'Hintergrund: kombinierter Exit+Entry-Sweep zeigt die dichteste Train+Test-positive Nachbarschaft der gesamten Kaspareit-Aufarbeitung; der eine offene Vorbehalt (SL < durchschnittliche H1-Balken-Range) wurde per 15m-Feingranularitäts-Reverifikation geprüft und NICHT bestätigt. Dieser Testmodus sammelt echte Live-Daten zur unabhängigen Prüfung. Siehe STRATEGIE_OPTIMIERUNG_HANDOVER.md Teil 24-26.',
    ].join('\n');

    const r = await sendTelegramBriefing(text);
    signalsLog.push({
      loggedAt: new Date().toISOString(), entryTime: t.entryTime, direction: t.direction,
      entry: t.entry, sl: t.sl, tp: t.tp,
      telegramSent: !!r.sent,
    });
    sent++;
  }

  writeFileSync(DEDUP_PATH, JSON.stringify(dedup, null, 2));
  writeFileSync(SIGNALS_LOG_PATH, JSON.stringify(signalsLog, null, 2));
  console.log(`Strategie-S3-Test-Check fertig. ${fresh.length} frische Signale, ${sent} neu gemeldet (${signalsLog.length} insgesamt geloggt).`);
  // Leave the chart on 1m after analysis (user-specified, 06.08.2026).
  await setTimeframe({ timeframe: '1' });
  await disconnect();
}

main().catch(async (e) => {
  console.error('FATAL', e.stack || e.message);
  await disconnect().catch(() => {});
  process.exit(1);
});
