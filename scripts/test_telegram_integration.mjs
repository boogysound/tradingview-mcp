#!/usr/bin/env node
/**
 * Test Telegram Integration
 * Verifies that MS alerts (potential + confirmed) work correctly
 */

import { readFileSync, existsSync } from 'fs';
import * as lib from './premarket/lib.mjs';
import { sendTelegramBriefing } from './premarket/telegram.mjs';

const DATA_DIR = '/Users/boogy/tradingview-mcp/backtests';

function loadBars(timeframe) {
  const map = { '1h': 'data_1h.json', '5m': 'data_15m.json' };
  const file = map[timeframe];
  if (!file) throw new Error(`Unknown timeframe: ${timeframe}`);
  const data = JSON.parse(readFileSync(`${DATA_DIR}/${file}`, 'utf8'));
  return data.bars || data;
}

function toBerlinTime(timestamp) {
  const date = new Date(timestamp * 1000);
  const formatter = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
  return formatter.format(date);
}

function fmtLevel(ms) {
  const arrow = ms.direction === 'bearish' ? '↓ bearish' : '↑ bullish';
  const brokenAt = toBerlinTime(ms.brokenLevel.time);
  return `${arrow}\nLevel: ${ms.brokenLevel.price.toFixed(1)} (gebrochen am ${brokenAt} Berlin)`;
}

function fmtPotential(ms) {
  const arrow = ms.direction === 'bearish' ? '↓ bearish' : '↑ bullish';
  const confirmType = ms.direction === 'bullish' ? 'Higher Low' : 'Lower High';
  const confirmLevel = ms.level.toFixed(1);
  const direction = ms.direction === 'bullish' ? 'über' : 'unter';
  return `${arrow}\nGebrochene Ebene: ${ms.brokenLevel.price.toFixed(1)}\n\n⏳ Bestätigung erwartet:\n${confirmType} ${direction} ${confirmLevel}`;
}

async function main() {
  console.log('🧪 TELEGRAM INTEGRATION TEST\n');
  console.log('═══════════════════════════════════════════\n');

  const bars1h = loadBars('1h');
  const bars5m = loadBars('5m');

  // Detect MS
  const ms1h = lib.detectMarketShift(bars1h, 2);
  const ms5m = lib.detectMarketShift(bars5m, 2);

  // Apply confluence
  const confluence = lib.validateMsConfluence(ms5m, ms1h);
  const ms1hConfluent = confluence.htfMs;
  const ms5mConfluent = confluence.ltfMs;

  console.log('🔍 DETECTED MS (after confluence filtering):\n');
  console.log(`  1H: status=${ms1hConfluent.status}, direction=${ms1hConfluent.direction}`);
  console.log(`  5m: status=${ms5mConfluent.status}, direction=${ms5mConfluent.direction}\n`);
  console.log(`  Confluence: ${confluence.reason}\n`);

  console.log('═══════════════════════════════════════════\n');
  console.log('📨 TESTING TELEGRAM ALERT MESSAGES\n');

  const messages = [];
  const nowBerlin = toBerlinTime(Math.floor(Date.now() / 1000));

  // Potential alerts
  if (ms1hConfluent.status === 'potential') {
    const msg = `⚠️ POTENZIELLER MS (1H)\n${fmtPotential(ms1hConfluent)}\n\n🕐 Erkannt: ${nowBerlin} Berlin`;
    messages.push(msg);
    console.log('✅ 1H Potential Alert Message:\n' + msg + '\n');
  }

  if (ms5mConfluent.status === 'potential') {
    const msg = `⚠️ POTENZIELLER MS (5m)\n${fmtPotential(ms5mConfluent)}\n\n🕐 Erkannt: ${nowBerlin} Berlin`;
    messages.push(msg);
    console.log('✅ 5m Potential Alert Message:\n' + msg + '\n');
  }

  // Confirmed alerts
  if (ms1hConfluent.status === 'confirmed') {
    const msg = `✅ BESTÄTIGTER MS (1H)\n${fmtLevel(ms1hConfluent)}\n\n🕐 Bestätigt: ${nowBerlin} Berlin`;
    messages.push(msg);
    console.log('✅ 1H Confirmed Alert Message:\n' + msg + '\n');
  }

  if (ms5mConfluent.status === 'confirmed') {
    const msg = `✅ BESTÄTIGTER MS (5m)\n${fmtLevel(ms5mConfluent)}\n\n🕐 Bestätigt: ${nowBerlin} Berlin`;
    messages.push(msg);
    console.log('✅ 5m Confirmed Alert Message:\n' + msg + '\n');
  }

  if (messages.length === 0) {
    console.log('⊘ Keine aktiven MS zum Testen (alle status=none)\n');
  }

  console.log('═══════════════════════════════════════════\n');
  console.log('📤 SENDING TEST TELEGRAM MESSAGES\n');

  if (messages.length > 0) {
    const result = await sendTelegramBriefing(messages.join('\n\n'));
    console.log(JSON.stringify(result, null, 2));

    if (result.sent) {
      console.log('\n✅ TELEGRAM ALERTS SENT SUCCESSFULLY');
    } else if (result.reason) {
      console.log(`\n⚠️ TELEGRAM SKIPPED: ${result.reason}`);
    } else {
      console.log('\n❌ TELEGRAM SEND FAILED');
    }
  } else {
    console.log('⊘ Kein Test-Alert zu senden (keine aktiven MS)\n');
  }

  console.log('\n═══════════════════════════════════════════\n');
  console.log('✅ Integration Test Completed\n');
}

main().catch(e => {
  console.error('❌ Test failed:', e);
  process.exit(1);
});
