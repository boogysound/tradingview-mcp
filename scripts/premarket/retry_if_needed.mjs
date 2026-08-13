#!/usr/bin/env node
/**
 * Periodic post-failure retry + pre-flight health check (Teil 47/49,
 * consolidated Teil 53, 13.08.2026 — two independently-built mechanisms for
 * the same underlying problem, merged on user request into one script with
 * two modes so there's a single restart code path instead of two).
 *
 * NORMAL MODE (`node retry_if_needed.mjs <morning|evening>`):
 * start-with-tv.mjs already self-heals WITHIN one launchd fire (2 attempts,
 * one TradingView restart in between — Teil 38/46), but once both attempts
 * are exhausted it gives up entirely until the next scheduled job, which
 * can be up to ~12h later (morning-briefing 09:20 -> evening-sync 22:00).
 * Live case, 13.08.2026: TradingView's Chart-API was unusable from ~09:25
 * until ~11:05 (~100min) — the built-in self-heal window covered only the
 * first ~15min of that. This mode is triggered a few times over a bounded
 * window AFTER the main job (see com.boogy.de40-{morning,evening}-retry.
 * plist) and is a cheap no-op on every tick once today's run for the given
 * slot already succeeded (via success_marker.mjs) — and also skips the
 * tick entirely if start-with-tv.mjs/run.mjs is already running, so this
 * can't race a still-in-progress self-heal into a second TradingView
 * instance (Teil 46 fixed that race *within* one process; two separate
 * launchd-triggered processes racing each other is a different path to
 * the same problem).
 *
 * PREFLIGHT MODE (`node retry_if_needed.mjs --preflight`, no slot arg —
 * originally a separate watchdog.mjs, folded in here): run shortly BEFORE
 * the main job, not after. Just checks TradingView health and hard-
 * restarts it (pkill + ensureTradingViewReady) if unhealthy — does NOT run
 * the full start-with-tv.mjs pipeline (no Telegram briefing, no zone
 * drawing), since the point is only to give the upcoming main job a clean
 * TradingView to start from. Deliberately not continuous/24-7: restarting
 * TradingView is disruptive to anyone actively viewing the live chart, so
 * this only runs in a narrow window right before the jobs that actually
 * need it. Sends a Telegram alert only if its own restart attempt fails —
 * a successful proactive restart doesn't need to page anyone.
 */
import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { alreadySucceededToday as checkAlreadySucceeded } from './success_marker.mjs';

const PREFLIGHT = process.argv[2] === '--preflight';
const slot = PREFLIGHT ? null : process.argv[2];
if (!PREFLIGHT && slot !== 'morning' && slot !== 'evening') {
  console.error('[retry] Usage: node retry_if_needed.mjs <morning|evening>  |  node retry_if_needed.mjs --preflight');
  process.exit(1);
}

const START_WITH_TV_PATH = fileURLToPath(new URL('./start-with-tv.mjs', import.meta.url));

function log(msg) {
  console.log(`[${PREFLIGHT ? 'preflight' : `retry:${slot}`}] ${new Date().toISOString()} — ${msg}`);
}

function mainJobAlreadyRunning() {
  try {
    const out = execSync('pgrep -f "scripts/premarket/(start-with-tv|run)\\.mjs"', { encoding: 'utf8' });
    return out.trim().length > 0;
  } catch {
    return false; // pgrep exits 1 (no match found) -> execSync throws
  }
}

async function pkillTradingView() {
  await new Promise((resolve) => {
    const kill = spawn('pkill', ['-9', '-f', 'TradingView']);
    kill.on('exit', resolve);
    kill.on('error', resolve);
  });
}

async function runPreflight() {
  const { healthCheck } = await import('../../src/core/health.js');
  const { ensureTradingViewReady } = await import('./utils.mjs');
  const { sendTelegramBriefing } = await import('./telegram.mjs');
  const { disconnect } = await import('../../src/connection.js');

  let health = null;
  try {
    health = await healthCheck();
  } catch (e) {
    log(`healthCheck() fehlgeschlagen: ${e.message}`);
  }

  if (health?.success && health.cdp_connected && health.api_available) {
    log(`OK — TradingView bereit (Symbol: ${health.chart_symbol}, Resolution: ${health.chart_resolution}). Kein Eingriff nötig.`);
    await disconnect();
    process.exit(0);
  }

  if (mainJobAlreadyRunning()) {
    log('start-with-tv.mjs/run.mjs läuft bereits — Preflight übersprungen, kein Neustart mitten in einem laufenden Versuch.');
    process.exit(0);
  }

  log('TradingView nicht bereit — harter Neustart...');
  await pkillTradingView();
  await new Promise(r => setTimeout(r, 2000));

  try {
    const restarted = await ensureTradingViewReady({ onLog: (m) => log(m) });
    log(`Neustart erfolgreich — Symbol: ${restarted.chart_symbol}, Resolution: ${restarted.chart_resolution}.`);
    await disconnect();
    process.exit(0);
  } catch (e) {
    console.error(`[preflight] Neustart fehlgeschlagen: ${e.message}`);
    try {
      const r = await sendTelegramBriefing(`⚠️ Preflight: TradingView-Neustart vor dem geplanten Lauf fehlgeschlagen. Bitte manuell prüfen. (${e.message})`);
      console.error('[preflight] Telegram-Warnung:', JSON.stringify(r));
    } catch (alertErr) {
      console.error('[preflight] Telegram-Warnung selbst fehlgeschlagen:', alertErr.message);
    }
    await disconnect().catch(() => {});
    process.exit(1);
  }
}

async function runRetry() {
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

async function main() {
  if (PREFLIGHT) await runPreflight();
  else await runRetry();
}

main().catch(async (e) => {
  console.error('[retry] Unerwarteter Fehler:', e.stack || e.message);
  try {
    const { disconnect } = await import('../../src/connection.js');
    await disconnect();
  } catch {}
  process.exit(1);
});
