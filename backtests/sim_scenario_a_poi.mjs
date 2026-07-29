/**
 * Backtest prototype for the new Scenario A ("Trend-Reversal-Fade an POI"),
 * per the user's spec (28.07.2026) + refined timeframe hierarchy (same day):
 *   1. HTF trend via 1H BOS (htfBias) — NOT 4H (user-refined).
 *   2. Only look for A when price is CURRENTLY counter-trend (shortTermBias,
 *      15m, opposite of htfBias) — i.e., a pullback against the dominant trend.
 *   3. POI pool = TREND-direction zones (demand for bull, supply for bear)
 *      the counter-move is heading toward: 4H+12H S/D levels (user-refined:
 *      "zeichne im 12h und im 4h chart die SD Zonen") AND S/R (findSRLevels
 *      on the tactical/15m series — a pure function of price, stand-in for
 *      the live system's stateful sr_flip_* lines, which need persistent
 *      zone-lifecycle tracking this pure backtest doesn't have).
 *   4. Entry trigger: a CONFIRMED Market Shift OR a Sweep+MSS on 5m (user-
 *      refined: "finde MS im 5min chart"), in the REVERSAL direction (back
 *      to htfBias), recent, and near the POI — PLUS the current 5m candle
 *      itself must be a reaction candle in that direction (approximates
 *      "mache Entries im 1m chart": TradingView's 1m lazy-load only reaches
 *      back 16 days — far too little to backtest — so 5m stands in for both
 *      the MS layer and the finer entry-confirmation layer, user-approved
 *      28.07.2026 trade-off).
 *   5. Bonus (tracked, not gating): Order Block (5m) + FVG in 12H/4H/15m
 *      (user-refined: "FVGs bitte in 12h, 4h und 15min finden") in reversal
 *      direction near the POI — "mehr Konfluenz = besser", per user.
 *   6. R:R >= 2, target = nearest real zone ahead in trend direction (else
 *      fixed 2x SL floor).
 *
 * Data limitation (documented, not hidden): TradingView's 5m lazy-load only
 * reaches back to 2026-05-31 (vs. 2026-02-02 for 15m) — so this sim only
 * covers ~2 months (31.05.-28.07.2026), not the full 6-month window used
 * for Scenario B. Small-sample caveat applies more strongly here. 12H bars
 * are synthesized by grouping consecutive 4H bars in 3s (no separate 12H
 * fetch) — a simplification, not necessarily aligned to real session
 * boundaries, acceptable for this exploratory backtest.
 */
import { writeFileSync, readFileSync } from 'fs';
import * as lib from '../scripts/premarket/lib.mjs';

const DIR = '/Users/boogy/tradingview-mcp/backtests';
const bars15All = JSON.parse(readFileSync(`${DIR}/data_15m.json`, 'utf8'));
const bars4hAll = JSON.parse(readFileSync(`${DIR}/data_4h.json`, 'utf8'));
const bars1hAll = JSON.parse(readFileSync(`${DIR}/data_1h.json`, 'utf8'));
const bars5All = JSON.parse(readFileSync(`${DIR}/data_5m.json`, 'utf8'));

const SIM_START = bars5All[0].time; // bounded by 5m data availability
const STEP_MIN = 15;
const WINDOW = 500;
const HTF_MAX_PCT = 0.05;
const SD_LEVEL_MAX_AGE_SEC = 15 * 24 * 3600;
const REACTION_MAX_AGE_SEC = 4 * 3600; // MS/sweep signal must be recent (one half-session)
const DEDUP_TOLERANCE_PCT = 0.001;
const DEDUP_MAX_AGE_SEC = 3 * 24 * 3600;
const EXPIRY_BARS = 640; // 15m bars, matches B's convention

