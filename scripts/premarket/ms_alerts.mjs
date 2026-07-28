/**
 * Market-Shift detection + Telegram alerting + chart-marker drawing, shared
 * by run.mjs (twice-daily full run) and check_ms.mjs (frequent standalone
 * check). Factored out 28.07.2026 after two user-reported bugs:
 *
 * 1. The confirmed-MS alert text always showed "Level: N/A" — it checked
 *    `typeof ltfMs.brokenLevel === 'number'`, but brokenLevel is always an
 *    object ({price, time, ...}), so the check never passed.
 * 2. Alerts/markers only existed for 5min (ltf). No 1H/4H alerting existed
 *    at all, even though htfMs (1H) was already being computed and drawn —
 *    just never sent to Telegram. User: "Wenn es im 1h oder 4h möglich ist,
 *    ist das viel besser" (5min structure is noisy — a confirmed 5m MS from
 *    19 hours ago was still being redrawn as "the current" MS every run,
 *    since nothing had since invalidated it).
 *
 * Dedup is signature-based (status+direction+break_time+brokenLevel.price),
 * not time-based cooldown — a still-standing MS should NOT re-alert every
 * run just because an hour has passed; it should alert once when it first
 * appears/changes, matching "sobald sie entsteht" (as soon as it happens).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import * as lib from './lib.mjs';
import { berlinTimeString } from './utils.mjs';
import { drawMarketShiftMarker } from './draw.mjs';
import { sendTelegramBriefing } from './telegram.mjs';

const MARKET_SHIFT_STATE_PATH = '/Users/boogy/tradingview-mcp/state/market_shift.json';
const MS_ALERTS_STATE_PATH = '/Users/boogy/tradingview-mcp/state/market_shift_alerts.json';

function fmtTime(t) {
  return t ? berlinTimeString(new Date(t * 1000)) : '?';
}
function fmtPrice(p) {
  return typeof p === 'number' ? p.toFixed(1) : 'N/A';
}

// Explains WHY this counts as an MS — user-specified, 28.07.2026: "Die
// Telegram Nachricht dazu sollte mir begründen, warum es sich um einen MS
// handelt." Both potential and confirmed always break a swing point BEFORE
// reversing (a low for a bearish shift, a high for a bullish one — see
// detectMarketShift in lib.mjs), so the same broken-level/confirm-point
// shape explains both statuses.
function buildMsReason(ms) {
  const brokenWord = ms.direction === 'bearish' ? 'Low' : 'Hoch';
  const brokenStr = `${fmtPrice(ms.brokenLevel?.price)} (${fmtTime(ms.brokenLevel?.time)})`;
  if (ms.status === 'confirmed') {
    const confirmWord = ms.direction === 'bearish' ? 'tieferes Hoch' : 'höheres Tief';
    return `Bruch des vorherigen ${brokenWord}s bei ${brokenStr}, bestätigt durch ein ${confirmWord} bei ${fmtPrice(ms.candlePrice)} (${fmtTime(ms.break_time)}) — kein neuer Swing in die alte Richtung mehr.`;
  }
  return `Vorheriges ${brokenWord} bei ${brokenStr} wurde bei ${fmtPrice(ms.candlePrice)} (${fmtTime(ms.break_time)}) durchbrochen — noch nicht bestätigt. Entscheidend: ${fmtPrice(ms.level)}.`;
}

function signatureOf(ms) {
  return `${ms.status}|${ms.direction}|${ms.break_time || ''}|${fmtPrice(ms.brokenLevel?.price)}`;
}

function buildAlertText(ms, tfLabel) {
  const icon = ms.status === 'confirmed' ? '✅ BESTÄTIGTER MS' : '🔹 POTENZIELLER MS';
  const dirEmoji = ms.direction === 'bullish' ? '📈' : '📉';
  const dirWord = ms.direction === 'bullish' ? 'Bullisch' : 'Bärisch';
  const waitNote = ms.status === 'potential' ? '\n⏳ Wartet auf Bestätigung' : '';
  return `${icon} (${tfLabel})\n${dirEmoji} ${dirWord}${waitNote}\n📝 ${buildMsReason(ms)}\n🕐 ${berlinTimeString()}`;
}

export async function checkAndAlertMarketShifts({ bars5, bars1h, bars4h }) {
  const ltfMs = bars5 && bars5.length >= 20 ? lib.detectMarketShift(bars5, 2) : { status: 'none' };
  const htfMs = bars1h && bars1h.length >= 20 ? lib.detectMarketShift(bars1h, 2) : { status: 'none' };
  const htf4hMs = bars4h && bars4h.length >= 20 ? lib.detectMarketShift(bars4h, 2) : { status: 'none' };

  mkdirSync('/Users/boogy/tradingview-mcp/state', { recursive: true });

  // --- Telegram alerts, deduped by signature (not time) ---
  const alertsState = existsSync(MS_ALERTS_STATE_PATH) ? JSON.parse(readFileSync(MS_ALERTS_STATE_PATH, 'utf8')) : {};
  const slots = [['ltf', ltfMs, '5m'], ['htf', htfMs, '1H'], ['htf4h', htf4hMs, '4H']];
  const telegramResults = [];
  let alertsSent = 0;

  for (const [key, ms, tfLabel] of slots) {
    alertsState[key] = alertsState[key] || {};
    if (ms.status !== 'confirmed' && ms.status !== 'potential') continue;
    const sig = signatureOf(ms);
    if (alertsState[key].lastSig === sig) continue;
    alertsState[key].lastSig = sig;
    try {
      const r = await sendTelegramBriefing(buildAlertText(ms, tfLabel));
      telegramResults.push({ tf: tfLabel, ...r });
      alertsSent++;
    } catch (e) {
      telegramResults.push({ tf: tfLabel, sent: false, error: e.message });
    }
  }
  writeFileSync(MS_ALERTS_STATE_PATH, JSON.stringify(alertsState, null, 2));

  // --- chart markers (redrawn fresh every check) ---
  const markerState = existsSync(MARKET_SHIFT_STATE_PATH) ? JSON.parse(readFileSync(MARKET_SHIFT_STATE_PATH, 'utf8')) : {};
  const ltfIds = await drawMarketShiftMarker(ltfMs, '5m', markerState.ltf || {});
  const htfIds = await drawMarketShiftMarker(htfMs, '1H', markerState.htf || {});
  const htf4hIds = await drawMarketShiftMarker(htf4hMs, '4H', markerState.htf4h || {});
  writeFileSync(MARKET_SHIFT_STATE_PATH, JSON.stringify({ ltf: ltfIds, htf: htfIds, htf4h: htf4hIds }, null, 2));

  return { ltfMs, htfMs, htf4hMs, alertsSent, telegramResults };
}
