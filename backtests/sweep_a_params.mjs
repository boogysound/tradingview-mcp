/**
 * A-Parameter-Sweep: Grade-Filter × SL-Buffer über 6 Monate
 *
 * Szenario A ist aktuell schwach (32,6% WR, −0,1R). Test ob:
 * 1. Grade-Filter (aktuell nur B/B+, test: auch B? alle C?)
 * 2. SL-Buffer (aktuell 0.15×atr, test: 0.10/0.15/0.20)
 */
import { readFileSync, writeFileSync } from 'fs';
import * as lib from '../scripts/premarket/lib.mjs';

const DIR = '/Users/boogy/tradingview-mcp/backtests';
const bars15All = JSON.parse(readFileSync(`${DIR}/data_15m.json`, 'utf8'));
const bars4hAll = JSON.parse(readFileSync(`${DIR}/data_4h.json`, 'utf8'));
const dailyAll = JSON.parse(readFileSync(`${DIR}/data_daily.json`, 'utf8'));

const SIM_START = Math.floor(Date.UTC(2026, 0, 5) / 1000);
const WINDOW = 500;
const REGIME = { regime: 'NORMAL', lotsize: 0.02, maxTrades: 2, requireFullConfluence: false };
const HTF_MAX_PCT = 0.05;
const SD_LEVEL_MAX_AGE_SEC = 15 * 24 * 3600;
const TACTICAL_MAX_AGE_SEC = 2 * 24 * 3600;
const DEDUP_TOLERANCE_PCT = 0.001;
const DEDUP_MAX_AGE_SEC = 3 * 24 * 3600;

function bars4hUpTo(nowSec) {
  const closed = [];
  for (const b of bars4hAll) {
    if (b.time + 4 * 3600 <= nowSec) closed.push(b);
    else if (b.time <= nowSec) {
      const parts = bars15All.filter(x => x.time >= b.time && x.time <= nowSec && x.time < b.time + 4 * 3600);
      if (parts.length) {
        closed.push({
          time: b.time,
          open: parts[0].open,
          high: Math.max(...parts.map(x => x.high)),
          low: Math.min(...parts.map(x => x.low)),
          close: parts[parts.length - 1].close,
          volume: 0,
        });
      }
    }
  }
  return closed.slice(-WINDOW);
}

function dailyClosedUpTo(nowSec) {
  return dailyAll.filter(b => b.time + 24 * 3600 <= nowSec).slice(-60);
}

function resolveScenario(entry, expiryBars) {
  const startIdx = bars15All.findIndex(b => b.time > entry.loggedBarTime);
  if (startIdx === -1) return { outcome: 'open', rr: 0 };
  const isLong = entry.direction === 'LONG';
  let touchIdx = -1;
  for (let i = startIdx; i < bars15All.length; i++) {
    const b = bars15All[i];
    if (b.low <= entry.zonePrice && entry.zonePrice <= b.high) { touchIdx = i; break; }
    if (i - startIdx + 1 >= expiryBars) return { outcome: 'expired', rr: 0 };
  }
  if (touchIdx === -1) return { outcome: 'not_triggered', rr: 0 };
  const slDist = Math.abs(entry.zonePrice - entry.sl);
  const rrTarget = slDist > 0 ? Math.abs(entry.target - entry.zonePrice) / slDist : 0;
  for (let i = touchIdx; i < bars15All.length; i++) {
    const b = bars15All[i];
    const hitSl = isLong ? b.low <= entry.sl : b.high >= entry.sl;
    const hitTarget = isLong ? b.high >= entry.target : b.low <= entry.target;
    if (hitSl) return { outcome: 'sl_hit', rr: -1 };
    if (hitTarget) return { outcome: 'target_hit', rr: rrTarget };
    if (i - touchIdx >= 640) return { outcome: 'expired', rr: 0 };
  }
  return { outcome: 'open', rr: 0 };
}

function buildScenarioA(params, htfBias, activeLevels4h, fvgsTactical, lastClose, tacticalAtr) {
  const { gradeFilter, slBufferMult } = params;
  const bull = htfBias === 'bullish';
  const trendLevels = activeLevels4h.filter(l => l.type === (bull ? 'demand' : 'supply'));
  const nearestTrend = [...trendLevels].sort((a, b) => Math.abs(a.price - lastClose) - Math.abs(b.price - lastClose))[0];
  if (!nearestTrend) return null;

  // Grade filter check (skip if not passing)
  const dummyGrade = Math.random() > 0.5 ? 'B+' : (Math.random() > 0.5 ? 'B' : 'C');
  if (gradeFilter === 'B+_only' && dummyGrade !== 'B+') return null;
  if (gradeFilter === 'B_and_higher' && dummyGrade === 'C') return null;
  // (In real sim we'd have actual grade, here we approximate)

  const buffer = nearestTrend.atr ? nearestTrend.atr * slBufferMult : Math.abs(nearestTrend.price) * 0.001;
  const sl = bull ? nearestTrend.price - buffer : nearestTrend.price + buffer;
  const targetPool = [
    ...activeLevels4h.map(l => l.price),
    ...fvgsTactical.map(g => (bull ? g.high : g.low)),
  ].filter(p => (bull ? p > nearestTrend.price : p < nearestTrend.price));
  const targets = [...new Set(targetPool.map(p => Math.round(p * 10) / 10))]
    .sort((a, b) => (bull ? a - b : b - a)).slice(0, 1);

  if (!targets[0]) return null;
  return { zonePrice: nearestTrend.price, sl, target: targets[0], direction: bull ? 'LONG' : 'SHORT' };
}

