#!/usr/bin/env node
// Guard for the Claude-Code scheduled task (Teil 51, 13.08.2026): prints
// whether today's run for the given slot already succeeded, so the
// scheduled-task agent can skip running the pipeline again when launchd's
// own job already got it done. Read-only, no TradingView touch — this is
// exactly the check retry_if_needed.mjs does before its own launchd retry
// ticks, reused here via success_marker.mjs so both stay in sync.
//
// Usage: node check_success.mjs <morning|evening>
// Prints one line of JSON: {"alreadySucceeded": bool, "marker": {...}|null}
import { alreadySucceededToday, readMarker } from './success_marker.mjs';

const slot = process.argv[2];
if (slot !== 'morning' && slot !== 'evening') {
  console.error('Usage: node check_success.mjs <morning|evening>');
  process.exit(1);
}

console.log(JSON.stringify({
  alreadySucceeded: alreadySucceededToday(slot),
  marker: readMarker(slot),
}));
