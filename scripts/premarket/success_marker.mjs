// Shared success-marker check (13.08.2026, Teil 51) — extracted out of
// retry_if_needed.mjs so the Claude-Code scheduled-task guard
// (check_success.mjs) uses the exact same date-comparison logic instead of
// a second, independently-drifting copy. Single source of truth for
// "has today's run for this slot already succeeded" against
// state/last_success.json (written by run.mjs's own success path).
import { fileURLToPath } from 'url';
import { existsSync, readFileSync } from 'fs';

export const SUCCESS_MARKER_PATH = fileURLToPath(new URL('../../state/last_success.json', import.meta.url));

// Same UTC-date-slice convention as run.mjs's own `dateStr` — must match
// exactly what run.mjs writes into the marker, not a Berlin-local date.
export function todayDateStr() {
  return new Date().toISOString().slice(0, 10);
}

export function alreadySucceededToday(slot) {
  if (!existsSync(SUCCESS_MARKER_PATH)) return false;
  try {
    const markers = JSON.parse(readFileSync(SUCCESS_MARKER_PATH, 'utf8'));
    return markers?.[slot]?.date === todayDateStr();
  } catch {
    return false;
  }
}

export function readMarker(slot) {
  if (!existsSync(SUCCESS_MARKER_PATH)) return null;
  try {
    const markers = JSON.parse(readFileSync(SUCCESS_MARKER_PATH, 'utf8'));
    return markers?.[slot] ?? null;
  } catch {
    return null;
  }
}
