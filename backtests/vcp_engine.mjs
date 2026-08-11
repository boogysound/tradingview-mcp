/**
 * Shared VCP (Kaspareit-Trading "VCP-Strategie" v1.30/v1.40) backtest engine
 * — reimplemented from `VCP/VCP-Strategie_Parametererklärung.pdf` + several
 * real `VCP/*VCPBOT_v1_40*.set` files (30.07.2026). Same engine/sweep split
 * as s1_engine.mjs/s5_engine.mjs/ut_engine.mjs/dailydax_engine.mjs.
 *
 * Rules (per PDF + set files):
 *   - VCP ("Volatility Contraction Pattern", Minervini concept) detection:
 *     an ATR(vcpPeriod)-based volatility CONTRACTION check, combined with a
 *     pivot high/low (over pivotLookback bars) as the breakout level. Once
 *     armed, the breakout must occur within vcpNachlaufBars bars or the
 *     signal expires and a fresh pivot/contraction check restarts.
 *   - Filters: main EMA (price above/below for long/short), optional
 *     MTF EMA1 (documented as usually one TF higher — all 3 sampled real
 *     presets use MTF1_Timeframe=H1, same as their own base chart, so no
 *     resampling was needed for those specific presets), optional TTM
 *     Squeeze (require "green"/released squeeze + momentum direction),
 *     optional Volume confirmation (vs. previous bar or N-bar average).
 *   - Exit: ATR(atrSlPeriod)*atrSlMultiplier initial SL, capped by
 *     maxSlPercent of entry (safety ceiling) — then partial TP1/TP2 (as
 *     literal R-multiples, not %-of-SL like S1/S5/UT/DailyDax, but
 *     mathematically identical: tp1Price = entry ± partial1RR * risk) +
 *     final TP at riskRewardRatio, optional breakeven at beRR profit
 *     (+ beOffsetPercent of the SL distance as buffer).
 *   - Williams Fractal Trailing exists in the doc (4 range/buffer params)
 *     but is OFF (`Use_Williams_Trailing=false`) in EVERY sampled .set file
 *     across all brokers/instruments checked — NOT implemented, same
 *     convention as S5's unused SuperTrend-trailing branch.
 *
 * CRITICAL DOCUMENTED GAP (per Fahrplan, Teil 16: "Breakout-/Squeeze-Formel
 * nicht spezifiziert" — lowest confidence of the 3 built-so-far strategies):
 * the PDF names the VCP-contraction/pivot/breakout PARAMETERS (VCP_Period,
 * Pivot_Lookback, Vol_Factor, VCP_Nachlauf_Bars) but never states the exact
 * comparison formula. Explicit assumption made here (flagged, not silently
 * guessed): contraction is "current ATR(vcpPeriod) <= ATR(vcpPeriod) from
 * pivotLookback bars ago, times volFactor" — reusing pivotLookback as BOTH
 * the pivot window AND the volatility-comparison lag, since it's the only
 * other time-window parameter the .set files actually expose alongside
 * volFactor. Pivot high/low = highest high / lowest low over the
 * pivotLookback bars strictly before the current one (same "extreme of last
 * N candles" convention already used for S1's breakout window and UT's SL
 * lookback elsewhere in this repo).
 *
 * Other explicit assumptions:
 *   - MTF EMA1/2/3 computed on the SAME bars array as the base chart (true
 *     multi-timeframe resampling not implemented) — matches every sampled
 *     preset's own MTF1_Timeframe value (H1, identical to their base TF).
 *   - TTM Squeeze: standard public "Squeeze Momentum Indicator" formula
 *     (Bollinger Bands vs. Keltner Channel width comparison + a linear-
 *     regression momentum histogram) — the same widely-published formula
 *     the .set file's own naming (BB_Mult/KC_Mult/"green squeeze") points
 *     to, not a Kaspareit-specific variant.
 *   - ATR uses SMA-of-true-range (lib.atr), not Wilder/RMA — same
 *     simplification used throughout this repo's backtests.
 *   - Same-bar SL+TP ambiguity resolved conservatively as SL.
 */
import { readFileSync } from 'fs';
import { atr } from '../scripts/premarket/lib.mjs';

const DIR = '/Users/boogy/tradingview-mcp/backtests';

