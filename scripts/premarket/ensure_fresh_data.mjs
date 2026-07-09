/**
 * Ensure Fresh Data - keeps backtests/*.json files current
 * Fetches latest bars from TradingView and updates cache files
 * Should be called before any MS detection
 */

import { writeFileSync, existsSync, statSync } from 'fs';
import { setTimeframe } from '/Users/boogy/tradingview-mcp/src/core/chart.js';
import { getOhlcv } from '/Users/boogy/tradingview-mcp/src/core/data.js';
import { disconnect } from '/Users/boogy/tradingview-mcp/src/connection.js';

const DATA_DIR = '/Users/boogy/tradingview-mcp/backtests';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Max age for cache files (in minutes)
const MAX_CACHE_AGE_MINUTES = 5;

function isCacheStale(filepath) {
  if (!existsSync(filepath)) return true;
  const mtime = statSync(filepath).mtime.getTime();
  const ageMinutes = (Date.now() - mtime) / (1000 * 60);
  return ageMinutes > MAX_CACHE_AGE_MINUTES;
}

export async function ensureFreshData() {
  const status = {
    checked: [],
    updated: [],
    skipped: [],
    errors: []
  };

  const timeframes = [
    { tf: 60, label: '1h' },
    { tf: 15, label: '15m' },
    { tf: 5, label: '5m' }
  ];

  for (const { tf, label } of timeframes) {
    const filepath = `${DATA_DIR}/data_${label}.json`;

    if (isCacheStale(filepath)) {
      try {
        await setTimeframe({ timeframe: String(tf) });
        await sleep(800);
        const raw = await getOhlcv({ count: 500 });
        const bars = raw.bars || raw;

        if (bars && bars.length > 0) {
          writeFileSync(filepath, JSON.stringify(bars));
          const lastBar = bars[bars.length - 1];
          const lastTime = new Date(lastBar.time * 1000).toLocaleString('de-DE', {
            timeZone: 'Europe/Berlin'
          });
          status.updated.push(`${label}: ${bars.length} bars (bis ${lastTime})`);
        } else {
          status.errors.push(`${label}: no bars returned`);
        }
      } catch (e) {
        status.errors.push(`${label}: ${e.message}`);
      }
    } else {
      const mtime = statSync(filepath).mtime;
      const lastUpdate = mtime.toLocaleString('de-DE', {
        timeZone: 'Europe/Berlin'
      });
      status.skipped.push(`${label}: fresh (${lastUpdate})`);
    }

    status.checked.push(label);
  }

  return status;
}

// If run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  ensureFreshData().then(status => {
    console.log(JSON.stringify(status, null, 2));
    disconnect().catch(() => {});
    process.exit(0);
  }).catch(async e => {
    console.error('FATAL:', e.message);
    await disconnect().catch(() => {});
    process.exit(1);
  });
}
