#!/usr/bin/env node
/**
 * Strategie S5 TEST-MODE live signal checker (30.07.2026, user-requested) —
 * NOT a trading strategy running in run.mjs/production. Same pattern as
 * check_ut.mjs/check_s3.mjs, reimplemented in backtests/s5_engine.mjs.
 *
 * S5's own exit/risk + entry sweeps (Teil 17/18) found no robust hit
 * across ~450 backtests. Deployed in test mode anyway per the user's
 * explicit request to monitor every built strategy regardless of backtest
 * verdict (30.07.2026: "richte ihn für alle ein"), same rationale as S1
 * (Teil 15/16) — checking whether live/tick execution disagrees with the
 * bar-level backtest's rejection.
 *
 * Config: `BASE_CONFIGS.GER40` — the only DE40-relevant preset (S5 also
 * has US30/XAUUSD presets, not used here since this project trades DE40).
 * Runs on DAILY bars (`data_daily.json` equivalent) — signals are rare
 * (at most one per day), but the checker still runs on the same 15-min
 * cadence as the others; dedup on entryTime makes repeat checks harmless.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { disconnect } from '../../src/connection.js';
import { setTimeframe } from '../../src/core/chart.js';
import { ensureTradingViewReady, isXetraOpen, fetchBars } from './utils.mjs';
import { sendTelegramBriefing } from './telegram.mjs';
import { BASE_CONFIGS, runInstrument } from '../../backtests/s5_engine.mjs';

const STATE_DIR = '/Users/boogy/tradingview-mcp/state';
const SIGNALS_LOG_PATH = `${STATE_DIR}/s5_signals.json`;
const DEDUP_PATH = `${STATE_DIR}/s5_dedup.json`;
const DAILY_BARS = 300;
const CFG = BASE_CONFIGS.GER40;

function fmt(n) {
  return Number(n).toFixed(1);
}

async function main() {
  if (!isXetraOpen()) {
    console.log('Außerhalb Xetra-Zeiten — kein Strategie-S5-Test-Check.');
    return;
  }

  await ensureTradingViewReady({ onLog: console.log });
  const bars = await fetchBars('D', DAILY_BARS);
  if (bars.length < 20) {
    console.log(`Zu wenig Daily-Historie geladen (${bars.length}) — überspringe diesen Lauf.`);
    await setTimeframe({ timeframe: '1' });
    await disconnect();
    return;
  }

  const trades = runInstrument(bars, CFG);
  const lastBarIdx = bars.length - 1;
  const fresh = trades.filter(t => t.entryIdx === lastBarIdx);

  mkdirSync(STATE_DIR, { recursive: true });
  const dedup = existsSync(DEDUP_PATH) ? JSON.parse(readFileSync(DEDUP_PATH, 'utf8')) : {};
  const signalsLog = existsSync(SIGNALS_LOG_PATH) ? JSON.parse(readFileSync(SIGNALS_LOG_PATH, 'utf8')) : [];

  let sent = 0;
  for (const t of fresh) {
    const key = `${t.direction}_${t.entryTime}`;
    if (dedup[key]) continue;
    dedup[key] = true;

    const tpLines = t.tp1Price != null
      ? [`TP1: ${fmt(t.tp1Price)} (33%) | TP2: ${fmt(t.tp2Price)} (33%) | Final: ${fmt(t.tpFinalPrice)} (Rest)`]
      : [];

    const text = [
      '🧪 STRATEGIE S5 TEST-SIGNAL (DE40, Daily) — NUR Datensammlung, KEIN Live-Trade',
      '',
      `Richtung: ${t.direction}`,
      `Entry: ${fmt(t.entry)}`,
      `SL: ${fmt(t.sl)} (Risiko: ${fmt(t.risk)} Pkt)`,
      ...tpLines,
      '',
      'Hintergrund: Exit/Risk- und Entry-Sweep (Teil 17/18, ~450 Backtests) fanden keinen robusten Treffer. Test-Modus läuft trotzdem (analog S1), um zu prüfen ob die Bar-Level-Simulation zu grob war. Siehe STRATEGIE_OPTIMIERUNG_HANDOVER.md.',
    ].join('\n');

    const r = await sendTelegramBriefing(text);
    signalsLog.push({
      loggedAt: new Date().toISOString(), entryTime: t.entryTime, direction: t.direction,
      entry: t.entry, sl: t.sl, risk: t.risk, telegramSent: !!r.sent,
    });
    sent++;
  }

  writeFileSync(DEDUP_PATH, JSON.stringify(dedup, null, 2));
  writeFileSync(SIGNALS_LOG_PATH, JSON.stringify(signalsLog, null, 2));
  console.log(`Strategie-S5-Test-Check fertig. ${fresh.length} frische Signale, ${sent} neu gemeldet (${signalsLog.length} insgesamt geloggt).`);
  // Leave the chart on 1m after analysis (user-specified, 06.08.2026).
  await setTimeframe({ timeframe: '1' });
  await disconnect();
}

main().catch(async (e) => {
  console.error('FATAL', e.stack || e.message);
  await disconnect().catch(() => {});
  process.exit(1);
});
