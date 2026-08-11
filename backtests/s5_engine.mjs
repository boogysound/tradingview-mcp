/**
 * Shared S5 backtest engine (indicators + per-bar simulation), extracted
 * from strategy_s5.mjs so both the baseline replica and sweep_s5.mjs can
 * reuse it without duplicating logic. See strategy_s5.mjs header for the
 * full rule description and documented assumptions (SL formula, BE off in
 * all sampled presets, MA1/MA2 undocumented, etc).
 *
 * Two new params vs. the original monolithic strategy_s5.mjs, both DEFAULT
 * to a no-op value so baseline behavior (riskScale=1, targetScale=1,
 * beMultR=0) is byte-for-byte identical to the pre-refactor sim_s5_results.json:
 *   - riskScale: multiplies the ST-based initial risk distance AFTER it's
 *     computed (post-hoc, like S1's atrMult) — widens/narrows the SL and,
 *     since tp1Pct/tp2Pct/tpFinalPct are % of risk, all TPs too, without
 *     touching the ST indicator itself (dir/value stay cacheable).
 *   - beMultR: NEW breakeven mechanism (S1's central lever), not present in
 *     the original — all 3 sampled S5 presets ship with use_be=false, so
 *     there's no documented step-buffer to reuse from the .set files. 0
 *     means "off" (matches all 3 presets' actual config); a nonzero test
 *     value moves SL to exactly entry (no buffer) once profit reaches
 *     beMultR x risk, mirroring S1's mechanism minus the undocumented
 *     beStepPct (which was S1-specific fee-recovery buffer, not given for S5).
 *   - Instruments using rsiClosing=true (XAUUSD) exit purely on the opposite
 *     WPR extreme — riskScale/targetScale/beMultR never touch that code path,
 *     so sweeping them is a no-op for that instrument (kept in the sweep for
 *     structural consistency, not because it can change the outcome).
 */
import { readFileSync } from 'fs';
import { atr } from '../scripts/premarket/lib.mjs';

const DIR = '/Users/boogy/tradingview-mcp/backtests';

export const BASE_CONFIGS = {
  GER40: {
    file: 'data_daily.json', wprPeriod: 4, buyLevel: -80, sellLevel: -20,
    stPeriod: 19, stMult: 7.0, ma3Period: 100, useMa3: true,
    rsiClosing: false, tpFinalPct: 975, tp1Pct: 125, tp2Pct: 300, tp1ClosePct: 0.33, tp2ClosePct: 0.33,
    days: [1, 3, 4, 5], // Mon, Wed, Thu, Fri (0=Sun..6=Sat)
  },
  US30: {
    file: 'data_us30_daily.json', wprPeriod: 2, buyLevel: -80, sellLevel: -20,
    stPeriod: 12, stMult: 5.0, ma3Period: 100, useMa3: false,
    rsiClosing: false, tpFinalPct: 975, tp1Pct: 125, tp2Pct: 200, tp1ClosePct: 0.33, tp2ClosePct: 0.33,
    days: [1, 3, 5], // Mon, Wed, Fri
  },
  XAUUSD: {
    file: 'data_xauusd_daily.json', wprPeriod: 3, buyLevel: -80, sellLevel: -20,
    stPeriod: 8, stMult: 3.0, ma3Period: 100, useMa3: true,
    rsiClosing: true, tpFinalPct: 475, tp1Pct: 150, tp2Pct: 175, tp1ClosePct: 0.33, tp2ClosePct: 0.33,
    days: [1, 3, 5],
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
  const dir = new Array(n).fill(null), value = new Array(n).fill(null);
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
    dir[i] = direction; value[i] = direction === 1 ? lowerBand : upperBand;
    prevUpper = upperBand; prevLower = lowerBand; prevClose = bars[i].close; prevDir = direction;
  }
  return { dir, value };
}

export function loadBars(file) {
  return JSON.parse(readFileSync(`${DIR}/${file}`, 'utf8'));
}

// Indicator arrays depend only on STRUCTURAL params (wprPeriod, stPeriod,
// stMult, ma3Period, useMa3) — cache per unique signature so a sweep that
// only varies riskScale/targetScale/beMultR doesn't recompute WPR/ST/MA3.
const indicatorCache = new Map();

// bars.length alone collides across different instruments' datasets that
// happen to have the same bar count — fold in first/last bar timestamps so
// distinct datasets never share a cache key.
function barsFingerprint(bars) {
  return bars.length ? `${bars.length}:${bars[0].time}:${bars[bars.length - 1].time}` : '0';
}

function getIndicators(bars, cfg) {
  const key = JSON.stringify({
    wprPeriod: cfg.wprPeriod, stPeriod: cfg.stPeriod, stMult: cfg.stMult,
    ma3Period: cfg.ma3Period, useMa3: cfg.useMa3, fp: barsFingerprint(bars),
  });
  if (indicatorCache.has(key)) return indicatorCache.get(key);
  const wpr = williamsR(bars, cfg.wprPeriod);
  const st = superTrend(bars, cfg.stPeriod, cfg.stMult);
  const ma3 = cfg.useMa3 ? emaArray(bars.map(b => b.close), cfg.ma3Period) : null;
  const result = { wpr, stValue: st.value, ma3 };
  indicatorCache.set(key, result);
  return result;
}