function bars4hUpTo(nowSec) {
  const closed = [];
  for (const b of bars4hAll) {
    if (b.time + 4 * 3600 <= nowSec) closed.push(b);
    else if (b.time <= nowSec) {
      const parts = bars15All.filter(x => x.time >= b.time && x.time <= nowSec && x.time < b.time + 4 * 3600);
      if (parts.length) closed.push({ time: b.time, open: parts[0].open, high: Math.max(...parts.map(x => x.high)), low: Math.min(...parts.map(x => x.low)), close: parts[parts.length - 1].close, volume: 0 });
    }
  }
  return closed.slice(-WINDOW);
}
function bars1hUpTo(nowSec) {
  const closed = [];
  for (const b of bars1hAll) {
    if (b.time + 3600 <= nowSec) closed.push(b);
    else if (b.time <= nowSec) {
      const parts = bars15All.filter(x => x.time >= b.time && x.time <= nowSec && x.time < b.time + 3600);
      if (parts.length) closed.push({ time: b.time, open: parts[0].open, high: Math.max(...parts.map(x => x.high)), low: Math.min(...parts.map(x => x.low)), close: parts[parts.length - 1].close, volume: 0 });
    }
  }
  return closed.slice(-WINDOW);
}
function bars12hUpTo(nowSec) {
  const closed4h = bars4hAll.filter(b => b.time + 4 * 3600 <= nowSec);
  const out = [];
  for (let i = 0; i + 3 <= closed4h.length; i += 3) {
    const g = closed4h.slice(i, i + 3);
    out.push({ time: g[0].time, open: g[0].open, high: Math.max(...g.map(x => x.high)), low: Math.min(...g.map(x => x.low)), close: g[g.length - 1].close, volume: 0 });
  }
  return out.slice(-WINDOW);
}
function bars5UpTo(nowSec) {
  let lo = 0, hi = bars5All.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (bars5All[mid].time <= nowSec) lo = mid + 1; else hi = mid; }
  return bars5All.slice(Math.max(0, lo - WINDOW), lo);
}

function resolveScenario(entry, expiryBars) {
  const startIdx = bars15All.findIndex(b => b.time > entry.loggedBarTime);
  if (startIdx === -1) return { outcome: 'open', resolvedIdx: Infinity, rr: 0 };
  const isLong = entry.direction === 'LONG';
  let touchIdx = -1;
  for (let i = startIdx; i < bars15All.length; i++) {
    const b = bars15All[i];
    if (b.low <= entry.zonePrice && entry.zonePrice <= b.high) { touchIdx = i; break; }
    if (i - startIdx + 1 >= expiryBars) return { outcome: 'not_triggered', resolvedIdx: i, rr: 0 };
  }
  if (touchIdx === -1) return { outcome: 'open', resolvedIdx: Infinity, rr: 0 };
  const slDist = Math.abs(entry.zonePrice - entry.sl);
  const rrTarget = slDist > 0 ? Math.abs(entry.target - entry.zonePrice) / slDist : 0;
  for (let i = touchIdx; i < bars15All.length; i++) {
    const b = bars15All[i];
    const hitSl = isLong ? b.low <= entry.sl : b.high >= entry.sl;
    const hitTarget = isLong ? b.high >= entry.target : b.low <= entry.target;
    if (hitSl) return { outcome: 'sl_hit', resolvedIdx: i, rr: -1 };
    if (hitTarget) return { outcome: 'target_hit', resolvedIdx: i, rr: rrTarget };
    if (i - touchIdx >= expiryBars) return { outcome: 'expired_pending', resolvedIdx: i, rr: 0 };
  }
  return { outcome: 'open', resolvedIdx: Infinity, rr: 0 };
}

const simLog = [];
let steps = 0;
const daysSeen = new Set();

