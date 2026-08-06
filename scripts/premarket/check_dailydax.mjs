#!/usr/bin/env node
/**
 * Strategie DailyDax TEST-MODE live signal checker (30.07.2026,
 * user-requested) — NOT a trading strategy running in run.mjs/production.
 * Same pattern as check_ut.mjs/check_s3.mjs, reimplemented in
 * backtests/dailydax_engine.mjs.
 *
 * DailyDax's exit/risk + entry sweep (Teil 22) found clearly no edge —
 * every parameter change made results worse. Deployed in test mode anyway
 * per the user's explicit request to monitor every built strategy
 * regardless of backtest verdict (30.07.2026: "richte ihn für alle ein").
 *
 * Needs FOUR timeframes (`loadAllBars()`'s live equivalent): 30m base
 * chart, H3/H6 (resampled from a live H1 fetch via the now-exported
 * `resample()` — no separate H3/H6 resolution exists on the chart itself),
 * and Daily for the slow EMA2. Entry is only evaluated once/day at Berlin
 * 11:30 (`entryMinutes`), force-exit tracked at 15:00 — both handled
 * inside `runBacktest()` itself via each 30m bar's Berlin time, so this
 * checker just needs fresh bars each run like every other checker.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { disconnect } from '../../src/connection.js';
import { setTimeframe } from '../../src/core/chart.js';
import { ensureTradingViewReady, isXetraOpen, fetchBars } from './utils.mjs';
import { sendTelegramBriefing } from './telegram.mjs';
import { BASE_CONFIG, runBacktest, resample } from '../../backtests/dailydax_engine.mjs';

const STATE_DIR = '/Users/boogy/tradingview-mcp/state';
const SIGNALS_LOG_PATH = `${STATE_DIR}/dailydax_signals.json`;
const DEDUP_PATH = `${STATE_DIR}/dailydax_dedup.json`;
const M30_BARS = 400;
const H1_BARS = 400;
const DAILY_BARS = 300;

function fmt(n) {
  return Number(n).toFixed(1);
}

async function main() {
  if (!isXetraOpen()) {
    console.log('Außerhalb Xetra-Zeiten — kein Strategie-DailyDax-Test-Check.');
    return;
  }

  await ensureTradingViewReady({ onLog: console.log });
  const bars30m = await fetchBars(30, M30_BARS);
  const bars1h = await fetchBars(60, H1_BARS);
  const barsDaily = await fetchBars('D', DAILY_BARS);
  if (bars30m.length < 20 || bars1h.length < 20 || barsDaily.length < 20) {
    console.log(`Zu wenig Historie geladen (30m=${bars30m.length}, H1=${bars1h.length}, D1=${barsDaily.length}) — überspringe diesen Lauf.`);
    await setTimeframe({ timeframe: '1' });
    await disconnect();
    return;
  }
  const barsH3 = resample(bars1h, 3);
  const barsH6 = resample(bars1h, 6);

  const trades = runBacktest({ bars30m, barsH3, barsH6, barsDaily }, BASE_CONFIG);
  const lastBarIdx = bars30m.length - 1;
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
      '🧪 STRATEGIE DAILYDAX TEST-SIGNAL (DE40, 30m, Entry 11:30 Berlin) — NUR Datensammlung, KEIN Live-Trade',
      '',
      `Richtung: ${t.direction}`,
      `Entry: ${fmt(t.entry)}`,
      `SL: ${fmt(t.sl)} (Risiko: ${fmt(t.risk)} Pkt)`,
      `TP1: ${fmt(t.tp1Price)} (40%) | TP2: ${fmt(t.tp2Price)} (40%) | Final: ${fmt(t.tpFinalPrice)} (Rest) | Force-Exit 15:00 Berlin`,
      '',
      'Hintergrund: Exit/Risk- und Entry-Sweep (Teil 22) fanden eindeutig KEINE Edge — jede Parameteränderung verschlechterte das Ergebnis. Test-Modus läuft trotzdem (analog S1), um echte Live-Daten zu sammeln. Siehe STRATEGIE_OPTIMIERUNG_HANDOVER.md Teil 22.',
    ].join('\n');

    const r = await sendTelegramBriefing(text);
    signalsLog.push({
      loggedAt: new Date().toISOString(), entryTime: t.entryTime, dateStr: t.dateStr, direction: t.direction,
      entry: t.entry, sl: t.sl, risk: t.risk, telegramSent: !!r.sent,
    });
    sent++;
  }

  writeFileSync(DEDUP_PATH, JSON.stringify(dedup, null, 2));
  writeFileSync(SIGNALS_LOG_PATH, JSON.stringify(signalsLog, null, 2));
  console.log(`Strategie-DailyDax-Test-Check fertig. ${fresh.length} frische Signale, ${sent} neu gemeldet (${signalsLog.length} insgesamt geloggt).`);
  // Leave the chart on 1m after analysis (user-specified, 06.08.2026).
  await setTimeframe({ timeframe: '1' });
  await disconnect();
}

main().catch(async (e) => {
  console.error('FATAL', e.stack || e.message);
  await disconnect().catch(() => {});
  process.exit(1);
});
