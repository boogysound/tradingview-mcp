#!/usr/bin/env node
/**
 * Wrapper für run.mjs: Startet TradingView automatisch, wenn keine Verbindung besteht.
 * Chart-API-Wartelogik lebt in ensureTradingViewReady() (utils.mjs) — geteilt
 * mit check_ms.mjs, damit beide Entry-Points dieselbe getestete Logik nutzen.
 */

import { ensureTradingViewReady } from './utils.mjs';

async function main() {
  console.log('🔍 Prüfe TradingView-Verbindung...');
  const health = await ensureTradingViewReady({ onLog: console.log });
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
