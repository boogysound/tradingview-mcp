/**
 * Shared S1 backtest engine (indicators + per-bar simulation), extracted
 * from strategy_s1.mjs so both the baseline replica and sweep_s1.mjs can
 * reuse it without duplicating logic. See strategy_s1.mjs header for the
 * full rule description and documented assumptions (HLOTT, SL_method, etc).
 */
import { atr } from '../scripts/premarket/lib.mjs';
import { hlott as computeHlott } from './hlott.mjs';

export const BASE_CONFIGS = {
  h1: {
    LONG: {
      wprPeriod: 15, lookback: 29, buyLevel: -80, sellLevel: -20,
      entryCandles: 5, atrLen: 9, atrMult: 1.9,
      tpFinalR: 3.0, tp1R: 0.7, tp1Pct: 0.33, tp2R: 1.0, tp2Pct: 0.33,
      beMultR: 0.6, beStepPct: 0.01,
      st1: { period: 14, mult: 7.0 }, st2: { period: 13, mult: 2.0 },
      stTrail: { period: 3, mult: 10.0 },
      emaPeriods: [130, 595, 220],
      hlott: { period: 4, percent: 0.6, length: 11 },
    },
    SHORT: {
      wprPeriod: 30, lookback: 24, buyLevel: -80, sellLevel: -20,
      entryCandles: 6, atrLen: 19, atrMult: 1.1,
      tpFinalR: 3.0, tp1R: 1.5, tp1Pct: 0.33, tp2R: 1.7, tp2Pct: 0.33,
      beMultR: 0.3, beStepPct: 0.01,
      st1: { period: 5, mult: 2.0 }, st2: { period: 10, mult: 2.0 },
      stTrail: { period: 2, mult: 1.0 },
      emaPeriods: [165, 520, 280],
      hlott: { period: 3, percent: 0.2, length: 16 },
    },
  },
  m15: {
    LONG: {
      wprPeriod: 15, lookback: 29, buyLevel: -80, sellLevel: -20,
      entryCandles: 2, atrLen: 5, atrMult: 1.5,
      tpFinalR: 4.0, tp1R: 1.0, tp1Pct: 0.33, tp2R: 1.4, tp2Pct: 0.33,
      beMultR: 0.6, beStepPct: 0.01,
      st1: { period: 6, mult: 9.5 }, st2: { period: 3, mult: 7.0 },
      stTrail: { period: 7, mult: 7.5 },
      emaPeriods: [55, 125, 490],
      hlott: { period: 2, percent: 0.6, length: 10 },
    },
    SHORT: {
      wprPeriod: 15, lookback: 6, buyLevel: -80, sellLevel: -20,
      entryCandles: 14, atrLen: 12, atrMult: 1.9,
      tpFinalR: 3.0, tp1R: 1.0, tp1Pct: 0.33, tp2R: 2.0, tp2Pct: 0.33,
      beMultR: 0.5, beStepPct: 0.01,
      st1: { period: 12, mult: 9.5 }, st2: { period: 7, mult: 7.5 },
      stTrail: { period: 18, mult: 9.0 },
      emaPeriods: [45, 460, 465],
      hlott: { period: 2, percent: 0.6, length: 10 },
    },
  },
  // GER40/DE40 H1 — only a LONG .set exists in S1/Archiv (no SHORT variant
  // was ever published for this instrument); tested 30.07.2026 as an
  // untried instrument after USTEC showed no robust OOS edge.
  de40: {
    LONG: {
      wprPeriod: 13, lookback: 27, buyLevel: -80, sellLevel: -20,
      entryCandles: 30, atrLen: 6, atrMult: 1.6,
      tpFinalR: 3.0, tp1R: 1.0, tp1Pct: 0.33, tp2R: 2.5, tp2Pct: 0.33,
      beMultR: 0.3, beStepPct: 0.01,
      st1: { period: 15, mult: 3.0 }, st2: { period: 15, mult: 3.0 },
      stTrail: { period: 1, mult: 10.0 },
      emaPeriods: [325, 330, 100],
      hlott: { period: 1, percent: 3.6, length: 2 },
    },
  },
};

