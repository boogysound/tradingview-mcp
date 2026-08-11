/**
 * Shared UT-Bot 2.0 backtest engine (indicators + simulation), built from
 * `UT/Kurzanleitung UT.pdf` + `UT/Parametererklärung für UT.pdf` (30.07.2026).
 * Same engine/sweep split as s1_engine.mjs/s5_engine.mjs.
 *
 * Rules (per the two PDFs):
 *   - Trigger: SMI crosses its own signal/D-line — cross UP = long trigger,
 *     cross DOWN = short trigger ("SMI-Linien kreuzen sich positiv/negativ").
 *   - UT-Bot arrow must simultaneously point the same direction (confirmation,
 *     not the trigger — opposite hierarchy from the informal Teil-14 EA,
 *     which required the exact same two conditions together but described
 *     UT-Bot as the primary signal).
 *   - EMA 1 (documented default: 200) confirms trend; EMA 2 optional,
 *     undocumented default -> assumed OFF here.
 *   - SL at the low (long) / high (short) of the last `slLookback` candles.
 *   - Partial TP1/TP2 + Final TP, all as %-of-SL (identical mechanism to
 *     S1/S5's tpXPct engine).
 *   - Optional breakeven at `beActivationPct`-of-SL profit.
 *
 * CRITICAL DIFFERENCE FROM S1/S5: no .set file exists anywhere in the
 * Kaspareit UT folder (Archiv/ is empty) — every numeric default below is
 * either (a) explicitly stated in the PDF (EMA1=200), (b) the underlying
 * public indicator's own well-known default (UT-Bot key=1/ATR=10, SMI
 * %K=10/%D=3/EMA=3 — same values already researched independently for the
 * Teil-14 EA), or (c) an unavoidable assumption, flagged below. Confidence
 * here is genuinely lower than S1/S5's factory-preset baselines — treat the
 * "baseline" run as a reasonable starting point to sweep from, NOT a
 * documented factory config like S1/S5 had.
 *
 * Explicit assumptions:
 *   - No zero-line requirement on the SMI cross (Teil-14's own EA required
 *     "both SMI and signal below/above zero" in addition to the cross —
 *     that's from the ad-hoc screenshot spec, NOT from this PDF, which only
 *     describes a directional cross. Deliberately NOT carried over here.
 *   - EMA1/EMA2 computed on the SAME timeframe as entries (PDF allows a
 *     separate "EMA Timeframe" per EMA, i.e. genuine MTF — not implemented;
 *     no default given for what timeframe that would be).
 *   - slLookback default = 3 candles (undocumented; reused from Teil-14's
 *     own assumption for the same unspecified field, for continuity).
 *   - tp1ClosePct/tp2ClosePct = 0.33 each (undocumented; same convention
 *     already used for S1/S5's partial closes).
 *   - BE offset assumed 0 (exact breakeven, no buffer) when BE triggers —
 *     same simplification as S5's Teil 17 (no documented step value exists
 *     for UT either).
 *   - Trailing Stop (4 modes: off/continuous/until BE/after BE) NOT
 *     implemented — out of scope for this build, same as S5's undocumented
 *     SuperTrend-trailing branch. Baseline runs with trailing conceptually
 *     "off" (only initial SL + BE + partial/final TP are simulated).
 *   - Day/session filters (5.01-5.36, up to 2 sessions/weekday) have no
 *     documented default times at all — baseline runs with NO time filter
 *     (all bars eligible), unlike Teil-14's own ad-hoc 09:00-23:00 window.
 *   - Same-bar SL+TP ambiguity resolved conservatively as SL (repo convention).
 */
import { readFileSync } from 'fs';
import { atr } from '../scripts/premarket/lib.mjs';

const DIR = '/Users/boogy/tradingview-mcp/backtests';

export const BASE_CONFIG = {
  utKey: 1, utAtrPeriod: 10,
  smiK: 10, smiD: 3, smiEma: 3,
  ema1Period: 200, useEma2: false, ema2Period: 50,
  slLookback: 3,
  tpFinalPct: 300, tp1Pct: 70, tp2Pct: 150, tp1ClosePct: 0.33, tp2ClosePct: 0.33,
};

function emaArray(values, len) {
  const out = new Array(values.length).fill(null);
  const alpha = 2 / (len + 1);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;
    prev = prev == null ? v : v * alpha + prev * (1 - alpha);
    out[i] = prev;
  }
  return out;
}

function utBot(bars, key, atrPeriod) {
  const atrArr = atr(bars, atrPeriod);
  const n = bars.length;
  const stop = new Array(n).fill(null);
  const trendUp = new Array(n).fill(null);
  let pos = 0;
  for (let i = 0; i < n; i++) {
    const a = atrArr[i];
    if (a == null) continue;
    const src = bars[i].close;
    const nLoss = key * a;
    const prevStop = i > 0 ? stop[i - 1] : null;
    const prevSrc = i > 0 ? bars[i - 1].close : null;
    let newStop;
    if (prevStop == null) {
      newStop = src - nLoss;
    } else if (src > prevStop && prevSrc > prevStop) {
      newStop = Math.max(prevStop, src - nLoss);
    } else if (src < prevStop && prevSrc < prevStop) {
      newStop = Math.min(prevStop, src + nLoss);
    } else if (src > prevStop) {
      newStop = src - nLoss;
    } else {
      newStop = src + nLoss;
    }
    stop[i] = newStop;
    if (prevStop != null && prevSrc != null) {
      if (prevSrc < prevStop && src > newStop) pos = 1;
      else if (prevSrc > prevStop && src < newStop) pos = -1;
    }
    trendUp[i] = pos === 1 ? true : pos === -1 ? false : null;
  }
  return { trendUp };
}

