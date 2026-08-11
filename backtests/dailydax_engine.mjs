/**
 * Shared DailyDax backtest engine (indicators + simulation), extracted from
 * strategy_dailydax.mjs so both the baseline replica and sweep_dailydax*.mjs
 * can reuse it without duplicating logic. See strategy_dailydax.mjs header
 * for the full rule description and documented assumptions (H3/H6 UTC-epoch
 * resampling, ma_tf=0 -> M30, same-bar SL+TP -> SL).
 *
 * Two new params vs. the original monolith, both DEFAULT to a no-op value so
 * baseline behavior is byte-for-byte identical to the pre-refactor
 * sim_dailydax_results.json:
 *   - riskScale: multiplies the H6-ATR-based initial risk distance AFTER
 *     it's computed (post-hoc, same convention as S1/S5/UT's atrMult/
 *     riskScale) — widens/narrows the SL and, since TPs/trailing are all
 *     %-of-risk, everything downstream with it.
 *   - targetScale: multiplies tp1Pct/tp2Pct/tpFinalPct together.
 * entryMinutes/exitMinutes/adxThreshold/trailStartR/trailDistR were already
 * plain cfg fields in the original (not baked into indicator computation),
 * so they're freely sweepable without any engine changes.
 *
 * IMPORTANT STRUCTURAL NOTE (carried over from Teil 15's own finding): 46 of
 * 49 baseline trades close via the FIXED EXIT TIME (15:00 Berlin), not via
 * SL/TP/trailing — the daily ATR(1,H6)-based SL/TP chain is wide relative to
 * the short 11:30-15:00 trading window. Any exit/risk sweep on this strategy
 * should treat entryMinutes/exitMinutes as first-class exit levers, not an
 * afterthought — riskScale/targetScale alone are unlikely to move the needle
 * much given how rarely they're actually reached.
 */
import { readFileSync } from 'fs';
import { atr } from '../scripts/premarket/lib.mjs';

const DIR = '/Users/boogy/tradingview-mcp/backtests';

export const BASE_CONFIG = {
  ema1Period: 20, ema2Period: 100, adxPeriod: 10, adxThreshold: 25,
  atrPeriod: 1, atrMult: 1.0,
  tpFinalPct: 275, tp1Pct: 200, tp1ClosePct: 0.40, tp2Pct: 225, tp2ClosePct: 0.40,
  trailStartR: 1.0, trailDistR: 0.5,
  entryMinutes: 11 * 60 + 30, exitMinutes: 15 * 60,
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

function adx(bars, period) {
  const n = bars.length;
  const plusDM = new Array(n).fill(0), minusDM = new Array(n).fill(0), tr = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const upMove = bars[i].high - bars[i - 1].high;
    const downMove = bars[i - 1].low - bars[i].low;
    plusDM[i] = (upMove > downMove && upMove > 0) ? upMove : 0;
    minusDM[i] = (downMove > upMove && downMove > 0) ? downMove : 0;
    tr[i] = Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - bars[i - 1].close), Math.abs(bars[i].low - bars[i - 1].close));
  }
  function wilder(arr) {
    const out = new Array(n).fill(null);
    let sum = 0;
    for (let i = 1; i <= period; i++) sum += arr[i] || 0;
    if (period >= n) return out;
    out[period] = sum;
    for (let i = period + 1; i < n; i++) out[i] = out[i - 1] - out[i - 1] / period + arr[i];
    return out;
  }
  const smTR = wilder(tr), smPlus = wilder(plusDM), smMinus = wilder(minusDM);
  const dx = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (smTR[i] == null || smTR[i] === 0) continue;
    const pDI = (100 * smPlus[i]) / smTR[i];
    const mDI = (100 * smMinus[i]) / smTR[i];
    const sum = pDI + mDI;
    dx[i] = sum !== 0 ? (100 * Math.abs(pDI - mDI)) / sum : 0;
  }
  const out = new Array(n).fill(null);
  const first = dx.findIndex(v => v != null);
  if (first >= 0 && first + period <= n) {
    let sum = 0;
    for (let i = first; i < first + period; i++) sum += dx[i] || 0;
    out[first + period - 1] = sum / period;
    for (let i = first + period; i < n; i++) out[i] = (out[i - 1] * (period - 1) + dx[i]) / period;
  }
  return out;
}

