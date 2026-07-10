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

async function main() {
  console.log('🔍 Prüfe TradingView-Verbindung...');

  let connected = false;
  try {
    const health = await healthCheck();
    console.log('✅ TradingView verbunden:');
    console.log('   Symbol:', health.chart_symbol);
    console.log('   Resolution:', health.chart_resolution);
    console.log('   API verfügbar:', health.api_available);
    connected = true;
  } catch (err) {
    console.log('❌ Verbindung fehlgeschlagen:', err.message);
    console.log('\n🚀 Starte TradingView automatisch...');

    try {
      const result = await launch({ kill_existing: false });
      console.log('✅ TradingView gestartet:');
      console.log('   PID:', result.pid);
      console.log('   Binary:', result.binary);
      console.log('   CDP URL:', result.cdp_url);

      // Warte bis zu 60s auf Verbindung
      console.log('\n⏳ Warte auf TradingView-Verbindung (max 60s)...');
      let attempts = 0;
      const maxAttempts = 60;

      while (attempts < maxAttempts) {
        try {
          const health = await healthCheck();
          console.log('✅ TradingView online!');
          console.log('   Symbol:', health.chart_symbol);
          console.log('   Resolution:', health.chart_resolution);
          connected = true;
          break;
        } catch (innerErr) {
          attempts++;
          if (attempts % 5 === 0) {
            console.log(`   Versuch ${attempts}/${maxAttempts}...`);
          }
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      if (!connected) {
        console.log('⚠️ Timeout: TradingView antwortet nicht nach 60s');
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

  if (connected) {
    console.log('\n▶️  Starte run.mjs...\n');
    const run = await import('./run.mjs');
  }
}

main().catch(err => {
  console.error('❌ Fehler:', err.message);
  process.exit(1);
});
