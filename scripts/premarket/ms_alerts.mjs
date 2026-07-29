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
