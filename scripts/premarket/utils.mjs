// ============================================================================
// UTILITIES — Consolidated shared functions (Berlin time, Telegram, File I/O)
// ============================================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { dirname } from 'path';
import { healthCheck, launch } from '../../src/core/health.js';
import { setTimeframe } from '../../src/core/chart.js';
import { getOhlcv, getStudyValues } from '../../src/core/data.js';

// ---------- BERLIN TIME UTILITIES ----------
// Rewritten 28.07.2026 — the previous getBerlinTime() constructed a German-
// locale string ("28.7.2026, 10:23:32") and fed it straight back into
// `new Date(string)`. That format isn't reliably parseable by the Date
// constructor, so it silently produced Invalid Date on this machine —
// found live: every MS Telegram alert's "🕐 ..." line read "Invalid Date",
// berlinNow() returned NaN, and isXetraOpen() always returned true
// regardless of the actual time (NaN comparisons are all false, so neither
// early-return fired and it fell through to the final `return true`) — a
// silent bug for a function whose entire job is deciding whether to run.
// Intl.DateTimeFormat.formatToParts sidesteps string round-tripping
// entirely — it reads Berlin wall-clock fields directly off a real Date.
function getBerlinParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Berlin',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    weekday: 'short', hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find(p => p.type === type)?.value;
  const hour = Number(get('hour'));
  return {
    year: Number(get('year')), month: Number(get('month')), day: Number(get('day')),
    hour: hour === 24 ? 0 : hour, minute: Number(get('minute')), second: Number(get('second')),
    weekday: get('weekday'), // 'Mon'..'Sun'
  };
}

export function getBerlinHour(date = new Date()) {
  return getBerlinParts(date).hour;
}

export function getBerlinWeekday(date = new Date()) {
  // 0=Sun..6=Sat, matching Date.prototype.getDay()
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[getBerlinParts(date).weekday];
}

// A unix timestamp is the same instant everywhere on Earth — no timezone
// conversion needed or meaningful here.
export function berlinNow() {
  return Math.floor(Date.now() / 1000);
}

export function berlinISO() {
  return new Date().toISOString();
}

