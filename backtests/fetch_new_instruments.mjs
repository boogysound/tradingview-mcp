/**
 * Generalized version of fetch_history_6m.mjs / fetch_5m.mjs — fetches
 * history for arbitrary (symbol, timeframe) pairs needed for the S1/S5/
 * DailyDax reimplementations (30.07.2026), then restores the chart to its
 * original symbol/resolution (GBEBROKERS:DE40) so the live de40-* launchd
 * automation isn't left pointed at the wrong instrument.
 */
import { writeFileSync } from 'fs';
import { evaluate, disconnect } from '../src/connection.js';
import { setSymbol, setTimeframe, getState } from '../src/core/chart.js';
import { healthCheck } from '../src/core/health.js';

const CHART = 'window.TradingViewApi._activeChartWidgetWV.value()';
const BARS = `${CHART}._chartWidget.model().mainSeries().bars()`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const JOBS = [
  { symbol: 'GBEBROKERS:USTEC', tf: '60', label: 'ustec_1h', targetSec: Math.floor(Date.UTC(2026, 0, 5) / 1000) },
  { symbol: 'GBEBROKERS:USTEC', tf: '15', label: 'ustec_15m', targetSec: Math.floor(Date.UTC(2026, 0, 5) / 1000) },
  { symbol: 'GBEBROKERS:DE40', tf: '30', label: 'de40_30m', targetSec: Math.floor(Date.UTC(2026, 0, 5) / 1000) },
];

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

async function fetchOne({ symbol, tf, label, targetSec }) {
  console.error(`\n== ${label} (${symbol}, tf=${tf}) ==`);
  await setSymbol({ symbol });
  await sleep(2500);
  await setTimeframe({ timeframe: tf });
  await sleep(2500);
  const info = await loadHistoryUntil(targetSec);
  console.error(`  loaded: ${info.size} bars, earliest ${new Date(info.firstTime * 1000).toISOString()}`);
  const bars = await extractAllBars();
  writeFileSync(`/Users/boogy/tradingview-mcp/backtests/data_${label}.json`, JSON.stringify(bars));
  console.error(`  saved ${bars.length} bars -> data_${label}.json (${bars[0] ? new Date(bars[0].time * 1000).toISOString() : '?'} .. ${new Date(bars[bars.length - 1].time * 1000).toISOString()})`);
  return bars.length;
}

async function main() {
  const health = await healthCheck();
  if (!health.success || !health.cdp_connected) throw new Error('CDP not connected');
  const original = await getState();
  console.error(`Original chart: ${original.symbol} @ ${original.resolution}`);

  const results = {};
  try {
    for (const job of JOBS) {
      try {
        results[job.label] = await fetchOne(job);
      } catch (e) {
        console.error(`  FAILED ${job.label}: ${e.message}`);
        results[job.label] = `ERROR: ${e.message}`;
      }
    }
  } finally {
    // Runs even if something above throws past the per-job try/catch (e.g. a
    // CDP hiccup between jobs) — found live 19.08.2026: the chart was stuck
    // on GBEBROKERS:DE40 (last job's symbol) for days with no TradingView
    // restart in between, because this restore previously only ran after a
    // clean loop exit, and the outer main().catch() below never actually
    // restored anything despite its "best-effort restore" comment.
    await setSymbol({ symbol: original.symbol }).catch((e) => console.error(`  restore setSymbol failed: ${e.message}`));
    await sleep(2000);
    await setTimeframe({ timeframe: original.resolution }).catch((e) => console.error(`  restore setTimeframe failed: ${e.message}`));
    await sleep(1000);
    await evaluate(`(function(){ var m=${CHART}._chartWidget.model(); m.timeScale().scrollToRealtime && m.timeScale().scrollToRealtime(true); })()`).catch(() => {});
    console.error(`\nDone. Chart restored to ${original.symbol} @ ${original.resolution}.`);
  }
  console.error(JSON.stringify(results, null, 2));
  await disconnect();
  process.exit(0);
}

main().catch(async (e) => {
  console.error('FATAL', e.stack || e.message);
  // Symbol/timeframe restore now happens in main()'s own finally block
  // (wraps the fetch loop), so nothing left to do here on failure.
  await disconnect().catch(() => {});
  process.exit(1);
});
