/**
 * 6-month backtest of the DE40 pre-market scenario system — pure JS replay,
 * no TradingView involvement beyond the already-fetched OHLC data.
 *
 * Faithfulness: reuses the PRODUCTION detection + scenario code directly
 * (lib.mjs / briefing.mjs buildScenarios) including the live filters:
 *   - Scenario A: only B/B+ grades, hard-skip on opposing Order Block
 *   - Scenario C: only mornings (orb/main) + aligned with 4H trend
 *   - Scenario D: as implemented (mornings + aligned + consolidation/sweep/retest)
 *   - Dedup identical to run.mjs (type+direction+zone 0.1%, 3 days, pending only)
 *   - Outcome semantics identical to lib.checkScenarioOutcome (same-bar SL+TP
 *     ambiguity resolved as SL, i.e. conservative)
 *
 * Documented simplifications vs live:
 *   - 5min confirmation approximated with 15m bars (bars5 := tactical window)
 *   - No 12H-level dedup of 4H levels (12H levels aren't scenario inputs)
 *   - S/D level break-invalidation approximated: a 4H level is dropped after
 *     >= 2 4H closes through it since creation (live tracks wick-touch state)
 *   - Regime fixed to NORMAL (informational only, no scenario gating in live)
 *   - Sim runs at every 15m bar close 08:00-17:30 Berlin, Mon-Fri
 */
import { readFileSync, writeFileSync } from 'fs';
import * as lib from '../scripts/premarket/lib.mjs';
import { buildScenarios } from '../scripts/premarket/briefing.mjs';

const DIR = '/Users/boogy/tradingview-mcp/backtests';
const bars15All = JSON.parse(readFileSync(`${DIR}/data_15m.json`, 'utf8'));
const bars4hAll = JSON.parse(readFileSync(`${DIR}/data_4h.json`, 'utf8'));
const dailyAll = JSON.parse(readFileSync(`${DIR}/data_daily.json`, 'utf8'));

const SIM_START = Math.floor(Date.UTC(2026, 0, 5) / 1000); // Mon 05.01.2026 (first day has 15m warmup)
const STEP_MIN = Number(process.env.STEP_MIN || 15);       // 15 = every bar close; 60 = hourly (closer to live cadence)
const WINDOW = 500;                                        // live fetches 500 bars per TF
const REGIME = { regime: 'NORMAL', lotsize: 0.02, maxTrades: 2, requireFullConfluence: false };
const HTF_MAX_PCT = 0.05;
const SD_LEVEL_MAX_AGE_SEC = 15 * 24 * 3600;
const TACTICAL_MAX_AGE_SEC = 2 * 24 * 3600;
const DEDUP_TOLERANCE_PCT = 0.001;
const DEDUP_MAX_AGE_SEC = 3 * 24 * 3600;
const EXPIRY = {
  trend_bounce: 640, counter_trend: 640, momentum_continuation: 40, consolidation_breakout: 40,
  consolidation_breakout_fixed_m10: 40, consolidation_breakout_fixed_m13: 40, consolidation_breakout_fixed_m15: 40,
};

// ---- helpers ----------------------------------------------------------------

// Synthesize the still-forming 4H bar from 15m bars, exactly what the live
// chart's last bar shows mid-period.
function bars4hUpTo(nowSec) {
  const closed = [];
  for (const b of bars4hAll) {
    if (b.time + 4 * 3600 <= nowSec) closed.push(b);
    else if (b.time <= nowSec) {
      const parts = bars15All.filter(x => x.time >= b.time && x.time <= nowSec && x.time < b.time + 4 * 3600);
      if (parts.length) {
        closed.push({
          time: b.time,
          open: parts[0].open,
          high: Math.max(...parts.map(x => x.high)),
          low: Math.min(...parts.map(x => x.low)),
          close: parts[parts.length - 1].close,
          volume: 0,
        });
      }
    }
  }
  return closed.slice(-WINDOW);
}

function dailyClosedUpTo(nowSec) {
  // "yesterday" for PDHL = last fully completed daily bar
  return dailyAll.filter(b => b.time + 24 * 3600 <= nowSec).slice(-60);
}

