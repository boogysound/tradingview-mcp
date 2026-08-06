#!/usr/bin/env node
/**
 * Strategie S2 TEST-MODE live signal checker (30.07.2026, user-requested) —
 * NOT a trading strategy running in run.mjs/production. Same pattern as
 * check_ut.mjs/check_s3.mjs, reimplemented in backtests/s2_engine.mjs.
 *
 * S2's own combined sweep (Teil 30) found 0/1.500 combinations Train+Test
 * both positive — the clearest "no edge" rejection of the whole Kaspareit
 * effort. Deployed in test mode anyway, same rationale as S1 (Teil 15/16):
 * live/tick-based execution is the most direct way to check whether the
 * bar-level backtest was simply too coarse, rather than trusting the
 * backtest's rejection alone. User explicit request (30.07.2026): "richte
 * ihn für alle ein" — set up test-mode monitoring across every remaining
 * built strategy, not only the ones with a positive backtest finding.
 *
 * Config: exactly the konservativ .set preset (Teil 29) — no changes.
 * Runs on DE40 H1, same chart the rest of the automation uses.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { disconnect } from '../../src/connection.js';
import { setTimeframe } from '../../src/core/chart.js';
import { ensureTradingViewReady, isXetraOpen, fetchBars } from './utils.mjs';
import { sendTelegramBriefing } from './telegram.mjs';
import { BASE_CONFIG, runBacktest } from '../../backtests/s2_engine.mjs';

const STATE_DIR = '/Users/boogy/tradingview-mcp/state';
const SIGNALS_LOG_PATH = `${STATE_DIR}/s2_signals.json`;
const DEDUP_PATH = `${STATE_DIR}/s2_dedup.json`;
const H1_BARS = 300;

function fmt(n) {
  return Number(n).toFixed(1);
}

async function main() {
  if (!isXetraOpen()) {
    console.log('Außerhalb Xetra-Zeiten — kein Strategie-S2-Test-Check.');
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

  const trades = runBacktest(bars, BASE_CONFIG);
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

    const text = [
      '🧪 STRATEGIE S2 TEST-SIGNAL (DE40, H1) — NUR Datensammlung, KEIN Live-Trade',
      '',
      `Richtung: ${t.direction}`,
      `Entry: ${fmt(t.entry)}`,
      `SL: ${fmt(t.sl)} (${BASE_CONFIG.slPoints} Pkt)`,
      '',
      'Hintergrund: kombinierter Exit+Entry-Sweep zeigt 0/1.500 Kombinationen mit Train+Test beide positiv — die klarste "keine Edge"-Ablehnung der Kaspareit-Aufarbeitung. Test-Modus läuft trotzdem (analog S1), um zu prüfen ob die Bar-Level-Simulation zu grob war. Siehe STRATEGIE_OPTIMIERUNG_HANDOVER.md Teil 29/30.',
    ].join('\n');

    const r = await sendTelegramBriefing(text);
    signalsLog.push({
      loggedAt: new Date().toISOString(), entryTime: t.entryTime, direction: t.direction,
      entry: t.entry, sl: t.sl, telegramSent: !!r.sent,
    });
    sent++;
  }

  writeFileSync(DEDUP_PATH, JSON.stringify(dedup, null, 2));
  writeFileSync(SIGNALS_LOG_PATH, JSON.stringify(signalsLog, null, 2));
  console.log(`Strategie-S2-Test-Check fertig. ${fresh.length} frische Signale, ${sent} neu gemeldet (${signalsLog.length} insgesamt geloggt).`);
  // Leave the chart on 1m after analysis (user-specified, 06.08.2026).
  await setTimeframe({ timeframe: '1' });
  await disconnect();
}

main().catch(async (e) => {
  console.error('FATAL', e.stack || e.message);
  await disconnect().catch(() => {});
  process.exit(1);
});
