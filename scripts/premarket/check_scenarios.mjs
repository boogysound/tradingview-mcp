#!/usr/bin/env node
/**
 * Lightweight, frequent scenario-entry check for A/B/D — separate from the
 * twice-daily full run.mjs (zones/OBs/FVGs/screenshot) and from check_ms.mjs
 * (Market-Shift-only). Reads already-drawn 4H S/D levels from state (no
 * redrawing), fetches fresh bars, rebuilds scenarios via the same
 * buildScenarios() run.mjs uses, then delegates to the shared, signature-
 * deduped alert in scenario_alerts.mjs — same dedup state file run.mjs also
 * writes to, so the two never double-alert the same confluence moment.
 *
 * User-specified, 28.07.2026: "wenn... alle Signale auf grün stehen" should
 * arrive as its own message, not only be visible inside the 09:20/22:00
 * briefing text — B's confluence (zone rejection + MSS + 5min confirmation)
 * can complete and fade again well within that ~13h gap. Meant to run every
 * ~15 minutes during Xetra hours via its own launchd job
 * (com.boogy.de40-scenario-check) — slightly less frequent than ms-check's
 * 10 min since this fetches one more timeframe (tactical 15m/1H) plus daily
 * bars for PDHL, and B's confluence doesn't shift as fast as raw MS structure.
 *
 * Widened 29.07.2026 (Teil 12, user-specified): "ich möchte, dass ich immer
 * potenzielle Entries auf Telegram erhalte" — the alert no longer waits for
 * full confluence; it fires for any scenario with a drawable Entry/SL/TP
 * (same gate the chart lines use), so an Entry never appears on the chart
 * without a Telegram message explaining it. See scenario_alerts.mjs.
 *
 * Also redraws the recommended Entry/SL/TP lines (same as run.mjs) so a
 * scenario that's already been resolved by price (SL or TP hit) gets its
 * lines removed within ~15 min — user-specified, 28.07.2026: "lösche immer
 * alle eingezeichneten Entries, wenn sie nicht mehr valide sind". Waiting
 * for the next twice-daily run.mjs would leave stale lines up for hours.
 *
 * Also removes mitigated FVG rectangles (fill >= 50%) within the same ~15
 * min cadence — user-specified, 29.07.2026: a mitigated FVG should disappear
 * "in dem Moment, wo sie 50% durchbrochen wurde", not wait for the next
 * twice-daily run.mjs. Same removed-vs-still-there bookkeeping as run.mjs
 * (wasActuallyRemoved, draw.mjs), scoped to just FVG entries to stay cheap.
 *
 * Also runs the S/D level lifecycle (touch-coloring + convert-to-S/R on 2nd
 * real break) within the same ~15 min cadence (Teil 13, user-specified) —
 * see applySdLevelLifecycle() in state.mjs, shared with run.mjs so the logic
 * itself lives in one place.
 */
import { disconnect } from '../../src/connection.js';
import { setTimeframe } from '../../src/core/chart.js';
import { ensureTradingViewReady, isXetraOpen, fetchBars } from './utils.mjs';
import * as lib from './lib.mjs';
import * as state from './state.mjs';
import { buildScenarios } from './briefing.mjs';
import { checkAndAlertScenarioEntries } from './scenario_alerts.mjs';
import { remove, wasActuallyRemoved, verifyDottedLinestyleCode } from './draw.mjs';

const MIN_15M_BARS = 300;
const TACTICAL_MAX_AGE_SEC = 2 * 24 * 3600;
const HTF_MAX_PCT_DISTANCE = 0.05;