function emaArray(values, len) {
  const out = new Array(values.length).fill(null);
  const alpha = 2 / (len + 1);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    if (values[i] == null) continue;
    prev = prev == null ? values[i] : values[i] * alpha + prev * (1 - alpha);
    out[i] = prev;
  }
  return out;
}

function williamsR(bars, period) {
  const n = bars.length;
  const out = new Array(n).fill(null);
  for (let i = period - 1; i < n; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - period + 1; j <= i; j++) { hh = Math.max(hh, bars[j].high); ll = Math.min(ll, bars[j].low); }
    out[i] = hh !== ll ? ((hh - bars[i].close) / (hh - ll)) * -100 : -50;
  }
  return out;
}

function superTrend(bars, period, multiplier) {
  const atrArr = atr(bars, period);
  const n = bars.length;
  const dir = new Array(n).fill(null);
  const value = new Array(n).fill(null);
  let prevUpper = null, prevLower = null, prevClose = null, prevDir = 1;
  for (let i = 0; i < n; i++) {
    const a = atrArr[i];
    if (a == null) continue;
    const hl2 = (bars[i].high + bars[i].low) / 2;
    let upperBand = hl2 + multiplier * a;
    let lowerBand = hl2 - multiplier * a;
    if (prevUpper != null) {
      upperBand = (upperBand < prevUpper || prevClose > prevUpper) ? upperBand : prevUpper;
      lowerBand = (lowerBand > prevLower || prevClose < prevLower) ? lowerBand : prevLower;
    }
    let direction = prevDir;
    if (prevDir === 1 && bars[i].close < lowerBand) direction = -1;
    else if (prevDir === -1 && bars[i].close > upperBand) direction = 1;
    dir[i] = direction;
    value[i] = direction === 1 ? lowerBand : upperBand;
    prevUpper = upperBand; prevLower = lowerBand; prevClose = bars[i].close; prevDir = direction;
  }
  return { dir, value };
}

// Indicator arrays depend only on the STRUCTURAL params (wprPeriod, st, ema,
// atrLen, hlott) — cache them per unique structural signature so a sweep
// that only varies risk/exit params (beMultR, tpXR, atrMult) doesn't
// recompute WPR/ST/EMA/HLOTT thousands of times.
const indicatorCache = new Map();
// Keying on bars.length alone collides across different instruments/datasets
// with the same bar count (found live, 11.08.2026, multi-instrument batch
// run — silently reused one instrument's indicator arrays against another's
// prices). First+last timestamp disambiguates without hashing full content.
const sig = (b) => `${b.length}|${b[0]?.time}|${b[b.length - 1]?.time}`;

function getIndicators(bars, cfg, useHlott) {
  const key = JSON.stringify({
    wprPeriod: cfg.wprPeriod, atrLen: cfg.atrLen, st1: cfg.st1, st2: cfg.st2, stTrail: cfg.stTrail,
    emaPeriods: cfg.emaPeriods, useHlott, hlott: cfg.hlott, s: sig(bars),
  });
  if (indicatorCache.has(key)) return indicatorCache.get(key);
  const wpr = williamsR(bars, cfg.wprPeriod);
  const st1 = superTrend(bars, cfg.st1.period, cfg.st1.mult);
  const st2 = superTrend(bars, cfg.st2.period, cfg.st2.mult);
  const stTrail = superTrend(bars, cfg.stTrail.period, cfg.stTrail.mult);
  const atrArr = atr(bars, cfg.atrLen);
  const sortedPeriods = [...cfg.emaPeriods].sort((a, b) => a - b);
  const emas = sortedPeriods.map(p => emaArray(bars.map(b => b.close), p));
  const { hott, lott } = useHlott ? computeHlott(bars, cfg.hlott.period, cfg.hlott.percent, cfg.hlott.length) : { hott: [], lott: [] };
  const result = { wpr, st1Dir: st1.dir, st2Dir: st2.dir, stTrailDir: stTrail.dir, stTrailValue: stTrail.value, atrArr, emas, hott, lott };
  indicatorCache.set(key, result);
  return result;
}

