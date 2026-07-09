// Intraday Market-Shift check: fetches 1H/5min bars, runs detectMarketShift
// on both, keeps the chart markers in sync (same draw call as the daily
// run, so the chart doesn't go stale until the next 09:15 run), and sends a
// Telegram alert exactly once per NEW confirmed MS — matched by break_time,
// so an already-alerted, still-standing confirmation doesn't re-fire every
// 5 minutes it stays true. Designed to be invoked repeatedly by a scheduled
// task (e.g. every 5min during Xetra hours), same pattern as
// telegram_poll.mjs — one quick pass per invocation, then exit.
//
// Also does FVG cleanup on the same cadence — user-specified, 09.07.2026:
// FVGs were only ever getting REMOVED once a day (during the 09:15 run.mjs
// invalidation pass), so one that got mitigated >=50% at, say, 11am sat on
// the chart as "active" for the rest of the day (found live: a bullish FVG
// at 100% fill still marked active in state 4 hours after being fully
// traded through). Reuses state.isInvalidated directly rather than
// reimplementing the 50%-fill rule.

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { getState, setTimeframe } from '/Users/boogy/tradingview-mcp/src/core/chart.js';
import { getOhlcv } from '/Users/boogy/tradingview-mcp/src/core/data.js';
import { healthCheck } from '/Users/boogy/tradingview-mcp/src/core/health.js';
import { disconnect } from '/Users/boogy/tradingview-mcp/src/connection.js';
import { listDrawings, getProperties } from '/Users/boogy/tradingview-mcp/src/core/drawing.js';
import * as lib from './lib.mjs';
import * as state from './state.mjs';
import { remove } from './draw.mjs';
import { drawMarketShiftMarker } from './draw.mjs';
import { sendTelegramBriefing } from './telegram.mjs';
import { ensureFreshData } from './ensure_fresh_data.mjs';

const MARKET_SHIFT_STATE_PATH = '/Users/boogy/tradingview-mcp/state/market_shift.json';
const MARKET_SHIFT_HISTORY_PATH = '/Users/boogy/tradingview-mcp/state/market_shift_history.json';
const ALERT_STATE_PATH = '/Users/boogy/tradingview-mcp/state/market_shift_alerts.json';
const HANDOVER_PATH = '/Users/boogy/tradingview-mcp/STRATEGIE_OPTIMIERUNG_HANDOVER.md';
const SCENARIO_LOG_PATH = '/Users/boogy/tradingview-mcp/state/scenario_log.json';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchBars(tf, count = 500) {
  await setTimeframe({ timeframe: String(tf) });
  await sleep(1500);
  const raw = await getOhlcv({ count });
  return raw.bars || raw;
}

function toBerlinTime(timestamp) {
  // Convert Unix timestamp to Berlin time (CEST/CET)
  const date = new Date(timestamp * 1000);
  const formatter = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  return formatter.format(date);
}

function fmtLevel(ms) {
  const arrow = ms.direction === 'bearish' ? '↓ bearish' : '↑ bullish';
  const brokenAt = toBerlinTime(ms.brokenLevel.time);
  return `${arrow}\nLevel: ${ms.brokenLevel.price.toFixed(1)} (gebrochen am ${brokenAt} Berlin)`;
}

function fmtPotential(ms) {
  const arrow = ms.direction === 'bearish' ? '↓ bearish' : '↑ bullish';
  const confirmType = ms.direction === 'bullish' ? 'Higher Low' : 'Lower High';
  const confirmLevel = ms.level.toFixed(1);
  const direction = ms.direction === 'bullish' ? 'über' : 'unter';
  return `${arrow}\nGebrochene Ebene: ${ms.brokenLevel.price.toFixed(1)}\n\n⏳ Bestätigung erwartet:\n${confirmType} ${direction} ${confirmLevel}`;
}

