/**
 * B-Parameter-Sweep: SL-Buffer × Target-RR über 6 Monate
 *
 * Szenario B ist der Kern (79% WR, +1,37R). Teste alle Kombinationen von:
 * - SL-Buffer: 0.0006 / 0.0012 / 0.0018 (derzeit 0.0012)
 * - Target-RR: 1.5 / 2.0 / 2.5 / 3.0 × SL-Distanz (derzeit 2.0)
 *
 * Methode: Skript das sim_6m.mjs-Logik für B isoliert, variiert die
 * Parameter, und aggregiert die Ergebnisse pro Kombination.
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

// helpers
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

// ---- B-specific scenario builder (isolated from A/C/D) ----
function buildScenarioB(params, htfBias, pdhl, lastClose, activeLevels4h) {
  const { slBuffer, targetRr } = params;
  const bull = htfBias === 'bullish';
  const counterLevels = activeLevels4h.filter(l => l.type === (bull ? 'supply' : 'demand'));
  const pdBoundary = bull ? (pdhl && pdhl.pdl) : (pdhl && pdhl.pdh);
  const counterPool = [...counterLevels.map(l => l.price), ...(pdBoundary != null ? [pdBoundary] : [])]
    .filter(p => (bull ? p > lastClose : p < lastClose));
  if (!counterPool.length) return null;

  const nearestCounter = counterPool.sort((a, b) => (bull ? a - b : b - a))[0];
  const buffer = Math.abs(nearestCounter) * slBuffer;
  const sl = bull ? nearestCounter + buffer : nearestCounter - buffer;
  const slDist = Math.abs(nearestCounter - sl);
  const target = bull ? nearestCounter + targetRr * slDist : nearestCounter - targetRr * slDist;
  return { zonePrice: nearestCounter, sl, target, direction: bull ? 'SHORT' : 'LONG' };
}

// ---- main sweep ----
const paramGrids = {
  slBuffer: [0.0006, 0.0012, 0.0018],
  targetRr: [1.5, 2.0, 2.5, 3.0],
};
const results = {};

for (const slBuffer of paramGrids.slBuffer) {
  for (const targetRr of paramGrids.targetRr) {
    const key = `slBuf=${slBuffer.toFixed(4)}_tgt=${targetRr.toFixed(1)}`;
    const params = { slBuffer, targetRr };
    const log = [];
    let steps = 0;

    for (let i = 0; i < bars15All.length; i++) {
      const bar = bars15All[i];
      const nowSec = bar.time + 15 * 60;
      if (nowSec < SIM_START) continue;

      const parts = lib.berlinDateTimeParts(nowSec);
      const dow = new Date(nowSec * 1000).getUTCDay();
      if (dow === 0 || dow === 6) continue;
      if (parts.minutesOfDay < 8 * 60 || parts.minutesOfDay > 17 * 60 + 30) continue;
      if (parts.minutesOfDay % 60 !== 0) continue; // hourly

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

      const pdhl = lib.calculatePDHL(dailyBars);
      const s = buildScenarioB(params, htfBias, pdhl, lastClose, activeLevels4h);
      if (!s) continue;

      // dedup check
      const dup = log.some(e =>
        e.type === 'counter_trend' && e.direction === s.direction &&
        Math.abs(e.zonePrice - s.zonePrice) <= Math.abs(s.zonePrice) * DEDUP_TOLERANCE_PCT &&
        (nowSec - e.loggedAtSec) < DEDUP_MAX_AGE_SEC &&
        e.outcome === 'open');
      if (dup) continue;

      const entry = {
        type: 'counter_trend', direction: s.direction,
        zonePrice: s.zonePrice, sl: s.sl, target: s.target,
        loggedAtSec: nowSec, loggedBarTime: bar.time, outcome: 'open', rr: 0,
      };
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

    results[key] = {
      total: log.length, wins, losses, resolved, wr: wr ? +(wr * 100).toFixed(1) : null,
      expR: +(expR).toFixed(2), steps, slBuffer, targetRr,
    };
  }
}

// ---- present results ----
const sorted = Object.entries(results).sort((a, b) => (b[1].expR || -999) - (a[1].expR || -999));

console.log('\n========== B-PARAMETER SWEEP RESULTS ==========\n');
console.log('Sorted by ExpR (descending):\n');
console.log('SL-Buffer | Target-RR | Total | Wins/Losses | Win-Rate | ExpR');
console.log('----------|-----------|-------|-------------|----------|------');
for (const [key, r] of sorted) {
  const buf = `${r.slBuffer.toFixed(4)}`.padStart(9);
  const tgt = `${r.targetRr.toFixed(1)}×`.padStart(9);
  const tot = String(r.total).padStart(5);
  const wl = `${r.wins}/${r.losses}`.padStart(11);
  const wr = r.wr !== null ? `${r.wr.toFixed(1)}%`.padStart(8) : '   n/a  ';
  const er = `${r.expR}`.padStart(6);
  console.log(`${buf} | ${tgt} | ${tot} | ${wl} | ${wr} | ${er}`);
}

// ---- save detailed results ----
writeFileSync(`${DIR}/sweep_b_params_results.json`, JSON.stringify(
  Object.fromEntries(sorted),
  null, 2
));

console.log(`\nFull results saved to: sweep_b_params_results.json`);

// ---- comparison vs baseline ----
const baseline = results['slBuf=0.0012_tgt=2.0'];
console.log('\n========== vs. BASELINE (current: 0.0012 buffer, 2.0× target) ==========\n');
console.log(`Baseline: ${baseline.total} scenarios, ${baseline.wins} wins, ${baseline.losses} losses`);
console.log(`Win-Rate: ${baseline.wr}%, ExpR: ${baseline.expR}R\n`);

console.log('Top 5 improvements over baseline:\n');
let rank = 0;
for (const [key, r] of sorted) {
  if (rank >= 5) break;
  const deltaExpR = (r.expR - baseline.expR).toFixed(2);
  const deltaWr = r.wr !== null && baseline.wr !== null ? (r.wr - baseline.wr).toFixed(1) : 'n/a';
  const sign = deltaExpR > 0 ? '+' : '';
  const wrSign = deltaWr !== 'n/a' && deltaWr > 0 ? '+' : '';
  console.log(`${key}`);
  console.log(`  ExpR: ${r.expR}R (${sign}${deltaExpR}R), WR: ${r.wr}% (${wrSign}${deltaWr}%)`);
  rank++;
}

console.log('\n✅ Sweep complete!');
