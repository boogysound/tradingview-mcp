#!/usr/bin/env node
/**
 * Strategie S4 TEST-MODE live signal checker (30.07.2026, user-requested)
 * — NOT a trading strategy running in run.mjs/production. Same pattern as
 * check_ut.mjs/check_s3.mjs, reimplemented in backtests/s4_engine.mjs.
 *
 * S4's baseline (Teil 31) only produced 5 LONG/9 SHORT trades over 14
 * months — the filter/pyramiding sweep (Teil 34) found the real
 * bottleneck was this repo's own `maxOpenTrades=1` baseline simplification
 * (not the Magic Trend filters, as first suspected), and that LONG still
 * shows no robust edge even loosened (test-window result exactly matches
 * the Xpct target at 100% WR — a regime artifact, not a real edge), while
 * SHORT shows a weaker, not fully robust but genuine positive signal.
 * Deployed in test mode for BOTH directions anyway, per the user's
 * explicit request to monitor every built strategy regardless of verdict
 * (30.07.2026: "richte ihn für alle ein").
 *
 * Config: each direction's own real MT1/MT2/dcLength/rsiPeriod from
 * BASE_CONFIGS (unchanged, faithful to the actual presets) — only
 * `maxOpenTrades` raised from the baseline's 1 to 10 (the Teil-34 fix),
 * so signals aren't needlessly starved by the single-trade-at-a-time
 * simplification. Runs on DE40 H4 (`Xpct_analysis_TF` in both real
 * presets) with Daily for LONG's MT2 D1 alignment.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { disconnect } from '../../src/connection.js';
import { setTimeframe } from '../../src/core/chart.js';
import { ensureTradingViewReady, isXetraOpen, fetchBars } from './utils.mjs';
import { sendTelegramBriefing } from './telegram.mjs';
import { BASE_CONFIGS, runDirection } from '../../backtests/s4_engine.mjs';

const STATE_DIR = '/Users/boogy/tradingview-mcp/state';
const SIGNALS_LOG_PATH = `${STATE_DIR}/s4_signals.json`;
const DEDUP_PATH = `${STATE_DIR}/s4_dedup.json`;
const H4_BARS = 400;
const DAILY_BARS = 300;

function fmt(n) {
  return Number(n).toFixed(1);
}

async function main() {
  if (!isXetraOpen()) {
    console.log('Außerhalb Xetra-Zeiten — kein Strategie-S4-Test-Check.');
    return;
  }

  await ensureTradingViewReady({ onLog: console.log });
  const bars = await fetchBars(240, H4_BARS);
  const dailyBars = await fetchBars('D', DAILY_BARS);
  if (bars.length < 20 || dailyBars.length < 20) {
    console.log(`Zu wenig Historie geladen (H4=${bars.length}, D1=${dailyBars.length}) — überspringe diesen Lauf.`);
    await setTimeframe({ timeframe: '1' });
    await disconnect();
    return;
  }

  mkdirSync(STATE_DIR, { recursive: true });
  const dedup = existsSync(DEDUP_PATH) ? JSON.parse(readFileSync(DEDUP_PATH, 'utf8')) : {};
  const signalsLog = existsSync(SIGNALS_LOG_PATH) ? JSON.parse(readFileSync(SIGNALS_LOG_PATH, 'utf8')) : [];
  const lastBarIdx = bars.length - 1;

  let totalFresh = 0, totalSent = 0;
  for (const direction of ['LONG', 'SHORT']) {
    const cfg = { ...BASE_CONFIGS[direction], maxOpenTrades: 10 };
    const trades = runDirection(bars, direction, cfg, dailyBars);
    const fresh = trades.filter(t => t.entryIdx === lastBarIdx);
    totalFresh += fresh.length;

    for (const t of fresh) {
      const key = `${direction}_${t.entryTime}`;
      if (dedup[key]) continue;
      dedup[key] = true;

      const text = [
        `🧪 STRATEGIE S4 TEST-SIGNAL [${direction}] (DE40, H4, DC-RSI) — NUR Datensammlung, KEIN Live-Trade`,
        '',
        `Richtung: ${t.direction}`,
        `Entry: ${fmt(t.entry)}`,
        `SL: ${fmt(t.sl)} (weiter Katastrophen-Stop, 100 Kerzen)`,
        `Xpct-Ziel: ${cfg.xpctProfitTargetPct}% vom Entry`,
        '',
        direction === 'LONG'
          ? 'Hintergrund: LONG zeigt auch nach Filter-/Pyramiding-Lockerung keine belastbare Edge (Teil 34) — das Test-Fenster-Ergebnis wirkte wie ein Regime-Artefakt. Test-Modus läuft trotzdem (analog S1), um echte Live-Daten zu sammeln. Siehe STRATEGIE_OPTIMIERUNG_HANDOVER.md Teil 31/34.'
          : 'Hintergrund: SHORT zeigt ein schwächeres, nicht robust bestätigtes, aber echtes positives Signal nach Filter-/Pyramiding-Lockerung (Teil 34). Siehe STRATEGIE_OPTIMIERUNG_HANDOVER.md Teil 31/34.',
      ].join('\n');

      const r = await sendTelegramBriefing(text);
      signalsLog.push({
        loggedAt: new Date().toISOString(), direction: t.direction, entryTime: t.entryTime,
        entry: t.entry, sl: t.sl, telegramSent: !!r.sent,
      });
      totalSent++;
    }
  }

  writeFileSync(DEDUP_PATH, JSON.stringify(dedup, null, 2));
  writeFileSync(SIGNALS_LOG_PATH, JSON.stringify(signalsLog, null, 2));
  console.log(`Strategie-S4-Test-Check fertig. ${totalFresh} frische Signale (beide Richtungen), ${totalSent} neu gemeldet (${signalsLog.length} insgesamt geloggt).`);
  // Leave the chart on 1m after analysis (user-specified, 06.08.2026).
  await setTimeframe({ timeframe: '1' });
  await disconnect();
}

main().catch(async (e) => {
  console.error('FATAL', e.stack || e.message);
  await disconnect().catch(() => {});
  process.exit(1);
});
