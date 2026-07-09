import { drawShape, removeOne, getProperties, listDrawings } from '/Users/boogy/tradingview-mcp/src/core/drawing.js';

// Returns the set of shape IDs actually present on the live chart right now.
// Used to reconcile our local state file against reality — protects against
// duplicate draws when the state file and chart drift out of sync (e.g. state
// file deleted/reset, or user manually deletes a drawing in TradingView).
export async function getLiveShapeIds() {
  const result = await listDrawings();
  return new Set((result.shapes || []).map(s => s.id));
}

// Converts an 8-digit RGBA hex (#RRGGBBAA, as given in the spec's color table)
// into TradingView's {color, transparency} convention (0 = opaque, 100 = fully
// transparent). If a plain 6-digit hex is passed, transparency is left at 0.
export function rgbaToTvOverride(hex, extraOverrides = {}) {
  const clean = hex.replace('#', '');
  const rgb = `#${clean.slice(0, 6)}`;
  let transparency = 0;
  if (clean.length === 8) {
    const alpha = parseInt(clean.slice(6, 8), 16);
    transparency = Math.round((1 - alpha / 255) * 100);
  }
  return {
    color: rgb, backgroundColor: rgb, linecolor: rgb,
    transparency, linewidth: 1,
    ...extraOverrides,
  };
}

// Verifies TradingView's numeric linestyle code for "dotted" against a live
// drawing rather than assuming 2, per the spec's explicit instruction.
export async function verifyDottedLinestyleCode() {
  const probe = await drawShape({
    shape: 'horizontal_line',
    point: { time: Math.floor(Date.now() / 1000) || 0, price: 1 },
    overrides: { linestyle: 2 },
  });
  if (!probe.entity_id) return { verified: false, assumed: 2 };
  try {
    const props = await getProperties({ entity_id: probe.entity_id });
    const style = props.properties?.linestyle ?? props.properties?.linestyle?.value;
    await removeOne({ entity_id: probe.entity_id });
    return { verified: style === 2, reported: style, assumed: 2 };
  } catch (e) {
    await removeOne({ entity_id: probe.entity_id }).catch(() => {});
    return { verified: false, error: e.message, assumed: 2 };
  }
}

export async function draw(shape, point, point2, overrides, text) {
  try {
    const r = await drawShape({ shape, point, point2, overrides, text });
    return { ok: true, entity_id: r.entity_id };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function remove(entity_id) {
  try { return await removeOne({ entity_id }); }
  catch (e) { return { ok: false, error: e.message }; }
}

export const COLORS = {
  sd_zone_12h: '#800080',
  sd_zone_4h: '#FFA500',
  sr_level: '#00FFFF',
  orb_high: '#00FF00',
  orb_low: '#FF0000',
  vwap: '#0000FF',
  fvg_bullish: '#90EE9040',
  fvg_bearish: '#FFB6C140',
  ob_bullish: '#00640040',
  ob_bearish: '#8B000040',
  pdhl: '#808080',
  sd_level_12h: '#673AB7',
  sd_level_4h: '#FF9800',
  sd_level_touched: '#87CEFA',
};


// Draws (at most) ONE Market-Shift marker pair — a horizontal level line
// plus a short vertical connector — for a given timeframe label. Both are
// plain white now (09.07.2026: previously direction-colored; the user
// wants both lines white). `ms` is the result of lib.detectMarketShift:
// status 'none' draws nothing (any previous markers for this slot are
// simply removed, not replaced — an unconfirmed potential that got
// invalidated disappears rather than lingering).
//
// HORIZONTAL line at `ms.brokenLevel` — the ORIGINAL protective high/low
// that actually got violated to trigger the shift (e.g. "das letzte HL vor
// dem aktuellen HH", not the fresh new extreme that formed afterward) —
// always drawn left-to-right from that point's own time up to "now"
// (`ms.now`, growing on every redraw as time passes), never projected into
// the future. Same line, same level, throughout: dotted while 'potential',
// solid with a "Bestätigter MS" label once 'confirmed'.
//
// VERTICAL connector — NOT an infinite ray (09.07.2026: "bitte keinen
// vertikalen Strahl, sondern nur von Schnittpunkt zu Kerze") — a short
// bounded segment at break_time, from where it crosses the horizontal line
// (`ms.brokenLevel.price`) up/down to the actual triggering/confirming
// candle's own price (`ms.candlePrice`). Same dotted/solid styling as the
// horizontal line, in lockstep with potential vs. confirmed.
//
// Always removes BOTH previous markers for this slot first, so at most one
// vertical + one horizontal shape per timeframe ever exists at once,
// matching the user's "immer nur ein MS ... eingezeichnet" requirement.
export async function drawMarketShiftMarker(ms, timeframeLabel, prevIds = {}) {
  // Delete old MS and draw new one if status changed or new MS appeared
  if (prevIds.vline || prevIds.hline) {
    const removed = [];
    if (prevIds.vline) {
      await remove(prevIds.vline).catch(() => {});
      removed.push('vline');
    }
    if (prevIds.hline) {
      await remove(prevIds.hline).catch(() => {});
      removed.push('hline');
    }
    // Log the removal
    if (ms && ms.status !== 'none') {
      console.log(`✂️ Old MS removed (${timeframeLabel}): ${removed.join(', ')} → drawing new ${ms.status} MS`);
    } else {
      console.log(`✂️ MS cleared (${timeframeLabel}): ${removed.join(', ')}`);
    }
  }
  if (!ms || ms.status === 'none') return { vline: null, hline: null };

  const isConfirmed = ms.status === 'confirmed';
  const arrow = ms.direction === 'bearish' ? '↓' : '↑';
  const lineStyle = { linecolor: '#FFFFFF', textcolor: '#FFFFFF', linewidth: 1, linestyle: isConfirmed ? 0 : 2 };

  // Draw horizontal line (confirmation level for potential, broken level for confirmed)
  let hline = null;
  if (ms.now) {
    let hlabelText = '';
    let linePrice = null;
    let lineStartTime = null;

    if (isConfirmed && ms.brokenLevel) {
      // Confirmed: show broken level (the old high/low that was broken)
      hlabelText = 'Bestätigter MS';
      linePrice = ms.brokenLevel.price;
      lineStartTime = ms.brokenLevel.time;
    } else if (ms.status === 'potential' && ms.level && !isConfirmed) {
      // Potential only: show confirmation expectation (HL/LH level where breakout is expected)
      // Don't show this for confirmed MS!
      const confirmType = ms.direction === 'bullish' ? 'HL' : 'LH';
      hlabelText = `Durchbruch über ${confirmType} ${ms.level.toFixed(1)} erwartet`;
      linePrice = ms.level;
      lineStartTime = ms.break_time;
    }

    if (linePrice !== null && lineStartTime) {
      const r = await draw('trend_line',
        { time: lineStartTime, price: linePrice },
        { time: ms.now, price: linePrice },
        lineStyle, hlabelText);
      hline = r.ok ? r.entity_id : null;
    }
  }

  // Draw vertical line ONLY for confirmed MS
  let vline = null;
  if (isConfirmed && ms.brokenLevel && ms.candlePrice != null) {
    const text = `Bestätigter MS (${timeframeLabel}, ${arrow})`;
    const r2 = await draw('trend_line',
      { time: ms.break_time, price: ms.brokenLevel.price },
      { time: ms.break_time, price: ms.candlePrice },
      lineStyle, text);
    vline = r2.ok ? r2.entity_id : null;
  }

  return { vline, hline };
}