// Live: level dies after 2 real breaks (close through). Approximate on 4H closes.
function breakCount(level, bars4h) {
  let n = 0;
  for (const b of bars4h) {
    if (b.time <= level.time) continue;
    if (level.type === 'demand' && b.close < level.price) n++;
    else if (level.type === 'supply' && b.close > level.price) n++;
  }
  return n;
}

// checkScenarioOutcome semantics, but also returns WHEN it resolved (bar index
// into bars15All) so pending-dedup can be evaluated at any sim time.
function resolveScenario(entry, expiryBars) {
  const startIdx = bars15All.findIndex(b => b.time > entry.loggedBarTime);
  if (startIdx === -1) return { outcome: 'open', resolvedIdx: Infinity, rr: 0 };
  const isLong = entry.direction === 'LONG';
  let touchIdx = -1;
  for (let i = startIdx; i < bars15All.length; i++) {
    const b = bars15All[i];
    if (b.low <= entry.zonePrice && entry.zonePrice <= b.high) { touchIdx = i; break; }
    if (i - startIdx + 1 >= expiryBars) return { outcome: 'not_triggered', resolvedIdx: i, rr: 0 };
  }
  if (touchIdx === -1) return { outcome: 'open', resolvedIdx: Infinity, rr: 0 };
  const slDist = Math.abs(entry.zonePrice - entry.sl);
  const rrTarget = slDist > 0 ? Math.abs(entry.target - entry.zonePrice) / slDist : 0;
  for (let i = touchIdx; i < bars15All.length; i++) {
    const b = bars15All[i];
    const hitSl = isLong ? b.low <= entry.sl : b.high >= entry.sl;
    const hitTarget = isLong ? b.high >= entry.target : b.low <= entry.target;
    if (hitSl) return { outcome: 'sl_hit', resolvedIdx: i, rr: -1 };          // same-bar ambiguity -> SL (conservative, like live)
    if (hitTarget) return { outcome: 'target_hit', resolvedIdx: i, rr: rrTarget };
    if (i - touchIdx >= expiryBars) return { outcome: 'expired_pending', resolvedIdx: i, rr: 0 };
  }
  return { outcome: 'open', resolvedIdx: Infinity, rr: 0 };
}

// ---- main replay loop --------------------------------------------------------

const simLog = [];
let steps = 0, daysSeen = new Set();
const t0 = Date.now();

