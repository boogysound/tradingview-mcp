/**
 * Shared S3 backtest engine (indicators + simulation), reimplemented from
 * `S3/Strategie 3 7.11 Parametererklärung.pdf` + two real .set files
 * (`13.11.24_Strat3_H1_Nasdaq_vollauto.set`, ver7.06; `26.04.2024_Strat3_
 * halbauto.set`, ver7.0) — 30.07.2026. Same engine/sweep split as
 * s1_engine.mjs/s5_engine.mjs/ut_engine.mjs/vcp_engine.mjs.
 *
 * Rules (per PDF, sections 8-10):
 *   - Entry trigger: the primary SuperTrend (period/multiplier, computed on
 *     the base chart timeframe) FLIPS direction — bullish flip = long,
 *     bearish flip = short (section 9, "SuperTrend Entry Settings" —
 *     this ST is the trigger itself, not merely a confirmation filter,
 *     unlike S1/UT where SuperTrend is a secondary agreement filter).
 *   - Dual "Magic Trend" HTF filter (sections 4-5): a trade is only taken
 *     if BOTH Magic Trend 1 and Magic Trend 2 (each independently
 *     configurable period/ATR-mult/ATR-period/timeframe) agree with the
 *     ST flip's direction. "Magic Trend" ("Trend Magic") is a well-known
 *     public CCI+ATR ratcheting-band indicator (not proprietary to
 *     Kaspareit) — formula reused here from its standard public definition:
 *       CCI = cci(hlc3, period); ATR = atr(atrPeriod) * atrMult
 *       up = low - ATR; down = high + ATR
 *       line = CCI>=0 ? max(up, prevLine if price still above) : min(down, ...)
 *       direction = CCI>=0 ? bullish : bearish
 *     Both sampled .set files run MT1+MT2 on H4 while the base chart is H1
 *     — genuine multi-timeframe alignment implemented via `alignHtf()`
 *     (last CLOSED higher-TF bar as of each base-TF bar's time, no
 *     repainting).
 *   - Exit: fixed SL in index points (`SL_pips`, per PDF 1.08 "SL per
 *     trade (in pips)") + fixed TP as an R-multiple of that SL.
 *
 * CRITICAL DOCUMENTED ASSUMPTIONS (flagged, not silently guessed):
 *   1. "Pip" = 1 index point for this instrument class (DE40/Nasdaq are
 *      both quoted in plain decimal index points, no traditional FX
 *      pip/point distinction) — SL_pips=85 is used directly as an 85-point
 *      stop distance.
 *   2. The vollauto .set's `TP_pips=2.8` field is reinterpreted as an
 *      R-MULTIPLE, not literal points: at face value 2.8 points against an
 *      85-point SL would be a ~1:0.03 RR, which is not a coherent trading
 *      system. 2.8x the SL distance (≈238 points, ~1:2.8 RR) is a sane
 *      target in line with S1/S5/UT's own final-TP R-multiples (3.0, ~3,
 *      3.0) — the same category of unit-reinterpretation already applied to
 *      S1's beStepPct (Teil 15/session log) rather than trusting a
 *      literal-but-nonsensical field name.
 *   3. Breakeven / trailing-after-BE (sections 11-12) NOT implemented for
 *      this baseline: the two sampled .set files disagree on structure
 *      across EA versions (halbauto/ver7.0 has explicit `is_Breakeven`/
 *      `is_Breakeven_notrail` toggles, both false/OFF; vollauto/ver7.06 has
 *      no such toggle field at all, only raw be_start/be_step numbers of a
 *      magnitude — 9000/500 — inconsistent with either a point or a percent
 *      reading against an 85-point SL). Rather than guess a wrong unit
 *      conversion (S1's beStepPct mistake was exactly this failure mode),
 *      BE/trailing is left OFF for the baseline and flagged as an open
 *      sweep candidate once the unit is resolved.
 *   4. Basket mode, corrections/pyramiding (sections 13-14), MA filters
 *      (sections 2-3), additional confirmation SuperTrend (section 10),
 *      price-level/time filters (sections 6-7), and HLOTT (section 17) are
 *      all OFF in both sampled .set files — not implemented, matching the
 *      preset's own disabled state (same convention as VCP's unused
 *      Williams-Fractal-Trailing branch). `maxOpenTrades=1` mirrors both
 *      presets' `max_trades=1`.
 *   5. Entry price = signal bar's close (same convention as S1/UT/VCP).
 */
import { readFileSync } from 'fs';
import { atr } from '../scripts/premarket/lib.mjs';

const DIR = '/Users/boogy/tradingview-mcp/backtests';

export const BASE_CONFIG = {
  // SuperTrend entry (base chart timeframe)
  stPeriod: 2, stMultiplier: 1,
  // Magic Trend 1 (H4)
  mt1Timeframe: '4h', mt1Period: 2, mt1AtrMult: 1, mt1AtrPeriod: 2,
  // Magic Trend 2 (H4)
  mt2Timeframe: '4h', mt2Period: 7, mt2AtrMult: 6, mt2AtrPeriod: 7,
  // Exit
  slPoints: 85, tpRMultiple: 2.8,
  maxOpenTrades: 1,
};