export function resample(bars, bucketHours) {
  const bucketSec = bucketHours * 3600;
  const out = [];
  let cur = null;
  for (const b of bars) {
    const bucket = Math.floor(b.time / bucketSec) * bucketSec;
    if (!cur || cur.time !== bucket) {
      if (cur) out.push(cur);
      cur = { time: bucket, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume || 0 };
    } else {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
      cur.volume += b.volume || 0;
    }
  }
  if (cur) out.push(cur);
  return out;
}

// Hoisted out of the per-bar hot loop — constructing an Intl.DateTimeFormat
// is expensive (ICU lookups), and this repo's own sweep scripts call
// runBacktest hundreds of times over thousands of bars each; a fresh
// formatter per bar per call turned a <1s backtest into a 2-minute one
// (found live 30.07.2026 running sweep_dailydax.mjs). Formatters are
// stateless and safe to reuse across calls.
const berlinTimeFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hour12: false });
const berlinDateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' });

function berlinMinutesOfDay(unixSec) {
  const d = new Date(unixSec * 1000);
  const parts = Object.fromEntries(berlinTimeFmt.formatToParts(d).map(p => [p.type, p.value]));
  const hour = parseInt(parts.hour, 10) % 24;
  return hour * 60 + parseInt(parts.minute, 10);
}

function lastClosedBarValue(htfBars, nowSec, valueArr) {
  let idx = -1;
  for (let i = 0; i < htfBars.length; i++) {
    if (htfBars[i].time + 0 <= nowSec) idx = i; else break;
  }
  return idx >= 0 ? valueArr[idx] : null;
}

export function loadAllBars() {
  const bars30m = JSON.parse(readFileSync(`${DIR}/data_de40_30m.json`, 'utf8'));
  const bars1h = JSON.parse(readFileSync(`${DIR}/data_1h.json`, 'utf8'));
  const barsDaily = JSON.parse(readFileSync(`${DIR}/data_daily.json`, 'utf8'));
  const barsH3 = resample(bars1h, 3);
  const barsH6 = resample(bars1h, 6);
  return { bars30m, barsH3, barsH6, barsDaily };
}

// Indicator arrays depend only on STRUCTURAL params (ema1Period, ema2Period,
// adxPeriod, atrPeriod) — cache per unique signature so a sweep that only
// varies riskScale/targetScale/adxThreshold/entryMinutes/exitMinutes/
// trailStartR/trailDistR doesn't recompute EMA/ADX/ATR.
const indicatorCache = new Map();
// Keying on bars.length alone collides across different instruments/datasets
// with the same bar count (found live, 11.08.2026, same bug independently in
// s1/s2/s5_engine.mjs during a multi-instrument batch run — silently reused
// one instrument's indicator arrays against another's prices). First+last
// timestamp is enough to disambiguate without hashing full bar content.
const sig = (b) => `${b.length}|${b[0]?.time}|${b[b.length - 1]?.time}`;

function getIndicators(allBars, cfg) {
  const { bars30m, barsH3, barsH6, barsDaily } = allBars;
  const key = JSON.stringify({
    ema1Period: cfg.ema1Period, ema2Period: cfg.ema2Period,
    adxPeriod: cfg.adxPeriod, atrPeriod: cfg.atrPeriod,
    s30: sig(bars30m), sH3: sig(barsH3), sH6: sig(barsH6), sDaily: sig(barsDaily),
  });
  if (indicatorCache.has(key)) return indicatorCache.get(key);
  const ema1 = emaArray(bars30m.map(b => b.close), cfg.ema1Period);
  const ema2Daily = emaArray(barsDaily.map(b => b.close), cfg.ema2Period);
  const adxH3 = adx(barsH3, cfg.adxPeriod);
  const trH6 = atr(barsH6, cfg.atrPeriod);
  const result = { ema1, ema2Daily, adxH3, trH6 };
  indicatorCache.set(key, result);
  return result;
}