for (let i = 0; i < bars15All.length; i++) {
  const bar = bars15All[i];
  const nowSec = bar.time + 15 * 60;
  if (nowSec < SIM_START) continue;

  const parts = lib.berlinDateTimeParts(nowSec);
  const dow = new Date(nowSec * 1000).getUTCDay();
  if (dow === 0 || dow === 6) continue;
  if (parts.minutesOfDay < 8 * 60 || parts.minutesOfDay > 17 * 60 + 30) continue;
  if (parts.minutesOfDay % STEP_MIN !== 0) continue;

  daysSeen.add(parts.dateStr);
  steps++;

  const tacticalBars = bars15All.slice(Math.max(0, i + 1 - WINDOW), i + 1);
  const bars4h = bars4hUpTo(nowSec);
  const bars1h = bars1hUpTo(nowSec);
  const bars12h = bars12hUpTo(nowSec);
  const bars5 = bars5UpTo(nowSec);
  const lastClose = bar.close;
  if (bars5.length < 30 || bars1h.length < 20) continue;

  // step 1: trend via 1H BOS (user-refined, was 4H)
  const bos1h = lib.findBosEvents(bars1h);
  const lastBos = bos1h[bos1h.length - 1];
  const htfBias = lastBos ? lastBos.type : null;
  if (!htfBias) continue;
  const bull = htfBias === 'bullish';
  const shortTermBias = lib.computeLastNBias(tacticalBars, 3);

  // step 2: require CURRENTLY counter-trend
  if (!shortTermBias || shortTermBias === htfBias) continue;

  // step 3: POI pool — trend-direction zones ahead of price (12H+4H S/D, +
  // tactical S/R), in the direction the counter-move is heading (bull: below lastClose)
  const sdLevels = [
    ...lib.findSDLevels(bars12h, { nowSec }),
    ...lib.findSDLevels(bars4h, { nowSec }),
  ]
    .filter(l => l.type === (bull ? 'demand' : 'supply'))
    .filter(l => lib.isPriceRelevant(l.price, l.price, lastClose, HTF_MAX_PCT))
    .filter(l => (nowSec - l.time) <= SD_LEVEL_MAX_AGE_SEC)
    .map(l => l.price);
  const srLevels = lib.findSRLevels(tacticalBars, { tolerancePct: 0.0005, maxLevels: 8 })
    .filter(l => l.type === (bull ? 'support' : 'resistance'))
    .map(l => l.price);
  const poiPool = [...sdLevels, ...srLevels].filter(p => (bull ? p < lastClose : p > lastClose));
  if (!poiPool.length) continue;
  const nearestPOI = poiPool.sort((a, b) => bull ? b - a : a - b)[0];

  const tacticalAtrArr = lib.atr(tacticalBars, 14);
  const tacticalAtr = tacticalAtrArr[tacticalAtrArr.length - 1];
  const poiTolerance = tacticalAtr ? tacticalAtr * 1.5 : Math.abs(nearestPOI) * 0.0015;
  const nearPOI = (level) => level != null && Math.abs(level - nearestPOI) <= poiTolerance;

  // step 4: MS/Sweep signal on 5m near POI, PLUS current 5m candle must
  // itself be a reaction candle in the reversal direction (stand-in for
  // the 1m entry-confirmation layer — see file header).
  const reversalDirection = bull ? 'bullish' : 'bearish';
  const ms5m = bars5.length >= 20 ? lib.detectMarketShift(bars5, 2) : { status: 'none' };
  const msSignal = ms5m.status === 'confirmed' && ms5m.direction === reversalDirection &&
    (nowSec - ms5m.break_time) <= REACTION_MAX_AGE_SEC && nearPOI(ms5m.brokenLevel?.price);
  const sweep5m = lib.findSweepMSS(bars5, 2, 10).filter(s => (nowSec - s.mssTime) <= REACTION_MAX_AGE_SEC).pop();
  const sweepSignal = !!(sweep5m && sweep5m.type === reversalDirection && (nearPOI(sweep5m.sweptLevel) || nearPOI(sweep5m.mssLevel)));
  if (!msSignal && !sweepSignal) continue;

  const currentBar5m = bars5[bars5.length - 1];
  const entryConfirmed = reversalDirection === 'bullish' ? currentBar5m.close > currentBar5m.open : currentBar5m.close < currentBar5m.open;
  if (!entryConfirmed) continue;

  // step 5: bonus confluence (tracked only) — OB on 5m, FVG on 12H/4H/15m
  const bos5m = lib.findBosEvents(bars5);
  const obs5m = lib.findOrderBlocks(bars5, bos5m).filter(o => !o.mitigated);
  const obConfirm = obs5m.some(o => o.type === reversalDirection && nearPOI((o.low + o.high) / 2));
  const fvgSources = [
    ...lib.findFVGs(bars12h).filter(g => lib.fvgFillFraction(g, bars12h) < 0.5),
    ...lib.findFVGs(bars4h).filter(g => lib.fvgFillFraction(g, bars4h) < 0.5),
    ...lib.findFVGs(tacticalBars).filter(g => lib.fvgFillFraction(g, tacticalBars) < 0.5),
  ];
  const fvgConfirm = fvgSources.some(g => g.type === reversalDirection && nearPOI((g.low + g.high) / 2));
  const confluenceCount = (msSignal ? 1 : 0) + (sweepSignal ? 1 : 0) + (obConfirm ? 1 : 0) + (fvgConfirm ? 1 : 0);

  // step 6: entry/SL/TP, R:R >= 2, target = nearest real zone ahead in trend direction
  const buffer = tacticalAtr ? tacticalAtr * 0.5 : Math.abs(nearestPOI) * 0.0015;
  const sl = bull ? nearestPOI - buffer : nearestPOI + buffer;
  const slDist = Math.abs(nearestPOI - sl);
  const targetPool = [
    ...lib.findSDLevels(bars12h, { nowSec }).map(l => l.price),
    ...lib.findSDLevels(bars4h, { nowSec }).map(l => l.price),
    ...lib.findSRLevels(tacticalBars, { tolerancePct: 0.0005, maxLevels: 8 }).map(l => l.price),
  ]
    .filter(p => bull ? p > nearestPOI : p < nearestPOI)
    .filter(p => Math.abs(p - nearestPOI) / slDist >= 2)
    .sort((a, b) => Math.abs(a - nearestPOI) - Math.abs(b - nearestPOI));
  const target = targetPool.length ? targetPool[0] : (bull ? nearestPOI + 2 * slDist : nearestPOI - 2 * slDist);

  const entry = {
    type: 'trend_reversal_poi', direction: bull ? 'LONG' : 'SHORT',
    zonePrice: nearestPOI, sl, target,
    loggedAtSec: nowSec, loggedBarTime: bar.time,
    dateStr: parts.dateStr, minutesOfDay: parts.minutesOfDay,
    trigger: msSignal ? 'ms' : 'sweep', confluenceCount,
  };

  const dup = simLog.some(e => e.direction === entry.direction &&
    Math.abs(e.zonePrice - entry.zonePrice) <= Math.abs(entry.zonePrice) * DEDUP_TOLERANCE_PCT &&
    (nowSec - e.loggedAtSec) < DEDUP_MAX_AGE_SEC && e.resolvedIdx > i);
  if (dup) continue;

  const res = resolveScenario(entry, EXPIRY_BARS);
  entry.outcome = res.outcome; entry.resolvedIdx = res.resolvedIdx; entry.rr = res.rr;
  simLog.push(entry);
}