function superTrend(bars, period, multiplier) {
  const atrArr = atr(bars, period);
  const n = bars.length;
  const dir = new Array(n).fill(null);
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
    prevUpper = upperBand; prevLower = lowerBand; prevClose = bars[i].close; prevDir = direction;
  }
  return dir;
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

// "Magic Trend" / "Trend Magic": public CCI+ATR ratcheting band. Returns
// direction only (+1 bullish / -1 bearish) — the band's own price level
// isn't used by S3 (it's a pure trend-agreement filter here, not an SL).
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

// Aligns a higher-timeframe indicator array onto the base-timeframe bar
// index: for each base bar i, find the last HTF bar whose time <= base
// bar's time (last CLOSED htf bar, no repainting/lookahead).
function alignHtf(baseBars, htfBars, htfValues) {
  const n = baseBars.length;
  const out = new Array(n).fill(null);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = baseBars[i].time;
    while (j + 1 < htfBars.length && htfBars[j + 1].time <= t) j++;
    if (htfBars[j].time <= t) out[i] = htfValues[j];
  }
  return out;
}

const indicatorCache = new Map();
// Keying on bars.length alone collides across different instruments/datasets
// with the same bar count (same bug independently confirmed live 11.08.2026
// in s1/s2/s5_engine.mjs during multi-instrument batch runs). First+last
// timestamp disambiguates without hashing full content; htfBars gets its own
// signature since it's an independent series that can collide separately.
const sig = (b) => `${b.length}|${b[0]?.time}|${b[b.length - 1]?.time}`;

function getIndicators(bars, htfBars, cfg) {
  const key = JSON.stringify({
    stPeriod: cfg.stPeriod, stMultiplier: cfg.stMultiplier,
    mt1Period: cfg.mt1Period, mt1AtrMult: cfg.mt1AtrMult, mt1AtrPeriod: cfg.mt1AtrPeriod,
    mt2Period: cfg.mt2Period, mt2AtrMult: cfg.mt2AtrMult, mt2AtrPeriod: cfg.mt2AtrPeriod,
    s: sig(bars), htfS: sig(htfBars),
  });
  if (indicatorCache.has(key)) return indicatorCache.get(key);
  const stDir = superTrend(bars, cfg.stPeriod, cfg.stMultiplier);
  const mt1Htf = magicTrend(htfBars, cfg.mt1Period, cfg.mt1AtrPeriod, cfg.mt1AtrMult);
  const mt2Htf = magicTrend(htfBars, cfg.mt2Period, cfg.mt2AtrPeriod, cfg.mt2AtrMult);
  const mt1Dir = alignHtf(bars, htfBars, mt1Htf);
  const mt2Dir = alignHtf(bars, htfBars, mt2Htf);
  const result = { stDir, mt1Dir, mt2Dir };
  indicatorCache.set(key, result);
  return result;
}

export function runBacktest(bars, htfBars, cfg, filterOpts = {}) {
  const requireMagicTrend = filterOpts.requireMagicTrend !== false;
  const maxOpenTrades = cfg.maxOpenTrades ?? 1;
  const { stDir, mt1Dir, mt2Dir } = getIndicators(bars, htfBars, cfg);

  const trades = [];
  const open = [];

  for (let i = 1; i < bars.length; i++) {
    const bar = bars[i];

    for (const t of open) {
      if (t.closed) continue;
      const isLong = t.direction === 'LONG';
      const hitSl = isLong ? bar.low <= t.sl : bar.high >= t.sl;
      const hitTp = isLong ? bar.high >= t.tp : bar.low <= t.tp;
      // Same-bar SL+TP ambiguity resolved conservatively as SL (repo convention).
      if (hitSl) { t.realizedR = -1; t.closed = true; }
      else if (hitTp) { t.realizedR = cfg.tpRMultiple; t.closed = true; }
    }
    for (const t of open) if (t.closed) trades.push(t);
    for (let k = open.length - 1; k >= 0; k--) if (open[k].closed) open.splice(k, 1);

    if (stDir[i] == null || stDir[i - 1] == null) continue;
    if (open.length >= maxOpenTrades) continue;
    const flipUp = stDir[i - 1] === -1 && stDir[i] === 1;
    const flipDown = stDir[i - 1] === 1 && stDir[i] === -1;
    if (!flipUp && !flipDown) continue;
    const isLong = flipUp;

    if (requireMagicTrend) {
      if (mt1Dir[i] == null || mt2Dir[i] == null) continue;
      const want = isLong ? 1 : -1;
      if (mt1Dir[i] !== want || mt2Dir[i] !== want) continue;
    }

    const entry = bar.close;
    const risk = cfg.slPoints;
    if (risk <= 0) continue;
    const sl = isLong ? entry - risk : entry + risk;
    const tp = isLong ? entry + cfg.tpRMultiple * risk : entry - cfg.tpRMultiple * risk;
    open.push({ direction: isLong ? 'LONG' : 'SHORT', entry, sl, tp, entryIdx: i, entryTime: bar.time, realizedR: 0, closed: false });
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