export function berlinTimeString(date = new Date()) {
  return date.toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

export function isXetraOpen() {
  const dayOfWeek = getBerlinWeekday(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  const hour = getBerlinHour();

  // Xetra: Mon-Fri, 08:00-22:00
  if (dayOfWeek == null || dayOfWeek < 1 || dayOfWeek > 5) return false;
  if (hour < 8 || hour >= 22) return false;

  return true;
}

// ---------- FILE I/O UTILITIES (with error handling) ----------

export function readJSON(filePath, defaultValue = null) {
  try {
    if (!existsSync(filePath)) return defaultValue;
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.error(`❌ Error reading ${filePath}:`, e.message);
    return defaultValue;
  }
}

export function writeJSON(filePath, data, indent = 2) {
  try {
    const dir = dirname(filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    // Backup existing file before overwriting
    if (existsSync(filePath)) {
      const backupPath = `${filePath}.bak`;
      try {
        const current = readFileSync(filePath, 'utf8');
        writeFileSync(backupPath, current);
      } catch {
        // Backup failure is non-fatal; proceed with write
      }
    }
    writeFileSync(filePath, JSON.stringify(data, null, indent));
    return true;
  } catch (e) {
    console.error(`❌ Error writing ${filePath}:`, e.message);
    return false;
  }
}

export function fileExists(filePath) {
  return existsSync(filePath);
}

// ---------- DEDUPLICATION UTILITIES ----------

export function loadDedup(filePath) {
  return readJSON(filePath, {});
}

export function saveDedup(filePath, data) {
  return writeJSON(filePath, data);
}

export function isDuplicate(dedup, key, maxAgeSeconds = 86400) {
  if (!dedup[key]) return false;
  const age = Math.floor(Date.now() / 1000) - dedup[key];
  return age < maxAgeSeconds;
}

export function markSeen(dedup, key) {
  dedup[key] = Math.floor(Date.now() / 1000);
  return dedup;
}

// ---------- TELEGRAM UTILITIES ----------

export function getTelegramConfig() {
  const tokenPath = '/Users/boogy/.claude/telegram_token';
  const chatIdPath = '/Users/boogy/.claude/telegram_chat_id';

  const token = fileExists(tokenPath) ? readFileSync(tokenPath, 'utf8').trim() : null;
  const chatId = fileExists(chatIdPath) ? readFileSync(chatIdPath, 'utf8').trim() : null;

  return { token, chatId, ready: !!(token && chatId) };
}

// ---------- TRADINGVIEW READINESS ----------
// Shared by every entry point that needs a live TradingView connection
// (start-with-tv.mjs's full run, check_ms.mjs's frequent MS-only check).
// A CDP connection can succeed before TradingView's own chart API
// (window.TradingViewApi) has finished initializing — healthCheck() then
// returns successfully but with api_available: false, and the first real
// call (getState/getOhlcv) throws a TypeError on '_activeChartWidgetWV' if
// called too early. "Ready" therefore means api_available === true, not
// just "CDP didn't throw" (found live 27.07.2026).
async function waitForChartApi(maxAttempts, intervalMs) {
  for (let attempts = 1; attempts <= maxAttempts; attempts++) {
    try {
      const health = await healthCheck();
      if (health.api_available) return health;
    } catch { /* CDP not reachable yet — keep retrying */ }
    await sleep(intervalMs);
  }
  return null;
}

// launch({kill_existing: false}) unconditionally spawns a fresh TradingView
// process — it never checks whether one is already running. Found live
// 12.08.2026 (post-reboot cold start, PDH/PDL/FVG/S/R/S/D drawing + morning
// briefing silently stopped updating): a slow cold start left the first
// launch still mid-startup when its 60s budget expired; the caller (this
// function, called a second time by start-with-tv.mjs's self-heal retry)
// saw "still not ready" and called launch() again, spawning a SECOND
// TradingView instance racing the first one for the same CDP port — exactly
// the kind of instance-collision that produces the recurring "CDP port
// answers but the page never responds" freeze documented since Teil 38.
// Checking for an already-running process before spawning another one
// avoids creating that race in the first place.
function isTradingViewRunning() {
  try {
    execSync('pgrep -f "TradingView.app/Contents/MacOS/TradingView "', { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

export async function ensureTradingViewReady({ onLog = () => {} } = {}) {
  let health = await waitForChartApi(1, 0);
  if (health) return health;

  if (isTradingViewRunning()) {
    onLog('TradingView läuft bereits, Chart-API aber noch nicht bereit — warte weiter (kein Neustart, um keine zweite Instanz zu erzeugen)...');
  } else {
    onLog('TradingView nicht erreichbar oder Chart-API nicht bereit — starte automatisch...');
    const result = await launch({ kill_existing: false });
    onLog(`TradingView gestartet (PID ${result.pid})`);
  }

  // 180s instead of the previous 60s — a genuinely slow cold start (observed
  // live: still not ready at 80s) needs more headroom than a warm reconnect,
  // and waiting longer is strictly safer than the old behavior of giving up
  // and letting a caller trigger the duplicate-instance race above.
  health = await waitForChartApi(120, 1500);
  if (!health) throw new Error('TradingView Chart-API nach 180s nicht bereit.');
  return health;
}

// ---------- SLEEP/RETRY ----------

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- CHART DATA FETCHING (resolution-switch settle/retry) ----------
// Real bars for a given resolution never arrive faster than that resolution,
// and the chart's OHLCV buffer can still be empty/mid-load right after a
// resolution switch (or right after ensureTradingViewReady's api_available
// check passes — that only confirms the chart API object exists, not that
// its bars buffer is populated yet). getOhlcv() then either throws ("Could
// not extract OHLCV data...") or silently returns bars from the PREVIOUS
// resolution. Found live 09.07.2026 (mismatched timeframe, no throw) and
// 28.07.2026 (check_ms.mjs's own naive version had no retry at all and
// failed on every single 10-minute run since deployment — always caught the
// chart mid-load right after a resolution switch).
export async function fetchBars(tf, count = 500) {
  const expectedSec = typeof tf === 'number' ? tf * 60 : null;
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    await setTimeframe({ timeframe: String(tf) });
    await sleep(1500 * attempt);
    try {
      const raw = await getOhlcv({ count });
      const bars = raw.bars || raw;
      if (!expectedSec || bars.length < 2) return bars;
      const minGapSec = Math.min(...bars.slice(1).map((b, i) => b.time - bars[i].time));
      if (minGapSec >= expectedSec * 0.9) return bars;
      lastErr = new Error(`Auflösung stimmt nicht — kleinster Bar-Abstand ${minGapSec}s < erwartet ~${expectedSec}s.`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`fetchBars(${tf}) nach 3 Versuchen fehlgeschlagen: ${lastErr?.message}`);
}

// TradingView renders data-window numbers in the chart's display locale
// (German here: "." as thousands separator, "," as decimal) — parse back to
// a plain float.
function parseDeNumber(s) {
  if (s == null) return null;
  const n = Number(String(s).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// Reads the user's own, already-active TradingView indicators — "VWAP Auto
// Anchored" and "ORB" (a public Pine script, session-configurable, currently
// 09:00-09:30) — rather than recomputing them independently, so the briefing
// always matches exactly what the user sees on their own chart. User-
// specified, 28.07.2026: these + PDH/PDL/zones/FVGs are what they build
// their daily discretionary plan from, so the 09:20 briefing should
// reference them. Only reliably readable while the chart is on the 5m
// resolution (user-confirmed) — call this right after fetchBars(5, ...),
// before anything switches the chart away. Returns nulls (not a throw) if
// either indicator isn't present, so a chart without them doesn't break the
// rest of the briefing.
export async function readOrbVwap() {
  try {
    const { studies } = await getStudyValues();
    const vwapStudy = (studies || []).find(s => /vwap/i.test(s.name));
    const orbStudy = (studies || []).find(s => /^orb\b/i.test(s.name));
    return {
      vwap: vwapStudy ? parseDeNumber(vwapStudy.values?.VWAP) : null,
      orbHigh: orbStudy ? parseDeNumber(orbStudy.values?.['ORB High']) : null,
      orbLow: orbStudy ? parseDeNumber(orbStudy.values?.['ORB Low']) : null,
    };
  } catch {
    return { vwap: null, orbHigh: null, orbLow: null };
  }
}

export async function retry(fn, maxAttempts = 3, delayMs = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt === maxAttempts) throw e;
      await sleep(delayMs);
    }
  }
}
