/**
 * Backtest: "wie erfolgreich ist es, bestätigte MS als Entry-Trigger zu
 * verwenden" (09.07.2026). Uses lib.detectMarketShiftEvents to replay every
 * historical confirmed-MS event on 1H (8.5 months, data_1h.json) and 5min
 * (1.75 months — feed's real depth limit, data_5m.json), then simulates a
 * trade at each confirmation:
 *   - Entry: confirmPoint's own candle close (same price the live system
 *     would see the moment confirmation fires).
 *   - SL: the still-standing opposite reference (`level`, the same
 *     "must not be reclaimed" threshold detectMarketShift itself would show
 *     live) + a buffer, mirroring Scenario B's tuned 0.0018 buffer.
 *   - Target: several R-multiples tested (1/1.5/2/3), same methodology as
 *     the B/C parameter sweeps.
 * Same-bar SL+TP ambiguity counts as SL throughout (conservative, matches
 * every other backtest in this repo). No fixed expiry — walks forward to
 * either hit or end of data (marked "open" if neither hit yet).
 */
import { readFileSync, writeFileSync } from 'fs';
import * as lib from '../scripts/premarket/lib.mjs';

const SL_BUFFER_PCT = 0.0018;
const R_MULTIPLES = [1, 1.5, 2, 3];

function simulateTrade(bars, entryIndex, direction, slLevel, targets) {
  const entryPrice = bars[entryIndex].close;
  const slBuffer = Math.abs(slLevel) * SL_BUFFER_PCT;
  const sl = direction === 'bearish' ? slLevel + slBuffer : slLevel - slBuffer;
  const slDist = Math.abs(entryPrice - sl);
  if (slDist <= 0) return null;

  const results = {};
  for (const r of targets) {
    const tp = direction === 'bearish' ? entryPrice - r * slDist : entryPrice + r * slDist;
    let outcome = 'open';
    for (let i = entryIndex + 1; i < bars.length; i++) {
      const b = bars[i];
      const hitSl = direction === 'bearish' ? b.high >= sl : b.low <= sl;
      const hitTp = direction === 'bearish' ? b.low <= tp : b.high >= tp;
      if (hitSl && hitTp) { outcome = 'sl_hit'; break; } // same-bar ambiguity -> SL (conservative)
      if (hitSl) { outcome = 'sl_hit'; break; }
      if (hitTp) { outcome = 'target_hit'; break; }
    }
    results[r] = outcome;
  }
  return { entryPrice, sl, slDist, results };
}

function runBacktest(bars, label) {
  const events = lib.detectMarketShiftEvents(bars, 2);
  const trades = [];
  for (const ev of events) {
    const entryIndex = ev.confirmPoint.index;
    const sim = simulateTrade(bars, entryIndex, ev.direction, ev.level, R_MULTIPLES);
    if (!sim) continue;
    trades.push({
      timeframe: label,
      direction: ev.direction,
      confirmTime: ev.confirmPoint.time,
      brokenLevel: ev.brokenLevel.price,
      brokenLevelTime: ev.brokenLevel.time,
      level: ev.level,
      entryPrice: sim.entryPrice,
      sl: sim.sl,
      slDist: sim.slDist,
      outcomes: sim.results,
    });
  }

  const summary = {};
  for (const r of R_MULTIPLES) {
    const wins = trades.filter(t => t.outcomes[r] === 'target_hit').length;
    const losses = trades.filter(t => t.outcomes[r] === 'sl_hit').length;
    const open = trades.filter(t => t.outcomes[r] === 'open').length;
    const resolved = wins + losses;
    const winRate = resolved > 0 ? (wins / resolved * 100) : null;
    const expR = resolved > 0 ? ((wins * r - losses * 1) / resolved) : null;
    summary[r] = { total: trades.length, wins, losses, open, winRate, expR };
  }

  const byDirection = {};
  for (const dir of ['bullish', 'bearish']) {
    byDirection[dir] = {};
    const dirTrades = trades.filter(t => t.direction === dir);
    for (const r of R_MULTIPLES) {
      const wins = dirTrades.filter(t => t.outcomes[r] === 'target_hit').length;
      const losses = dirTrades.filter(t => t.outcomes[r] === 'sl_hit').length;
      const resolved = wins + losses;
      byDirection[dir][r] = {
        total: dirTrades.length, wins, losses,
        winRate: resolved > 0 ? (wins / resolved * 100) : null,
        expR: resolved > 0 ? ((wins * r - losses * 1) / resolved) : null,
      };
    }
  }

  return { label, tradeCount: trades.length, summary, byDirection, trades };
}

async function main() {
  const bars1h = JSON.parse(readFileSync('/Users/boogy/tradingview-mcp/backtests/data_1h.json', 'utf8'));
  const bars5m = JSON.parse(readFileSync('/Users/boogy/tradingview-mcp/backtests/data_5m.json', 'utf8'));

  const result1h = runBacktest(bars1h, '1H');
  const result5m = runBacktest(bars5m, '5m');

  console.log(JSON.stringify({
    window: {
      '1h': { from: new Date(bars1h[0].time * 1000).toISOString(), to: new Date(bars1h[bars1h.length - 1].time * 1000).toISOString(), bars: bars1h.length },
      '5m': { from: new Date(bars5m[0].time * 1000).toISOString(), to: new Date(bars5m[bars5m.length - 1].time * 1000).toISOString(), bars: bars5m.length },
    },
    '1H': { tradeCount: result1h.tradeCount, summary: result1h.summary, byDirection: result1h.byDirection },
    '5m': { tradeCount: result5m.tradeCount, summary: result5m.summary, byDirection: result5m.byDirection },
  }, null, 2));

  writeFileSync('/Users/boogy/tradingview-mcp/backtests/sim_ms_entry_results.json', JSON.stringify({ result1h, result5m }, null, 2));
}

main().catch((e) => { console.error('FATAL', e.stack || e.message); process.exit(1); });
