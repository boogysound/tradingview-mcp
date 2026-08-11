/**
 * Shared S2 backtest engine (indicators + simulation), reimplemented from
 * `S2/Handelsregeln Strategie 2.pdf` (plain-English rules) + `S2/Strategie 2
 * Parameter-Erklärung 5.95.pdf` (field-by-field) + the real `20240712 Strat
 * 2 Nasdaq konservativ.set` preset (ver5.9) — 30.07.2026. Same engine/sweep
 * split as s1_engine.mjs/s3_engine.mjs/vcp_engine.mjs.
 *
 * Rules (per the two PDFs):
 *   - Entry trigger: primary SuperTrend (stPeriod/stMultiplier) FLIPS
 *     direction — same trigger mechanism as S3's SuperTrend entry.
 *   - Gated by (all real/on in the konservativ preset): an ADDITIONAL
 *     confirmation SuperTrend (must agree with the flip direction — S3 had
 *     this feature too but OFF in its sampled preset; S2's konservativ
 *     preset turns it ON), two EMA filters (MA1/MA2, price must be on the
 *     correct side of both), dual "Magic Trend" (same public CCI+ATR
 *     ratcheting-band indicator as S3 — both must agree), and HLOTT
 *     (public HOTT/LOTT indicator, `hlott.mjs`, reused from S1 — mode "a":
 *     no trade while price sits inside the HOTT/LOTT channel; outside it,
 *     same directional convention S1 already uses: close > HOTT for long,
 *     close < LOTT for short).
 *   - Exit: UNLIKE S1/S3/UT, this preset has NO take-profit at all
 *     (TP_pips=0 in both real .set files) — the entire exit is: fixed
 *     initial SL (slPoints) -> trail using the PRIMARY entry SuperTrend's
 *     own value while it still agrees with the trade direction -> once
 *     profit reaches beStartPoints, jump to breakeven + beStepPoints ->
 *     after breakeven, switch to trailing via a SEPARATE SuperTrend
 *     (trailAfterBePeriod/trailAfterBeMultiplier). This is the EXACT same
 *     trail-until-BE + separate-post-BE-trailing-ST mechanism already
 *     built for S1 (`s1_engine.mjs`'s `useTrailToBE`/`stTrail`) — reused
 *     here, not reinvented, since both EAs share the same underlying
 *     trade-management design (same author/EA family).
 *
 * CRITICAL DOCUMENTED ASSUMPTIONS (flagged, not silently guessed):
 *   1. "Pip"/"point" for `SL_pips` = 1 index point (same convention as S3;
 *      both real .set files agree on SL_pips=50 across "high risk" and
 *      "konservativ" presets, a stable, sane value at that scale).
 *   2. `be_start`/`be_step` are on a DIFFERENT, finer-grained unit than
 *      `SL_pips` — taken LITERALLY, konservativ's be_start=7000/be_step=50
 *      would mean breakeven only activates at 140x the 50-point SL (never
 *      happens in practice), and high-risk's be_start=19000 would be 380x
 *      its own 50-point SL — implausible for a real BE mechanism in EITHER
 *      preset. Dividing by 100 (raw MT5 `_Point` vs whole index-point
 *      scale, a common broker convention) gives konservativ BE at +70pt
 *      (1.4x SL) with a +0.5pt buffer, and high-risk BE at +190pt (3.8x
 *      SL) with 0 buffer — both sane, internally consistent BE placements
 *      relative to their own SL. Same category of unit correction as S1's
 *      documented beStepPct fix and S3's TP_pips-as-R-multiple fix.
 *   3. `use_ATR`/`ATR_Period` (global ATR volatility gate, section 8 of the
 *      PDF) has NO documented or set-file threshold value anywhere — only
 *      a period, no minimum-ATR number to compare against. Left
 *      UNIMPLEMENTED (same treatment as S3's undocumented BE toggle
 *      ambiguity) rather than inventing a threshold.
 *   4. Basket mode (SL/TP/BE/trailing as % of balance, section 13),
 *      corrections/pyramiding (section 14), time/day-of-week/news filters
 *      are all OFF or structurally moot in the konservativ preset
 *      (`max_trades=1` — no second trade can ever open, so basket-level
 *      management collapses to the single per-trade SL already modeled).
 *      Not implemented, matching VCP's/S3's convention for unused branches.
 *   5. HLOTT's own formula assumptions are inherited unchanged from
 *      `hlott.mjs` (public HOTT/LOTT reconstruction, already flagged there
 *      — not re-flagged here).
 *   6. Entry price = signal bar's close (same convention as S1/S3/UT/VCP).
 */