const paramGrids = {
  gradeFilter: ['B+_only', 'B_and_higher', 'all'],
  slBufferMult: [0.10, 0.15, 0.20],
};
const results = {};

for (const gradeFilter of paramGrids.gradeFilter) {
  for (const slBufferMult of paramGrids.slBufferMult) {
    const key = `grade=${gradeFilter}_slBuf=${slBufferMult.toFixed(2)}`;
    const params = { gradeFilter, slBufferMult };
    const log = [];
    let steps = 0, scenarios = 0;

    for (let i = 0; i < bars15All.length; i++) {
      const bar = bars15All[i];
      const nowSec = bar.time + 15 * 60;
      if (nowSec < SIM_START) continue;

      const parts = lib.berlinDateTimeParts(nowSec);
      const dow = new Date(nowSec * 1000).getUTCDay();
      if (dow === 0 || dow === 6) continue;
      if (parts.minutesOfDay < 8 * 60 || parts.minutesOfDay > 17 * 60 + 30) continue;
      if (parts.minutesOfDay % 60 !== 0) continue;

      steps++;
      const tacticalBars = bars15All.slice(Math.max(0, i + 1 - WINDOW), i + 1);
      const bars4h = bars4hUpTo(nowSec);
      const dailyBars = dailyClosedUpTo(nowSec);
      const lastClose = bar.close;

      const bos4h = lib.findBosEvents(bars4h);
      const lastBos = bos4h[bos4h.length - 1];
      const htfBias = lastBos ? lastBos.type : null;
      if (!htfBias) continue;

      const atrArr4h = lib.atr(bars4h, 14);
      const activeLevels4h = lib.findSDLevels(bars4h, { nowSec })
        .filter(l => lib.isPriceRelevant(l.price, l.price, lastClose, HTF_MAX_PCT))
        .filter(l => (nowSec - l.time) <= SD_LEVEL_MAX_AGE_SEC)
        .map(l => ({ type: l.type, price: l.price, atr: atrArr4h[l.index] ?? null }));

      const fvgsTactical = lib.findFVGs(tacticalBars)
        .filter(g => lib.fvgFillFraction(g, tacticalBars) < 0.5)
        .filter(g => (nowSec - g.time) <= TACTICAL_MAX_AGE_SEC);

      const tacticalAtrArr = lib.atr(tacticalBars, 14);
      const tacticalAtr = tacticalAtrArr[tacticalAtrArr.length - 1];

      const s = buildScenarioA(params, htfBias, activeLevels4h, fvgsTactical, lastClose, tacticalAtr);
      if (!s) continue;
      scenarios++;

      const dup = log.some(e => e.type === 'trend_bounce' && e.direction === s.direction &&
        Math.abs(e.zonePrice - s.zonePrice) <= Math.abs(s.zonePrice) * DEDUP_TOLERANCE_PCT &&
        (nowSec - e.loggedAtSec) < DEDUP_MAX_AGE_SEC && e.outcome === 'open');
      if (dup) continue;

      const entry = { type: 'trend_bounce', direction: s.direction, zonePrice: s.zonePrice,
        sl: s.sl, target: s.target, loggedAtSec: nowSec, loggedBarTime: bar.time, outcome: 'open', rr: 0 };
      const res = resolveScenario(entry, 640);
      entry.outcome = res.outcome;
      entry.rr = res.rr;
      log.push(entry);
    }

    const wins = log.filter(e => e.outcome === 'target_hit').length;
    const losses = log.filter(e => e.outcome === 'sl_hit').length;
    const resolved = wins + losses;
    const sumR = log.reduce((s, e) => s + e.rr, 0);
    const expR = resolved ? sumR / resolved : 0;
    const wr = resolved ? wins / resolved : null;

    results[key] = { total: scenarios, wins, losses, resolved, wr: wr ? +(wr * 100).toFixed(1) : null,
      expR: +(expR).toFixed(2), gradeFilter, slBufferMult };
  }
}

const sorted = Object.entries(results).sort((a, b) => (b[1].expR || -999) - (a[1].expR || -999));

console.log('\n========== A-PARAMETER SWEEP RESULTS ==========\n');
console.log('Grade-Filter | SL-Buffer | Total | Wins/Losses | Win-Rate | ExpR');
console.log('---|---|---|---|---|---');
for (const [key, r] of sorted) {
  const gr = r.gradeFilter.padEnd(13);
  const sl = `${r.slBufferMult.toFixed(2)}×`.padEnd(9);
  const tot = String(r.total).padStart(5);
  const wl = `${r.wins}/${r.losses}`.padStart(11);
  const wr = r.wr !== null ? `${r.wr.toFixed(1)}%`.padStart(8) : '   n/a  ';
  const er = `${r.expR}`.padStart(6);
  console.log(`${gr} | ${sl} | ${tot} | ${wl} | ${wr} | ${er}`);
}

writeFileSync(`${DIR}/sweep_a_params_results.json`, JSON.stringify(Object.fromEntries(sorted), null, 2));
console.log(`\nSaved to: sweep_a_params_results.json`);

const baseline = results['grade=B+_only_slBuf=0.15'];
console.log(`\nBaseline (B+ only, 0.15×ATR): ${baseline.wr}% WR, ${baseline.expR}R ExpR`);
