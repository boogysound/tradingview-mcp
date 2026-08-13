#!/usr/bin/env node
/**
 * Periodic post-failure retry (Teil 47 gap-fix, 13.08.2026).
 *
 * start-with-tv.mjs already self-heals WITHIN one launchd fire (2 attempts,
 * one TradingView restart in between — Teil 38/46), but once both attempts
 * are exhausted it gives up entirely until the next scheduled job, which
 * can be up to ~12h later (morning-briefing 09:20 -> evening-sync 22:00).
 * Live case, 13.08.2026: TradingView's Chart-API was unusable from ~09:25
 * until ~11:05 (~100min) — the built-in self-heal window covered only the
 * first ~15min of that, so the briefing went out ~1h50m late and only
 * because someone happened to retry manually.
 *
 * This script is triggered a few times over a bounded window AFTER the
 * main job (see com.boogy.de40-{morning,evening}-retry.plist) and is a
 * cheap no-op on every tick once today's run for the given slot already
 * succeeded — it reads state/last_success.json (written by run.mjs's own
 * success path) before doing anything that touches TradingView.
 *
 * Also guards against overlapping with a still-running attempt (the main
 * job's own self-heal can itself take several minutes) by skipping the
 * tick entirely if start-with-tv.mjs or run.mjs is already running —
 * launching a second TradingView instance/CDP session concurrently is
 * exactly the race Teil 46 fixed *within* one process; two separate
 * launchd-triggered processes racing each other is a different path to
 * the same problem, not covered by that fix.
 *
 * Usage: node retry_if_needed.mjs <morning|evening>
 */
import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { alreadySucceededToday as checkAlreadySucceeded } from './success_marker.mjs';

const slot = process.argv[2];
if (slot !== 'morning' && slot !== 'evening') {
  console.error('[retry] Usage: node retry_if_needed.mjs <morning|evening>');
  process.exit(1);
}

const START_WITH_TV_PATH = fileURLToPath(new URL('./start-with-tv.mjs', import.meta.url));

function log(msg) {
  console.log(`[retry:${slot}] ${new Date().toISOString()} — ${msg}`);
}

function mainJobAlreadyRunning() {
  try {
    const out = execSync('pgrep -f "scripts/premarket/(start-with-tv|run)\\.mjs"', { encoding: 'utf8' });
    return out.trim().length > 0;
  } catch {
    return false; // pgrep exits 1 (no match found) -> execSync throws
  }
}

async function main() {
  if (checkAlreadySucceeded(slot)) {
    log('heute schon erfolgreich gelaufen, kein Eingriff.');
    process.exit(0);
  }

  if (mainJobAlreadyRunning()) {
    log('start-with-tv.mjs/run.mjs läuft bereits (vermutlich noch in Selbstheilung) — dieser Tick wird übersprungen, kein Doppelstart.');
    process.exit(0);
  }

  log(`noch kein erfolgreicher ${slot}-Lauf heute — starte start-with-tv.mjs erneut...`);
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [START_WITH_TV_PATH], { stdio: 'inherit' });
    child.on('exit', (c) => resolve(c == null ? 1 : c));
    child.on('error', (e) => { console.error(`[retry:${slot}] Konnte start-with-tv.mjs nicht starten:`, e.message); resolve(1); });
  });
  process.exit(code);
}

main();