// GER40 (DE40) H1 Long/Short — FTMO broker presets (30.07.2026), the only
// GER40-branded .set pair with values fully consistent with our cached
// DE40 H1 data (data_1h.json). TTM Squeeze / Volume filters OFF in both —
// see tickmillDe40Long below for a preset that exercises those two filters.
export const BASE_CONFIGS = {
  ger40Long: {
    tradeLong: true, tradeShort: false,
    atrSlPeriod: 24, atrSlMultiplier: 1.5, maxSlPercent: 3,
    riskRewardRatio: 3, partial1RR: 1, partial1Percent: 0.33, partial2RR: 2, partial2Percent: 0.33,
    useBreakEven: true, beRR: 1, beOffsetPercent: 0.1,
    vcpPeriod: 50, pivotLookback: 6, volFactor: 1.05, vcpNachlaufBars: 3,
    emaPeriod: 15,
    useMtfEma1: true, mtf1EmaPeriod: 180,
    useTtmSqueeze: false, ttmLength: 20, ttmBbMult: 2, ttmKcMult: 1.5, ttmRequireGreen: true, ttmCheckMomentum: true,
    useVolumeFilter: false, volumeAvgPeriod: 10, volumeMultiplier: 1.1,
  },
  ger40Short: {
    tradeLong: false, tradeShort: true,
    atrSlPeriod: 10, atrSlMultiplier: 1.5, maxSlPercent: 3,
    riskRewardRatio: 3, partial1RR: 1, partial1Percent: 0.33, partial2RR: 2, partial2Percent: 0.33,
    useBreakEven: true, beRR: 1, beOffsetPercent: 0.1,
    vcpPeriod: 80, pivotLookback: 15, volFactor: 1.00, vcpNachlaufBars: 2,
    emaPeriod: 9,
    useMtfEma1: true, mtf1EmaPeriod: 160,
    useTtmSqueeze: false, ttmLength: 20, ttmBbMult: 2, ttmKcMult: 1.5, ttmRequireGreen: true, ttmCheckMomentum: true,
    useVolumeFilter: false, volumeAvgPeriod: 10, volumeMultiplier: 1.1,
  },
  // Tickmill DE40 H1 Long — exercises TTM Squeeze AND Volume filter (both
  // OFF in ger40Long/Short above), needed to validate those two code paths.
  tickmillDe40Long: {
    tradeLong: true, tradeShort: false,
    atrSlPeriod: 15, atrSlMultiplier: 1.5, maxSlPercent: 3,
    riskRewardRatio: 3, partial1RR: 1, partial1Percent: 0.33, partial2RR: 2, partial2Percent: 0.33,
    useBreakEven: true, beRR: 1, beOffsetPercent: 0.1,
    vcpPeriod: 50, pivotLookback: 5, volFactor: 1.00, vcpNachlaufBars: 3,
    emaPeriod: 18,
    useMtfEma1: true, mtf1EmaPeriod: 150,
    useTtmSqueeze: true, ttmLength: 20, ttmBbMult: 2, ttmKcMult: 1.5, ttmRequireGreen: true, ttmCheckMomentum: true,
    useVolumeFilter: true, volumeAvgPeriod: 10, volumeMultiplier: 1.1,
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

function smaArray(values, len) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= len) sum -= values[i - len];
    if (i >= len - 1) out[i] = sum / len;
  }
  return out;
}

function stdevArray(values, len) {
  const out = new Array(values.length).fill(null);
  for (let i = len - 1; i < values.length; i++) {
    let mean = 0;
    for (let j = i - len + 1; j <= i; j++) mean += values[j];
    mean /= len;
    let sq = 0;
    for (let j = i - len + 1; j <= i; j++) sq += (values[j] - mean) ** 2;
    out[i] = Math.sqrt(sq / len);
  }
  return out;
}

// Public "Squeeze Momentum Indicator" formula (LazyBear/John Carter): BB vs
// KC width -> squeeze on/off, plus a linreg momentum histogram of
// close - avg(avg(highestHigh,lowestLow), sma(close)).
function ttmSqueeze(bars, length, bbMult, kcMult) {
  const n = bars.length;
  const closes = bars.map(b => b.close);
  const sma = smaArray(closes, length);
  const std = stdevArray(closes, length);
  const atrArr = atr(bars, length);
  const upperBB = new Array(n).fill(null), lowerBB = new Array(n).fill(null);
  const upperKC = new Array(n).fill(null), lowerKC = new Array(n).fill(null);
  const squeezeOn = new Array(n).fill(null);
  const momentum = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (sma[i] == null || std[i] == null || atrArr[i] == null) continue;
    upperBB[i] = sma[i] + bbMult * std[i];
    lowerBB[i] = sma[i] - bbMult * std[i];
    upperKC[i] = sma[i] + kcMult * atrArr[i];
    lowerKC[i] = sma[i] - kcMult * atrArr[i];
    squeezeOn[i] = lowerBB[i] > lowerKC[i] && upperBB[i] < upperKC[i];
  }
  for (let i = length - 1; i < n; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - length + 1; j <= i; j++) { hh = Math.max(hh, bars[j].high); ll = Math.min(ll, bars[j].low); }
    const avg1 = (hh + ll) / 2;
    const avg2 = (avg1 + sma[i]) / 2;
    const series = [];
    for (let j = i - length + 1; j <= i; j++) {
      let hh2 = -Infinity, ll2 = Infinity;
      for (let k = Math.max(0, j - length + 1); k <= j; k++) { hh2 = Math.max(hh2, bars[k].high); ll2 = Math.min(ll2, bars[k].low); }
      series.push(closes[j] - avg2);
    }
    // linreg value at the current (last) point of the window: least-squares
    // fit of `series` against x=0..length-1, evaluated at x=length-1.
    const m = series.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let x = 0; x < m; x++) { sumX += x; sumY += series[x]; sumXY += x * series[x]; sumXX += x * x; }
    const denom = m * sumXX - sumX * sumX;
    const slope = denom !== 0 ? (m * sumXY - sumX * sumY) / denom : 0;
    const intercept = (sumY - slope * sumX) / m;
    momentum[i] = intercept + slope * (m - 1);
  }
  return { squeezeOn, momentum };
}

