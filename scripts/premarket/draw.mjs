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

// Distinguishes "shape was already gone" (harmless — nothing to orphan) from
// a genuine removal failure (CDP call ran but the shape is still there, e.g.
// a transient timing hiccup) — treating both as success is what caused the
// chart-orphan bug (handover, Teil 8): a failed-but-still-present shape got
// marked removed anyway, and once its state entry aged out, the shape was
// stranded on the chart forever with nothing left to retry it. Shared by any
// caller that removes a tracked shape (run.mjs's full pass, check_scenarios.
// mjs's frequent FVG-mitigation check) so they can't drift out of sync on
// this distinction.
export function wasActuallyRemoved(r) {
  if (r?.removed === true) return true;
  if (r?.ok === false && /not found/i.test(r.error || '')) return true; // already gone — nothing to orphan
  return false;
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
  scenario_entry: '#2196F3',
  scenario_sl: '#F44336',
  scenario_tp: '#4CAF50',
};


// Draws recommended Entry/SL/TP for the currently active scenario(s) — user-
// requested, 28.07.2026. One slot per scenario TYPE (counter_trend='b',
// consolidation_breakout='d'), remove-then-redraw: previous lines for a slot
// are always removed first, so a scenario that's no longer active (or moved
// to a different zone) doesn't leave stale levels behind, and re-running
// never accumulates duplicates. `lastBarTime` anchors the line's start so it
// draws as a ray from "now" rather than the full chart history.
const SCENARIO_LINE_SLOTS = { trend_reversal_poi: 'a', counter_trend: 'b', consolidation_breakout: 'd' };

export async function drawScenarioLevels(scenarios, lastBarTime, prevIds = {}) {
  const nextIds = {};
  const bySlot = {};
  for (const s of scenarios || []) {
    const slot = SCENARIO_LINE_SLOTS[s.type];
    if (slot && s.targets[0] != null) bySlot[slot] = s;
  }

  for (const slot of Object.keys(SCENARIO_LINE_SLOTS).map(k => SCENARIO_LINE_SLOTS[k])) {
    const prev = prevIds[slot] || {};
    for (const key of ['entry', 'sl', 'tp']) {
      if (prev[key]) await remove(prev[key]).catch(() => {});
    }

    const s = bySlot[slot];
    if (!s) { nextIds[slot] = {}; continue; }

    const typeLabel = s.type === 'trend_reversal_poi' ? 'A' : s.type === 'counter_trend' ? 'B' : 'D';
    const dirWord = s.direction === 'LONG' ? 'Long' : 'Short';
    const tp = s.targets[0];

    const entryR = await draw('horizontal_ray', { time: lastBarTime, price: s.zonePrice }, undefined,
      { linecolor: COLORS.scenario_entry, linewidth: 2, linestyle: 0, showLabel: true, textcolor: COLORS.scenario_entry, fontsize: 10 },
      `${typeLabel} Entry (${dirWord}) ${s.zonePrice.toFixed(1)} [${s.probability}]`);
    const slR = await draw('horizontal_ray', { time: lastBarTime, price: s.sl }, undefined,
      { linecolor: COLORS.scenario_sl, linewidth: 1, linestyle: 2, showLabel: true, textcolor: COLORS.scenario_sl, fontsize: 10 },
      `${typeLabel} SL ${s.sl.toFixed(1)}`);
    const tpR = await draw('horizontal_ray', { time: lastBarTime, price: tp }, undefined,
      { linecolor: COLORS.scenario_tp, linewidth: 1, linestyle: 2, showLabel: true, textcolor: COLORS.scenario_tp, fontsize: 10 },
      `${typeLabel} TP ${tp.toFixed(1)}`);

    nextIds[slot] = {
      entry: entryR.ok ? entryR.entity_id : null,
      sl: slR.ok ? slR.entity_id : null,
      tp: tpR.ok ? tpR.entity_id : null,
    };
  }

  return nextIds;
}