async function syncDrawingsWithState() {
  // Option C: Auto-sync all shapes on TradingView with state.json
  // — finds shapes that don't exist in state (new), or state entries whose
  // entity_id doesn't exist on TV (stale/deleted)
  try {
    const result = await listDrawings();
    const tvIds = new Set((result.shapes || []).map(d => d.id));

    const zonesState = state.readState();
    const staleEntries = [];
    const syncErrors = [];

    // Check state entries — mark stale if entity_id doesn't exist on TV
    for (const entry of zonesState) {
      if (entry.status === 'removed') continue; // already marked as removed
      if (!entry.tv_entity_id) continue;
      if (!tvIds.has(entry.tv_entity_id)) {
        staleEntries.push({
          id: entry.id,
          tv_entity_id: entry.tv_entity_id,
          type: entry.type,
          reason: 'entity_id_not_found_on_tv'
        });
        entry.status = 'sync_error_stale';
        entry.sync_error_at = new Date().toISOString();
        entry.sync_error_reason = 'entity_id_not_found_on_tv';
      }
    }

    if (staleEntries.length) {
      state.writeState(zonesState);
      for (const e of staleEntries) {
        console.warn(`⚠️ STALE: ${e.id} (${e.tv_entity_id}) not found on TV — marked as sync_error`);
        syncErrors.push(e);
      }
    }

    return { staleEntries, tvShapeCount: tvIds.size, stateCount: zonesState.length };
  } catch (e) {
    console.error('syncDrawingsWithState failed:', e.message);
    return { syncError: e.message };
  }
}

async function findAndRemoveOrphanedFvgs() {
  // Scan all rectangles on TV for FVGs that don't exist in state
  // (orphaned, likely redrawn after removal). Find the ones near
  // the target prices and remove them + correct zones.json
  try {
    const result = await listDrawings();
    const rectangles = result.shapes.filter(s => s.name === 'rectangle');

    const targetPrices = [25054, 24939]; // Known orphaned FVGs
    const orphanedFvgIds = [];

    for (const rect of rectangles) {
      try {
        const props = await getProperties({ entity_id: rect.id });
        const text = props.properties?.text || '';

        if (!text.includes('FVG')) continue;

        const points = props.points || [];
        if (points.length < 2) continue;

        const prices = points.map(p => p.price);
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);

        // Check if this FVG is near one of our target prices
        for (const target of targetPrices) {
          if (minPrice <= target && target <= maxPrice) {
            const distance = Math.min(Math.abs(minPrice - target), Math.abs(maxPrice - target));
            if (distance < 2) { // Within 2 points of target
              orphanedFvgIds.push({ entity_id: rect.id, text, distance });
            }
            break;
          }
        }
      } catch (e) {
        // Skip errors
      }
    }

    // Remove the orphaned FVGs from TradingView
    const removedIds = [];
    for (const fvg of orphanedFvgIds) {
      try {
        const removeResult = await remove(fvg.entity_id);
        if (removeResult?.ok) {
          removedIds.push(fvg.entity_id);
          console.log(`✅ Removed orphaned FVG: ${fvg.entity_id} (${fvg.text})`);
        }
      } catch (e) {
        console.warn(`⚠️ Failed to remove ${fvg.entity_id}: ${e.message}`);
      }
    }

    // Update zones.json to mark the corrected FVGs
    if (removedIds.length > 0) {
      const zonesState = state.readState();
      for (const entry of zonesState) {
        if (entry.id === 'fvg_bullish_15_20260709_24911' || entry.id === 'fvg_bearish_15_20260709_25051') {
          entry.status = 'removed_corrected';
          entry.corrected_entity_id = null; // These don't have valid entities anymore
          entry.corrected_at = new Date().toISOString();
        }
      }
      state.writeState(zonesState);
    }

    return { removedIds, count: removedIds.length };
  } catch (e) {
    console.error('findAndRemoveOrphanedFvgs failed:', e.message);
    return { removeError: e.message };
  }
}

