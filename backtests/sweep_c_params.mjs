/**
 * C-Parameter-Sweep: Session-Window × SL-Multiplier × Aligned-Bars über 6 Monate
 *
 * Szenario C ist aktuell negativ (36,1% WR, −0,17R). Test ob es an:
 * 1. Session-Window liegt (aktuell 09:00–11:30, test: 08:00–12:00 / 10:00–11:30 / mornings only)
 * 2. SL-Größe (aktuell 1.5×ATR, test: 1.0/1.5/2.0)
 * 3. Aligned-Definition (aktuell last 3 bars, test: 2/3/5)
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

function computeLastNBias(bars, n) {
  if (bars.length < n) return null;
  const slice = bars.slice(-n);
  const up = slice.filter(c => c.close > c.open).length;
  const down = n - up;
  if (up > down) return 'bullish';
  if (down > up) return 'bearish';
  return null;
}

function isInSessionWindow(minutesOfDay, sessionDef) {
  if (sessionDef === 'orb') return minutesOfDay >= 9 * 60 && minutesOfDay < 9 * 60 + 30;
  if (sessionDef === 'main_tight') return minutesOfDay >= 9 * 60 + 30 && minutesOfDay < 11 * 60 + 30;
  if (sessionDef === 'main_broad') return minutesOfDay >= 8 * 60 && minutesOfDay < 12 * 60;
  if (sessionDef === 'main_tight_10') return minutesOfDay >= 10 * 60 && minutesOfDay < 11 * 60 + 30;
  return false;
}

function resolveScenario(entry, expiryBars) {
  const startIdx = bars15All.findIndex(b => b.time > entry.loggedBarTime);
  if (startIdx === -1) return { outcome: 'open', rr: 0 };
  const isLong = entry.direction === 'LONG';
  let touchIdx = -1;
  for (let i = startIdx; i < bars15All.length; i++) {
    const b = bars15All[i];
    if (b.low <= entry.zonePrice && entry.zonePrice <= b.high) { touchIdx = i; break; }
    if (i - startIdx + 1 >= 40) return { outcome: 'expired', rr: 0 };
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
    if (i - touchIdx >= 40) return { outcome: 'expired', rr: 0 };
  }
  return { outcome: 'open', rr: 0 };
}

function buildScenarioC(params, htfBias, shortTermBias, activeLevels4h, lastClose, tacticalAtr) {
  const { sessionDef, slMult, alignedBars } = params;
  if (shortTermBias !== htfBias) return null; // must be aligned

  const momBull = shortTermBias === 'bullish';
  const momLevels = activeLevels4h.filter(l => l.type === (momBull ? 'supply' : 'demand'))
    .filter(l => (momBull ? l.price > lastClose : l.price < lastClose));
  const nearestMomTarget = momLevels.sort((a, b) => Math.abs(a.price - lastClose) - Math.abs(b.price - lastClose))[0];
  if (!nearestMomTarget) return null;

  const buffer = tacticalAtr ? tacticalAtr * slMult : Math.abs(lastClose) * 0.002;
  const sl = momBull ? lastClose - buffer : lastClose + buffer;
  return { zonePrice: lastClose, sl, target: nearestMomTarget.price, direction: momBull ? 'LONG' : 'SHORT', sessionDef, alignedBars };
}

const paramGrids = {
  sessionDef: ['orb', 'main_tight', 'main_broad', 'main_tight_10'],
  slMult: [1.0, 1.5, 2.0],
  alignedBars: [2, 3, 5],
};
const results = {};

for (const sessionDef of paramGrids.sessionDef) {
  for (const slMult of paramGrids.slMult) {
    for (const alignedBars of paramGrids.alignedBars) {
      const key = `sess=${sessionDef}_sl=${slMult.toFixed(1)}_align=${alignedBars}`;
      const params = { sessionDef, slMult, alignedBars };
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

        const shortTermBias = computeLastNBias(tacticalBars, alignedBars);
        if (!shortTermBias) continue;
        if (shortTermBias !== htfBias) continue; // must align for C

        if (!isInSessionWindow(parts.minutesOfDay, sessionDef)) continue;

        const atrArr4h = lib.atr(bars4h, 14);
        const activeLevels4h = lib.findSDLevels(bars4h, { nowSec })
          .filter(l => lib.isPriceRelevant(l.price, l.price, lastClose, HTF_MAX_PCT))
          .filter(l => (nowSec - l.time) <= SD_LEVEL_MAX_AGE_SEC)
          .map(l => ({ type: l.type, price: l.price, atr: atrArr4h[l.index] ?? null }));

        const tacticalAtrArr = lib.atr(tacticalBars, 14);
        const tacticalAtr = tacticalAtrArr[tacticalAtrArr.length - 1];

        const s = buildScenarioC(params, htfBias, shortTermBias, activeLevels4h, lastClose, tacticalAtr);
        if (!s) continue;
        scenarios++;

        const dup = log.some(e => e.type === 'momentum_continuation' && e.direction === s.direction &&
          Math.abs(e.zonePrice - s.zonePrice) <= Math.abs(s.zonePrice) * DEDUP_TOLERANCE_PCT &&
          (nowSec - e.loggedAtSec) < DEDUP_MAX_AGE_SEC && e.outcome === 'open');
        if (dup) continue;

        const entry = { type: 'momentum_continuation', direction: s.direction, zonePrice: s.zonePrice,
          sl: s.sl, target: s.target, loggedAtSec: nowSec, loggedBarTime: bar.time, outcome: 'open', rr: 0 };
        const res = resolveScenario(entry, 40);
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
        expR: +(expR).toFixed(2), sessionDef, slMult, alignedBars };
    }
  }
}

const sorted = Object.entries(results).sort((a, b) => (b[1].expR || -999) - (a[1].expR || -999));

console.log('\n========== C-PARAMETER SWEEP RESULTS ==========\n');
console.log('Session | SL-Mult | Align-Bars | Total | Wins/Losses | Win-Rate | ExpR');
console.log('---|---|---|---|---|---|---');
for (const [key, r] of sorted.slice(0, 20)) {
  const ss = r.sessionDef.padEnd(13);
  const sl = `${r.slMult.toFixed(1)}×`.padEnd(7);
  const al = String(r.alignedBars).padEnd(10);
  const tot = String(r.total).padStart(5);
  const wl = `${r.wins}/${r.losses}`.padStart(11);
  const wr = r.wr !== null ? `${r.wr.toFixed(1)}%`.padStart(8) : '   n/a  ';
  const er = `${r.expR}`.padStart(6);
  console.log(`${ss} | ${sl} | ${al} | ${tot} | ${wl} | ${wr} | ${er}`);
}

writeFileSync(`${DIR}/sweep_c_params_results.json`, JSON.stringify(Object.fromEntries(sorted), null, 2));
console.log(`\nSaved to: sweep_c_params_results.json (showing top 20 of ${Object.entries(results).length} combos)`);

const baseline = results['sess=main_tight_sl=1.5_align=3'];
if (baseline) console.log(`\nBaseline (main_tight, 1.5×ATR, 3-bar align): ${baseline.wr}% WR, ${baseline.expR}R ExpR`);