export function runBacktest(allBars, cfg, filterOpts = {}) {
  const { bars30m, barsH3, barsH6, barsDaily } = allBars;
  const riskScale = cfg.riskScale ?? 1;
  const targetScale = cfg.targetScale ?? 1;
  const requireAdx = filterOpts.requireAdx !== false;
  const { ema1, ema2Daily, adxH3, trH6 } = getIndicators(allBars, cfg);

  const trades = [];
  let openTrade = null;
  let lastTradeDate = null;

  for (let i = 1; i < bars30m.length; i++) {
    const bar = bars30m[i];
    const minutesOfDay = berlinMinutesOfDay(bar.time);
    const dateStr = berlinDateFmt.format(new Date(bar.time * 1000));

    if (openTrade) {
      const isLong = openTrade.direction === 'LONG';
      const profit = isLong ? bar.high - openTrade.entry : openTrade.entry - bar.low;
      if (profit >= cfg.trailStartR * openTrade.risk) {
        const trailSl = isLong ? bar.high - cfg.trailDistR * openTrade.risk : bar.low + cfg.trailDistR * openTrade.risk;
        openTrade.sl = isLong ? Math.max(openTrade.sl, trailSl) : Math.min(openTrade.sl, trailSl);
      }
      const hitSl = isLong ? bar.low <= openTrade.sl : bar.high >= openTrade.sl;
      if (hitSl) {
        openTrade.realizedR += openTrade.remainingFrac * ((openTrade.sl - openTrade.entry) / openTrade.risk) * (isLong ? 1 : -1);
        openTrade.closed = true;
      } else {
        if (!openTrade.tp1Done) {
          const hit = isLong ? bar.high >= openTrade.tp1Price : bar.low <= openTrade.tp1Price;
          if (hit) { openTrade.realizedR += cfg.tp1ClosePct * (openTrade.tp1Pct / 100); openTrade.remainingFrac -= cfg.tp1ClosePct; openTrade.tp1Done = true; }
        }
        if (!openTrade.tp2Done) {
          const hit = isLong ? bar.high >= openTrade.tp2Price : bar.low <= openTrade.tp2Price;
          if (hit) { openTrade.realizedR += cfg.tp2ClosePct * (openTrade.tp2Pct / 100); openTrade.remainingFrac -= cfg.tp2ClosePct; openTrade.tp2Done = true; }
        }
        const hitFinal = isLong ? bar.high >= openTrade.tpFinalPrice : bar.low <= openTrade.tpFinalPrice;
        if (hitFinal) { openTrade.realizedR += openTrade.remainingFrac * (openTrade.tpFinalPct / 100); openTrade.closed = true; }
        else if (minutesOfDay >= cfg.exitMinutes) {
          const mtm = isLong ? (bar.close - openTrade.entry) / openTrade.risk : (openTrade.entry - bar.close) / openTrade.risk;
          openTrade.realizedR += openTrade.remainingFrac * mtm;
          openTrade.closed = true; openTrade.forcedFlat = true;
        }
      }
      if (openTrade.closed) { trades.push(openTrade); openTrade = null; }
    }

    if (openTrade || lastTradeDate === dateStr) continue;
    if (minutesOfDay !== cfg.entryMinutes) continue;
    if (ema1[i] == null || ema2Daily.length === 0) continue;

    const e2 = lastClosedBarValue(barsDaily, bar.time, ema2Daily);
    const adxVal = lastClosedBarValue(barsH3, bar.time, adxH3);
    const h6tr = lastClosedBarValue(barsH6, bar.time, trH6);
    if (e2 == null || h6tr == null) continue;
    if (requireAdx) {
      if (adxVal == null || adxVal <= cfg.adxThreshold) continue;
    }

    const bullish = bar.close > ema1[i] && ema1[i] > e2;
    const bearish = bar.close < ema1[i] && ema1[i] < e2;
    if (!bullish && !bearish) continue;

    const direction = bullish ? 'LONG' : 'SHORT';
    const isLong = bullish;
    const baseRisk = cfg.atrMult * h6tr;
    if (baseRisk <= 0) continue;
    const risk = baseRisk * riskScale;
    const entry = bar.close;
    const sl = isLong ? entry - risk : entry + risk;
    const tp1Pct = cfg.tp1Pct * targetScale;
    const tp2Pct = cfg.tp2Pct * targetScale;
    const tpFinalPct = cfg.tpFinalPct * targetScale;
    openTrade = {
      direction, entry, sl, risk, entryIdx: i, entryTime: bar.time, dateStr,
      tp1Pct, tp2Pct, tpFinalPct,
      tp1Price: isLong ? entry + (tp1Pct / 100) * risk : entry - (tp1Pct / 100) * risk,
      tp2Price: isLong ? entry + (tp2Pct / 100) * risk : entry - (tp2Pct / 100) * risk,
      tpFinalPrice: isLong ? entry + (tpFinalPct / 100) * risk : entry - (tpFinalPct / 100) * risk,
      tp1Done: false, tp2Done: false, remainingFrac: 1.0, realizedR: 0, closed: false,
    };
    lastTradeDate = dateStr;
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