for (let i = 0; i < bars15All.length; i++) {
  const bar = bars15All[i];
  const nowSec = bar.time + 15 * 60; // decisions at bar CLOSE
  if (nowSec < SIM_START) continue;

  const parts = lib.berlinDateTimeParts(nowSec);
  const dow = new Date(nowSec * 1000).getUTCDay();
  if (dow === 0 || dow === 6) continue;
  if (parts.minutesOfDay < 8 * 60 || parts.minutesOfDay > 17 * 60 + 30) continue;
  if (parts.minutesOfDay % STEP_MIN !== 0) continue;

  daysSeen.add(parts.dateStr);
  steps++;

  const tacticalBars = bars15All.slice(Math.max(0, i + 1 - WINDOW), i + 1);
  const bars4h = bars4hUpTo(nowSec);
  const dailyBars = dailyClosedUpTo(nowSec);
  const lastClose = bar.close;

  // --- trend / bias (same as run.mjs) ---
  const bos4h = lib.findBosEvents(bars4h);
  const lastBos = bos4h[bos4h.length - 1];
  const htfBias = lastBos ? lastBos.type : null;
  if (!htfBias) continue;
  const shortTermBias = lib.computeLastNBias(tacticalBars, 3);

  // --- active 4H S/D levels (distance + recency + not-broken-twice) ---
  const atrArr4h = lib.atr(bars4h, 14);
  const activeLevels4h = lib.findSDLevels(bars4h, { nowSec })
    .filter(l => lib.isPriceRelevant(l.price, l.price, lastClose, HTF_MAX_PCT))
    .filter(l => (nowSec - l.time) <= SD_LEVEL_MAX_AGE_SEC)
    .filter(l => breakCount(l, bars4h) < 2)
    .map(l => ({ type: l.type, price: l.price, atr: atrArr4h[l.index] ?? null }));

  // --- context objects (same recipes as run.mjs) ---
  const recentEnough = (t) => (nowSec - t) <= TACTICAL_MAX_AGE_SEC;
  const bosTactical = lib.findBosEvents(tacticalBars);
  const obs4hAll = lib.findOrderBlocks(bars4h, bos4h).filter(o => lib.isPriceRelevant(o.low, o.high, lastClose, HTF_MAX_PCT));
  const obsTactical = lib.findOrderBlocks(tacticalBars, bosTactical).filter(o => recentEnough(o.time));
  const reversalObs = [...obs4hAll, ...obsTactical].filter(o => !o.mitigated);
  const fvgsTactical = lib.findFVGs(tacticalBars).filter(g => lib.fvgFillFraction(g, tacticalBars) < 0.5).filter(g => recentEnough(g.time));
  const premiumDiscount = lib.computePremiumDiscount(bars4h, htfBias);
  const sweepMss = lib.findSweepMSS(tacticalBars).filter(r => recentEnough(r.mssTime)).pop() || null;
  const pdhl = lib.calculatePDHL(dailyBars);
  const tacticalAtrArr = lib.atr(tacticalBars, 14);
  const tacticalAtr = tacticalAtrArr[tacticalAtrArr.length - 1];
  const session = lib.classifySession(parts.minutesOfDay);

  // --- production scenario builder ---
  let scenarios = buildScenarios({
    htfBias, activeLevels4h, fvgsTactical, pdhl, lastClose, regime: REGIME,
    sweepMss, premiumDiscount, bars5: tacticalBars, nowSec, reversalObs,
    shortTermBias, tacticalAtr, tacticalBars, session,
  });

  // live post-filter from run.mjs: momentum only aligned + morning
  const momMorning = session.key === 'orb' || session.key === 'main';
  const momAligned = shortTermBias && shortTermBias === htfBias;
  scenarios = scenarios.filter(s => s.type !== 'momentum_continuation' || (momAligned && momMorning));

  // --- Scenario D (FIXED variant) ---
  // Production D can never fire: findConsolidationPhase anchors on the LAST
  // 5 bars of the window, then findLiquiditySweep/findRetestBreakout need
  // bars AFTER it — which don't exist at the live edge. Fixed version: allow
  // the consolidation to have ended k bars ago (k=3..12), sweep + retest
  // resolve within those k bars, and the retest-breakout candle must be the
  // CURRENT bar (entry now). Same thresholds, SL/target recipe, and filters
  // (mornings + aligned) as the production D block in briefing.mjs.
  if (momAligned && momMorning && tacticalBars.length > 40) {
    const bull = htfBias === 'bullish';
    const swings = lib.findSwings(tacticalBars, 2);
    // production multiplier 0.5 fires on 0.03% of 15m windows (measured) —
    // test data-driven alternatives side by side
    for (const [mult, tag] of [[1.0, 'm10'], [1.3, 'm13'], [1.5, 'm15']]) {
      for (let k = 3; k <= 12; k++) {
        const sub = tacticalBars.slice(0, tacticalBars.length - k); // indices align with tacticalBars
        if (sub.length < 20) break;
        const consolidation = lib.findConsolidationPhase(sub, 5, mult);
        if (!consolidation) continue;
        const sweep = lib.findLiquiditySweep(tacticalBars, consolidation, swings, htfBias);
        if (!sweep) continue;
        const retest = lib.findRetestBreakout(tacticalBars, consolidation, sweep, htfBias, 10);
        if (!retest || retest.retestBarIndex !== tacticalBars.length - 1) continue;
        const buffer = tacticalAtr ? tacticalAtr * 0.5 : Math.abs(retest.entryPrice) * 0.0015;
        const sl = bull
          ? Math.min(sweep.sweptLevel, consolidation.low) - buffer
          : Math.max(sweep.sweptLevel, consolidation.high) + buffer;
        const targetPool = activeLevels4h
          .filter(l => bull ? l.price > retest.entryPrice : l.price < retest.entryPrice)
          .map(l => l.price);
        const target = targetPool.length ? targetPool.sort((a, b) => bull ? a - b : b - a)[0] : null;
        if (target != null) {
          scenarios.push({
            type: `consolidation_breakout_fixed_${tag}`, direction: bull ? 'LONG' : 'SHORT',
            probability: 'B+', zonePrice: retest.entryPrice, sl, targets: [target],
          });
        }
        break;
      }
    }
  }

  // --- log with live dedup semantics ---
  for (const s of scenarios) {
    if (s.targets[0] == null) continue;
    const dup = simLog.some(e =>
      e.type === s.type && e.direction === s.direction &&
      Math.abs(e.zonePrice - s.zonePrice) <= Math.abs(s.zonePrice) * DEDUP_TOLERANCE_PCT &&
      (nowSec - e.loggedAtSec) < DEDUP_MAX_AGE_SEC &&
      e.resolvedIdx > i /* still pending at this sim time */);
    if (dup) continue;
    const entry = {
      type: s.type, direction: s.direction, grade: s.probability,
      zonePrice: s.zonePrice, sl: s.sl, target: s.targets[0],
      loggedAtSec: nowSec, loggedBarTime: bar.time,
      dateStr: parts.dateStr, minutesOfDay: parts.minutesOfDay, sessionKey: session.key,
      aligned: shortTermBias === htfBias,
    };
    const res = resolveScenario(entry, EXPIRY[s.type] ?? 40);
    entry.outcome = res.outcome;
    entry.resolvedIdx = res.resolvedIdx;
    entry.rr = res.rr;
    simLog.push(entry);
  }
}

