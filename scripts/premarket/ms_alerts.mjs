/**
 * Market-Shift Telegram alerting — shared by run.mjs (twice-daily full run)
 * and check_ms.mjs (frequent standalone check).
 *
 * Redesigned 29.07.2026 (Teil 11, user-specified) — three changes from the
 * original 5min(LTF)/1H(HTF)/4H(HTF) design:
 *
 * 1. HTF reference moved off 4H/12H entirely: those have looked choppy with
 *    no clear trend for weeks. HTF bias is now picked dynamically from
 *    whichever of 15min/1H currently shows the fresher (= clearer) confirmed
 *    BOS — same "trust whichever timeframe has had time to resolve" logic
 *    already used to prefer 1H over 4H originally (see Teil 1).
 * 2. LTF moved from 5min down to 1min for faster reaction.
 * 3. Only alerts when the LTF shift would mean price RESUMING the HTF trend
 *    after running counter to it — not any LTF shift in either direction.
 *    This falls out for free from detectMarketShift()'s own definition: it
 *    only ever reports 'potential'/'confirmed' for a reversal FROM the
 *    currently-settled direction TO ms.direction. So "this 1m shift resumes
 *    the HTF trend after a counter-trend move" is exactly
 *    `ltfMs.direction === htfBias` — no separate counter-trend lookback
 *    needed.
 *
 * Also drops chart-marker drawing entirely (user, 29.07.2026: "ich brauche
 * keine MS mehr im Chart eingezeichnet... ausschließlich Telegram") — see
 * draw.mjs's git history for the removed drawMarketShiftMarker.
 *
 * Dedup is signature-based (status+direction+break_time+brokenLevel.price),
 * not time-based cooldown — a still-standing MS should NOT re-alert every
 * run just because time has passed; it should alert once when it first
 * appears/changes, matching "sobald sie entsteht" (as soon as it happens).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import * as lib from './lib.mjs';
import { sendTelegramBriefing } from './telegram.mjs';

const MS_ALERTS_STATE_PATH = '/Users/boogy/tradingview-mcp/state/market_shift_alerts.json';
const COUNTER_TREND_MS_ALERTS_STATE_PATH = '/Users/boogy/tradingview-mcp/state/counter_trend_ms_alerts.json';

function fmtPrice(p) {
  return typeof p === 'number' ? p.toFixed(1) : 'N/A';
}

// Picks whichever of 15min/1H has the more recently confirmed BOS as the
// "clearer" HTF trend reference. Falls back to whichever one has any BOS at
// all if the other has none yet (insufficient history / very early session).
function pickHtfBias(bars15, bars1h) {
  const bos15 = lib.findBosEvents(bars15 || []);
  const bos1h = lib.findBosEvents(bars1h || []);
  const last15 = bos15[bos15.length - 1];
  const last1h = bos1h[bos1h.length - 1];
  if (!last15 && !last1h) return { bias: null, source: null };
  if (!last15) return { bias: last1h.type, source: '1H' };
  if (!last1h) return { bias: last15.type, source: '15min' };
  return last15.time >= last1h.time
    ? { bias: last15.type, source: '15min' }
    : { bias: last1h.type, source: '1H' };
}

function signatureOf(ms) {
  return `${ms.status}|${ms.direction}|${ms.break_time || ''}|${fmtPrice(ms.brokenLevel?.price)}`;
}

// User-specified exact wording, 29.07.2026:
// "Potenzieller MS: HTF ↓; erwartet LTF MS bei [Kurswert]"
// "Bestätigter MS: HTF ↓; LTF ebenfalls bärisch bestätigt."
function buildAlertText(ms, htfBias) {
  const arrow = htfBias === 'bullish' ? '↑' : '↓';
  if (ms.status === 'confirmed') {
    const dirWord = ms.direction === 'bullish' ? 'bullisch' : 'bärisch';
    return `Bestätigter MS: HTF ${arrow}; LTF ebenfalls ${dirWord} bestätigt.`;
  }
  return `Potenzieller MS: HTF ${arrow}; erwartet LTF MS bei ${fmtPrice(ms.level)}`;
}

export async function checkAndAlertTrendResumptionMS({ bars15, bars1h, bars1 }) {
  const { bias: htfBias, source: htfSource } = pickHtfBias(bars15, bars1h);
  const ltfMs = bars1 && bars1.length >= 20 ? lib.detectMarketShift(bars1, 2) : { status: 'none' };

  mkdirSync('/Users/boogy/tradingview-mcp/state', { recursive: true });
  const alertsState = existsSync(MS_ALERTS_STATE_PATH) ? JSON.parse(readFileSync(MS_ALERTS_STATE_PATH, 'utf8')) : {};

  const isResumption = htfBias && (ltfMs.status === 'confirmed' || ltfMs.status === 'potential') && ltfMs.direction === htfBias;

  let alertsSent = 0;
  let telegramResult = null;
  if (isResumption) {
    const sig = signatureOf(ltfMs);
    if (alertsState.lastSig !== sig) {
      alertsState.lastSig = sig;
      try {
        telegramResult = await sendTelegramBriefing(buildAlertText(ltfMs, htfBias));
        alertsSent++;
      } catch (e) {
        telegramResult = { sent: false, error: e.message };
      }
      writeFileSync(MS_ALERTS_STATE_PATH, JSON.stringify(alertsState, null, 2));
    }
  }

  return { ltfMs, htfBias, htfSource, alertsSent, telegramResult };
}

// Counter-Trend-MS-Alert (06.08.2026, Teil 40, user-specified) — the
// Trend-Resumption alert above (by design, Teil 11) ONLY ever fires when a
// 1m shift moves back INTO the current HTF bias direction; a confirmed or
// potential MS AGAINST the HTF bias on 5m/15m/1H (e.g. HTF bullish but 5m
// just confirmed bearish) was computed internally by detectMarketShift()
// but never surfaced — found live, 06.08.2026: user spotted a bearish LH-
// after-HHs pattern that WAS already "confirmed" on 5m/15m/1H, with zero
// Telegram alert sent for it. Same HTF-bias reference (dynamic 15min/1H
// pick) as the resumption alert, for consistency — but checks EACH of
// 5m/15m/1H individually against it, since a counter-trend shift can start
// on any of them independently (unlike the resumption alert, which only
// ever needed the 1m LTF).
function buildCounterTrendAlertText(ms, htfBias, tfLabel) {
  const arrow = htfBias === 'bullish' ? '↑' : '↓';
  const dirWord = ms.direction === 'bullish' ? 'bullisch' : 'bärisch';
  if (ms.status === 'confirmed') {
    return `⚠️ GEGENTREND-MS bestätigt (${tfLabel}): HTF ${arrow}, aber ${tfLabel} jetzt ${dirWord} bestätigt (Level ${fmtPrice(ms.brokenLevel?.price)}).`;
  }
  return `🔹 Potenzieller GEGENTREND-MS (${tfLabel}): HTF ${arrow}, ${tfLabel} könnte auf ${dirWord} drehen — erwartet bei ${fmtPrice(ms.level)}.`;
}

export async function checkAndAlertCounterTrendMS({ bars5, bars15, bars1h }) {
  const { bias: htfBias, source: htfSource } = pickHtfBias(bars15, bars1h);

  mkdirSync('/Users/boogy/tradingview-mcp/state', { recursive: true });
  const alertsState = existsSync(COUNTER_TREND_MS_ALERTS_STATE_PATH) ? JSON.parse(readFileSync(COUNTER_TREND_MS_ALERTS_STATE_PATH, 'utf8')) : {};

  const checks = [
    { bars: bars5, label: '5m' },
    { bars: bars15, label: '15m' },
    { bars: bars1h, label: '1H' },
  ];

  const results = {};
  const telegramResults = [];
  let alertsSent = 0;
  let stateChanged = false;

  for (const { bars, label } of checks) {
    const ms = bars && bars.length >= 20 ? lib.detectMarketShift(bars, 2) : { status: 'none' };
    results[label] = { status: ms.status, direction: ms.direction };

    const isCounterTrend = htfBias && (ms.status === 'confirmed' || ms.status === 'potential') && ms.direction !== htfBias;
    if (!isCounterTrend) continue;

    const sig = signatureOf(ms);
    if (alertsState[label] === sig) continue;
    alertsState[label] = sig;
    stateChanged = true;

    try {
      const r = await sendTelegramBriefing(buildCounterTrendAlertText(ms, htfBias, label));
      telegramResults.push({ tf: label, ...r });
      alertsSent++;
    } catch (e) {
      telegramResults.push({ tf: label, sent: false, error: e.message });
    }
  }

  if (stateChanged) writeFileSync(COUNTER_TREND_MS_ALERTS_STATE_PATH, JSON.stringify(alertsState, null, 2));

  return { htfBias, htfSource, results, alertsSent, telegramResults };
}
