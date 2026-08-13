#!/usr/bin/env node
/**
 * TradingView pre-flight watchdog (Teil 47, 13.08.2026, user-requested).
 * Fresh short-lived process, run shortly BEFORE the two jobs that actually
 * need a working chart (morning-briefing 09:20, evening-sync 22:00) — not a
 * continuous/always-on monitor. Deliberately narrow: restarting TradingView
 * is disruptive to anyone actively looking at the live chart, so this only
 * acts when there's a real problem to fix before those jobs run, not on a
 * fixed interval around the clock.
 *
 * Root cause this exists for: on 13.08.2026, the scheduled 09:20 run's own
 * long-lived process got stuck for 20+ minutes because its cached CDP client
 * (src/connection.js) hung indefinitely on a dead connection — meanwhile
 * every FRESH process connecting to the same TradingView instance succeeded
 * in well under a second. That connection.js bug is now fixed (timeout on
 * the liveness check + the main evaluate() call), but this watchdog adds a
 * second line of defense: even if TradingView itself is genuinely down/
 * frozen (not just one process's stale connection), a fresh pre-flight
 * check a few minutes before the real job catches and fixes it in time.
 */
import { healthCheck } from '../../src/core/health.js';
import { ensureTradingViewReady } from './utils.mjs';
import { sendTelegramBriefing } from './telegram.mjs';
import { disconnect } from '../../src/connection.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pkillTradingView() {
  const { spawn } = await import('child_process');
  await new Promise((resolve) => {
    const kill = spawn('pkill', ['-9', '-f', 'TradingView']);
    kill.on('exit', resolve);
    kill.on('error', resolve);
  });
}

async function main() {
  console.log(`[watchdog] ${new Date().toISOString()} — Pre-Flight-Check...`);

  let health = null;
  try {
    health = await healthCheck();
  } catch (e) {
    console.log(`[watchdog] healthCheck() fehlgeschlagen: ${e.message}`);
  }

  if (health?.success && health.cdp_connected && health.api_available) {
    console.log(`[watchdog] OK — TradingView bereit (Symbol: ${health.chart_symbol}, Resolution: ${health.chart_resolution}). Kein Eingriff nötig.`);
    await disconnect();
    process.exit(0);
  }

  console.log('[watchdog] TradingView nicht bereit — harter Neustart...');
  await pkillTradingView();
  await sleep(2000);

  try {
    const restarted = await ensureTradingViewReady({ onLog: (m) => console.log(`[watchdog] ${m}`) });
    console.log(`[watchdog] Neustart erfolgreich — Symbol: ${restarted.chart_symbol}, Resolution: ${restarted.chart_resolution}.`);
    await disconnect();
    process.exit(0);
  } catch (e) {
    console.error(`[watchdog] Neustart fehlgeschlagen: ${e.message}`);
    try {
      const r = await sendTelegramBriefing(`⚠️ Watchdog: TradingView-Neustart vor dem geplanten Lauf fehlgeschlagen. Bitte manuell prüfen. (${e.message})`);
      console.error('[watchdog] Telegram-Warnung:', JSON.stringify(r));
    } catch (alertErr) {
      console.error('[watchdog] Telegram-Warnung selbst fehlgeschlagen:', alertErr.message);
    }
    await disconnect().catch(() => {});
    process.exit(1);
  }
}

main().catch(async (e) => {
  console.error('[watchdog] Unerwarteter Fehler:', e.stack || e.message);
  await disconnect().catch(() => {});
  process.exit(1);
});
