#!/usr/bin/env node
/**
 * Strategie InsideBar TEST-MODE live signal checker (30.07.2026,
 * user-requested) — NOT a trading strategy running in run.mjs/production.
 * Reimplemented in backtests/insidebar_engine.mjs — the breadth/density
 * of its combined sweep (Teil 33) plus a clean M1-fine-granularity
 * re-verification (Teil 35) make it, alongside S3, the most thoroughly
 * checked Kaspareit finding so far.
 *
 * STRUCTURALLY DIFFERENT from every other checker in this repo: InsideBar
 * places PENDING STOP ORDERS (buy-stop at the master candle's high /
 * sell-stop at its low) that can sit live for up to `orderExpiryBars`
 * M5 bars (96 = 8h in the deployed config) before triggering or expiring
 * — not an immediate market entry at signal detection. `runBacktest()`
 * tracks this internally but only returns CLOSED trades, so it can't be
 * called as-is to see "what's pending right now". This checker instead:
 *   1. Uses the newly-exported `computeFilterState()` (extracted from
 *      insidebar_engine.mjs, 30.07.2026, no behavior change — verified
 *      identical backtest output before/after) to get the EMA/SuperTrend/
 *      ATR filter arrays fresh each run.
 *   2. Checks the LAST completed Master+Inside pair itself (same
 *      body%/containment logic as the engine) — if it qualifies, adds a
 *      pending order to `state/insidebar_pending.json` (deduped by the
 *      master bar's own timestamp, so the same pattern is never queued
 *      twice).
 *   3. Replays every bar since each pending order's placement against its
 *      trigger price — first bar to cross it fires the alert (an ENTRY,
 *      not just a pattern sighting) and removes the order from pending;
 *      an order past its expiry with no trigger is silently dropped (same
 *      as the backtest engine — an expired, never-triggered order is not
 *      a trade).
 *
 * Config: the representative sweep-neighborhood candidate from Teil 33/35
 * (masterBodyPct=30, all 3 filters on, orderExpiryBars=96, riskScale=0.5,
 * targetScale=0.75). Runs on DE40 M5 with H1 for the EMA/SuperTrend
 * filters (same pattern as strategy_insidebar.mjs's baseline).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { disconnect } from '../../src/connection.js';
import { setTimeframe } from '../../src/core/chart.js';
import { ensureTradingViewReady, isXetraOpen, fetchBars } from './utils.mjs';
import { sendTelegramBriefing } from './telegram.mjs';
import { BASE_CONFIG, computeFilterState } from '../../backtests/insidebar_engine.mjs';

const STATE_DIR = '/Users/boogy/tradingview-mcp/state';
const SIGNALS_LOG_PATH = `${STATE_DIR}/insidebar_signals.json`;
const DEDUP_PATH = `${STATE_DIR}/insidebar_dedup.json`;
const PENDING_PATH = `${STATE_DIR}/insidebar_pending.json`;
const M5_BARS = 300;
const H1_BARS = 300;
const CFG = {
  ...BASE_CONFIG,
  masterBodyPct: 30,
  orderExpiryBars: 96,
  maxSlPct: BASE_CONFIG.maxSlPct * 0.5,
  tpFinalSlPct: BASE_CONFIG.tpFinalSlPct * 0.75,
  tp1SlPct: BASE_CONFIG.tp1SlPct * 0.75,
  tp2SlPct: BASE_CONFIG.tp2SlPct * 0.75,
};

function fmt(n) {
  return Number(n).toFixed(1);
}

async function main() {
  if (!isXetraOpen()) {
    console.log('Außerhalb Xetra-Zeiten — kein Strategie-InsideBar-Test-Check.');
    return;
  }

  await ensureTradingViewReady({ onLog: console.log });
  const bars = await fetchBars(5, M5_BARS);
  const htfBars = await fetchBars(60, H1_BARS);
  if (bars.length < 20 || htfBars.length < 20) {
    console.log(`Zu wenig Historie geladen (M5=${bars.length}, H1=${htfBars.length}) — überspringe diesen Lauf.`);
    await setTimeframe({ timeframe: '1' });
    await disconnect();
    return;
  }

  mkdirSync(STATE_DIR, { recursive: true });
  const dedup = existsSync(DEDUP_PATH) ? JSON.parse(readFileSync(DEDUP_PATH, 'utf8')) : {};
  const signalsLog = existsSync(SIGNALS_LOG_PATH) ? JSON.parse(readFileSync(SIGNALS_LOG_PATH, 'utf8')) : [];
  let pending = existsSync(PENDING_PATH) ? JSON.parse(readFileSync(PENDING_PATH, 'utf8')) : [];

  const { htfEma, htfStDir, atrArr } = computeFilterState(bars, htfBars, CFG, { useEma: CFG.useEma, useSt: CFG.useSt, useAtr: CFG.useAtr });

  // Step 1: detect a fresh Master(n-2)/Inside(n-1) pair at the current last bar.
  const i = bars.length - 1;
  const master = bars[i - 1];
  const insideBar = bars[i];
  const masterRange = master.high - master.low;
  if (masterRange > 0) {
    const bodyPct = Math.abs(master.close - master.open) / masterRange * 100;
    const isInside = insideBar.high <= master.high && insideBar.low >= master.low;
    if (bodyPct >= CFG.masterBodyPct && isInside && !dedup[`master_${master.time}`]) {
      const emaOk = !CFG.useEma || htfEma[i] != null;
      const stOk = !CFG.useSt || htfStDir[i] != null;
      const atrOk = !CFG.useAtr || (atrArr[i] != null && atrArr[i] >= CFG.atrMin && atrArr[i] <= CFG.atrMax);
      if (emaOk && stOk && atrOk) {
        const longOk = (!CFG.useEma || insideBar.close > htfEma[i]) && (!CFG.useSt || htfStDir[i] === 1);
        const shortOk = (!CFG.useEma || insideBar.close < htfEma[i]) && (!CFG.useSt || htfStDir[i] === -1);
        const expiresAtTime = insideBar.time + CFG.orderExpiryBars * 300;
        if (longOk) pending.push({ direction: 'LONG', masterTime: master.time, triggerPrice: master.high, sl: master.low, expiresAtTime });
        if (shortOk) pending.push({ direction: 'SHORT', masterTime: master.time, triggerPrice: master.low, sl: master.high, expiresAtTime });
        if (longOk || shortOk) dedup[`master_${master.time}`] = true;
      }
    }
  }

  // Step 2: check every pending order against bars fetched since it was placed.
  const stillPending = [];
  let sent = 0;
  for (const p of pending) {
    if (bars[bars.length - 1].time > p.expiresAtTime) continue; // expired, silently dropped
    const isLong = p.direction === 'LONG';
    let triggeredAt = null;
    for (const b of bars) {
      if (b.time <= p.masterTime + 300) continue; // only bars after the inside bar itself
      if (b.time > p.expiresAtTime) break;
      const hit = isLong ? b.high >= p.triggerPrice : b.low <= p.triggerPrice;
      if (hit) { triggeredAt = b; break; }
    }
    if (!triggeredAt) { stillPending.push(p); continue; }

    const key = `${p.direction}_${p.masterTime}`;
    if (dedup[key]) continue;
    dedup[key] = true;

    const entry = p.triggerPrice;
    const risk = Math.abs(entry - p.sl) * (CFG.maxSlPct / 100);
    const sl = isLong ? entry - risk : entry + risk;
    const tp1Price = isLong ? entry + (CFG.tp1SlPct / 100) * risk : entry - (CFG.tp1SlPct / 100) * risk;
    const tp2Price = isLong ? entry + (CFG.tp2SlPct / 100) * risk : entry - (CFG.tp2SlPct / 100) * risk;
    const tpFinalPrice = isLong ? entry + (CFG.tpFinalSlPct / 100) * risk : entry - (CFG.tpFinalSlPct / 100) * risk;

    const text = [
      '🧪 STRATEGIE INSIDEBAR TEST-SIGNAL (DE40, M5) — NUR Datensammlung, KEIN Live-Trade',
      '',
      `Richtung: ${p.direction} (Pending-Stop-Order ausgelöst)`,
      `Entry: ${fmt(entry)}`,
      `SL: ${fmt(sl)} (Risiko: ${fmt(risk)} Pkt)`,
      `TP1: ${fmt(tp1Price)} (33%) | TP2: ${fmt(tp2Price)} (33%) | Final: ${fmt(tpFinalPrice)} (Rest)`,
      '',
      'Hintergrund: kombinierter Sweep zeigt die breiteste, dichteste Robust-Nachbarschaft der gesamten Kaspareit-Aufarbeitung (Teil 33), per M1-Feingranularitäts-Reverifikation bestätigt (Teil 35). Dieser Testmodus sammelt echte Live-Daten zur unabhängigen Prüfung. Siehe STRATEGIE_OPTIMIERUNG_HANDOVER.md Teil 32-35.',
    ].join('\n');

    const r = await sendTelegramBriefing(text);
    signalsLog.push({
      loggedAt: new Date().toISOString(), entryTime: triggeredAt.time, direction: p.direction,
      entry, sl, tp1Price, tp2Price, tpFinalPrice, telegramSent: !!r.sent,
    });
    sent++;
  }

  writeFileSync(DEDUP_PATH, JSON.stringify(dedup, null, 2));
  writeFileSync(SIGNALS_LOG_PATH, JSON.stringify(signalsLog, null, 2));
  writeFileSync(PENDING_PATH, JSON.stringify(stillPending, null, 2));
  console.log(`Strategie-InsideBar-Test-Check fertig. ${stillPending.length} Orders weiter pending, ${sent} neu ausgelöst/gemeldet (${signalsLog.length} insgesamt geloggt).`);
  // Leave the chart on 1m after analysis (user-specified, 06.08.2026).
  await setTimeframe({ timeframe: '1' });
  await disconnect();
}

main().catch(async (e) => {
  console.error('FATAL', e.stack || e.message);
  await disconnect().catch(() => {});
  process.exit(1);
});