export function runDirection(bars, direction, cfg, useHlott, filterOpts = {}) {
  const requireST = filterOpts.requireST !== false;
  const requireEma = filterOpts.requireEma !== false;
  // useTrailToBE: mirrors the documented Trailing_type=2 ("Trailing_Till_
  // breakeven") + BE_SL_trailed=false behavior confirmed in the PDF (5.10,
  // 3.03) for all 4 sampled presets: the separate trailing SuperTrend
  // continuously ratchets the SL favorably from entry, the BE trigger is
  // evaluated against that CURRENT (trailed) risk rather than the fixed
  // initial risk, and trailing stops once BE is reached (SL then freezes at
  // entry+step). Defaults on; sweep_s1_trail.mjs can turn it off for A/B.
  const useTrailToBE = filterOpts.useTrailToBE !== false;
  // trailMode: 'freezeAtBE' (documented Trailing_type=2, default) stops
  // ratcheting once BE is hit; 'continuous' (Trailing_type=0, "No_Stop_
  // Trailing") keeps ratcheting the SL via the trailing ST for the whole
  // trade life, letting winners run further instead of locking a small
  // fixed buffer at BE.
  const trailMode = filterOpts.trailMode || 'freezeAtBE';
  const { wpr, st1Dir, st2Dir, stTrailDir, stTrailValue, atrArr, emas, hott, lott } = getIndicators(bars, cfg, useHlott);
  const isLong = direction === 'LONG';
  const trades = [];
  const open = [];

  for (let i = 1; i < bars.length; i++) {
    const bar = bars[i];

    for (const t of open) {
      if (t.closed) continue;
      const trailActive = useTrailToBE && (trailMode === 'continuous' || !t.beHit);
      if (trailActive) {
        const stVal = stTrailValue[i];
        const stDir = stTrailDir[i];
        // Only ratchet the SL when the trailing ST's own direction still
        // agrees with the trade — if it has flipped against us, its value
        // sits on the wrong side of price (resistance for a long, etc.) and
        // must not be used as a stop level.
        if (stVal != null && ((isLong && stDir === 1) || (!isLong && stDir === -1))) {
          t.sl = isLong ? Math.max(t.sl, stVal) : Math.min(t.sl, stVal);
        }
      }
      const currentRiskForBE = Math.abs(t.entry - t.sl);
      const profit = isLong ? bar.high - t.entry : t.entry - bar.low;
      if (!t.beHit && currentRiskForBE > 0 && profit >= cfg.beMultR * currentRiskForBE) {
        t.beHit = true;
        // beStepPct is stored as the raw .set value (e.g. 0.01 = "0.01%",
        // per PDF 3.04's own stated purpose — a small fee-recovery buffer,
        // not 1% of the index price, which would dwarf the entire SL
        // distance and was silently producing nonsense +8R "wins" before
        // this fix (30.07.2026, user-prompted bug hunt).
        const stepFrac = cfg.beStepPct / 100;
        t.sl = isLong ? t.entry + stepFrac * t.entry : t.entry - stepFrac * t.entry;
      }
      const hitSl = isLong ? bar.low <= t.sl : bar.high >= t.sl;
      if (hitSl) {
        // realizedR is always relative to the ORIGINAL fixed risk (the R
        // unit doesn't move just because the stop trailed) — a favorably
        // trailed stop that gets hit is a smaller loss (or breakeven/small
        // win), not automatically -1R.
        const slR = isLong ? (t.sl - t.entry) / t.riskOriginal : (t.entry - t.sl) / t.riskOriginal;
        t.realizedR += t.remainingFrac * slR;
        t.closed = true; trades.push(t); continue;
      }
      if (!t.tp1Done) {
        const hit = isLong ? bar.high >= t.tp1Price : bar.low <= t.tp1Price;
        if (hit) { t.realizedR += cfg.tp1Pct * cfg.tp1R; t.remainingFrac -= cfg.tp1Pct; t.tp1Done = true; }
      }
      if (!t.tp2Done) {
        const hit = isLong ? bar.high >= t.tp2Price : bar.low <= t.tp2Price;
        if (hit) { t.realizedR += cfg.tp2Pct * cfg.tp2R; t.remainingFrac -= cfg.tp2Pct; t.tp2Done = true; }
      }
      const hitFinal = isLong ? bar.high >= t.tpFinalPrice : bar.low <= t.tpFinalPrice;
      if (hitFinal) {
        t.realizedR += t.remainingFrac * cfg.tpFinalR;
        t.closed = true; trades.push(t);
      }
    }
    for (let k = open.length - 1; k >= 0; k--) if (open[k].closed) open.splice(k, 1);

    if (i < cfg.lookback || i < cfg.entryCandles || wpr[i] == null || atrArr[i] == null) continue;
    if (requireST && (st1Dir[i] == null || st2Dir[i] == null)) continue;
    if (requireEma && emas.some(e => e[i] == null)) continue;

    let armed = false;
    for (let j = i - cfg.lookback + 1; j <= i; j++) {
      if (isLong && wpr[j] <= cfg.buyLevel) { armed = true; break; }
      if (!isLong && wpr[j] >= cfg.sellLevel) { armed = true; break; }
    }
    if (!armed) continue;

    let extreme = isLong ? -Infinity : Infinity;
    for (let j = i - cfg.entryCandles; j < i; j++) {
      extreme = isLong ? Math.max(extreme, bars[j].high) : Math.min(extreme, bars[j].low);
    }
    const breakout = isLong ? bar.close > extreme : bar.close < extreme;
    if (!breakout) continue;

    if (requireST) {
      const stOk = isLong ? (st1Dir[i] === 1 && st2Dir[i] === 1) : (st1Dir[i] === -1 && st2Dir[i] === -1);
      if (!stOk) continue;
    }

    if (requireEma) {
      const [eFast, eMid, eSlow] = emas.map(e => e[i]);
      const emaOk = isLong ? (bar.close > eFast && eFast > eMid && eMid > eSlow) : (bar.close < eFast && eFast < eMid && eMid < eSlow);
      if (!emaOk) continue;
    }

    if (useHlott) {
      if (hott[i] == null || lott[i] == null) continue;
      const hlOk = isLong ? bar.close > hott[i] : bar.close < lott[i];
      if (!hlOk) continue;
    }

    const risk = cfg.atrMult * atrArr[i];
    if (risk <= 0) continue;
    const entry = bar.close;
    const sl = isLong ? entry - risk : entry + risk;
    open.push({
      direction, entry, sl, risk, riskOriginal: risk, entryIdx: i, entryTime: bar.time,
      tp1Price: isLong ? entry + cfg.tp1R * risk : entry - cfg.tp1R * risk,
      tp2Price: isLong ? entry + cfg.tp2R * risk : entry - cfg.tp2R * risk,
      tpFinalPrice: isLong ? entry + cfg.tpFinalR * risk : entry - cfg.tpFinalR * risk,
      tp1Done: false, tp2Done: false, beHit: false, remainingFrac: 1.0,
      realizedR: 0, closed: false,
    });
  }
  return trades;
}

export function splitAgg(trades, nBars, splitFrac = 0.7) {
  const cut = Math.floor(nBars * splitFrac);
  const train = trades.filter(t => t.entryIdx < cut);
  const test = trades.filter(t => t.entryIdx >= cut);
  const agg = (arr) => ({
    total: arr.length,
    expR: arr.length ? +(arr.reduce((s, t) => s + t.realizedR, 0) / arr.length).toFixed(3) : null,
    winRate: arr.length ? +(arr.filter(t => t.realizedR > 0).length / arr.length * 100).toFixed(1) : null,
  });
  return { train: agg(train), test: agg(test), overall: agg(trades) };
}