function agg(entries) {
  const wins = entries.filter(e => e.outcome === 'target_hit');
  const losses = entries.filter(e => e.outcome === 'sl_hit');
  const resolved = wins.length + losses.length;
  const sumR = entries.reduce((s, e) => s + e.rr, 0);
  return {
    total: entries.length, wins: wins.length, losses: losses.length,
    open: entries.filter(e => e.outcome === 'open').length,
    not_triggered: entries.filter(e => e.outcome === 'not_triggered').length,
    winRate: resolved ? +(wins.length / resolved * 100).toFixed(1) : null,
    expR: resolved ? +(sumR / resolved).toFixed(2) : null,
  };
}

const byMonth = {};
for (const e of simLog) { const m = e.dateStr.slice(0, 7); byMonth[m] = byMonth[m] || []; byMonth[m].push(e); }
const monthly = Object.fromEntries(Object.entries(byMonth).sort().map(([m, es]) => [m, agg(es)]));

const byTrigger = {};
for (const t of ['ms', 'sweep']) byTrigger[t] = agg(simLog.filter(e => e.trigger === t));

const byConfluence = {};
for (const c of [1, 2, 3, 4]) byConfluence[c] = agg(simLog.filter(e => e.confluenceCount === c));

const out = {
  window: { from: new Date(SIM_START * 1000).toISOString().slice(0, 10), to: new Date(bars15All[bars15All.length - 1].time * 1000).toISOString().slice(0, 10) },
  tradingDays: daysSeen.size, simSteps: steps, scenariosLogged: simLog.length,
  overall: agg(simLog), monthly, byTrigger, byConfluence,
};
writeFileSync(`${DIR}/sim_scenario_a_results.json`, JSON.stringify(out, null, 2));
writeFileSync(`${DIR}/sim_scenario_a_log.json`, JSON.stringify(simLog, null, 2));
console.log(JSON.stringify(out, null, 2));
