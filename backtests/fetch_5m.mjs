/**
 * Fetch ~6 months of DE40 5-minute history via CDP, same lazy-load pattern
 * as fetch_history_6m.mjs (adapted here since that script only fetches
 * D/4H/1H/15m — 5m is needed separately for the new Scenario A's entry-
 * trigger backtest, which the user specified must run on 1m/5m granularity).
 * Output: backtests/data_5m.json
 */
import { writeFileSync } from 'fs';
import { evaluate, disconnect } from '/Users/boogy/tradingview-mcp/src/connection.js';
import { setTimeframe, getState } from '/Users/boogy/tradingview-mcp/src/core/chart.js';
import { healthCheck } from '/Users/boogy/tradingview-mcp/src/core/health.js';

const CHART = 'window.TradingViewApi._activeChartWidgetWV.value()';
const BARS = `${CHART}._chartWidget.model().mainSeries().bars()`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TARGET_SEC = Math.floor(Date.UTC(2025, 11, 1) / 1000);

async function firstBarInfo() {
  return evaluate(`(function(){
    var b = ${BARS};
    if (!b || typeof b.firstIndex !== 'function') return null;
    var f = b.firstIndex(), l = b.lastIndex();
    var v = b.valueAt(f);
    return { first: f, last: l, firstTime: v ? v[0] : null, size: b.size() };
  })()`);
}

async function loadHistoryUntil(targetSec, maxIters = 150) {
  let lastFirstTime = null, stall = 0;
  for (let k = 0; k < maxIters; k++) {
    const info = await firstBarInfo();
    if (!info) throw new Error('Bar series not readable');
    if (info.firstTime != null && info.firstTime <= targetSec) return info;
    if (info.firstTime === lastFirstTime) {
      stall++;
      if (stall >= 5) { console.error(`  history stalled at ${new Date(info.firstTime * 1000).toISOString()}`); return info; }
    } else stall = 0;
    lastFirstTime = info.firstTime;
    await evaluate(`(function(){
      var s = ${CHART}._chartWidget.model().mainSeries();
      if (typeof s.requestMoreData === 'function') s.requestMoreData(1000);
      return s.requestMoreDataAvailable ? String(s.requestMoreDataAvailable()) : 'n/a';
    })()`);
    await sleep(1600);
  }
  return firstBarInfo();
}

async function extractAllBars() {
  const info = await firstBarInfo();
  const CHUNK = 4000;
  const all = [];
  for (let start = info.first; start <= info.last; start += CHUNK) {
    const end = Math.min(start + CHUNK - 1, info.last);
    const chunk = await evaluate(`(function(){
      var b = ${BARS};
      var out = [];
      for (var i = ${start}; i <= ${end}; i++) {
        var v = b.valueAt(i);
        if (v) out.push({ time: v[0], open: v[1], high: v[2], low: v[3], close: v[4], volume: v[5] || 0 });
      }
      return out;
    })()`);
    all.push(...chunk);
  }
  return all;
}

async function main() {
  const health = await healthCheck();
  if (!health.success || !health.cdp_connected) throw new Error('CDP not connected');
  if (!/DE40/i.test(String(health.chart_symbol || ''))) throw new Error(`Chart symbol is ${health.chart_symbol}, not DE40 — aborting`);

  const original = await getState();

  console.error('\n== 5m ==');
  await setTimeframe({ timeframe: '5' });
  await sleep(2500);
  const info = await loadHistoryUntil(TARGET_SEC);
  console.error(`  loaded: ${info.size} bars, earliest ${new Date(info.firstTime * 1000).toISOString()}`);
  const bars = await extractAllBars();
  writeFileSync('/Users/boogy/tradingview-mcp/backtests/data_5m.json', JSON.stringify(bars));
  console.error(`  saved ${bars.length} bars -> data_5m.json (${new Date(bars[0].time * 1000).toISOString()} .. ${new Date(bars[bars.length - 1].time * 1000).toISOString()})`);

  await setTimeframe({ timeframe: original.resolution });
  await sleep(1000);
  await evaluate(`(function(){ var m=${CHART}._chartWidget.model(); m.timeScale().scrollToRealtime && m.timeScale().scrollToRealtime(true); })()`).catch(() => {});
  console.error('\nDone.');
  await disconnect();
  process.exit(0);
}

main().catch(async (e) => {
  console.error('FATAL', e.stack || e.message);
  await disconnect().catch(() => {});
  process.exit(1);
});
