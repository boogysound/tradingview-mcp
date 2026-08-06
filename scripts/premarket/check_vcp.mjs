#!/usr/bin/env node
/**
 * Strategie VCP TEST-MODE live signal checker (30.07.2026, user-requested)
 * — NOT a trading strategy running in run.mjs/production. Same pattern as
 * check_ut.mjs/check_s3.mjs, reimplemented in backtests/vcp_engine.mjs.
 *
 * VCP's exit/entry sweeps (Teil 23) found ger40Long/tickmillDe40Long
 * clearly without edge, and only a weak, not robustly confirmed signal
 * for ger40Short (thinner support than UT's/InsideBar's finds, plus the
 * core VCP pattern-recognition formula itself is an unconfirmed
 * assumption — see vcp_engine.mjs header). Deployed in test mode anyway
 * per the user's explicit request to monitor every built strategy
 * regardless of backtest verdict (30.07.2026: "richte ihn für alle ein").
 *
 * Runs all 3 real presets (`BASE_CONFIGS.ger40Long/ger40Short/
 * tickmillDe40Long`) each cycle, all on DE40 H1 — same bars array for all
 * three (no MTF resampling needed, MTF1_Timeframe=H1 in every sampled
 * preset). Each preset's alerts are distinctly labeled.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { disconnect } from '../../src/connection.js';
import { setTimeframe } from '../../src/core/chart.js';
import { ensureTradingViewReady, isXetraOpen, fetchBars } from './utils.mjs';
import { sendTelegramBriefing } from './telegram.mjs';
import { BASE_CONFIGS, runBacktest } from '../../backtests/vcp_engine.mjs';

const STATE_DIR = '/Users/boogy/tradingview-mcp/state';
const SIGNALS_LOG_PATH = `${STATE_DIR}/vcp_signals.json`;
const DEDUP_PATH = `${STATE_DIR}/vcp_dedup.json`;
const H1_BARS = 300;

function fmt(n) {
  return Number(n).toFixed(1);
}

async function main() {
  if (!isXetraOpen()) {
    console.log('Außerhalb Xetra-Zeiten — kein Strategie-VCP-Test-Check.');
    return;
  }

  await ensureTradingViewReady({ onLog: console.log });
  const bars = await fetchBars(60, H1_BARS);
  if (bars.length < 20) {
    console.log(`Zu wenig H1-Historie geladen (${bars.length}) — überspringe diesen Lauf.`);
    await setTimeframe({ timeframe: '1' });
    await disconnect();
    return;
  }

  mkdirSync(STATE_DIR, { recursive: true });
  const dedup = existsSync(DEDUP_PATH) ? JSON.parse(readFileSync(DEDUP_PATH, 'utf8')) : {};
  const signalsLog = existsSync(SIGNALS_LOG_PATH) ? JSON.parse(readFileSync(SIGNALS_LOG_PATH, 'utf8')) : [];
  const lastBarIdx = bars.length - 1;

  let totalFresh = 0, totalSent = 0;
  for (const [presetName, cfg] of Object.entries(BASE_CONFIGS)) {
    const trades = runBacktest(bars, cfg);
    const fresh = trades.filter(t => t.entryIdx === lastBarIdx);
    totalFresh += fresh.length;

    for (const t of fresh) {
      const key = `${presetName}_${t.direction}_${t.entryTime}`;
      if (dedup[key]) continue;
      dedup[key] = true;

      const text = [
        `🧪 STRATEGIE VCP TEST-SIGNAL [${presetName}] (DE40, H1) — NUR Datensammlung, KEIN Live-Trade`,
        '',
        `Richtung: ${t.direction}`,
        `Entry: ${fmt(t.entry)}`,
        `SL: ${fmt(t.sl)} (Risiko: ${fmt(t.risk)} Pkt)`,
        `TP1: ${fmt(t.tp1Price)} | TP2: ${fmt(t.tp2Price)} | Final: ${fmt(t.tpFinalPrice)}`,
        '',
        'Hintergrund: ger40Long/tickmillDe40Long zeigen im Sweep eindeutig keine Edge, ger40Short einen schwachen, nicht robust bestätigten Silberstreif (Teil 23) — zusätzlich ist die VCP-Kernformel selbst eine unbestätigte Annahme. Test-Modus läuft trotzdem (analog S1), um echte Live-Daten zu sammeln. Siehe STRATEGIE_OPTIMIERUNG_HANDOVER.md Teil 23.',
      ].join('\n');

      const r = await sendTelegramBriefing(text);
      signalsLog.push({
        loggedAt: new Date().toISOString(), preset: presetName, entryTime: t.entryTime, direction: t.direction,
        entry: t.entry, sl: t.sl, risk: t.risk, telegramSent: !!r.sent,
      });
      totalSent++;
    }
  }

  writeFileSync(DEDUP_PATH, JSON.stringify(dedup, null, 2));
  writeFileSync(SIGNALS_LOG_PATH, JSON.stringify(signalsLog, null, 2));
  console.log(`Strategie-VCP-Test-Check fertig. ${totalFresh} frische Signale (alle Presets), ${totalSent} neu gemeldet (${signalsLog.length} insgesamt geloggt).`);
  // Leave the chart on 1m after analysis (user-specified, 06.08.2026).
  await setTimeframe({ timeframe: '1' });
  await disconnect();
}

main().catch(async (e) => {
  console.error('FATAL', e.stack || e.message);
  await disconnect().catch(() => {});
  process.exit(1);
});