async function main() {
  if (!isXetraOpen()) {
    console.log('Außerhalb Xetra-Zeiten — kein Check.');
    return;
  }

  await ensureTradingViewReady({ onLog: console.log });

  const nowSec = Math.floor(Date.now() / 1000);
  const bars12h = await fetchBars(720, 500);
  const bars4h = await fetchBars(240, 500);
  const bars15 = await fetchBars(15, 500);
  const bars1h = await fetchBars(60, 500);
  let bars5 = [];
  try { bars5 = await fetchBars(5, 500); } catch { /* optional — B's 5min-confirmation just won't be checkable this run */ }
  let dailyBars = null;
  try { dailyBars = await fetchBars('D', 60); } catch { /* PDHL boundary unavailable this run, not required for B */ }

  let tacticalBars = bars15;
  if (bars15.length < MIN_15M_BARS) tacticalBars = bars1h;
  const lastClose = tacticalBars[tacticalBars.length - 1].close;

  const regimeDateKey = lib.berlinDateTimeParts(nowSec).dateStr;
  const storedRegime = state.readDailyRegime();
  const regime = (storedRegime && storedRegime.date === regimeDateKey)
    ? storedRegime.regime
    : lib.classifyRegime({ dailyBars, bars4h, tacticalBars, lastClose, nowSec });

  const bos4h = lib.findBosEvents(bars4h);
  const lastBos4h = bos4h[bos4h.length - 1];
  const htfBias = lastBos4h ? lastBos4h.type : null;
  // Scenario A's trend is on 1H, deliberately separate from B/D's 4H htfBias
  // (see briefing.mjs's buildScenarios comment for why).
  const bos1h = lib.findBosEvents(bars1h);
  const lastBos1h = bos1h[bos1h.length - 1];
  const aHtfBias = lastBos1h ? lastBos1h.type : null;
  const shortTermBias = lib.computeLastNBias(tacticalBars, 3);
  const premiumDiscount = htfBias ? lib.computePremiumDiscount(bars4h, htfBias) : null;

  const recentEnough = (t) => (nowSec - t) <= TACTICAL_MAX_AGE_SEC;
  const sweepMssTactical = lib.findSweepMSS(tacticalBars).filter(r => recentEnough(r.mssTime)).pop() || null;
  const bosTactical = lib.findBosEvents(tacticalBars);
  const obsTactical = lib.findOrderBlocks(tacticalBars, bosTactical).filter(o => recentEnough(o.time));
  const obs4h = lib.findOrderBlocks(bars4h, bos4h).filter(o => !o.mitigated);
  const reversalObs = [...obs4h, ...obsTactical].filter(o => !o.mitigated);
  const isRelevant = (z) => lib.isPriceRelevant(z.low, z.high, lastClose, HTF_MAX_PCT_DISTANCE);
  const fvgsTactical = lib.findFVGs(tacticalBars).filter(g => lib.fvgFillFraction(g, tacticalBars) < 0.5).filter(g => recentEnough(g.time));
  const fvgs12h = lib.findFVGs(bars12h).filter(g => lib.fvgFillFraction(g, bars12h) < 0.5).filter(isRelevant);
  const fvgs4h = lib.findFVGs(bars4h).filter(g => lib.fvgFillFraction(g, bars4h) < 0.5).filter(isRelevant);
  const pdhl = dailyBars ? lib.calculatePDHL(dailyBars) : { pdh: null, pdl: null };
  const srLevels = lib.findSRLevels(tacticalBars, { tolerancePct: 0.0005, maxLevels: 8 });

  const zonesState = state.readState();
  const atrArr4h = lib.atr(bars4h, 14);
  const activeLevels4h = zonesState
    .filter(e => e.status === 'active' && e.timeframe === 240 && (e.type === 'sd_level_demand' || e.type === 'sd_level_supply'))
    .filter(e => lib.isPriceRelevant(e.price_low, e.price_high, lastClose, HTF_MAX_PCT_DISTANCE))
    .map(e => {
      const idx = bars4h.findIndex(b => b.time === e.created_bar_time);
      return { type: e.type === 'sd_level_demand' ? 'demand' : 'supply', price: e.price_low, atr: idx >= 0 ? atrArr4h[idx] : null };
    });
  const activeLevels12h = zonesState
    .filter(e => e.status === 'active' && e.timeframe === 720 && (e.type === 'sd_level_demand' || e.type === 'sd_level_supply'))
    .map(e => ({ type: e.type === 'sd_level_demand' ? 'demand' : 'supply', price: e.price_low }));

  // User-specified, 29.07.2026: a mitigated FVG (fill >= 50%) should
  // disappear "in dem Moment, wo sie 50% durchbrochen wurde" — the only
  // place that removed mitigated FVG rectangles before this was run.mjs's
  // full invalidation pass (twice daily, 09:20/22:00), so a tactical FVG
  // crossing 50% mid-session could sit stale on the chart for up to ~13h.
  // Same lightweight-frequent-cleanup pattern already used for scenario
  // lines above (`isScenarioResolved`) — reuses `state.isInvalidated()`'s
  // existing FVG branch rather than reimplementing the fill-fraction math,
  // scoped to just active fvg_bullish/fvg_bearish entries so this stays
  // cheap at the 15-min cadence (no full S/D/OB invalidation sweep here —
  // that stays twice-daily via run.mjs).
  const barsByTf = { 720: bars12h, 240: bars4h, 60: bars1h, 15: bars15, 5: bars5 };
  const nowIso = new Date(nowSec * 1000).toISOString();
  let fvgsMitigated = 0;
  for (const entry of zonesState) {
    if (entry.status !== 'active' || (entry.type !== 'fvg_bullish' && entry.type !== 'fvg_bearish')) continue;
    if (!state.isInvalidated(entry, barsByTf)) continue;
    const r = await remove(entry.tv_entity_id);
    if (wasActuallyRemoved(r)) {
      entry.status = 'removed';
      entry.removed_at = nowIso;
      entry.removed_reason = 'fvg_mitigated_50pct';
      fvgsMitigated++;
    }
  }

  // User-specified, 29.07.2026 (Teil 13): a 4H/12H level that's been broken
  // through repeatedly shouldn't wait for the twice-daily run.mjs to flip
  // into a watched S/R line — same ~15-min-cadence reasoning as the FVG
  // cleanup above. See applySdLevelLifecycle() in state.mjs for the full
  // lifecycle (fresh -> touched -> converted-to-S/R on 2nd real break).
  const dataWarnings = [];
  const dottedCheck = await verifyDottedLinestyleCode();
  const dottedCode = dottedCheck.verified ? dottedCheck.assumed : (dottedCheck.reported ?? 2);
  const { converted: levelsConverted, colored: levelsColored } = await state.applySdLevelLifecycle(zonesState, barsByTf, { tacticalBars, dottedCode, nowIso, dataWarnings });

  if (fvgsMitigated || levelsConverted || levelsColored) state.writeState(zonesState);

  const tacticalAtrArr = lib.atr(tacticalBars, 14);
  const tacticalAtr = tacticalAtrArr[tacticalAtrArr.length - 1];
  const { minutesOfDay } = lib.berlinDateTimeParts(nowSec);
  const session = lib.classifySession(minutesOfDay);
  const htfMs = bars1h && bars1h.length >= 20 ? lib.detectMarketShift(bars1h, 2) : { status: 'none' };

  const scenarios = buildScenarios({
    htfBias, activeLevels4h, fvgsTactical, pdhl, lastClose, regime,
    sweepMss: sweepMssTactical, premiumDiscount, bars5, nowSec, reversalObs,
    shortTermBias, tacticalAtr, tacticalBars, session, htfMs,
    aHtfBias, activeLevels12h, srLevels, fvgs12h, fvgs4h,
  });

  const result = await checkAndAlertScenarioEntries(scenarios);

  console.log(JSON.stringify({
    alertsSent: result.alertsSent,
    telegramResults: result.telegramResults,
    scenarios: scenarios.map(s => ({ type: s.type, direction: s.direction, metCount: s.metCount, totalCount: s.totalCount, probability: s.probability })),
    fvgsMitigated,
    levelsConverted,
    levelsColored,
    dataWarnings,
  }));

  // Leave the chart on 1m after analysis (user-specified, 06.08.2026).
  await setTimeframe({ timeframe: '1' });
}

main()
  .catch(err => { console.error('FATAL:', err.message); process.exitCode = 1; })
  .finally(() => disconnect().catch(() => {}));
