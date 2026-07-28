import { readFileSync, existsSync } from 'fs';
import { basename } from 'path';

const TOKEN_PATH = '/Users/boogy/.claude/telegram_token';
const CHATID_PATH = '/Users/boogy/.claude/telegram_chat_id';
const LIMIT = 4096;

// Retry helper: attempt up to maxAttempts times with exponential backoff
async function retryFetch(fn, maxAttempts = 3, delayMs = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt === maxAttempts) throw e;
      const delay = delayMs * Math.pow(2, attempt - 1);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

function readSecret(path) {
  if (!existsSync(path)) return null;
  const v = readFileSync(path, 'utf8').trim();
  return v || null;
}

function chunk(text, size) {
  const parts = [];
  for (let i = 0; i < text.length; i += size) parts.push(text.slice(i, i + size));
  return parts;
}

// Reads BOT_TOKEN/CHAT_ID from restricted local files (never from the prompt
// text itself, per the spec's own security note). Skips gracefully — logs a
// clear reason — if either is missing, rather than failing the whole run.
export async function sendTelegramBriefing(text) {
  const token = process.env.BOT_TOKEN || readSecret(TOKEN_PATH);
  const chatId = process.env.CHAT_ID || readSecret(CHATID_PATH);

  if (!token || !chatId) {
    return {
      sent: false,
      reason: `Telegram übersprungen: ${!token ? `BOT_TOKEN fehlt (erwartet in ${TOKEN_PATH} oder $BOT_TOKEN)` : ''}${!token && !chatId ? ' und ' : ''}${!chatId ? `CHAT_ID fehlt (erwartet in ${CHATID_PATH} oder $CHAT_ID)` : ''}`,
    };
  }

  const parts = chunk(text, LIMIT);
  const results = [];
  for (const part of parts) {
    try {
      const resp = await retryFetch(
        () => fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ chat_id: chatId, text: part }),
        }),
        3,
        1000
      );
      const json = await resp.json();
      results.push({ ok: resp.ok && json.ok, status: resp.status, description: json.description });
    } catch (e) {
      results.push({ ok: false, error: e.message, attempts: 3 });
    }
  }
  return { sent: results.every(r => r.ok), parts: results.length, results };
}

// Sends the chart screenshot (with the coach-drawn scenario paths) alongside
// the text briefing — same credential handling/skip behavior as sendMessage.
export async function sendTelegramPhoto(filePath, caption) {
  const token = process.env.BOT_TOKEN || readSecret(TOKEN_PATH);
  const chatId = process.env.CHAT_ID || readSecret(CHATID_PATH);

  if (!token || !chatId) {
    return {
      sent: false,
      reason: `Telegram übersprungen: ${!token ? `BOT_TOKEN fehlt (erwartet in ${TOKEN_PATH} oder $BOT_TOKEN)` : ''}${!token && !chatId ? ' und ' : ''}${!chatId ? `CHAT_ID fehlt (erwartet in ${CHATID_PATH} oder $CHAT_ID)` : ''}`,
    };
  }
  if (!existsSync(filePath)) {
    return { sent: false, reason: `Screenshot-Datei nicht gefunden: ${filePath}` };
  }

  try {
    const buffer = readFileSync(filePath);
    const form = new FormData();
    form.append('chat_id', chatId);
    if (caption) form.append('caption', caption.slice(0, 1024));
    form.append('photo', new Blob([buffer]), basename(filePath));
    const resp = await retryFetch(
      () => fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: 'POST', body: form }),
      3,
      1000
    );
    const json = await resp.json();
    return { sent: resp.ok && json.ok, status: resp.status, description: json.description };
  } catch (e) {
    return { sent: false, error: e.message };
  }
}
