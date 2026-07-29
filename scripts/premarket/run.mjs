import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { getState, setTimeframe } from '/Users/boogy/tradingview-mcp/src/core/chart.js';
import { healthCheck } from '/Users/boogy/tradingview-mcp/src/core/health.js';
import { captureScreenshot } from '/Users/boogy/tradingview-mcp/src/core/capture.js';
import { disconnect } from '/Users/boogy/tradingview-mcp/src/connection.js';
import * as lib from './lib.mjs';
import * as state from './state.mjs';
import { getBerlinHour, fetchBars, sleep, readOrbVwap } from './utils.mjs';
import { draw, remove, verifyDottedLinestyleCode, rgbaToTvOverride, COLORS, getLiveShapeIds, drawScenarioLevels } from './draw.mjs';
import { buildScenarios, buildBriefing } from './briefing.mjs';
import { sendTelegramBriefing, sendTelegramPhoto } from './telegram.mjs';
import { checkAndAlertMarketShifts } from './ms_alerts.mjs';
import { checkAndAlertFullConfluence } from './scenario_alerts.mjs';

const MIN_15M_BARS = 300; // threshold below which we treat 15min history as "insufficient" (precondition 0.3)

async function main() {
  const dataWarnings = [];
  const nowSec = Math.floor(new Date().getTime() / 1000) || Math.floor(Date.now() / 1000);
  const nowIso = new Date().toISOString();
  const forceRegimeReset = process.argv.includes('--reset-regime');

  // --- 0. Preconditions ---
  const health = await healthCheck();
  if (!health.success || !health.cdp_connected) {
    console.error(JSON.stringify({ success: false, aborted: true, reason: 'tv_health_check fehlgeschlagen', health }, null, 2));
    await disconnect().catch(() => {});
    process.exit(1);
  }

  const original = await getState();

  // symbol is expected to already be DE40 on this chart; a no-op setSymbol
  // call is risky if the exact ticker differs across brokers, so we only
  // warn rather than force-set it.
  if (!/DE40/i.test(String(health.chart_symbol || ''))) {
    dataWarnings.push(`Chart-Symbol war "${health.chart_symbol}", nicht DE40 — bitte manuell prüfen (kein automatisches setSymbol ausgeführt, um keinen falschen Broker-Ticker zu erzwingen).`);
  }

  const zonesState = state.readState();

  // --- reconcile local state against what's actually drawn on the chart ---
  // Protects against drift (state file reset/edited by hand, or a drawing
  // manually deleted in TradingView): any tracked entry whose shape no longer
  // exists on the chart is marked removed here, so later duplicate-checks and
  // redraws work off reality instead of a stale bookkeeping file.
  const liveShapeIds = await getLiveShapeIds();
  let orphanedCount = 0;
  for (const entry of zonesState) {
    if (entry.status !== 'active' && entry.status !== 'breached' && entry.status !== 'historical') continue;
    if (!liveShapeIds.has(entry.tv_entity_id)) {
      entry.status = 'removed';
      entry.removed_at = nowIso;
      entry.removed_reason = 'orphaned_not_on_chart';
      orphanedCount++;
    }
  }
  if (orphanedCount) dataWarnings.push(`${orphanedCount} Zone(n) waren im State aktiv, aber nicht mehr im Chart (manuell gelöscht?) — aus dem State entfernt.`);

  // --- fetch OHLC across timeframes ---
  const bars12h = await fetchBars(720, 500);
  const bars4h = await fetchBars(240, 500);
  const bars15 = await fetchBars(15, 500);
  const bars1h = await fetchBars(60, 500);

  let bars5 = [];
  try { bars5 = await fetchBars(5, 500); } catch (e) { dataWarnings.push(`5min-Bars für Entry-Bestätigung nicht verfügbar: ${e.message}`); }

  // User's own ORB + VWAP indicators (already active on their chart) — must
  // be read HERE, right after the 5m fetch, before dailyBars below switches
  // the chart away to 'D' (user-confirmed: only reliably readable on 5m).
  let orbVwap = { vwap: null, orbHigh: null, orbLow: null };
  try { orbVwap = await readOrbVwap(); } catch (e) { dataWarnings.push(`ORB/VWAP nicht lesbar: ${e.message}`); }

  let dailyBars = null;
  try { dailyBars = await fetchBars('D', 60); } catch (e) { dataWarnings.push(`Daily-Bars für Overnight-Gap nicht verfügbar: ${e.message}`); }

  await setTimeframe({ timeframe: original.resolution });
  // Drawing shapes too soon after a timeframe switch can snap the anchor to a
  // stale/not-yet-rendered bar near the live edge (observed: a rectangle drawn
  // right after this switch landed exactly 10 bars — 9000s on 15min — earlier
  // than requested). Give the chart time to fully catch up before any draw().
  await sleep(2000);

  let tacticalTf = 15, tacticalBars = bars15;
  if (bars15.length < MIN_15M_BARS) {
    dataWarnings.push(`15min-Historie unzureichend (${bars15.length} Bars < ${MIN_15M_BARS}) — auf 1H als Zonen-/S-R-Kontext ausgewichen (Precondition 0.3).`);
    tacticalTf = 60; tacticalBars = bars1h;
  }

  const lastClose = tacticalBars[tacticalBars.length - 1].close;

  // --- regime: fixed once per Berlin trading day, not re-evaluated intraday
  // unless explicitly reset (see scripts/premarket/premarket_prompt notes) ---
  const regimeDateKey = lib.berlinDateTimeParts(nowSec).dateStr;
  const storedRegime = forceRegimeReset ? null : state.readDailyRegime();
  let regime;
  if (storedRegime && storedRegime.date === regimeDateKey) {
    regime = storedRegime.regime;
  } else {
    regime = lib.classifyRegime({ dailyBars, bars4h, tacticalBars, lastClose, nowSec });
    state.writeDailyRegime(regimeDateKey, regime);
  }

  // --- 2. swings + 3. MSS/BOS per timeframe ---
  const bos12h = lib.findBosEvents(bars12h);
  const bos4h = lib.findBosEvents(bars4h);
  const bos1h = lib.findBosEvents(bars1h);
  const bosTactical = lib.findBosEvents(tacticalBars);

  // --- 6. S/D zones (HTF) ---
  // HTF zones/OBs that price never revisited stay "active" indefinitely under
  // pure mitigation logic even once months old and far away — a 5% price-
  // distance relevance filter drops those, keeping only practically tradeable
  // zones (user-set threshold).
  const HTF_MAX_PCT_DISTANCE = 0.05;
  const isRelevant = (z) => lib.isPriceRelevant(z.low, z.high, lastClose, HTF_MAX_PCT_DISTANCE);
  const zones12h = lib.findSDZones(bars12h, bos12h, 3).filter(isRelevant);
  const zones4h = lib.findSDZones(bars4h, bos4h, 3).filter(isRelevant);

  // S/D Levels: the user's actual manual-drawing style (single price = open
  // of the last opposite candle before a move), separate from the zones12h/
  // zones4h range-based objects above (which still drive entry candidates).
  // Recency window matches the calibration exercise (15 days) — without it,
  // the 5%-distance filter alone let through dozens of levels from months
  // ago that price had simply drifted back near, cluttering the chart.
  const SD_LEVEL_MAX_AGE_SEC = 15 * 24 * 3600;
  const levelIsRelevant = (lvl) => lib.isPriceRelevant(lvl.price, lvl.price, lastClose, HTF_MAX_PCT_DISTANCE) && (nowSec - lvl.time) <= SD_LEVEL_MAX_AGE_SEC;
  // Once a level converts to an S/R line its `type` changes to sr_flip_*, so
  // the normal same-type findDuplicate check no longer sees it — without this,
  // a fresh candidate for the same underlying candle gets redrawn, touched
  // twice again, and converted into a SECOND S/R line at the same spot.
  // Keyed on created_bar_time (the candle's own time — deterministic, never
  // changes) rather than status==='active' or price proximity: relying on
  // live-shape reconciliation to have already caught orphans first is fragile
  // (a momentary CDP listing hiccup would silently let a duplicate through).
  // Excludes only status==='removed' (a genuinely invalidated/deleted level
  // — those should be free to be redetected), matching demand<->support and
  // supply<->resistance since that's the same underlying level pre/post-flip.
  // A candle removed for 'sd_level_not_respected' (2+ real breaks) is
  // permanently resolved — price has already proven it doesn't hold there,
  // so it must never be redrawn as a fresh, apparently-unbroken level again.
  // Without this, removing it just freed up the exact same created_bar_time
  // for redetection on the very next run (found live: 10 legitimately-broken
  // levels got removed by the break-count fix, then several of them
  // immediately reappeared as "new" levels moments later).
  const alreadyTracked = (lvl, timeframe) => {
    const equivTypes = lvl.type === 'demand'
      ? ['sd_level_demand', 'sr_flip_support']
      : ['sd_level_supply', 'sr_flip_resistance'];
    return zonesState.some(o => o.timeframe === timeframe && equivTypes.includes(o.type) &&
      o.created_bar_time === lvl.time &&
      (o.status !== 'removed' || o.removed_reason === 'sd_level_not_respected'));
  };
  // Was 0.4% (~103pts) — found via live debugging to be far too wide: with
  // multiple legitimate, distinct 12H levels only ~140pts apart, their
  // tolerance radii overlapped into a continuous "wall" that blocked EVERY
  // 4H candidate, not just genuine same-candle duplicates. 0.05% (~13pts)
  // still catches the original intended case (12H/4H sharing a candle
  // boundary, differing by a few points) without the wall effect.
  const NEAR_12H_PCT = 0.0005;
  // Existing active 12H levels — needed both to self-dedupe fresh 12H
  // candidates against each other (see below) and for the 4H-vs-12H
  // near12h check further down.
  const existing12hPrices = zonesState
    .filter(o => o.status !== 'removed' && o.timeframe === 720 && (o.type === 'sd_level_demand' || o.type === 'sd_level_supply' || o.type === 'sr_flip_support' || o.type === 'sr_flip_resistance'))
    .map(o => ({ type: o.type === 'sr_flip_support' ? 'demand' : o.type === 'sr_flip_resistance' ? 'supply' : (o.type === 'sd_level_demand' ? 'demand' : 'supply'), price: o.price_low }));
  // 12H levels were never deduped against EACH OTHER (only 4H-vs-12H was) —
  // over time this let many near-identical 12H levels 15-20 points apart
  // accumulate into a dense "wall" that then blocked almost every 4H
  // candidate via the near12h check below (found via live debugging: 33
  // relevant 4H candidates, 0 survived near12h). Self-dedupe: skip a fresh
  // 12H candidate if an existing active 12H level is already within the same
  // tolerance. Deliberately type-agnostic (demand vs. supply, not just
  // demand-vs-demand): a Demand and a Supply level 2pts apart are just as
  // redundant/confusing on the chart as two Demands would be — same fix as
  // the cross-type case found live on 4H, 29.07.2026 (see near4hSelf below).
  const near12hSelf = (lvl) => existing12hPrices.some(l12 => Math.abs(l12.price - lvl.price) <= l12.price * NEAR_12H_PCT);
  const sdLevels12h = lib.findSDLevels(bars12h, { nowSec }).filter(levelIsRelevant).filter(lvl => !alreadyTracked(lvl, 720)).filter(lvl => !near12hSelf(lvl));
  // 12H takes priority over 4H (user-specified): a 4H level within 0.4% of an
  // existing/new 12H level of the same type is redundant — the 12H is the
  // one more likely to be respected, so drop the 4H duplicate before drawing.
  // Checks BOTH freshly-detected 12H candidates AND already-tracked active
  // 12H entries in state — the fresh candidates alone miss 12H levels that
  // were created in an earlier run (alreadyTracked has already excluded them
  // from sdLevels12h by this point, so they'd otherwise be invisible here).
  const all12hLevels = [...sdLevels12h, ...existing12hPrices];
  const near12h = (lvl) => all12hLevels.some(l12 => l12.type === lvl.type && Math.abs(l12.price - lvl.price) <= l12.price * NEAR_12H_PCT);
  // 4H levels had the exact same self-dedupe gap 12H had before near12hSelf was
  // added above — user-reported live, 29.07.2026: two active 4H levels at
  // 25511.78 (Supply) and 25509.71 (Demand), only 2pts apart. Both render in
  // the same orange (sd_level_4h color is keyed by timeframe, not type — see
  // draw.mjs COLORS), so on the chart they read as indistinguishable clutter
  // regardless of the actual demand/supply label. Same fix, same tolerance,
  // deliberately type-agnostic for the same reason as near12hSelf above: skip
  // a fresh 4H candidate if ANY existing active 4H level (demand OR supply)
  // is already within range (the post-hoc cleanup block further down handles
  // any near-duplicates that still slip through within the same detection
  // batch).
  const existing4hPrices = zonesState
    .filter(o => o.status !== 'removed' && o.timeframe === 240 && (o.type === 'sd_level_demand' || o.type === 'sd_level_supply' || o.type === 'sr_flip_support' || o.type === 'sr_flip_resistance'))
    .map(o => ({ price: o.price_low }));
  const near4hSelf = (lvl) => existing4hPrices.some(l4 => Math.abs(l4.price - lvl.price) <= l4.price * NEAR_12H_PCT);
  const sdLevels4h = lib.findSDLevels(bars4h, { nowSec }).filter(levelIsRelevant).filter(lvl => !alreadyTracked(lvl, 240)).filter(lvl => !near12h(lvl)).filter(lvl => !near4hSelf(lvl));

  // --- 4. Order blocks + 5. FVGs ---
  // Order Blocks (user definition): last opposite-colour candle before an
  // impulse that BOTH creates an FVG/imbalance AND leads to a confirmed BOS —
  // computed on 12H/4H (like S/D zones) as well as the tactical timeframe.
  // Detection runs on the full window (fractals/BOS need surrounding context),
  // but section 9.3 defines 15min objects as tactical/near-term only — so
  // patterns older than the same 2-trading-day threshold used for staleness
  // are dropped here rather than drawn-then-immediately-purged next run.
  const TACTICAL_MAX_AGE_SEC = 2 * 24 * 3600;
  const recentEnough = (t) => (nowSec - t) <= TACTICAL_MAX_AGE_SEC;
  const obs12h = lib.findOrderBlocks(bars12h, bos12h).filter(isRelevant);
  const obs4h = lib.findOrderBlocks(bars4h, bos4h).filter(isRelevant);
  const obsTactical = lib.findOrderBlocks(tacticalBars, bosTactical).filter(o => recentEnough(o.time));
  const fvgsTactical = lib.findFVGs(tacticalBars).filter(g => lib.fvgFillFraction(g, tacticalBars) < 0.5).filter(g => recentEnough(g.time));
  // 12H/4H FVGs for the new Scenario A's bonus confirmation (user-specified:
  // "FVGs bitte in 12h, 4h und 15min finden") — price-distance filtered like
  // other 12H/4H objects, not time-filtered (a 2-day recency window makes no
  // sense on these slower timeframes).
  const fvgs12h = lib.findFVGs(bars12h).filter(g => lib.fvgFillFraction(g, bars12h) < 0.5).filter(isRelevant);
  const fvgs4h = lib.findFVGs(bars4h).filter(g => lib.fvgFillFraction(g, bars4h) < 0.5).filter(isRelevant);

  // 1H and 5min OBs were previously invisible to the system entirely (only
  // 12H/4H/tactical were scanned) — added after finding real, price-relevant
  // OBs on both that the old scope missed. Skip 1H if it's already the
  // tactical timeframe (15min-insufficient fallback) to avoid double-drawing
  // the same candles under two different loops.
  const obs1h = tacticalTf === 60 ? [] : lib.findOrderBlocks(bars1h, lib.findBosEvents(bars1h)).filter(o => recentEnough(o.time));
  const obs5m = bars5.length ? lib.findOrderBlocks(bars5, lib.findBosEvents(bars5)).filter(o => recentEnough(o.time)) : [];

  // --- 7. S/R (tactical tf) ---
  const srLevels = lib.findSRLevels(tacticalBars, { tolerancePct: 0.0005, maxLevels: 8 });

  // --- Trend bias from most recent confirmed 4H BOS ---
  // Switched from 12H after simulation showed 12H BOS is too infrequent/slow
  // to react — it can stay stuck on a stale bias for months after price has
  // already reversed (e.g. stayed "bearish" for 3.5 months in one dataset
  // while 4H had already flipped bullish). 4H hit ~55-60% vs 12H's ~40-45%
  // on predicting forward price direction over 10/20/40-bar horizons.
  const lastBos4hForTrend = bos4h[bos4h.length - 1];
  const htfBias = lastBos4hForTrend ? lastBos4hForTrend.type : null;

  // Trend for the new Scenario A ("Trend-Reversal-Fade an POI", 28.07.2026,
  // user-specified) is deliberately on 1H, not 4H — kept separate from B/D's
  // htfBias rather than reused, since the user's refined timeframe hierarchy
  // for A specifically calls for 1H trend determination.
  const lastBos1hForA = bos1h[bos1h.length - 1];
  const aHtfBias = lastBos1hForA ? lastBos1hForA.type : null;

  // Short-term bias: momentum (last 3 tactical candles), not BOS — calibrated
  // against real data showing BOS lags too much for a "what just happened"
  // read (see computeLastNBias in lib.mjs). Can disagree with the 4H
  // medium-term trend (e.g. a sharp intraday pullback against an unbroken 4H
  // uptrend), which is itself useful information, not a contradiction.
  const shortTermBias = lib.computeLastNBias(tacticalBars, 3);

  // --- Market Shift (MS) detection — HTF (1H) and LTF (5min), independently ---
  // User-specified, 09.07.2026: only potential/confirmed MS markers now (the
  // earlier HH/HL/LH/LL swing labels and entry markers are removed
  // entirely — "mir gefällt das Ergebnis nicht... zeige mir nur potenzielle
  // Marketshifts und bestätigte Marketshifts an"). See detectMarketShift in
  // lib.mjs for the exact potential/confirmed/invalidated state machine.
  //
  // HTF is 1H, not 4H: checked live against real data (09.07.2026) — 4H was
  // still stuck at "potential" (the low had broken, but no 4H high had yet
  // formed to confirm or deny it) while 1H had ALREADY resolved to
  // "confirmed" on the same underlying move, simply because more 1H swings
  // had had the chance to form in the same wall-clock time. The user's own
  // hunch ("ich glaube, dass der 1h chart besser geeignet ist") checked out.
  // Detection + Telegram alerting + chart-marker drawing all live in
  // ms_alerts.mjs now, shared with check_ms.mjs's frequent standalone check
  // (every ~10min via its own launchd job) — see that file for why alerts
  // moved off a time-based cooldown onto signature-based dedup, and why 1H/4H
  // alerting was added alongside the pre-existing 5min-only path.
  const { htfMs } = await checkAndAlertMarketShifts({ bars5, bars1h, bars4h });

  // --- section 9: invalidation/mitigation pass on tracked state ---
  const barsByTf = { 720: bars12h, 240: bars4h, 60: bars1h, 15: bars15, 5: bars5 };
  const removedLog = [];
  const breachedLog = [];

  // User-reported, 29.07.2026 (live-verified): saw duplicate PDH lines and
  // 4H levels, plus mitigated FVGs still on the chart. Root cause: every
  // removal site below unconditionally set `status = 'removed'` right after
  // calling remove(), without checking whether the CDP call actually
  // succeeded. remove() returns `{removed: false}` (success:true, but the
  // shape is still there — e.g. a transient CDP/timing hiccup) in a
  // genuinely-failed case, vs `{ok: false, error: 'Shape not found...'}`
  // when the shape was already gone (harmless — nothing to orphan). Treating
  // BOTH as "done" meant a failed-but-still-present shape got marked removed
  // anyway; once >7 days old, PRUNE_AGE_SEC deletes the state record
  // entirely, leaving the shape stranded on the chart forever with no
  // tracking left to ever clean it up. Found live: 14 such orphans (9 S/D-
  // level rays, 3 zone/FVG rectangles, 2 PDH/PDL lines) — see cleanup script
  // referenced in the handover, Teil 8.
  function wasActuallyRemoved(r) {
    if (r?.removed === true) return true;
    if (r?.ok === false && /not found/i.test(r.error || '')) return true; // already gone — nothing to orphan
    return false;
  }

  // Moved up from its original spot further down (after the S/R drawing loop)
  // so blocks that run earlier in this section — breach/level conversion to
  // S/R lines — can safely reference it too (they were doing so before this
  // was defined, a latent ReferenceError bug that never fired only because
  // those code paths had zero matching entries in every run so far).
  const dottedCheck = await verifyDottedLinestyleCode();
  if (!dottedCheck.verified) dataWarnings.push(`Linestyle-Code für "gepunktet" nicht verifiziert (Annahme: 2). Detail: ${JSON.stringify(dottedCheck)}`);
  const dottedCode = dottedCheck.verified ? dottedCheck.assumed : (dottedCheck.reported ?? 2);

  // sd_level_demand/supply were missing from this list — meaning once drawn,
  // they never got cleaned up as price drifted away, only ever removed via
  // an actual break. Found by noticing the OBSERVE section listing 9 stale
  // 12H levels, most far from current price.
  const HTF_ZONE_TYPES = ['sd_zone_demand', 'sd_zone_supply', 'order_block_bullish', 'order_block_bearish', 'sd_level_demand', 'sd_level_supply'];
  for (const entry of zonesState) {
    if (entry.status !== 'active' && entry.status !== 'breached' && entry.status !== 'historical') continue;
    let shouldRemove = false, reason = null;

    // Remove all S/R levels (user no longer needs them)
    if (entry.type === 'sr_support' || entry.type === 'sr_resistance') { shouldRemove = true; reason = 'sr_disabled'; }
    // PDHL entries are recalculated once per day, not once per run — comparing
    // only the date part of created_at keeps them alive across repeated runs
    // within the same day. Without this check, findDuplicate() below never
    // matches (it only counts active/historical entries), so every single
    // run pushed a fresh pdh/pdl entry and redrew the TV shape, even when
    // nothing had changed — found via 70 duplicate pdh_0_... entries in
    // zones.json from a single day of frequent testing.
    else if ((entry.type === 'pdh' || entry.type === 'pdl') && entry.created_at?.slice(0, 10) !== nowIso.slice(0, 10)) { shouldRemove = true; reason = 'pdhl_daily_refresh'; }
    // HTF zones/OBs (12H/4H) that price has drifted more than 5% away from —
    // no longer practically tradeable, even if never price-invalidated.
    else if ((entry.timeframe === 720 || entry.timeframe === 240) && HTF_ZONE_TYPES.includes(entry.type) &&
      !lib.isPriceRelevant(entry.price_low, entry.price_high, lastClose, HTF_MAX_PCT_DISTANCE)) {
      shouldRemove = true; reason = 'htf_out_of_range';
    }
    // A 4H S/D level within 0.4% of an active 12H level of the same type is
    // redundant — 12H has priority (user-specified), drop the 4H duplicate
    // even if the 12H one only became active/nearby after this 4H was drawn.
    else if (entry.timeframe === 240 && (entry.type === 'sd_level_demand' || entry.type === 'sd_level_supply') &&
      zonesState.some(o => o.status === 'active' && o.timeframe === 720 && o.type === entry.type &&
        Math.abs(o.price_low - entry.price_low) <= o.price_low * NEAR_12H_PCT)) {
      shouldRemove = true; reason = 'redundant_with_12h';
    }
    else if (entry.status !== 'historical' && state.isInvalidated(entry, barsByTf)) {
      // For S/D zones: track breach count
      if ((entry.type === 'sd_zone_demand' || entry.type === 'sd_zone_supply') && entry.breach_count === 1) {
        // 1st breach: transition to 'breached' state, will be redrawn below
        entry.status = 'breached';
        entry.breached_at = nowIso;
        breachedLog.push({ id: entry.id, breach_count: entry.breach_count });
      } else {
        // 2nd breach or other objects: remove
        shouldRemove = true; reason = 'invalidated';
      }
    } else if (state.isStale(entry, nowSec)) { shouldRemove = true; reason = 'stale_15m'; }

    if (shouldRemove) {
      const r = await remove(entry.tv_entity_id);
      if (wasActuallyRemoved(r)) {
        entry.status = 'removed';
        entry.removed_at = nowIso;
        entry.removed_reason = reason;
      } else {
        dataWarnings.push(`Entfernen von ${entry.id} (${reason}) fehlgeschlagen — bleibt aktiv, erneuter Versuch nächster Lauf.`);
      }
      removedLog.push({ id: entry.id, reason, remove_result: r, actually_removed: wasActuallyRemoved(r) });
    }
  }

  // --- Clean up pre-existing 12H/4H self-duplicates ---
  // One-time cleanup for the dense "wall" that accumulated before near12hSelf/
  // near4hSelf existed above (many near-identical levels 2-20 points apart on
  // the same timeframe, found via live debugging — on 12H it was silently
  // blocking almost every 4H candidate via the near12h check; on 4H the user
  // caught it directly on the chart, 29.07.2026: 25511.78 Supply and 25509.71
  // Demand, 2pts apart). Deliberately type-agnostic (matches near12hSelf/
  // near4hSelf above) — a Demand+Supply pair this close is just as redundant
  // as two same-type levels would be, and both render in the same per-
  // timeframe color anyway (see draw.mjs COLORS), so they're visually
  // indistinguishable clutter either way. Runs every time (not just once)
  // since a fresh pair can still slip through within the same detection
  // batch — the pre-filters above only check against already-tracked state,
  // not against each other. For each pair within tolerance, keep the OLDER
  // one (earlier created_at) and remove the newer duplicate.
  for (const tf of [720, 240]) {
    const activeLevels = zonesState.filter(e => e.status === 'active' && e.timeframe === tf && (e.type === 'sd_level_demand' || e.type === 'sd_level_supply'));
    const sortedLevels = [...activeLevels].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const kept = [];
    const reason = tf === 720 ? 'duplicate_12h_self' : 'duplicate_4h_self';
    for (const entry of sortedLevels) {
      const dup = kept.find(k => Math.abs(k.price_low - entry.price_low) <= k.price_low * NEAR_12H_PCT);
      if (dup) {
        const r = await remove(entry.tv_entity_id);
        if (wasActuallyRemoved(r)) {
          entry.status = 'removed';
          entry.removed_at = nowIso;
          entry.removed_reason = reason;
        } else {
          dataWarnings.push(`Entfernen von ${entry.id} (${reason}) fehlgeschlagen — bleibt aktiv, erneuter Versuch nächster Lauf.`);
        }
        removedLog.push({ id: entry.id, reason, remove_result: r, actually_removed: wasActuallyRemoved(r) });
      } else {
        kept.push(entry);
      }
    }
  }

  // --- Convert breached S/D zones to S/R levels ---
  for (const entry of zonesState) {
    if (entry.status !== 'breached') continue;
    // Remove old rectangle drawing — entry.tv_entity_id gets overwritten
    // below regardless of outcome, so if this fails the old rectangle
    // orphans with no tracking left to retry it (same failure mode as
    // wasActuallyRemoved elsewhere — surfaced here since the conversion
    // must proceed either way, unlike the other removal sites).
    const removeOldResult = await remove(entry.tv_entity_id);
    if (!wasActuallyRemoved(removeOldResult)) {
      dataWarnings.push(`Alte Zone ${entry.id} konnte beim S/R-Flip nicht entfernt werden — möglicher Chart-Orphan.`);
    }

    // Convert to S/R level: demand → support, supply → resistance
    // (distinct type from the old auto-clustered sr_support/sr_resistance,
    // which the user disabled — this flip-conversion must survive that ban)
    const isSupport = entry.type === 'sd_zone_demand';
    const newType = isSupport ? 'sr_flip_support' : 'sr_flip_resistance';
    const srPrice = isSupport ? entry.price_low : entry.price_high;

    // Redraw as horizontal S/R line
    const srLabel = `${isSupport ? 'Support' : 'Resistance'} ${srPrice.toFixed(1)} (ex-${entry.type === 'sd_zone_demand' ? 'Demand' : 'Supply'})`;
    const r = await draw('horizontal_line',
      { time: tacticalBars[tacticalBars.length - 1].time, price: srPrice },
      undefined,
      { linecolor: COLORS.sr_level, linewidth: 2, linestyle: dottedCode, showLabel: true, textcolor: COLORS.sr_level, fontsize: 10 },
      srLabel);

    if (r.ok) {
      entry.tv_entity_id = r.entity_id;
      entry.type = newType;
      entry.price_high = srPrice;
      entry.price_low = srPrice;
      entry.converted_at = nowIso;
      entry.status = 'active'; // reactivate as S/R level
    }
  }

  // --- S/D Level lifecycle (user-specified): fresh (lila/orange) -> 1st touch
  // (hellblau, same label). SR-line conversion on 2nd touch was tried and
  // then explicitly disabled by the user — touches beyond the 1st no longer
  // change anything. 2 actual breaks (close through, "nicht respektiert")
  // still deletes the level outright.
  for (const entry of zonesState) {
    if (entry.status !== 'active') continue;
    if (entry.type !== 'sd_level_demand' && entry.type !== 'sd_level_supply') continue;

    const bars = barsByTf[entry.timeframe];
    if (!bars || !bars.length) continue;
    const { touchedNew, brokenNew, lastCheckedTime } = state.checkLevelInteraction(entry, bars);
    // A gap can close beyond the level without any candle's wick-range ever
    // containing the exact price — brokenNew can be >0 while touchedNew is
    // 0. The old `if (!touchedNew) continue` skipped break-tracking entirely
    // in that case, so real breaks (13 of them, found live) never got
    // counted. Only skip when there's neither a touch nor a break.
    if (!touchedNew && !brokenNew) continue;

    entry.touch_count = (entry.touch_count ?? 0) + touchedNew;
    entry.break_count = (entry.break_count ?? 0) + brokenNew;
    entry.last_checked_time = lastCheckedTime;

    if (entry.break_count >= 2) {
      const r = await remove(entry.tv_entity_id);
      if (wasActuallyRemoved(r)) {
        entry.status = 'removed';
        entry.removed_at = nowIso;
        entry.removed_reason = 'sd_level_not_respected';
      } else {
        dataWarnings.push(`Entfernen von ${entry.id} (sd_level_not_respected) fehlgeschlagen — bleibt aktiv, erneuter Versuch nächster Lauf.`);
      }
      removedLog.push({ id: entry.id, reason: 'sd_level_not_respected', remove_result: r, actually_removed: wasActuallyRemoved(r) });
    } else if (entry.touch_count >= 1 && !entry.colored_touched) {
      // Same orphan risk as the S/R-flip conversion above: tv_entity_id gets
      // overwritten below regardless, so a failed removal here would strand
      // the old (uncolored) line untracked.
      const removeOldResult = await remove(entry.tv_entity_id);
      if (!wasActuallyRemoved(removeOldResult)) {
        dataWarnings.push(`Alte Level-Linie ${entry.id} konnte beim Umfärben nicht entfernt werden — möglicher Chart-Orphan.`);
      }
      const r = await draw('horizontal_ray', { time: entry.created_bar_time, price: entry.price_low }, undefined,
        { linecolor: COLORS.sd_level_touched, linewidth: 1, linestyle: 2 }, entry.label);
      if (r.ok) {
        entry.tv_entity_id = r.entity_id;
        entry.colored_touched = true;
      }
    }
  }

  // --- draw newly detected, not-yet-tracked zones ---
  const newEntries = [];

  // status defaults to 'active' (subject to next run's invalidation check).
  // Zones already broken at the moment of first detection are drawn once for
  // flip-level reference but tracked as 'historical' so they aren't drawn-then
  // -immediately-invalidated on the very next run (same underlying fact,
  // already reflected once via the mitigated=true / "(gebrochen)" label).
  async function maybeDrawZone(type, timeframe, z, colorKey, label, extraOverride = {}, status = 'active') {
    const candidate = { type, timeframe, price_low: z.low, price_high: z.high };
    if (state.findDuplicate(zonesState, candidate)) return;
    const isRgba = COLORS[colorKey].length === 9;
    const overrides = isRgba ? rgbaToTvOverride(COLORS[colorKey], extraOverride) : { linecolor: COLORS[colorKey], backgroundColor: COLORS[colorKey], color: COLORS[colorKey], transparency: 78, linewidth: 1, ...extraOverride };
    const farRight = tacticalBars[tacticalBars.length - 1].time + 20 * 3600;
    const r = await draw('rectangle', { time: z.time, price: z.low }, { time: farRight, price: z.high }, overrides, label);
    if (r.ok) {
      const entry = {
        id: state.makeEntryId(candidate, nowIso), tv_entity_id: r.entity_id, type, timeframe,
        price_high: z.high, price_low: z.low, created_at: nowIso, created_bar_time: z.time, status,
      };
      zonesState.push(entry);
      newEntries.push(entry);
    }
  }

  // Draws a fresh S/D level (single-price ray). Label is stored on the state
  // entry (unlike maybeDrawZone's rectangles) because the touch-lifecycle
  // above needs to redraw the exact same label when recoloring to hellblau.
  async function maybeDrawLevel(type, timeframe, lvl, colorKey, label) {
    const candidate = { type, timeframe, price_low: lvl.price, price_high: lvl.price };
    if (state.findDuplicate(zonesState, candidate)) return;
    const r = await draw('horizontal_ray', { time: lvl.time, price: lvl.price }, undefined,
      { linecolor: COLORS[colorKey], linewidth: 1, linestyle: 2 }, label);
    if (r.ok) {
      const entry = {
        id: state.makeEntryId(candidate, nowIso), tv_entity_id: r.entity_id, type, timeframe,
        price_high: lvl.price, price_low: lvl.price, created_at: nowIso, created_bar_time: lvl.time,
        status: 'active', label, touch_count: 0, break_count: 0,
      };
      zonesState.push(entry);
      newEntries.push(entry);
    }
  }

  for (const lvl of sdLevels12h) await maybeDrawLevel(lvl.type === 'demand' ? 'sd_level_demand' : 'sd_level_supply', 720, lvl, 'sd_level_12h', `12H ${lvl.type === 'demand' ? 'Demand' : 'Supply'}`);
  for (const lvl of sdLevels4h) await maybeDrawLevel(lvl.type === 'demand' ? 'sd_level_demand' : 'sd_level_supply', 240, lvl, 'sd_level_4h', `4H ${lvl.type === 'demand' ? 'Demand' : 'Supply'}`);

  for (const z of zones12h) await maybeDrawZone(z.type === 'demand' ? 'sd_zone_demand' : 'sd_zone_supply', 720, z, 'sd_zone_12h', `${z.type === 'demand' ? 'Demand' : 'Supply'} 12H${z.mitigated ? ' (gebrochen)' : ''}`, { transparency: z.mitigated ? 88 : 78 }, z.mitigated ? 'historical' : 'active');
  for (const z of zones4h) await maybeDrawZone(z.type === 'demand' ? 'sd_zone_demand' : 'sd_zone_supply', 240, z, 'sd_zone_4h', `${z.type === 'demand' ? 'Demand' : 'Supply'} 4H${z.mitigated ? ' (gebrochen)' : ''}`, { transparency: z.mitigated ? 85 : 72 }, z.mitigated ? 'historical' : 'active');
  const formatTf = (tf) => ({ 5: '5m', 15: '15m', 60: '1H', 240: '4H', 720: '12H' }[tf] || `${tf}`);
  for (const g of fvgsTactical) await maybeDrawZone(g.type === 'bullish' ? 'fvg_bullish' : 'fvg_bearish', tacticalTf, g, g.type === 'bullish' ? 'fvg_bullish' : 'fvg_bearish', `FVG ${g.type} (${formatTf(tacticalTf)})`);
  for (const o of obs12h.filter(o => !o.mitigated)) await maybeDrawZone(o.type === 'bullish' ? 'order_block_bullish' : 'order_block_bearish', 720, o, o.type === 'bullish' ? 'ob_bullish' : 'ob_bearish', `OB ${o.type} (12H)`);
  for (const o of obs4h.filter(o => !o.mitigated)) await maybeDrawZone(o.type === 'bullish' ? 'order_block_bullish' : 'order_block_bearish', 240, o, o.type === 'bullish' ? 'ob_bullish' : 'ob_bearish', `OB ${o.type} (4H)`);
  for (const o of obsTactical.filter(o => !o.mitigated)) await maybeDrawZone(o.type === 'bullish' ? 'order_block_bullish' : 'order_block_bearish', tacticalTf, o, o.type === 'bullish' ? 'ob_bullish' : 'ob_bearish', `OB ${o.type} (${formatTf(tacticalTf)})`);
  for (const o of obs1h.filter(o => !o.mitigated)) await maybeDrawZone(o.type === 'bullish' ? 'order_block_bullish' : 'order_block_bearish', 60, o, o.type === 'bullish' ? 'ob_bullish' : 'ob_bearish', `OB ${o.type} (1H)`);
  for (const o of obs5m.filter(o => !o.mitigated)) await maybeDrawZone(o.type === 'bullish' ? 'order_block_bullish' : 'order_block_bearish', 5, o, o.type === 'bullish' ? 'ob_bullish' : 'ob_bearish', `OB ${o.type} (5m)`);

  // S/R levels disabled per user request (no longer needed with S/D zones + PDHL)

  // --- PDHL (Previous Day High/Low) in all timeframes ---
  const pdhl = lib.calculatePDHL(dailyBars);
  if (pdhl.pdh !== null && pdhl.pdl !== null) {
    const lastBarTime = tacticalBars[tacticalBars.length - 1].time;

    // PDH line
    const pdhCandidate = { type: 'pdh', timeframe: 0, price_low: pdhl.pdh, price_high: pdhl.pdh };
    if (!state.findDuplicate(zonesState, pdhCandidate)) {
      const pdhResult = await draw('horizontal_line', { time: lastBarTime, price: pdhl.pdh }, undefined,
        { linecolor: COLORS.pdhl, linewidth: 1, linestyle: dottedCode, showLabel: true, textcolor: COLORS.pdhl, fontsize: 10 },
        `PDH ${pdhl.pdh.toFixed(1)}`);
      if (pdhResult.ok) {
        const entry = { id: state.makeEntryId(pdhCandidate, nowIso), tv_entity_id: pdhResult.entity_id, type: 'pdh', timeframe: 0, price_high: pdhl.pdh, price_low: pdhl.pdh, created_at: nowIso, created_bar_time: pdhl.time, status: 'active' };
        zonesState.push(entry); newEntries.push(entry);
      }
    }

    // PDL line
    const pdlCandidate = { type: 'pdl', timeframe: 0, price_low: pdhl.pdl, price_high: pdhl.pdl };
    if (!state.findDuplicate(zonesState, pdlCandidate)) {
      const pdlResult = await draw('horizontal_line', { time: lastBarTime, price: pdhl.pdl }, undefined,
        { linecolor: COLORS.pdhl, linewidth: 1, linestyle: dottedCode, showLabel: true, textcolor: COLORS.pdhl, fontsize: 10 },
        `PDL ${pdhl.pdl.toFixed(1)}`);
      if (pdlResult.ok) {
        const entry = { id: state.makeEntryId(pdlCandidate, nowIso), tv_entity_id: pdlResult.entity_id, type: 'pdl', timeframe: 0, price_high: pdhl.pdl, price_low: pdhl.pdl, created_at: nowIso, created_bar_time: pdhl.time, status: 'active' };
        zonesState.push(entry); newEntries.push(entry);
      }
    }
  }

  // --- Declutter pass (user-specified, 27.07.2026 — "zu viele Linien auf
  // dem Chart"): cap how many objects of each kind stay visible, keeping the
  // ones nearest to the current price rather than the newest ones. ---

  // 4H/12H S/D levels: min 1, max 3 per (type, timeframe) group, nearest to
  // price first. Excess (beyond 3) gets removed from chart + state; if a
  // group would end up empty, fall back to the single nearest RAW candidate
  // (bypassing the 15-day/5%-distance filters above, but still respecting
  // alreadyTracked so a permanently-invalidated level never gets resurrected)
  // so the chart never loses all directional context for that group.
  async function capNearestToPrice(matchFn, max) {
    const group = zonesState.filter(e => e.status === 'active' && matchFn(e));
    if (group.length <= max) return;
    const sorted = [...group].sort((a, b) => Math.abs(a.price_low - lastClose) - Math.abs(b.price_low - lastClose));
    for (const entry of sorted.slice(max)) {
      const r = await remove(entry.tv_entity_id);
      if (wasActuallyRemoved(r)) {
        entry.status = 'removed'; entry.removed_at = nowIso; entry.removed_reason = 'declutter_max_per_group';
      } else {
        dataWarnings.push(`Entfernen von ${entry.id} (declutter_max_per_group) fehlgeschlagen — bleibt aktiv, erneuter Versuch nächster Lauf.`);
      }
      removedLog.push({ id: entry.id, reason: 'declutter_max_per_group', remove_result: r, actually_removed: wasActuallyRemoved(r) });
    }
  }
  async function ensureMinOneLevel(rawLevels, wantedSubtype, type, timeframe, colorKey, tfLabel) {
    const activeCount = zonesState.filter(e => e.status === 'active' && e.type === type && e.timeframe === timeframe).length;
    if (activeCount > 0) return;
    const candidates = rawLevels.filter(l => l.type === wantedSubtype && !alreadyTracked(l, timeframe));
    if (!candidates.length) return;
    const nearest = [...candidates].sort((a, b) => Math.abs(a.price - lastClose) - Math.abs(b.price - lastClose))[0];
    await maybeDrawLevel(type, timeframe, nearest, colorKey, `${tfLabel} ${wantedSubtype === 'demand' ? 'Demand' : 'Supply'}`);
  }
  const MAX_SD_LEVELS_PER_GROUP = 3;
  const rawSdLevels12h = lib.findSDLevels(bars12h, { nowSec });
  const rawSdLevels4h = lib.findSDLevels(bars4h, { nowSec });
  await ensureMinOneLevel(rawSdLevels12h, 'demand', 'sd_level_demand', 720, 'sd_level_12h', '12H');
  await ensureMinOneLevel(rawSdLevels12h, 'supply', 'sd_level_supply', 720, 'sd_level_12h', '12H');
  await ensureMinOneLevel(rawSdLevels4h, 'demand', 'sd_level_demand', 240, 'sd_level_4h', '4H');
  await ensureMinOneLevel(rawSdLevels4h, 'supply', 'sd_level_supply', 240, 'sd_level_4h', '4H');
  await capNearestToPrice(e => e.type === 'sd_level_demand' && e.timeframe === 720, MAX_SD_LEVELS_PER_GROUP);
  await capNearestToPrice(e => e.type === 'sd_level_supply' && e.timeframe === 720, MAX_SD_LEVELS_PER_GROUP);
  await capNearestToPrice(e => e.type === 'sd_level_demand' && e.timeframe === 240, MAX_SD_LEVELS_PER_GROUP);
  await capNearestToPrice(e => e.type === 'sd_level_supply' && e.timeframe === 240, MAX_SD_LEVELS_PER_GROUP);

  // S/R lines (ex-S/D zones broken and flipped, sr_flip_support/resistance):
  // max 3 above price, max 3 below price; hidden once older than 3 months —
  // except the morning run always keeps the nearest one on each side alive
  // even if stale, so the briefing never loses all directional context.
  const SR_MAX_AGE_SEC = 90 * 24 * 3600;
  const isMorningRun = getBerlinHour() < 15;
  const srFlipActive = zonesState.filter(e => e.status === 'active' && (e.type === 'sr_flip_support' || e.type === 'sr_flip_resistance'));
  const srAbove = srFlipActive.filter(e => e.price_low > lastClose).sort((a, b) => a.price_low - b.price_low);
  const srBelow = srFlipActive.filter(e => e.price_low <= lastClose).sort((a, b) => b.price_low - a.price_low);
  async function declutterSrSide(sideSorted) {
    const nearest3 = sideSorted.slice(0, 3);
    for (const entry of sideSorted.slice(3)) {
      const r = await remove(entry.tv_entity_id);
      if (wasActuallyRemoved(r)) {
        entry.status = 'removed'; entry.removed_at = nowIso; entry.removed_reason = 'declutter_max_per_side';
      } else {
        dataWarnings.push(`Entfernen von ${entry.id} (declutter_max_per_side) fehlgeschlagen — bleibt aktiv, erneuter Versuch nächster Lauf.`);
      }
      removedLog.push({ id: entry.id, reason: 'declutter_max_per_side', remove_result: r, actually_removed: wasActuallyRemoved(r) });
    }
    for (let i = 0; i < nearest3.length; i++) {
      const entry = nearest3[i];
      const ageSec = nowSec - Math.floor(new Date(entry.converted_at || entry.created_at).getTime() / 1000);
      const keepAnyway = isMorningRun && i === 0;
      if (ageSec > SR_MAX_AGE_SEC && !keepAnyway) {
        const r = await remove(entry.tv_entity_id);
        if (wasActuallyRemoved(r)) {
          entry.status = 'removed'; entry.removed_at = nowIso; entry.removed_reason = 'sr_line_older_than_3_months';
        } else {
          dataWarnings.push(`Entfernen von ${entry.id} (sr_line_older_than_3_months) fehlgeschlagen — bleibt aktiv, erneuter Versuch nächster Lauf.`);
        }
        removedLog.push({ id: entry.id, reason: 'sr_line_older_than_3_months', remove_result: r, actually_removed: wasActuallyRemoved(r) });
      }
    }
  }
  await declutterSrSide(srAbove);
  await declutterSrSide(srBelow);

  // Prune removed/stale entries older than 7 days — they're never read again
  // (only 'active'/'breached'/'historical' entries feed any logic above),
  // so keeping them forever just grows zones.json unboundedly. 7 days keeps
  // recent history around for debugging without the file growing forever.
  const PRUNE_AGE_SEC = 7 * 24 * 3600;
  const prunedState = zonesState.filter(e => {
    if (e.status !== 'removed' && e.status !== 'sync_error_stale') return true;
    const ts = e.removed_at || e.created_at;
    return !ts || (nowSec - Math.floor(new Date(ts).getTime() / 1000)) < PRUNE_AGE_SEC;
  });

  state.writeState(prunedState);

  // --- entries + briefing (Trend 4H / Zone 4H / FVG-direction / Premium-Discount / Bestätigung 5min) ---
  // "Zone" is fed by the same active 4H S/D levels drawn on the chart (state
  // entries, not the separate old range-based zones4h) — unified so the
  // briefing reasons about exactly what the user sees.
  const atrArr4h = lib.atr(bars4h, 14);
  const activeLevels4h = zonesState
    .filter(e => e.status === 'active' && e.timeframe === 240 && (e.type === 'sd_level_demand' || e.type === 'sd_level_supply'))
    .map(e => {
      const idx = bars4h.findIndex(b => b.time === e.created_bar_time);
      return { type: e.type === 'sd_level_demand' ? 'demand' : 'supply', price: e.price_low, atr: idx >= 0 ? atrArr4h[idx] : null };
    });
  // 12H levels aren't used for entry confluence (that's 4H-only), just shown
  // in the OBSERVE section of the briefing for context.
  const activeLevels12h = zonesState
    .filter(e => e.status === 'active' && e.timeframe === 720 && (e.type === 'sd_level_demand' || e.type === 'sd_level_supply'))
    .map(e => ({ type: e.type === 'sd_level_demand' ? 'demand' : 'supply', price: e.price_low }));
  const premiumDiscount = htfBias ? lib.computePremiumDiscount(bars4h, htfBias) : null;
  // Sweep+MSS on the tactical timeframe, shown in OBSERVE — user-validated
  // against a real example (15min, 07.07. 09:00 sweep -> 10:30 MSS) before
  // wiring in. Only the most recent, still-recent-enough one is surfaced.
  const sweepMssTactical = lib.findSweepMSS(tacticalBars).filter(r => recentEnough(r.mssTime)).pop() || null;
  // Order Blocks against a scenario's direction are a reversal warning, not
  // a confluence add (user-specified) — pooled from 4H + tactical.
  const reversalObs = [...obs4h, ...obsTactical].filter(o => !o.mitigated);
  const tacticalAtrArr = lib.atr(tacticalBars, 14);
  const tacticalAtr = tacticalAtrArr[tacticalAtrArr.length - 1];
  const { minutesOfDay } = lib.berlinDateTimeParts(nowSec);
  const session = lib.classifySession(minutesOfDay);

  let scenarios = buildScenarios({ htfBias, activeLevels4h, fvgsTactical, pdhl, lastClose, regime, sweepMss: sweepMssTactical, premiumDiscount, bars5, nowSec, reversalObs, shortTermBias, tacticalAtr, tacticalBars, session, htfMs, aHtfBias, activeLevels12h, srLevels, fvgs12h, fvgs4h });

  // Backtest filter (change #2): momentum_continuation only if short-term bias
  // aligns with 4H trend AND during morning session (orb/main before 11:30).
  // Afternoon momentum was 0R; non-aligned momentum was flat.
  const momMorning = session.key === 'orb' || session.key === 'main';
  const momAligned = shortTermBias && shortTermBias === htfBias;
  scenarios = scenarios.filter(s =>
    s.type !== 'momentum_continuation' || (momAligned && momMorning)
  );

  // Full-confluence alert (shares dedup state with check_scenarios.mjs's
  // frequent standalone check, so the two never double-alert the same
  // confluence moment — same pattern as checkAndAlertMarketShifts above).
  const scenarioAlertResult = await checkAndAlertFullConfluence(scenarios);

  // --- Recommended Entry/SL/TP lines (user-requested, 28.07.2026) ---
  // Same remove-then-redraw pattern as MS markers: previous lines are always
  // cleared first, so a scenario that's no longer active doesn't linger.
  // Also drops any scenario whose SL/TP price has already been crossed
  // (isScenarioResolved) — user-specified, 28.07.2026: "lösche immer alle
  // eingezeichneten Entries, wenn sie nicht mehr valide sind" — the
  // underlying 4H zone can stay "active" well after price has already
  // resolved the trade, so that alone isn't a reliable invalidation signal.
  const SCENARIO_LINES_STATE_PATH = '/Users/boogy/tradingview-mcp/state/scenario_lines.json';
  const scenarioLinesState = existsSync(SCENARIO_LINES_STATE_PATH) ? JSON.parse(readFileSync(SCENARIO_LINES_STATE_PATH, 'utf8')) : {};
  const scenariosStillValid = scenarios.filter(s => !lib.isScenarioResolved(s, lastClose));
  const scenarioLineIds = await drawScenarioLevels(scenariosStillValid, tacticalBars[tacticalBars.length - 1].time, scenarioLinesState);
  writeFileSync(SCENARIO_LINES_STATE_PATH, JSON.stringify(scenarioLineIds, null, 2));

  // --- Self-feedback loop: log scenarios, check older ones against what
  // actually happened, surface a historical win-rate per scenario type. Adds
  // the accountability the user asked for after a straight momentum move hit
  // neither the trend-bounce nor the counter-trend scenario.
  const SCENARIO_LOG_PATH = '/Users/boogy/tradingview-mcp/state/scenario_log.json';
  const scenarioLog = existsSync(SCENARIO_LOG_PATH) ? JSON.parse(readFileSync(SCENARIO_LOG_PATH, 'utf8')) : [];
  // Change #4: Evaluate A/B on 15m bars (finer granularity, ~7 day horizon = 640 15m bars)
  // instead of 4h bars (which made tight SLs look like instant losses).
  // Szenario A (trend_bounce) removed 08.07.2026 — all 9 parameter combinations
  // tested negative in sweep. Dead code with no salvage path.
  // D was added after backtest fix (was missing entirely, causing unresolved log entries).
  const barsByScenarioType = { counter_trend: tacticalBars, momentum_continuation: tacticalBars, consolidation_breakout: tacticalBars, trend_reversal_poi: tacticalBars };
  const expiryBarsByScenarioType = { counter_trend: 640, momentum_continuation: 40, consolidation_breakout: 40, trend_reversal_poi: 640 };

  for (const logEntry of scenarioLog) {
    if (logEntry.resolved) continue;
    const bars = barsByScenarioType[logEntry.type];
    if (!bars) continue;
    const expiry = expiryBarsByScenarioType[logEntry.type];
    const { resolved, outcome } = lib.checkScenarioOutcome(logEntry, bars, expiry);
    if (resolved) { logEntry.resolved = true; logEntry.outcome = outcome; logEntry.resolvedAt = nowIso; }
  }

  const statsByType = {};
  for (const logEntry of scenarioLog) {
    if (!logEntry.resolved) continue;
    if (!statsByType[logEntry.type]) statsByType[logEntry.type] = { wins: 0, losses: 0, other: 0 };
    if (logEntry.outcome === 'target_hit') statsByType[logEntry.type].wins++;
    else if (logEntry.outcome === 'sl_hit') statsByType[logEntry.type].losses++;
    else statsByType[logEntry.type].other++;
  }
  for (const s of scenarios) {
    const st = statsByType[s.type];
    if (st) {
      const resolvedCount = st.wins + st.losses;
      s.historicalStats = { wins: st.wins, resolvedCount, winRate: resolvedCount ? st.wins / resolvedCount : 0 };
    }
  }

  // Dedup: don't log a fresh duplicate of a scenario that's already pending
  // (same type/direction/zone, logged recently) — let the existing one
  // resolve rather than spamming near-identical entries every run.
  const DEDUP_TOLERANCE_PCT = 0.001;
  const DEDUP_MAX_AGE_SEC = 3 * 24 * 3600;
  for (const s of scenarios) {
    const alreadyLogged = scenarioLog.some(e => !e.resolved && e.type === s.type && e.direction === s.direction &&
      Math.abs(e.zonePrice - s.zonePrice) <= Math.abs(s.zonePrice) * DEDUP_TOLERANCE_PCT &&
      (nowSec - Math.floor(new Date(e.loggedAt).getTime() / 1000)) < DEDUP_MAX_AGE_SEC);
    if (alreadyLogged || s.targets[0] == null) continue;
    scenarioLog.push({
      id: `${s.type}_${nowSec}`, loggedAt: nowIso, loggedBarTime: tacticalBars[tacticalBars.length - 1].time,
      type: s.type, direction: s.direction, zonePrice: s.zonePrice, sl: s.sl, target: s.targets[0],
      grade: s.probability, resolved: false, outcome: null,
    });
  }

  mkdirSync('/Users/boogy/tradingview-mcp/state', { recursive: true });
  writeFileSync(SCENARIO_LOG_PATH, JSON.stringify(scenarioLog, null, 2));

  const dateStr = nowIso.slice(0, 10);
  const { dateDisplay, timeDisplay } = lib.berlinDateTimeParts(nowSec);
  const briefingText = buildBriefing({
    regime, htfBias, lastBosTrend: lastBos4hForTrend, shortTermBias, premiumDiscount, activeLevels4h, scenarios, lastClose, dataWarnings, dateDisplay, timeDisplay, session,
    observe12h: { lastCandles: bars12h.slice(-2), activeLevels: activeLevels12h, pdhl },
    observe4h: { lastCandles: bars4h.slice(-2), activeLevels: activeLevels4h, fvgs: fvgsTactical, pdhl },
    observeTactical: { lastCandles: tacticalBars.slice(-6), tf: formatTf(tacticalTf), pdhl, sweepMss: sweepMssTactical },
    orbVwap,
  });

  // Saved immediately, BEFORE the screenshot/telegram steps below — found a
  // real gap: on 08.07. the run got this far (state files were updated) but
  // never produced a briefing file or a Telegram message, and with no
  // try/catch around the telegram calls at the time, a crash there would
  // have discarded an already-finished briefing. Saving early means the text
  // survives even if everything after this point fails.
  mkdirSync('/Users/boogy/briefings', { recursive: true });
  writeFileSync(`/Users/boogy/briefings/briefing_${dateStr}.md`, briefingText);

  // --- Chart screenshot (sent as a Telegram photo alongside the text) ---
  // No more scenario-path arrows here — user-specified, 09.07.2026: "bitte
  // verzichte in Zukunft darauf, Pfeile einzuzeichnen, um mögliche
  // Entwicklungen anzuzeigen. Das hat sich doch eher als hinderlich
  // erwiesen." Removed the drawScenarioPaths call and the right-margin
  // setup that existed only to make room for that sketch. Still captures a
  // plain screenshot of the live chart (zones/FVGs/MS markers etc. are
  // still useful to see), just without the arrows.
  let scenarioScreenshotPath = null;
  try {
    mkdirSync('/Users/boogy/briefings', { recursive: true });
    const shot = await captureScreenshot({ region: 'chart', filename: `chart_${dateStr}` });
    if (shot.success) scenarioScreenshotPath = shot.file_path;
    else dataWarnings.push(`Chart-Screenshot fehlgeschlagen: ${JSON.stringify(shot)}`);
  } catch (e) {
    dataWarnings.push(`Chart-Screenshot fehlgeschlagen: ${e.message}`);
  }

  // MS markers + MS Telegram alerts were already handled up front by
  // checkAndAlertMarketShifts() (ms_alerts.mjs) — nothing left to do here.

  // telegram.mjs's own functions already catch their internal errors and
  // return {sent: false, ...} rather than throwing, but wrapping the calls
  // themselves too — belt and suspenders after an unexplained silent failure
  // where the briefing file never got written and no Telegram message arrived.
  let telegramResult, telegramPhotoResult;
  try {
    telegramResult = await sendTelegramBriefing(briefingText);
  } catch (e) {
    telegramResult = { sent: false, error: e.message };
    dataWarnings.push(`Telegram-Textversand fehlgeschlagen: ${e.message}`);
  }
  try {
    telegramPhotoResult = scenarioScreenshotPath
      ? await sendTelegramPhoto(scenarioScreenshotPath, 'Aktueller Chart 📈')
      : { sent: false, reason: 'Kein Screenshot verfügbar' };
  } catch (e) {
    telegramPhotoResult = { sent: false, error: e.message };
    dataWarnings.push(`Telegram-Fotoversand fehlgeschlagen: ${e.message}`);
  }

  console.log(JSON.stringify({
    success: true, dataWarnings, tacticalTf, regime,
    regimeSource: storedRegime && !forceRegimeReset && storedRegime.date === regimeDateKey ? 'cached_today' : 'freshly_computed',
    zones12h, zones4h, srLevels, fvgsTactical, obs12h, obs4h, obs1h, obs5m, obsTactical,
    pdhl, breachedLog, removedLog, newEntriesCount: newEntries.length,
    telegramResult, telegramPhotoResult, scenarioScreenshotPath, briefingSavedTo: `/Users/boogy/briefings/briefing_${dateStr}.md`,
    scenarioAlertResult,
  }, null, 2));

  console.log('\n\n===== BRIEFING TEXT =====\n');
  console.log(briefingText);

  await disconnect();
  process.exit(0);
}