export function loadBars(file) {
  return JSON.parse(readFileSync(`${DIR}/${file}`, 'utf8'));
}

// Indicator arrays depend only on STRUCTURAL params — cache per signature so
// a sweep that only varies exit/risk params doesn't recompute everything.
const indicatorCache = new Map();
// Keying on bars.length alone collides across different instruments/datasets
// with the same bar count (same bug independently confirmed live 11.08.2026
// in s1/s2/s5_engine.mjs during multi-instrument batch runs). First+last
// timestamp disambiguates without hashing full content.
const sig = (b) => `${b.length}|${b[0]?.time}|${b[b.length - 1]?.time}`;

function getIndicators(bars, cfg) {
  const key = JSON.stringify({
    atrSlPeriod: cfg.atrSlPeriod, vcpPeriod: cfg.vcpPeriod, emaPeriod: cfg.emaPeriod,
    mtf1EmaPeriod: cfg.mtf1EmaPeriod, ttmLength: cfg.ttmLength, ttmBbMult: cfg.ttmBbMult,
    ttmKcMult: cfg.ttmKcMult, volumeAvgPeriod: cfg.volumeAvgPeriod, s: sig(bars),
  });
  if (indicatorCache.has(key)) return indicatorCache.get(key);
  const atrSl = atr(bars, cfg.atrSlPeriod);
  const atrVcp = atr(bars, cfg.vcpPeriod);
  const ema = emaArray(bars.map(b => b.close), cfg.emaPeriod);
  const mtf1Ema = emaArray(bars.map(b => b.close), cfg.mtf1EmaPeriod);
  const { squeezeOn, momentum } = ttmSqueeze(bars, cfg.ttmLength, cfg.ttmBbMult, cfg.ttmKcMult);
  const volAvg = smaArray(bars.map(b => b.volume || 0), cfg.volumeAvgPeriod);
  const result = { atrSl, atrVcp, ema, mtf1Ema, squeezeOn, momentum, volAvg };
  indicatorCache.set(key, result);
  return result;
}

