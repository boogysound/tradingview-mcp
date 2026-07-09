#!/usr/bin/env node
/**
 * Cleanup & Redraw MS
 * 1. Delete all old MS shapes from TV
 * 2. Run fresh MS detection and draw with corrected logic
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { getState, setTimeframe } from '/Users/boogy/tradingview-mcp/src/core/chart.js';
import { getOhlcv } from '/Users/boogy/tradingview-mcp/src/core/data.js';
import { healthCheck } from '/Users/boogy/tradingview-mcp/src/core/health.js';
import { disconnect } from '/Users/boogy/tradingview-mcp/src/connection.js';
import * as lib from './premarket/lib.mjs';
import { remove } from './premarket/draw.mjs';
import { drawMarketShiftMarker } from './premarket/draw.mjs';
import { ensureFreshData } from './premarket/ensure_fresh_data.mjs';

const MARKET_SHIFT_STATE_PATH = '/Users/boogy/tradingview-mcp/state/market_shift.json';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchBars(tf, count = 500) {
  await setTimeframe({ timeframe: String(tf) });
  await sleep(1000);
  const raw = await getOhlcv({ count });
  return raw.bars || raw;
}

async function main() {
  console.log('🔧 CLEANUP & REDRAW MS\n');

  const health = await healthCheck();
  if (!health.success || !health.cdp_connected) {
    console.error('❌ CDP nicht erreichbar');
    process.exit(1);
  }

  const original = await getState();

  // Step 1: Delete all old MS shapes
  console.log('🗑️ DELETING OLD MS SHAPES...\n');
  let prevIds = { htf: {}, ltf: {} };
  if (existsSync(MARKET_SHIFT_STATE_PATH)) {
    prevIds = JSON.parse(readFileSync(MARKET_SHIFT_STATE_PATH, 'utf8'));
  }

  if (prevIds.htf?.vline) {
    await remove(prevIds.htf.vline).catch(() => {});
    console.log(`  ✂️ Deleted 1H vline: ${prevIds.htf.vline}`);
  }
  if (prevIds.htf?.hline) {
    await remove(prevIds.htf.hline).catch(() => {});
    console.log(`  ✂️ Deleted 1H hline: ${prevIds.htf.hline}`);
  }
  if (prevIds.ltf?.vline) {
    await remove(prevIds.ltf.vline).catch(() => {});
    console.log(`  ✂️ Deleted 5m vline: ${prevIds.ltf.vline}`);
  }
  if (prevIds.ltf?.hline) {
    await remove(prevIds.ltf.hline).catch(() => {});
    console.log(`  ✂️ Deleted 5m hline: ${prevIds.ltf.hline}`);
  }

  console.log('\n📦 FRESH DATA & MS DETECTION...\n');

  // Step 2: Ensure fresh data
  await ensureFreshData();

  // Step 3: Fetch latest bars
  const bars1h = await fetchBars(60, 500);
  const bars5 = await fetchBars(5, 500);
  await setTimeframe({ timeframe: original.resolution });

  // Step 4: Detect MS
  const htfMs = lib.detectMarketShift(bars1h, 2);
  const ltfMs = bars5.length >= 20 ? lib.detectMarketShift(bars5, 2) : { status: 'none' };

  console.log(`1H: ${htfMs.status} ${htfMs.direction || ''}`);
  console.log(`5m: ${ltfMs.status} ${ltfMs.direction || ''}\n`);

  // Step 5: Apply confluence
  const confluence = lib.validateMsConfluence(ltfMs, htfMs);
  console.log(`Confluence: ${confluence.reason}\n`);

  // Step 6: Draw with CORRECTED logic
  console.log('📐 DRAWING CORRECTED MS...\n');
  const htfIds = await drawMarketShiftMarker(confluence.htfMs, '1H', {});
  const ltfIds = await drawMarketShiftMarker(confluence.ltfMs, '5m', {});

  // Step 7: Save new state
  writeFileSync(MARKET_SHIFT_STATE_PATH, JSON.stringify({
    htf: { ...htfIds, lastMs: confluence.htfMs },
    ltf: { ...ltfIds, lastMs: confluence.ltfMs }
  }));

  console.log('\n✅ COMPLETE!\n');
  console.log(`1H: ${confluence.htfMs.status} → vline:${htfIds.vline || 'none'}, hline:${htfIds.hline || 'none'}`);
  console.log(`5m: ${confluence.ltfMs.status} → vline:${ltfIds.vline || 'none'}, hline:${ltfIds.hline || 'none'}`);

  await disconnect().catch(() => {});
  process.exit(0);
}

main().catch(async e => {
  console.error('❌ ERROR:', e.message);
  await disconnect().catch(() => {});
  process.exit(1);
});
