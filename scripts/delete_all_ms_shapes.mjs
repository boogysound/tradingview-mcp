#!/usr/bin/env node
/**
 * Delete ALL MS-related shapes from TradingView
 * Finds and removes every "Durchbruch" and "Bestätigter MS" line
 */

import { healthCheck } from '/Users/boogy/tradingview-mcp/src/core/health.js';
import { disconnect } from '/Users/boogy/tradingview-mcp/src/connection.js';
import { listDrawings } from '/Users/boogy/tradingview-mcp/src/core/drawing.js';
import { remove } from './premarket/draw.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('🔥 DELETE ALL MS SHAPES FROM TV\n');

  const health = await healthCheck();
  if (!health.success || !health.cdp_connected) {
    console.error('❌ CDP nicht erreichbar');
    process.exit(1);
  }

  // List all drawings
  const result = await listDrawings();
  const shapes = result.shapes || [];

  console.log(`Found ${shapes.length} total shapes on chart\n`);

  // Find all MS-related shapes (by text content or ID pattern)
  const msShapes = shapes.filter(s =>
    (s.text && s.text.includes('Durchbruch')) ||
    (s.text && s.text.includes('Bestätigter MS')) ||
    (s.text && s.text.includes('MS (1H')) ||
    (s.text && s.text.includes('MS (5m'))
  );

  console.log(`🎯 Found ${msShapes.length} MS-related shapes:\n`);

  for (const shape of msShapes) {
    console.log(`  • [${shape.id}] ${shape.text || '(no text)'}`);
  }

  if (msShapes.length === 0) {
    console.log('✅ No MS shapes found - already clean!\n');
    await disconnect().catch(() => {});
    process.exit(0);
  }

  console.log(`\n🗑️ DELETING ${msShapes.length} SHAPES...\n`);

  let deleted = 0;
  for (const shape of msShapes) {
    try {
      const r = await remove(shape.id);
      if (r.ok) {
        console.log(`  ✂️ Deleted: ${shape.id} (${shape.text?.slice(0, 30)}...)`);
        deleted++;
        await sleep(500);
      } else {
        console.log(`  ❌ Failed: ${shape.id}`);
      }
    } catch (e) {
      console.log(`  ⚠️ Error: ${shape.id} - ${e.message}`);
    }
  }

  console.log(`\n✅ DELETED ${deleted}/${msShapes.length} shapes\n`);

  await disconnect().catch(() => {});
  process.exit(0);
}

main().catch(async e => {
  console.error('ERROR:', e.message);
  await disconnect().catch(() => {});
  process.exit(1);
});