export function runBacktest(bars, cfg, filterOpts = {}) {
  const riskScale = cfg.riskScale ?? 1;
  const targetScale = cfg.targetScale ?? 1;
  const requireMtfEma1 = filterOpts.requireMtfEma1 !== false;
  const { atrSl, atrVcp, ema, mtf1Ema, squeezeOn, momentum, volAvg } = getIndicators(bars, cfg);

  const trades = [];
  const open = [];
  // "armed" VCP signal state per direction: { pivot, sinceIdx }
  let armedLong = null, armedShort = null;

  for (let i = 1; i < bars.length; i++) {
    const bar = bars[i];

    for (const t of open) {
      if (t.closed) continue;
      const isLong = t.direction === 'LONG';
      if (cfg.useBreakEven && !t.beHit) {
        const profit = isLong ? bar.high - t.entry : t.entry - bar.low;
        if (profit >= cfg.beRR * t.risk) {
          t.beHit = true;
          const offset = cfg.beOffsetPercent * t.risk;
          t.sl = isLong ? t.entry + offset : t.entry - offset;
        }
      }
      const hitSl = isLong ? bar.low <= t.sl : bar.high >= t.sl;
      if (hitSl) {
        const slR = isLong ? (t.sl - t.entry) / t.risk : (t.entry - t.sl) / t.risk;
        t.realizedR += t.remainingFrac * slR;
        t.closed = true; continue;
      }
      if (!t.tp1Done) {
        const hit = isLong ? bar.high >= t.tp1Price : bar.low <= t.tp1Price;
        if (hit) { t.realizedR += t.partial1Percent * t.partial1RR; t.remainingFrac -= t.partial1Percent; t.tp1Done = true; }
      }
      if (!t.tp2Done) {
        const hit = isLong ? bar.high >= t.tp2Price : bar.low <= t.tp2Price;
        if (hit) { t.realizedR += t.partial2Percent * t.partial2RR; t.remainingFrac -= t.partial2Percent; t.tp2Done = true; }
      }
      const hitFinal = isLong ? bar.high >= t.tpFinalPrice : bar.low <= t.tpFinalPrice;
      if (hitFinal) { t.realizedR += t.remainingFrac * t.riskRewardRatio; t.closed = true; }
    }
    for (const t of open) if (t.closed) trades.push(t);
    for (let k = open.length - 1; k >= 0; k--) if (open[k].closed) open.splice(k, 1);

    if (i <= cfg.pivotLookback) continue;
    if (atrVcp[i] == null || atrVcp[i - cfg.pivotLookback] == null || atrSl[i] == null || ema[i] == null) continue;

    const contracted = atrVcp[i] <= atrVcp[i - cfg.pivotLookback] * cfg.volFactor;
    let pivotHigh = -Infinity, pivotLow = Infinity;
    for (let j = i - cfg.pivotLookback; j < i; j++) { pivotHigh = Math.max(pivotHigh, bars[j].high); pivotLow = Math.min(pivotLow, bars[j].low); }

    // Arm a fresh signal whenever contraction holds (re-arming replaces any
    // stale unexpired signal with the current, tighter pivot).
    if (contracted) {
      if (cfg.tradeLong) armedLong = { pivot: pivotHigh, sinceIdx: i };
      if (cfg.tradeShort) armedShort = { pivot: pivotLow, sinceIdx: i };
    }
    // Expire signals that ran out their Nachlauf window without a breakout.
    if (armedLong && i - armedLong.sinceIdx > cfg.vcpNachlaufBars) armedLong = null;
    if (armedShort && i - armedShort.sinceIdx > cfg.vcpNachlaufBars) armedShort = null;

    const tryEntry = (isLong) => {
      const armed = isLong ? armedLong : armedShort;
      if (!armed) return false;
      const breakout = isLong ? bar.close > armed.pivot : bar.close < armed.pivot;
      if (!breakout) return false;
      if (requireMtfEma1 && cfg.useMtfEma1) {
        if (mtf1Ema[i] == null) return false;
        if (isLong ? bar.close <= mtf1Ema[i] : bar.close >= mtf1Ema[i]) return false;
      }
      if (isLong ? bar.close <= ema[i] : bar.close >= ema[i]) return false;
      if (cfg.useTtmSqueeze) {
        if (squeezeOn[i] == null) return false;
        if (cfg.ttmRequireGreen && squeezeOn[i]) return false;
        if (cfg.ttmCheckMomentum) {
          if (momentum[i] == null) return false;
          if (isLong ? momentum[i] <= 0 : momentum[i] >= 0) return false;
        }
      }
      if (cfg.useVolumeFilter) {
        if (volAvg[i] == null) return false;
        const vol = bar.volume || 0;
        if (vol < volAvg[i] * cfg.volumeMultiplier) return false;
      }
      return true;
    };

    let direction = null;
    if (cfg.tradeLong && tryEntry(true)) direction = 'LONG';
    else if (cfg.tradeShort && tryEntry(false)) direction = 'SHORT';
    if (!direction) continue;

    const isLong = direction === 'LONG';
    const entry = bar.close;
    const atrDist = cfg.atrSlMultiplier * atrSl[i];
    const capDist = (cfg.maxSlPercent / 100) * entry;
    const baseRisk = Math.min(atrDist, capDist);
    if (baseRisk <= 0) continue;
    const risk = baseRisk * riskScale;
    const sl = isLong ? entry - risk : entry + risk;
    const partial1RR = cfg.partial1RR * targetScale;
    const partial2RR = cfg.partial2RR * targetScale;
    const riskRewardRatio = cfg.riskRewardRatio * targetScale;
    trades.length; // no-op keep lint happy about unused var patterns
    open.push({
      direction, entry, sl, risk, entryIdx: i, entryTime: bar.time,
      partial1RR, partial1Percent: cfg.partial1Percent, partial2RR, partial2Percent: cfg.partial2Percent, riskRewardRatio,
      tp1Price: isLong ? entry + partial1RR * risk : entry - partial1RR * risk,
      tp2Price: isLong ? entry + partial2RR * risk : entry - partial2RR * risk,
      tpFinalPrice: isLong ? entry + riskRewardRatio * risk : entry - riskRewardRatio * risk,
      tp1Done: false, tp2Done: false, beHit: false, remainingFrac: 1.0, realizedR: 0, closed: false,
    });
    if (isLong) armedLong = null; else armedShort = null;
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