import { readFileSync } from 'fs';
import { atr } from '../scripts/premarket/lib.mjs';
import { hlott as computeHlott } from './hlott.mjs';

const DIR = '/Users/boogy/tradingview-mcp/backtests';

export const BASE_CONFIG = {
  stPeriod: 2, stMultiplier: 1,
  useAddlSt: true, addlStPeriod: 10, addlStMultiplier: 2.5,
  useMa1: true, ma1Period: 2,
  useMa2: true, ma2Period: 100,
  mt1Period: 5, mt1AtrMult: 3, mt1AtrPeriod: 8,
  mt2Period: 5, mt2AtrMult: 1, mt2AtrPeriod: 16,
  useHlott: true, hlottPeriod: 4, hlottPercent: 0.6, hlottLength: 7,
  slPoints: 50,
  beStartPoints: 70, beStepPoints: 0.5,
  trailAfterBePeriod: 7, trailAfterBeMultiplier: 28,
  maxOpenTrades: 1,
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

function cci(bars, period) {
  const n = bars.length;
  const tp = bars.map(b => (b.high + b.low + b.close) / 3);
  const out = new Array(n).fill(null);
  for (let i = period - 1; i < n; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += tp[j];
    const sma = sum / period;
    let devSum = 0;
    for (let j = i - period + 1; j <= i; j++) devSum += Math.abs(tp[j] - sma);
    const meanDev = devSum / period;
    out[i] = meanDev !== 0 ? (tp[i] - sma) / (0.015 * meanDev) : 0;
  }
  return out;
}

// "Magic Trend" / "Trend Magic": public CCI+ATR ratcheting band, same
// formula as s3_engine.mjs — direction only (+1 bullish / -1 bearish).
function magicTrend(bars, period, atrPeriod, atrMult) {
  const n = bars.length;
  const cciArr = cci(bars, period);
  const atrArr = atr(bars, atrPeriod);
  const dir = new Array(n).fill(null);
  let line = null;
  for (let i = 0; i < n; i++) {
    if (cciArr[i] == null || atrArr[i] == null) continue;
    const bullish = cciArr[i] >= 0;
    const bandAtr = atrArr[i] * atrMult;
    const up = bars[i].low - bandAtr;
    const down = bars[i].high + bandAtr;
    if (line == null) {
      line = bullish ? up : down;
    } else if (bullish) {
      line = up < line ? line : up;
    } else {
      line = down > line ? line : down;
    }
    dir[i] = bullish ? 1 : -1;
  }
  return dir;
}

export function loadBars(file) {
  return JSON.parse(readFileSync(`${DIR}/${file}`, 'utf8'));
}

const indicatorCache = new Map();
// Keying on bars.length alone collides across different instruments/datasets
// with the same bar count — confirmed live 11.08.2026: an isolated re-run of
// the US500 H1 backtest (4300 bars, same as XAUUSD's H1 file) produced 104
// trades/-0.086R, but running XAUUSD then US500 in one process silently
// reused XAUUSD's cached indicator arrays and reported only 4 trades for
// US500. First+last timestamp disambiguates without hashing full content.
const sig = (b) => `${b.length}|${b[0]?.time}|${b[b.length - 1]?.time}`;

function getIndicators(bars, cfg) {
  const key = JSON.stringify({
    stPeriod: cfg.stPeriod, stMultiplier: cfg.stMultiplier,
    addlStPeriod: cfg.addlStPeriod, addlStMultiplier: cfg.addlStMultiplier,
    ma1Period: cfg.ma1Period, ma2Period: cfg.ma2Period,
    mt1Period: cfg.mt1Period, mt1AtrMult: cfg.mt1AtrMult, mt1AtrPeriod: cfg.mt1AtrPeriod,
    mt2Period: cfg.mt2Period, mt2AtrMult: cfg.mt2AtrMult, mt2AtrPeriod: cfg.mt2AtrPeriod,
    hlottPeriod: cfg.hlottPeriod, hlottPercent: cfg.hlottPercent, hlottLength: cfg.hlottLength,
    trailAfterBePeriod: cfg.trailAfterBePeriod, trailAfterBeMultiplier: cfg.trailAfterBeMultiplier,
    s: sig(bars),
  });
  if (indicatorCache.has(key)) return indicatorCache.get(key);
  const st = superTrend(bars, cfg.stPeriod, cfg.stMultiplier);
  const addlSt = superTrend(bars, cfg.addlStPeriod, cfg.addlStMultiplier);
  const stTrail = superTrend(bars, cfg.trailAfterBePeriod, cfg.trailAfterBeMultiplier);
  const ema1 = emaArray(bars.map(b => b.close), cfg.ma1Period);
  const ema2 = emaArray(bars.map(b => b.close), cfg.ma2Period);
  const mt1Dir = magicTrend(bars, cfg.mt1Period, cfg.mt1AtrPeriod, cfg.mt1AtrMult);
  const mt2Dir = magicTrend(bars, cfg.mt2Period, cfg.mt2AtrPeriod, cfg.mt2AtrMult);
  const { hott, lott } = computeHlott(bars, cfg.hlottPeriod, cfg.hlottPercent, cfg.hlottLength);
  const result = { stDir: st.dir, stValue: st.value, addlStDir: addlSt.dir, stTrailDir: stTrail.dir, stTrailValue: stTrail.value, ema1, ema2, mt1Dir, mt2Dir, hott, lott };
  indicatorCache.set(key, result);
  return result;
}

export function runBacktest(bars, cfg, filterOpts = {}) {
  const useAddlSt = filterOpts.useAddlSt ?? cfg.useAddlSt;
  const useMa1 = filterOpts.useMa1 ?? cfg.useMa1;
  const useMa2 = filterOpts.useMa2 ?? cfg.useMa2;
  const useMagicTrend = filterOpts.useMagicTrend !== false;
  const useHlott = filterOpts.useHlott ?? cfg.useHlott;
  const maxOpenTrades = cfg.maxOpenTrades ?? 1;
  const { stDir, stValue, addlStDir, stTrailDir, stTrailValue, ema1, ema2, mt1Dir, mt2Dir, hott, lott } = getIndicators(bars, cfg);

  const trades = [];
  const open = [];

  for (let i = 1; i < bars.length; i++) {
    const bar = bars[i];

    for (const t of open) {
      if (t.closed) continue;
      const isLong = t.direction === 'LONG';
      if (!t.beHit) {
        const stVal = stValue[i];
        if (stVal != null && ((isLong && stDir[i] === 1) || (!isLong && stDir[i] === -1))) {
          t.sl = isLong ? Math.max(t.sl, stVal) : Math.min(t.sl, stVal);
        }
      } else {
        const trailVal = stTrailValue[i];
        if (trailVal != null && ((isLong && stTrailDir[i] === 1) || (!isLong && stTrailDir[i] === -1))) {
          t.sl = isLong ? Math.max(t.sl, trailVal) : Math.min(t.sl, trailVal);
        }
      }
      const profit = isLong ? bar.high - t.entry : t.entry - bar.low;
      if (!t.beHit && profit >= cfg.beStartPoints) {
        t.beHit = true;
        t.sl = isLong ? Math.max(t.sl, t.entry + cfg.beStepPoints) : Math.min(t.sl, t.entry - cfg.beStepPoints);
      }
      const hitSl = isLong ? bar.low <= t.sl : bar.high >= t.sl;
      if (hitSl) {
        t.realizedR = isLong ? (t.sl - t.entry) / t.risk : (t.entry - t.sl) / t.risk;
        t.closed = true;
      }
    }
    for (const t of open) if (t.closed) trades.push(t);
    for (let k = open.length - 1; k >= 0; k--) if (open[k].closed) open.splice(k, 1);

    if (stDir[i] == null || stDir[i - 1] == null) continue;
    if (open.length >= maxOpenTrades) continue;
    const flipUp = stDir[i - 1] === -1 && stDir[i] === 1;
    const flipDown = stDir[i - 1] === 1 && stDir[i] === -1;
    if (!flipUp && !flipDown) continue;
    const isLong = flipUp;

    if (useAddlSt) {
      if (addlStDir[i] == null) continue;
      if (addlStDir[i] !== (isLong ? 1 : -1)) continue;
    }
    if (useMa1) {
      if (ema1[i] == null) continue;
      if (isLong ? bar.close <= ema1[i] : bar.close >= ema1[i]) continue;
    }
    if (useMa2) {
      if (ema2[i] == null) continue;
      if (isLong ? bar.close <= ema2[i] : bar.close >= ema2[i]) continue;
    }
    if (useMagicTrend) {
      if (mt1Dir[i] == null || mt2Dir[i] == null) continue;
      const want = isLong ? 1 : -1;
      if (mt1Dir[i] !== want || mt2Dir[i] !== want) continue;
    }
    if (useHlott) {
      if (hott[i] == null || lott[i] == null) continue;
      if (isLong ? bar.close <= hott[i] : bar.close >= lott[i]) continue;
    }

    const entry = bar.close;
    const risk = cfg.slPoints;
    if (risk <= 0) continue;
    const sl = isLong ? entry - risk : entry + risk;
    open.push({ direction: isLong ? 'LONG' : 'SHORT', entry, sl, risk, entryIdx: i, entryTime: bar.time, beHit: false, realizedR: 0, closed: false });
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