function calcSMI(bars, kLen, dLen, emaLen) {
  const n = bars.length;
  const diff = new Array(n).fill(null);
  const rdiff = new Array(n).fill(null);
  for (let i = kLen - 1; i < n; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - kLen + 1; j <= i; j++) {
      hh = Math.max(hh, bars[j].high);
      ll = Math.min(ll, bars[j].low);
    }
    diff[i] = hh - ll;
    rdiff[i] = bars[i].close - (hh + ll) / 2;
  }
  const avgrel = emaArray(emaArray(rdiff, dLen), dLen);
  const avgdiff = emaArray(emaArray(diff, dLen), dLen);
  const smi = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (avgrel[i] == null || avgdiff[i] == null) continue;
    smi[i] = avgdiff[i] !== 0 ? (avgrel[i] / (avgdiff[i] / 2)) * 100 : 0;
  }
  const signal = emaArray(smi, emaLen);
  return { smi, signal };
}

export function loadBars(file) {
  return JSON.parse(readFileSync(`${DIR}/${file}`, 'utf8'));
}

// Indicator arrays depend only on STRUCTURAL params (utKey, utAtrPeriod,
// smiK, smiD, smiEma, ema1Period, useEma2, ema2Period) — cache per unique
// signature so a sweep that only varies SL/TP/BE/riskScale/targetScale
// doesn't recompute UT-Bot/SMI/EMA.
const indicatorCache = new Map();
// Keying on bars.length alone collides across different instruments/datasets
// with the same bar count (same bug independently confirmed live 11.08.2026
// in s1/s2/s5_engine.mjs during multi-instrument batch runs). First+last
// timestamp disambiguates without hashing full content.
const sig = (b) => `${b.length}|${b[0]?.time}|${b[b.length - 1]?.time}`;

function getIndicators(bars, cfg) {
  const key = JSON.stringify({
    utKey: cfg.utKey, utAtrPeriod: cfg.utAtrPeriod,
    smiK: cfg.smiK, smiD: cfg.smiD, smiEma: cfg.smiEma,
    ema1Period: cfg.ema1Period, useEma2: cfg.useEma2, ema2Period: cfg.ema2Period,
    s: sig(bars),
  });
  if (indicatorCache.has(key)) return indicatorCache.get(key);
  const { trendUp } = utBot(bars, cfg.utKey, cfg.utAtrPeriod);
  const { smi, signal } = calcSMI(bars, cfg.smiK, cfg.smiD, cfg.smiEma);
  const ema1 = emaArray(bars.map(b => b.close), cfg.ema1Period);
  const ema2 = cfg.useEma2 ? emaArray(bars.map(b => b.close), cfg.ema2Period) : null;
  const result = { trendUp, smi, signal, ema1, ema2 };
  indicatorCache.set(key, result);
  return result;
}

export function runBacktest(bars, cfg, filterOpts = {}) {
  const riskScale = cfg.riskScale ?? 1;
  const targetScale = cfg.targetScale ?? 1;
  const beMultR = cfg.beMultR ?? 0;
  const requireUtBot = filterOpts.requireUtBot !== false;
  const requireEma1 = filterOpts.requireEma1 !== false;
  const { trendUp, smi, signal, ema1, ema2 } = getIndicators(bars, cfg);

  const trades = [];
  const open = [];

  for (let i = 1; i < bars.length; i++) {
    const bar = bars[i];

    for (const t of open) {
      if (t.closed) continue;
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

    if (i < cfg.slLookback) continue;
    if (smi[i] == null || signal[i] == null || smi[i - 1] == null || signal[i - 1] == null) continue;
    if (requireUtBot && trendUp[i] == null) continue;
    if (requireEma1 && ema1[i] == null) continue;
    if (cfg.useEma2 && ema2[i] == null) continue;

    const crossUp = smi[i - 1] <= signal[i - 1] && smi[i] > signal[i];
    const crossDown = smi[i - 1] >= signal[i - 1] && smi[i] < signal[i];
    if (!crossUp && !crossDown) continue;
    const isLong = crossUp;

    if (requireUtBot && (isLong ? trendUp[i] !== true : trendUp[i] !== false)) continue;
    if (requireEma1 && (isLong ? bar.close <= ema1[i] : bar.close >= ema1[i])) continue;
    if (cfg.useEma2 && (isLong ? bar.close <= ema2[i] : bar.close >= ema2[i])) continue;

    let extreme = isLong ? Infinity : -Infinity;
    for (let j = i - cfg.slLookback; j < i; j++) {
      extreme = isLong ? Math.min(extreme, bars[j].low) : Math.max(extreme, bars[j].high);
    }
    const entry = bar.close;
    const baseRisk = Math.abs(entry - extreme);
    if (baseRisk <= 0) continue;
    const risk = baseRisk * riskScale;
    const sl = isLong ? entry - risk : entry + risk;
    const tp1Pct = cfg.tp1Pct * targetScale;
    const tp2Pct = cfg.tp2Pct * targetScale;
    const tpFinalPct = cfg.tpFinalPct * targetScale;
    open.push({
      direction: isLong ? 'LONG' : 'SHORT', entry, sl, risk, entryIdx: i, entryTime: bar.time,
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
