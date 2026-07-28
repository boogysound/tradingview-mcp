// ============================================================================
// UTILITIES — Consolidated shared functions (Berlin time, Telegram, File I/O)
// ============================================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { healthCheck, launch } from '../../src/core/health.js';

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
      } catch (e) {
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

export async function ensureTradingViewReady({ onLog = () => {} } = {}) {
  let health = await waitForChartApi(1, 0);
  if (health) return health;

  onLog('TradingView nicht erreichbar oder Chart-API nicht bereit — starte automatisch...');
  const result = await launch({ kill_existing: false });
  onLog(`TradingView gestartet (PID ${result.pid})`);

  health = await waitForChartApi(60, 1000);
  if (!health) throw new Error('TradingView Chart-API nach 60s nicht bereit.');
  return health;
}

// ---------- SLEEP/RETRY ----------

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
