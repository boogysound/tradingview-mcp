import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { fvgFillFraction } from './lib.mjs';

const STATE_PATH = '/Users/boogy/tradingview-mcp/state/zones.json';
const REGIME_STATE_PATH = '/Users/boogy/tradingview-mcp/state/regime_daily.json';

export function readState() {
  if (!existsSync(STATE_PATH)) return [];
  try { return JSON.parse(readFileSync(STATE_PATH, 'utf8')); }
  catch { return []; }
}

export function writeState(entries) {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(entries, null, 2));
}

// Regime is fixed once per (Berlin-calendar) trading day so it can't flip
// intraday and produce contradictory signals within the same session. Only
// an explicit --reset-regime run re-evaluates it.
export function readDailyRegime() {
  if (!existsSync(REGIME_STATE_PATH)) return null;
  try { return JSON.parse(readFileSync(REGIME_STATE_PATH, 'utf8')); }
  catch { return null; }
}

export function writeDailyRegime(dateStr, regime) {
  mkdirSync(dirname(REGIME_STATE_PATH), { recursive: true });
  writeFileSync(REGIME_STATE_PATH, JSON.stringify({ date: dateStr, regime }, null, 2));
}

function overlaps(a_low, a_high, b_low, b_high, tolerancePct = 0.0005) {
  const mid = (a_low + a_high) / 2;
  const tol = mid * tolerancePct;
  return a_low - tol <= b_high && b_low - tol <= a_high;
}

// Section 9.2 — invalidation/mitigation criteria per object type.
// Returns true if the entry should be removed given fresh bars for its timeframe.
// For S/D zones: tracks breach count (1st breach → "breached" state; 2nd breach → remove).
export function isInvalidated(entry, barsByTf) {
  // PDHL (Previous Day High/Low) entries are never invalidated; they're fresh daily.
  if (entry.type === 'pdh' || entry.type === 'pdl') return false;

  const bars = barsByTf[entry.timeframe];
  if (!bars || !bars.length) return false;

  // find bars strictly after this entry was created (by time) to check against
  const future = bars.filter(b => b.time > (entry.created_bar_time ?? 0));
  if (!future.length) return false;

  if (entry.type === 'fvg_bullish' || entry.type === 'fvg_bearish') {
    const dir = entry.type === 'fvg_bullish' ? 'bullish' : 'bearish';
    const frac = fvgFillFraction({ type: dir, low: entry.price_low, high: entry.price_high, index: -1 }, [{ time: -1 }, ...future]);
    return frac >= 0.5;
  }

  // Any wick crossing all the way through counts, not just a candle close —
  // user-specified, 27.07.2026: a block price has already traded through
  // isn't a meaningful support/resistance anymore even without a close beyond it.
  if (entry.type === 'order_block_bullish') {
    return future.some(b => b.low < entry.price_low);
  }
  if (entry.type === 'order_block_bearish') {
    return future.some(b => b.high > entry.price_high);
  }

  // S/D zones: track breach count, remove at 2nd breach
  if (entry.type === 'sd_zone_demand') {
    if (future.some(b => b.close < entry.price_low)) {
      entry.breach_count = (entry.breach_count ?? 0) + 1;
      return entry.breach_count >= 2;
    }
    return false;
  }
  if (entry.type === 'sd_zone_supply') {
    if (future.some(b => b.close > entry.price_high)) {
      entry.breach_count = (entry.breach_count ?? 0) + 1;
      return entry.breach_count >= 2;
    }
    return false;
  }

  if (entry.type === 'sr_support' || entry.type === 'sr_resistance' || entry.type === 'sr_flip_support' || entry.type === 'sr_flip_resistance') {
    const isSupport = entry.type === 'sr_support' || entry.type === 'sr_flip_support';
    const mid = (entry.price_low + entry.price_high) / 2;
    let consecutive = 0;
    for (const b of future) {
      const brokenBelow = isSupport && b.close < mid;
      const brokenAbove = !isSupport && b.close > mid;
      if (brokenBelow || brokenAbove) { consecutive++; if (consecutive >= 2) return true; }
      else consecutive = 0;
    }
    return false;
  }

  return false;
}

// Section 9.3 — time-based decay, hygiene only, tactical/short-term objects
// (15min, 1H, 5min) — HTF (12H/4H) zones/OBs are cleaned up via the separate
// price-distance relevance check in run.mjs instead, since they're meant to
// persist as long-lived structural references, not decay by age.
export function isStale(entry, nowSec) {
  if (entry.timeframe !== 15 && entry.timeframe !== 60 && entry.timeframe !== 5) return false;
  const twoTradingDaysSec = 2 * 24 * 3600;
  return (nowSec - (entry.created_bar_time ?? 0)) > twoTradingDaysSec;
}

// S/D level lifecycle (user-specified): counts DISTINCT candles since the
// level was created (or last checked) whose range touches the level price
// (touchedNew), and how many of those CLOSE beyond it in the invalidating
// direction (brokenNew — a "real" break, not just a wick test). Incremental
// via last_checked_time so repeated runs never recount the same candle.
export function checkLevelInteraction(entry, bars) {
  const sinceTime = entry.last_checked_time ?? entry.created_bar_time ?? 0;
  const future = bars.filter(b => b.time > sinceTime);
  if (!future.length) return { touchedNew: 0, brokenNew: 0, lastCheckedTime: sinceTime };

  const price = entry.price_low;
  let touchedNew = 0, brokenNew = 0;
  for (const b of future) {
    if (b.low <= price && price <= b.high) touchedNew++;
    if (entry.type === 'sd_level_demand' && b.close < price) brokenNew++;
    if (entry.type === 'sd_level_supply' && b.close > price) brokenNew++;
  }
  return { touchedNew, brokenNew, lastCheckedTime: future[future.length - 1].time };
}

// Section 9.1 dedup — same type+timeframe with overlapping price range already active?
export function findDuplicate(state, candidate) {
  // 'historical' entries (already-broken HTF zones, kept once for flip-level
  // reference — see run.mjs) must count as duplicates too, or they get
  // redrawn on every single run since they never transition out of that status.
  return state.find(e =>
    (e.status === 'active' || e.status === 'historical') &&
    e.type === candidate.type &&
    e.timeframe === candidate.timeframe &&
    overlaps(e.price_low, e.price_high, candidate.price_low, candidate.price_high));
}

export function makeEntryId(candidate, nowIso) {
  const datePart = nowIso.slice(0, 10).replace(/-/g, '');
  return `${candidate.type}_${candidate.timeframe}_${datePart}_${Math.round(candidate.price_low)}`;
}