export function runInstrument(bars, cfg) {
  const riskScale = cfg.riskScale ?? 1;
  const targetScale = cfg.targetScale ?? 1;
  const beMultR = cfg.beMultR ?? 0;
  const { wpr, stValue, ma3 } = getIndicators(bars, cfg);

  const trades = [];
  const open = [];

  for (let i = 1; i < bars.length; i++) {
    const bar = bars[i];
    const dow = new Date(bar.time * 1000).getUTCDay();

    for (const t of open) {
      if (t.closed) continue;
      if (cfg.rsiClosing) {
        const exitLong = t.direction === 'LONG' && wpr[i] != null && wpr[i] >= cfg.sellLevel;
        const exitShort = t.direction === 'SHORT' && wpr[i] != null && wpr[i] <= cfg.buyLevel;
        if (exitLong || exitShort) {
          const rr = t.direction === 'LONG' ? (bar.close - t.entry) / t.risk : (t.entry - bar.close) / t.risk;
          t.realizedR = rr; t.closed = true;
        }
        continue;
      }
      const isLong = t.direction === 'LONG';
      if (beMultR > 0 && !t.beHit) {
        const profit = isLong ? bar.high - t.entry : t.entry - bar.low;
        if (profit >= beMultR * t.risk) { t.beHit = true; t.sl = t.entry; }
      }
      const hitSl = isLong ? bar.low <= t.sl : bar.high >= t.sl;
      if (hitSl) {
        const slR = isLong ? (t.sl - t.entry) / t.risk : (t.entry - t.sl) / t.risk;
        t.realizedR += t.remainingFrac * slR;
        t.closed = true; continue;
      }
      if (!t.tp1Done) {
        const hit = isLong ? bar.high >= t.tp1Price : bar.low <= t.tp1Price;
        if (hit) { t.realizedR += cfg.tp1ClosePct * (t.tp1Pct / 100); t.remainingFrac -= cfg.tp1ClosePct; t.tp1Done = true; }
      }
      if (!t.tp2Done) {
        const hit = isLong ? bar.high >= t.tp2Price : bar.low <= t.tp2Price;
        if (hit) { t.realizedR += cfg.tp2ClosePct * (t.tp2Pct / 100); t.remainingFrac -= cfg.tp2ClosePct; t.tp2Done = true; }
      }
      const hitFinal = isLong ? bar.high >= t.tpFinalPrice : bar.low <= t.tpFinalPrice;
      if (hitFinal) { t.realizedR += t.remainingFrac * (t.tpFinalPct / 100); t.closed = true; }
    }
    for (const t of open) if (t.closed) trades.push(t);
    for (let k = open.length - 1; k >= 0; k--) if (open[k].closed) open.splice(k, 1);

    if (!cfg.days.includes(dow)) continue;
    if (wpr[i] == null || wpr[i - 1] == null || stValue[i] == null) continue;
    if (cfg.useMa3 && ma3[i] == null) continue;

    const crossLong = wpr[i] <= cfg.buyLevel && wpr[i - 1] > cfg.buyLevel;
    const crossShort = wpr[i] >= cfg.sellLevel && wpr[i - 1] < cfg.sellLevel;
    if (!crossLong && !crossShort) continue;
    const direction = crossLong ? 'LONG' : 'SHORT';
    const isLong = direction === 'LONG';

    if (cfg.useMa3) {
      const ma3Ok = isLong ? bar.close > ma3[i] : bar.close < ma3[i];
      if (!ma3Ok) continue;
    }

    const entry = bar.close;
    const baseRisk = Math.abs(entry - stValue[i]);
    if (baseRisk <= 0) continue;
    const risk = baseRisk * riskScale;
    const sl = isLong ? entry - risk : entry + risk;
    const tp1Pct = cfg.tp1Pct * targetScale;
    const tp2Pct = cfg.tp2Pct * targetScale;
    const tpFinalPct = cfg.tpFinalPct * targetScale;
    open.push({
      direction, entry, sl, risk, entryIdx: i, entryTime: bar.time,
      tp1Pct, tp2Pct, tpFinalPct,
      tp1Price: isLong ? entry + (tp1Pct / 100) * risk : entry - (tp1Pct / 100) * risk,
      tp2Price: isLong ? entry + (tp2Pct / 100) * risk : entry - (tp2Pct / 100) * risk,
      tpFinalPrice: isLong ? entry + (tpFinalPct / 100) * risk : entry - (tpFinalPct / 100) * risk,
      tp1Done: false, tp2Done: false, beHit: false, remainingFrac: 1.0, realizedR: 0, closed: false,
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
