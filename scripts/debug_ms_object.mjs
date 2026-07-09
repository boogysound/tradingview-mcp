#!/usr/bin/env node
/**
 * Debug: Show exact MS object structure
 */

import { readFileSync } from 'fs';
import * as lib from './premarket/lib.mjs';

function loadBars(tf) {
  const data = JSON.parse(readFileSync(`/Users/boogy/tradingview-mcp/backtests/data_${tf}.json`, 'utf8'));
  return data.bars || data;
}

function toBerlinTime(ts) {
  return new Date(ts * 1000).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
}

async function main() {
  console.log('🔍 MS OBJECT DEBUG\n');

  const bars5m = loadBars('5m');
  const ms = lib.detectMarketShift(bars5m, 2);

  console.log('RAW MS OBJECT:\n');
  console.log(JSON.stringify(ms, null, 2));

  console.log('\n\n📋 ANALYZED:\n');
  console.log(`status: ${ms.status}`);
  console.log(`direction: ${ms.direction}`);
  console.log(`break_time: ${ms.break_time} (${toBerlinTime(ms.break_time)})`);
  console.log(`\nHAS brokenLevel: ${!!ms.brokenLevel} → ${ms.brokenLevel?.price}`);
  console.log(`HAS level: ${!!ms.level} → ${ms.level}`);
  console.log(`HAS candlePrice: ${!!ms.candlePrice} → ${ms.candlePrice}`);
  console.log(`\nPROBLEM: Both 'brokenLevel' AND 'level' are present!`);
  console.log(`→ This confuses the draw function!\n`);
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