// ---- aggregate ----------------------------------------------------------------

function agg(entries) {
  const wins = entries.filter(e => e.outcome === 'target_hit');
  const losses = entries.filter(e => e.outcome === 'sl_hit');
  const expired = entries.filter(e => e.outcome === 'expired_pending');
  const notTrig = entries.filter(e => e.outcome === 'not_triggered');
  const open = entries.filter(e => e.outcome === 'open');
  const resolved = wins.length + losses.length;
  const sumR = entries.reduce((s, e) => s + e.rr, 0);
  return {
    total: entries.length, wins: wins.length, losses: losses.length,
    expired: expired.length, not_triggered: notTrig.length, open: open.length,
    winRate: resolved ? +(wins.length / resolved * 100).toFixed(1) : null,
    expR: resolved ? +(sumR / resolved).toFixed(2) : null,
    avgWinRR: wins.length ? +(wins.reduce((s, e) => s + e.rr, 0) / wins.length).toFixed(2) : null,
  };
}

const byType = {};
for (const t of [...new Set(simLog.map(e => e.type))]) byType[t] = agg(simLog.filter(e => e.type === t));

const byGrade = {};
for (const t of Object.keys(byType)) {
  byGrade[t] = {};
  for (const g of ['B+', 'B', 'C']) {
    const sub = simLog.filter(e => e.type === t && e.grade === g);
    if (sub.length) byGrade[t][g] = agg(sub);
  }
}

// session split for momentum sanity-check
const bySession = {};
for (const t of Object.keys(byType)) {
  const morning = simLog.filter(e => e.type === t && e.minutesOfDay < 11 * 60 + 30);
  const later = simLog.filter(e => e.type === t && e.minutesOfDay >= 11 * 60 + 30);
  bySession[t] = { morning: agg(morning), afternoon: agg(later) };
}

// monthly breakdown (overall)
const byMonth = {};
for (const e of simLog) {
  const m = e.dateStr.slice(0, 7);
  byMonth[m] = byMonth[m] || [];
  byMonth[m].push(e);
}
const monthly = Object.fromEntries(Object.entries(byMonth).sort().map(([m, es]) => [m, agg(es)]));

const out = {
  simulatedAt: null, // stamped by caller
  window: { from: new Date(SIM_START * 1000).toISOString().slice(0, 10), to: bars15All[bars15All.length - 1] ? new Date(bars15All[bars15All.length - 1].time * 1000).toISOString().slice(0, 10) : null },
  tradingDays: daysSeen.size, simSteps: steps, scenariosLogged: simLog.length,
  overall: agg(simLog), byType, byGrade, bySession, monthly,
  runtimeMs: Date.now() - t0,
};

const suffix = STEP_MIN === 15 ? '' : `_${STEP_MIN}min`;
writeFileSync(`${DIR}/sim_6m_results${suffix}.json`, JSON.stringify(out, null, 2));
writeFileSync(`${DIR}/sim_6m_log${suffix}.json`, JSON.stringify(simLog, null, 2));
console.log(JSON.stringify(out, null, 2));