async function cleanupStaleRemoved() {
  // Clean up entries that are marked "removed" but have entity_ids
  // that don't exist on TV (likely they were manually redrawn, or
  // the original remove was successful but they got re-added)
  try {
    const result = await listDrawings();
    const tvIds = new Set((result.shapes || []).map(d => d.id));

    const zonesState = state.readState();
    let cleanedCount = 0;

    // Find all "removed" FVGs whose entity_id isn't on TV anymore
    const orphanedRemoved = zonesState.filter(e =>
      e.status === 'removed' &&
      (e.type === 'fvg_bullish' || e.type === 'fvg_bearish') &&
      !tvIds.has(e.tv_entity_id)
    );

    for (const entry of orphanedRemoved) {
      entry.status = 'orphaned_cleaned';
      entry.cleaned_at = new Date().toISOString();
      cleanedCount++;
    }

    if (cleanedCount > 0) {
      state.writeState(zonesState);
      console.log(`✅ Cleaned up ${cleanedCount} orphaned removed FVGs`);
    }

    return { cleanedCount, orphanedIds: orphanedRemoved.map(e => e.id) };
  } catch (e) {
    console.error('cleanupStaleRemoved failed:', e.message);
    return { cleanupError: e.message };
  }
}

async function archiveAndCleanupOldMs(htfMsNew, ltfMsNew) {
  // Load previous MS history
  let history = [];
  if (existsSync(MARKET_SHIFT_HISTORY_PATH)) {
    try {
      history = JSON.parse(readFileSync(MARKET_SHIFT_HISTORY_PATH, 'utf8'));
      if (!Array.isArray(history)) history = [];
    } catch (e) {
      history = [];
    }
  }

  // Load previous shape IDs to know what to cleanup
  let prevIds = { htf: {}, ltf: {} };
  if (existsSync(MARKET_SHIFT_STATE_PATH)) {
    try {
      prevIds = JSON.parse(readFileSync(MARKET_SHIFT_STATE_PATH, 'utf8'));
    } catch (e) {}
  }

  const nowIso = new Date().toISOString();
  const oldMsLog = [];

  // Check if HTF MS is old
  if (prevIds.htf.lastMs && lib.isMsOld(prevIds.htf.lastMs, htfMsNew)) {
    console.log(`🗑️ Old HTF MS archived: ${prevIds.htf.lastMs.direction} → new: ${htfMsNew.direction || 'none'}`);
    history.push({
      timeframe: '1H',
      status: prevIds.htf.lastMs.status,
      direction: prevIds.htf.lastMs.direction,
      start_time: prevIds.htf.lastMs.break_time,
      end_time: Math.floor(Date.now() / 1000),
      iso_end: nowIso,
      reason: 'new_ms_detected'
    });
    oldMsLog.push('HTF');
  }

  // Check if LTF MS is old
  if (prevIds.ltf.lastMs && lib.isMsOld(prevIds.ltf.lastMs, ltfMsNew)) {
    console.log(`🗑️ Old LTF MS archived: ${prevIds.ltf.lastMs.direction} → new: ${ltfMsNew.direction || 'none'}`);
    history.push({
      timeframe: '5m',
      status: prevIds.ltf.lastMs.status,
      direction: prevIds.ltf.lastMs.direction,
      start_time: prevIds.ltf.lastMs.break_time,
      end_time: Math.floor(Date.now() / 1000),
      iso_end: nowIso,
      reason: 'new_ms_detected'
    });
    oldMsLog.push('LTF');
  }

  // Save updated history (keep last 30 entries)
  if (history.length > 0) {
    const recent = history.slice(-30);
    writeFileSync(MARKET_SHIFT_HISTORY_PATH, JSON.stringify(recent, null, 2));
    if (oldMsLog.length > 0) {
      console.log(`📋 MS History updated: ${oldMsLog.join(', ')} archived`);
    }
  }

  // Update the last-seen MS in prevIds for next comparison
  const updated = {
    htf: { ...prevIds.htf, lastMs: htfMsNew },
    ltf: { ...prevIds.ltf, lastMs: ltfMsNew }
  };

  return { updated, archived: oldMsLog };
}