// Found live on 08.07.: a run didn't crash, it just HUNG indefinitely (still
// running 20+ minutes later, no error, no output) — almost certainly a CDP
// call to TradingView that never resolved. A hung process produces neither a
// success nor a caught error, so nothing downstream (briefing file, Telegram,
// even this catch handler) ever fires. Race main() against a hard timeout so
// a hang becomes a loud, logged failure instead of a silent no-op.
const GLOBAL_TIMEOUT_MS = 4 * 60 * 1000; // normal runs observed at 30-90s
function timeoutAfter(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(`Globaler Timeout nach ${ms / 1000}s — Skript hing vermutlich fest (z.B. TradingView/CDP reagiert nicht).`)), ms));
}

Promise.race([main(), timeoutAfter(GLOBAL_TIMEOUT_MS)]).catch(async (e) => {
  console.error('FATAL', e.stack || e.message);
  // A run failed silently on 08.07. with no stored trace anywhere (the
  // scheduled-task runner doesn't persist console output) — write a crash
  // log so a future silent failure is actually diagnosable afterward.
  try {
    writeFileSync('/Users/boogy/tradingview-mcp/state/last_error.log', `${new Date().toISOString()}\n${e.stack || e.message}\n`);
  } catch { /* if even this fails, nothing more we can do */ }
  await disconnect().catch(() => {});
  process.exit(1);
});
