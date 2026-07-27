#!/usr/bin/env node
/**
 * Wrapper für run.mjs: Startet TradingView automatisch, wenn keine Verbindung besteht.
 *
 * Logik:
 * 1. Versuche, mit TradingView zu verbinden (healthCheck)
 * 2. Falls erfolgreich → führe run.mjs aus
 * 3. Falls nicht → starte TradingView mit launch()
 * 4. Warte bis zu 60s auf Verbindung, dann run.mjs
 */

import { healthCheck, launch } from '../../src/core/health.js';

// A CDP connection can succeed before TradingView's own chart API
// (window.TradingViewApi) has finished initializing — healthCheck() then
// returns successfully but with api_available: false and symbol: 'unknown'.
// run.mjs's first call (getState) assumes the chart API is ready and throws
// a TypeError on '_activeChartWidgetWV' if called too early, so "connected"
// must mean api_available === true, not just "CDP didn't throw".
async function waitForChartApi(maxAttempts, intervalMs) {
  for (let attempts = 1; attempts <= maxAttempts; attempts++) {
    try {
      const health = await healthCheck();
      if (health.api_available) return health;
    } catch { /* CDP not reachable yet — keep retrying */ }
    if (attempts % 5 === 0) console.log(`   Versuch ${attempts}/${maxAttempts}...`);
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return null;
}

async function main() {
  console.log('🔍 Prüfe TradingView-Verbindung...');

  let health = await waitForChartApi(1, 0);

  if (!health) {
    console.log('❌ Verbindung fehlgeschlagen oder Chart-API nicht bereit.');
    console.log('\n🚀 Starte TradingView automatisch...');

    try {
      const result = await launch({ kill_existing: false });
      console.log('✅ TradingView gestartet:');
      console.log('   PID:', result.pid);
      console.log('   Binary:', result.binary);
      console.log('   CDP URL:', result.cdp_url);

      console.log('\n⏳ Warte auf TradingView Chart-API (max 60s)...');
      health = await waitForChartApi(60, 1000);

      if (!health) {
        console.log('⚠️ Timeout: TradingView Chart-API nicht bereit nach 60s');
        console.log('Starten Sie TradingView manuell mit CDP-Port 9222:');
        console.log('  TradingView --remote-debugging-port=9222');
        process.exit(1);
      }
    } catch (launchErr) {
      console.log('❌ Fehler beim Starten von TradingView:', launchErr.message);
      console.log('\nAlternativ: Starten Sie TradingView manuell mit:');
      console.log('  TradingView --remote-debugging-port=9222');
      process.exit(1);
    }
  }

  console.log('✅ TradingView online:');
  console.log('   Symbol:', health.chart_symbol);
  console.log('   Resolution:', health.chart_resolution);
  console.log('   API verfügbar:', health.api_available);

  console.log('\n▶️  Starte run.mjs...\n');
  await import('./run.mjs');
}

main().catch(err => {
  console.error('❌ Fehler:', err.message);
  process.exit(1);
});