async function updateHandover(htfMs, ltfMs, removedFvgs) {
  try {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toISOString().split('T')[1].slice(0, 5);

    let logs = [];
    if (existsSync(SCENARIO_LOG_PATH)) {
      logs = JSON.parse(readFileSync(SCENARIO_LOG_PATH, 'utf8'));
    }

    // Get today's scenarios
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayTs = Math.floor(todayStart.getTime() / 1000);

    const todayScenarios = logs.filter(s => (s.detected_at_ts || 0) >= todayTs);
    const successCount = todayScenarios.filter(s => s.outcome === 'win').length;
    const failCount = todayScenarios.filter(s => s.outcome === 'loss').length;
    const todayWr = todayScenarios.length > 0
      ? ((successCount / todayScenarios.length) * 100).toFixed(1)
      : 0;

    // Build status section
    let msStatus = '';
    if (htfMs.status === 'confirmed') {
      msStatus += `- **1H MS:** ✅ Bestätigt (${htfMs.direction === 'bullish' ? '↑' : '↓'} um ${htfMs.brokenLevel.price.toFixed(1)})\n`;
    } else if (htfMs.status === 'potential') {
      msStatus += `- **1H MS:** ⚠️ Potenziell (${htfMs.direction === 'bullish' ? '↑' : '↓'}, erwartet ${htfMs.direction === 'bullish' ? 'HL' : 'LH'} ${htfMs.direction === 'bullish' ? 'über' : 'unter'} ${htfMs.level.toFixed(1)})\n`;
    }
    if (ltfMs.status === 'confirmed') {
      msStatus += `- **5m MS:** ✅ Bestätigt (${ltfMs.direction === 'bullish' ? '↑' : '↓'} um ${ltfMs.brokenLevel.price.toFixed(1)})\n`;
    } else if (ltfMs.status === 'potential') {
      msStatus += `- **5m MS:** ⚠️ Potenziell (${ltfMs.direction === 'bullish' ? '↑' : '↓'}, erwartet ${ltfMs.direction === 'bullish' ? 'HL' : 'LH'} ${ltfMs.direction === 'bullish' ? 'über' : 'unter'} ${ltfMs.level.toFixed(1)})\n`;
    }

    // Read current handover to preserve structure
    let content = readFileSync(HANDOVER_PATH, 'utf8');

    // Update "Stand" date
    content = content.replace(
      /\*\*Stand:\*\*.*$/m,
      `**Stand:** ${dateStr} (${timeStr} UTC — Intraday Market Shift Check)`
    );

    // Update live status section (create if not exists)
    const liveStatusSection = `## 📡 Live-Status (${dateStr})\n\n${msStatus}**Heute:** ${successCount}W / ${failCount}L (${todayWr}% WR)\n`;

    if (content.includes('## 📡 Live-Status')) {
      content = content.replace(
        /## 📡 Live-Status.*?\n\n.*?(?=\n##|\Z)/s,
        liveStatusSection.trim()
      );
    } else {
      // Insert after overview, before backtest
      content = content.replace(
        /(\n---\n\n## 📊 Backtest)/,
        `\n${liveStatusSection}\n---\n\n## 📊 Backtest`
      );
    }

    writeFileSync(HANDOVER_PATH, content);
    return true;
  } catch (e) {
    console.error('Handover update failed:', e.message);
    return false;
  }
}

async function main() {
  const health = await healthCheck();
  if (!health.success || !health.cdp_connected) {
    console.log(JSON.stringify({ success: false, reason: 'CDP nicht erreichbar', health }));
    await disconnect().catch(() => {});
    process.exit(1);
  }

  const original = await getState();

  // --- FRESH DATA GUARANTEE: Update cache if stale ---
  const dataRefreshStatus = await ensureFreshData();
  console.log(`📦 Data Refresh: ${dataRefreshStatus.updated.length} updated, ${dataRefreshStatus.skipped.length} fresh`);

  const bars1h = await fetchBars(60, 500);
  const bars15 = await fetchBars(15, 500);
  const bars5 = await fetchBars(5, 500);
  await setTimeframe({ timeframe: original.resolution });

  // Run auto-sync: find stale entity_ids
  const syncResult = await syncDrawingsWithState();

  // Find and remove orphaned FVGs (redrawn after removal)
  const orphanedResult = await findAndRemoveOrphanedFvgs();

  // Clean up "removed" FVGs whose entity_ids no longer exist on TV
  const cleanupResult = await cleanupStaleRemoved();

  const htfMs = lib.detectMarketShift(bars1h, 2);
  const ltfMs = bars5.length >= 20 ? lib.detectMarketShift(bars5, 2) : { status: 'none' };

  // --- Confluence Validation: HTF MS only if matches LTF direction ---
  const confluenceResult = lib.validateMsConfluence(ltfMs, htfMs);
  const htfMsConfluent = confluenceResult.htfMs;
  const ltfMsConfluent = confluenceResult.ltfMs;
  console.log(`\n📊 Confluence Check: ${confluenceResult.reason}`);

  // --- FVG cleanup (>=50% mitigated) ---
  const barsByTf = { 60: bars1h, 15: bars15, 5: bars5 };
  const zonesState = state.readState();
  const nowIso = new Date().toISOString();
  const removedFvgs = [];
  const failedRemoves = [];
  for (const entry of zonesState) {
    if (entry.status !== 'active') continue;
    if (entry.type !== 'fvg_bullish' && entry.type !== 'fvg_bearish') continue;
    if (state.isInvalidated(entry, barsByTf)) {
      const removeResult = await remove(entry.tv_entity_id).catch(e => ({ok: false, error: e.message}));
      if (!removeResult?.ok) {
        failedRemoves.push({ id: entry.id, entity_id: entry.tv_entity_id, error: removeResult?.error });
        console.warn(`⚠️ FVG remove failed: ${entry.id} (${entry.tv_entity_id})`);
      }
      entry.status = 'removed';
      entry.removed_at = nowIso;
      entry.removed_reason = 'fvg_mitigated_50pct';
      removedFvgs.push(entry.id);
    }
  }
  if (removedFvgs.length) state.writeState(zonesState);

  // --- Auto-cleanup: Archive old MS when new ones are detected ---
  const prevIds = existsSync(MARKET_SHIFT_STATE_PATH)
    ? JSON.parse(readFileSync(MARKET_SHIFT_STATE_PATH, 'utf8'))
    : { htf: {}, ltf: {} };
  const cleanupResult = await archiveAndCleanupOldMs(htfMsConfluent, ltfMsConfluent);

  // Keep the chart markers current intraday, not just once at 09:15 — same
  // draw call, same state file, as the daily run.mjs.
  // Use confluent MS (with validation applied)
  const htfIds = await drawMarketShiftMarker(htfMsConfluent, '1H', prevIds.htf);
  const ltfIds = await drawMarketShiftMarker(ltfMsConfluent, '5m', prevIds.ltf);

  // Save with last-seen MS for next cleanup comparison
  writeFileSync(MARKET_SHIFT_STATE_PATH, JSON.stringify({
    htf: { ...htfIds, lastMs: htfMsConfluent },
    ltf: { ...ltfIds, lastMs: ltfMsConfluent }
  }));

  // Verify MS lines were drawn before sending alerts
  const msDrawingStatus = [];
  if (htfMs.status !== 'none') {
    const htfDrawn = htfIds.vline && htfIds.hline;
    msDrawingStatus.push(`1H: ${htfDrawn ? '✅ Linien gezeichnet' : '❌ Fehler beim Zeichnen'}`);
  }
  if (ltfMs.status !== 'none') {
    const ltfDrawn = ltfIds.vline && ltfIds.hline;
    msDrawingStatus.push(`5m: ${ltfDrawn ? '✅ Linien gezeichnet' : '❌ Fehler beim Zeichnen'}`);
  }
  if (msDrawingStatus.length > 0) {
    console.log(`📊 MS Drawing Status: ${msDrawingStatus.join(' | ')}`);
  }

  const alertState = existsSync(ALERT_STATE_PATH)
    ? JSON.parse(readFileSync(ALERT_STATE_PATH, 'utf8'))
    : { htf: { confirmed: null, potential: null }, ltf: { confirmed: null, potential: null } };

  const messages = [];
  const nowBerlin = toBerlinTime(Math.floor(Date.now() / 1000));

  // Potential MS alerts (new) — using confluent MS
  if (htfMsConfluent.status === 'potential' && htfMsConfluent.break_time !== alertState.htf.potential) {
    messages.push(`⚠️ POTENZIELLER MS (1H)\n${fmtPotential(htfMsConfluent)}\n\n🕐 Erkannt: ${nowBerlin} Berlin`);
    alertState.htf.potential = htfMsConfluent.break_time;
  }
  if (ltfMsConfluent.status === 'potential' && ltfMsConfluent.break_time !== alertState.ltf.potential) {
    messages.push(`⚠️ POTENZIELLER MS (5m)\n${fmtPotential(ltfMsConfluent)}\n\n🕐 Erkannt: ${nowBerlin} Berlin`);
    alertState.ltf.potential = ltfMsConfluent.break_time;
  }

  // Confirmed MS alerts (existing) — using confluent MS
  if (htfMsConfluent.status === 'confirmed' && htfMsConfluent.break_time !== alertState.htf.confirmed) {
    messages.push(`✅ BESTÄTIGTER MS (1H)\n${fmtLevel(htfMsConfluent)}\n\n🕐 Bestätigt: ${nowBerlin} Berlin`);
    alertState.htf.confirmed = htfMsConfluent.break_time;
  }
  if (ltfMsConfluent.status === 'confirmed' && ltfMsConfluent.break_time !== alertState.ltf.confirmed) {
    messages.push(`✅ BESTÄTIGTER MS (5m)\n${fmtLevel(ltfMsConfluent)}\n\n🕐 Bestätigt: ${nowBerlin} Berlin`);
    alertState.ltf.confirmed = ltfMsConfluent.break_time;
  }

  let telegram = null;
  if (messages.length) {
    writeFileSync(ALERT_STATE_PATH, JSON.stringify(alertState));
    telegram = await sendTelegramBriefing(messages.join('\n\n'));
  }

  // Update handover document using confluent MS
  await updateHandover(htfMsConfluent, ltfMsConfluent, removedFvgs);

  console.log(JSON.stringify({
    success: true,
    alerted: messages.length > 0,
    confluence: confluenceResult.reason,
    htf: htfMsConfluent.status, ltf: ltfMsConfluent.status,
    cleanup: cleanupResult.archived.length > 0 ? `Archived: ${cleanupResult.archived.join(', ')}` : 'No old MS',
    telegram,
    removedFvgs,
    failedRemoves: failedRemoves.length > 0 ? failedRemoves : undefined,
    sync: syncResult,
    orphaned: orphanedResult,
  }));

  await disconnect().catch(() => {});
}

const GLOBAL_TIMEOUT_MS = 2 * 60 * 1000;
function timeoutAfter(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(`Globaler Timeout nach ${ms / 1000}s — Skript hing vermutlich fest.`)), ms));
}

Promise.race([main(), timeoutAfter(GLOBAL_TIMEOUT_MS)]).catch(async (e) => {
  console.error('FATAL', e.stack || e.message);
  try {
    writeFileSync('/Users/boogy/tradingview-mcp/state/market_shift_check_error.log', `${new Date().toISOString()}\n${e.stack || e.message}\n`);
  } catch { /* if even this fails, nothing more we can do */ }
  await disconnect().catch(() => {});
  process.exit(1);
});
