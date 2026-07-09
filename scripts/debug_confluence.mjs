#!/usr/bin/env node
/**
 * Debug Confluence Validation
 * Shows exactly what happens with the confluence rule
 */

import { readFileSync } from 'fs';
import * as lib from './premarket/lib.mjs';

const DATA_DIR = '/Users/boogy/tradingview-mcp/backtests';

function loadBars(timeframe) {
  const map = { '4h': 'data_4h.json', '1h': 'data_1h.json', '5m': 'data_15m.json' };
  const file = map[timeframe];
  if (!file) throw new Error(`Unknown timeframe: ${timeframe}`);
  const data = JSON.parse(readFileSync(`${DATA_DIR}/${file}`, 'utf8'));
  return data.bars || data;
}

async function main() {
  console.log('🐛 CONFLUENCE DEBUG\n');

  const bars1h = loadBars('1h');
  const bars5m = loadBars('5m');

  const ms1h = lib.detectMarketShift(bars1h, 2);
  const ms5m = lib.detectMarketShift(bars5m, 2);

  console.log('RAW MS DETECTION:');
  console.log(`  1H: status=${ms1h.status}, direction=${ms1h.direction}`);
  console.log(`  5m: status=${ms5m.status}, direction=${ms5m.direction}\n`);

  // Test confluence
  const confluence = lib.validateMsConfluence(ms5m, ms1h);

  console.log('CONFLUENCE VALIDATION:');
  console.log(`  Input: ltfMs(5m)=${ms5m.status}/${ms5m.direction}, htfMs(1h)=${ms1h.status}/${ms1h.direction}`);
  console.log(`  Result: ${confluence.reason}`);
  console.log(`  isConfluent: ${confluence.isConfluent}`);
  console.log(`  Output htfMs: status=${confluence.htfMs.status}, direction=${confluence.htfMs.direction}\n`);

  console.log('WHAT WILL BE DRAWN:');
  console.log(`  5m (LTF):  ${confluence.ltfMs.status !== 'none' ? '✅ YES' : '❌ NO'} (${confluence.ltfMs.direction})`);
  console.log(`  1H (HTF):  ${confluence.htfMs.status !== 'none' ? '✅ YES' : '❌ NO'} (${confluence.htfMs.direction})`);
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
