/**
 * Timeframe-hierarchy confluence model + fixed-template briefing renderer.
 *
 * Hierarchy (user-specified, not derived from the original spec): 4H BOS
 * sets trade direction (Trend), an active 4H S/D level in that direction is
 * the tradeable area (Zone), and a 5min BOS (or close-reaction fallback)
 * after the level is touched confirms the entry. Trend+Zone are hard
 * prerequisites for a candidate to exist at all, so confluence starts at
 * 2/4 and can reach 4/4 via two further, independent checks:
 *   - FVG-direction: an unfilled FVG above a long entry (or below a short
 *     entry) acts as a magnet/target in the trade's favour.
 *   - Premium/Discount: is price on the favourable side of the current
 *     swing range's midpoint for this trend direction (see
 *     computePremiumDiscount in lib.mjs)?
 * Order Blocks are deliberately NOT a same-direction confluence add here —
 * per the user, they're more indicative of a possible reversal, so an OB
 * against the trade direction is surfaced as a warning note instead.
 *
 * "Zone" is fed by the same active S/D levels drawn on the chart (see
 * findSDLevels in lib.mjs / sd_level_* entries in state) — unified so what
 * the user sees on the chart is what the briefing actually reasons about,
 * rather than a separate, uncalibrated range-based zone model.
 */

import * as lib from './lib.mjs';
const { findConfirmation5m } = lib;

// ---------- Scenario planning (replaces the old confirmed-entry model) ----------
// Forward-looking, conditional plans ("WENN X passiert, DANN Y") instead of
// only showing already-confirmed setups — matches the user's own briefing
// format. Two scenarios: A) bounce in the 4H trend direction at the nearest
// trend-aligned level, B) counter-trend continuation if a pullback into an
// opposing level/PDHL boundary gets rejected. Each carries an explicit
// confluence checklist (met vs pending) rather than a single collapsed
// number, since a scenario is inherently partly-unconfirmed by definition.
function buildScenario({ type, label, direction, zonePrice, sl, targets, checklist, regime, reversalObs, zoneBrokenNoRetest }) {
  const metCount = checklist.filter(c => c.met).length;
  const totalCount = checklist.length;
  const probability = metCount >= totalCount - 1 ? 'B+' : metCount >= totalCount - 2 ? 'B' : 'C';
  // An Order Block against this scenario's direction, close to the zone, is
  // a reversal warning — informational, doesn't change the checklist/grade.
  const oppositeType = direction === 'LONG' ? 'bearish' : 'bullish';
  const warningOb = (reversalObs || []).find(o => o.type === oppositeType &&
    Math.abs((o.low + o.high) / 2 - zonePrice) < Math.abs(zonePrice) * 0.01);
  return { type, label, direction, zonePrice, sl, targets, checklist, metCount, totalCount, probability, regime, warningOb, zoneBrokenNoRetest: !!zoneBrokenNoRetest };
}

export function buildScenarios({ htfBias, activeLevels4h, fvgsTactical, pdhl, lastClose, regime, sweepMss, premiumDiscount, bars5, nowSec, reversalObs, shortTermBias, tacticalAtr, tacticalBars, session, htfMs, aHtfBias, activeLevels12h, srLevels, fvgs12h, fvgs4h }) {
  const scenarios = [];

  // Scenario A: Trend-Reversal-Fade an POI — komplett neu konzipiert,
  // 28.07.2026 (User-Vorgabe, ersetzt das alte "Trend-Bounce"-Design, das im
  // 6-Monats-Backtest strukturell unprofitabel war — alle 9 Parameter-
  // Kombinationen negativ, −0.11R bis −0.42R, kein Salvage-Weg gefunden).
  //
  // Neue Hierarchie (User-spezifiziert): Trend auf 1H (nicht 4H — bewusst
  // getrennt von B/D's 4H-Trend), POI-Pool aus 12H+4H S/D-Zonen UND S/R-
  // Linien, Entry-Trigger ist ein Market Shift ODER Liquidity Sweep auf 5m
  // in Reversal-Richtung nahe der POI, PLUS die aktuelle 5m-Kerze muss selbst
  // eine Reaktionskerze in diese Richtung sein (steht für den vom User
  // gewünschten 1m-Entry — TradingViews 1m-Historie reicht nur 16 Tage
  // zurück, zu wenig für einen Backtest; 5m als Näherung User-bestätigt,
  // 28.07.2026). Order Block + FVG (12H/4H/15m) sind Bonus-Konfluenz, keine
  // Voraussetzung — "mehr Konfluenz = besser" (User-Vorgabe, im Gegensatz zu
  // B's invertierter Fresh-Zone-Logik). Ziel: R:R >= 2, immer auf die
  // nächste reale Zone in Trendrichtung, kein fixer Multiplikator.
  //
  // Backtest (28.07.2026, ~2 Monate Stichprobe — TradingViews 5m-Historie
  // reicht nur bis 31.05.2026 zurück, deutlich kürzer als B's 6 Monate):
  // 34,9% WR, +0,13R ExpR über 60 aufgelöste Trades, in beiden getesteten
  // Monaten positiv (+0,12R Juni, +0,14R Juli) — moderat, nicht so stark
  // validiert wie B, aber ein echtes, konsistentes Signal. Dieselbe
  // Konfluenz-Inversion wie bei B zeigte sich auch hier (Confluence=1 lief
  // mit +0,46R besser als Confluence=3 mit −0,31R) — User entschied sich
  // trotzdem für die Gesamt-Version (nicht auf Confluence=1 einschränken),
  // um die größere, robustere Stichprobe zu behalten.
  if (aHtfBias) {
    const aBull = aHtfBias === 'bullish';
    if (shortTermBias && shortTermBias !== aHtfBias) {
      const aSdLevels = [...(activeLevels12h || []), ...(activeLevels4h || [])]
        .filter(l => l.type === (aBull ? 'demand' : 'supply'))
        .map(l => l.price);
      const aSrLevels = (srLevels || [])
        .filter(l => l.type === (aBull ? 'support' : 'resistance'))
        .map(l => l.price);
      const aPoiPool = [...aSdLevels, ...aSrLevels].filter(p => (aBull ? p < lastClose : p > lastClose));
      if (aPoiPool.length) {
        const aNearestPOI = aPoiPool.sort((x, y) => (aBull ? y - x : x - y))[0];
        const aPoiTolerance = tacticalAtr ? tacticalAtr * 1.5 : Math.abs(aNearestPOI) * 0.0015;
        const aNearPOI = (lvl) => lvl != null && Math.abs(lvl - aNearestPOI) <= aPoiTolerance;
        const aReversalDir = aBull ? 'bullish' : 'bearish';
        const A_REACTION_MAX_AGE_SEC = 4 * 3600;

        const aMs5m = (bars5 && bars5.length >= 20) ? lib.detectMarketShift(bars5, 2) : { status: 'none' };
        const aMsSignal = aMs5m.status === 'confirmed' && aMs5m.direction === aReversalDir &&
          nowSec != null && (nowSec - aMs5m.break_time) <= A_REACTION_MAX_AGE_SEC && aNearPOI(aMs5m.brokenLevel?.price);
        const aSweep5m = (bars5 && bars5.length)
          ? lib.findSweepMSS(bars5, 2, 10).filter(s => nowSec != null && (nowSec - s.mssTime) <= A_REACTION_MAX_AGE_SEC).pop()
          : null;
        const aSweepSignal = !!(aSweep5m && aSweep5m.type === aReversalDir && (aNearPOI(aSweep5m.sweptLevel) || aNearPOI(aSweep5m.mssLevel)));

        if ((aMsSignal || aSweepSignal) && bars5 && bars5.length) {
          const aCurrentBar5m = bars5[bars5.length - 1];
          const aEntryConfirmed = aReversalDir === 'bullish' ? aCurrentBar5m.close > aCurrentBar5m.open : aCurrentBar5m.close < aCurrentBar5m.open;

          if (aEntryConfirmed) {
            const aBos5m = lib.findBosEvents(bars5);
            const aObs5m = lib.findOrderBlocks(bars5, aBos5m).filter(o => !o.mitigated);
            const aObConfirm = aObs5m.some(o => o.type === aReversalDir && aNearPOI((o.low + o.high) / 2));
            const aFvgSources = [...(fvgs12h || []), ...(fvgs4h || []), ...(fvgsTactical || [])];
            const aFvgConfirm = aFvgSources.some(g => g.type === aReversalDir && aNearPOI((g.low + g.high) / 2));

            const aBuffer = tacticalAtr ? tacticalAtr * 0.5 : Math.abs(aNearestPOI) * 0.0015;
            const aSl = aBull ? aNearestPOI - aBuffer : aNearestPOI + aBuffer;
            const aSlDist = Math.abs(aNearestPOI - aSl);
            const aTargetPool = [...aSdLevels, ...aSrLevels]
              .filter(p => (aBull ? p > aNearestPOI : p < aNearestPOI))
              .filter(p => Math.abs(p - aNearestPOI) / aSlDist >= 2)
              .sort((x, y) => Math.abs(x - aNearestPOI) - Math.abs(y - aNearestPOI));
            const aTarget = aTargetPool.length ? aTargetPool[0] : (aBull ? aNearestPOI + 2 * aSlDist : aNearestPOI - 2 * aSlDist);

            scenarios.push(buildScenario({
              type: 'trend_reversal_poi',
              label: `${aBull ? 'Long' : 'Short'} Reversal an POI ${aNearestPOI.toFixed(1)}`,
              direction: aBull ? 'LONG' : 'SHORT',
              zonePrice: aNearestPOI,
              sl: aSl,
              targets: [aTarget],
              checklist: [
                { label: `1H-Trend: ${aBull ? 'bullisch' : 'bärisch'}`, met: true },
                { label: `POI erreicht (${aNearestPOI.toFixed(1)})`, met: true },
                { label: aMsSignal ? 'Market Shift bestätigt Reversal (5m)' : 'Liquidity Sweep bestätigt Reversal (5m)', met: true },
                { label: 'Order Block als Konfirmation', met: aObConfirm },
                { label: 'FVG als Konfirmation', met: aFvgConfirm },
              ],
              regime,
              reversalObs,
            }));
          }
        }
      }
    }
  }

  if (!htfBias) return scenarios;
  const bull = htfBias === 'bullish';

  // Scenario B: counter-trend fade at a FRESH (not-yet-tested) opposing 4H
  // level or PDHL boundary. Redesigned 28.07.2026 after a full, corrected
  // 6-month re-backtest (see STRATEGIE_OPTIMIERUNG_HANDOVER.md, Teil 4/5):
  //
  // The pre-28.07.2026 design (enter regardless of prior reaction, 3R
  // target, "more confluence = higher grade") had two independent problems:
  // 1. A target-price sign bug (fixed 28.07.2026 morning) meant the reported
  //    87.8% WR / +2.37R was a measurement artifact — every touched trade
  //    scored as an instant win regardless of real price action.
  // 2. Once that was fixed, the REAL win-rate over 285 trades (Feb-Jul 2026,
  //    live-fetched history) was 24.6% / -0.02R — essentially zero edge —
  //    AND grade was INVERTED (B+ scenarios performed worse than C: 15.9%
  //    WR/-0.37R vs 32.8% WR/+0.31R). Root cause: "high confluence" meant
  //    a rejection/MSS/confirmation had ALREADY happened before the zone
  //    even qualified as a candidate — i.e., the level had already been
  //    actively tested and reacted to. Classic TA: a level's FIRST test is
  //    stronger than a retest: by the time all 3 reaction checks fire, the
  //    zone is already partially "used up".
  //
  // Fix: flip the premise. Only take FRESH zones — no rejection, no MSS, no
  // 5min reaction detected yet — with a 1:1 R:R exit instead of 3:1.
  // Fresh-zone-only alone (no alignment filter) already re-backtests to
  // 70.7% WR/+0.41R over 58 trades, positive or flat in all 6 of 6 months
  // tested (no single outlier month driving it, unlike a session-only
  // filter variant that was also tried and rejected for exactly that
  // instability). Adding momentum-alignment (shortTermBias === htfBias,
  // below) narrows the sample to 33 trades but improves it further: 75.8%
  // WR, +0.52R ExpR — user-selected trade-off (smaller but stronger sample)
  // over the unfiltered 58-trade baseline.
  const htfMsConfirmsTrend = !!(htfMs && htfMs.status === 'confirmed' && htfMs.direction === htfBias);
  const counterLevels = activeLevels4h.filter(l => l.type === (bull ? 'supply' : 'demand'));
  const pdBoundary = bull ? (pdhl && pdhl.pdl) : (pdhl && pdhl.pdh);
  const counterPool = [...counterLevels.map(l => l.price), ...(pdBoundary != null ? [pdBoundary] : [])]
    .filter(p => (bull ? p > lastClose : p < lastClose));
  if (counterPool.length && shortTermBias && shortTermBias === htfBias) {
    const nearestCounter = counterPool.sort((a, b) => (bull ? a - b : b - a))[0];
    const buffer = Math.abs(nearestCounter) * 0.0018;
    const sl = bull ? nearestCounter + buffer : nearestCounter - buffer;
    const slDist = Math.abs(nearestCounter - sl);
    // 1:1 R:R (was 3:1) — see redesign note above. Target sits on the
    // OPPOSITE side of entry from SL: bull(SHORT) falls, target BELOW
    // entry; !bull(LONG) rises, target ABOVE entry.
    const targets = [bull ? nearestCounter - slDist : nearestCounter + slDist];

    // Freshness checks — B's trade direction is bull?SHORT:LONG, so the
    // reaction we're checking FOR (and now require to be ABSENT) is
    // bearish/bullish respectively (matching findBosEvents' type field,
    // used consistently across findZoneRejection/findSweepMSS/
    // findConfirmation5m). Freshness window: one trading session (8h), not
    // the wider 2-day "tactical recentEnough" convention used for OB/FVG/
    // sweepMss elsewhere — an 8h-old reaction is still a real prior test of
    // this zone. MSS additionally requires proximity to the zone itself
    // (swept/mss level within 1.5x tactical ATR of nearestCounter), not just
    // matching direction from anywhere on the chart (live-caught bug,
    // 28.07.2026: a "confirming" MSS was once 87-146 points away from the
    // actual zone).
    const reactionDirection = bull ? 'bearish' : 'bullish';
    const CONFLUENCE_MAX_AGE_SEC = 8 * 3600;
    const zoneRejection = (bars5 && bars5.length)
      ? lib.findZoneRejection(bars5, nearestCounter, reactionDirection, { nowSec, maxAgeSec: CONFLUENCE_MAX_AGE_SEC })
      : { rejected: false };
    const mssProximityTolerance = tacticalAtr ? tacticalAtr * 1.5 : Math.abs(nearestCounter) * 0.0015;
    const mssNearZone = (level) => level != null && Math.abs(level - nearestCounter) <= mssProximityTolerance;
    const mssAgainstTrend = !!(sweepMss && sweepMss.type === reactionDirection &&
      (nowSec - sweepMss.mssTime) <= CONFLUENCE_MAX_AGE_SEC &&
      (mssNearZone(sweepMss.sweptLevel) || mssNearZone(sweepMss.mssLevel)));
    const confirmation5m = (bars5 && bars5.length)
      ? findConfirmation5m(bars5, nearestCounter - buffer, nearestCounter + buffer, reactionDirection, { nowSec, maxAgeSec: CONFLUENCE_MAX_AGE_SEC })
      : { confirmed: false };
    const isFresh = !zoneRejection.rejected && !mssAgainstTrend && !confirmation5m.confirmed;

    // Only take the trade if the zone is genuinely untested — this IS the
    // edge (see redesign note above), not an optional confluence add-on.
    if (isFresh) {
      // Once drawn, the line is invalidated if price later closes through
      // the zone without ever showing a rejection/confirmation — same
      // detectors, just checked again against current price at draw time.
      const zoneBrokenNoRetest = (bull ? lastClose > nearestCounter : lastClose < nearestCounter) &&
        !zoneRejection.rejected && !confirmation5m.confirmed;

      scenarios.push(buildScenario({
        type: 'counter_trend',
        label: `${bull ? 'Short' : 'Long'} Fade an frischer Zone ${nearestCounter.toFixed(1)}`,
        direction: bull ? 'SHORT' : 'LONG',
        zonePrice: nearestCounter,
        sl,
        targets,
        checklist: [
          { label: `Gegentrend-Level/PDHL-Grenze (${nearestCounter.toFixed(1)})`, met: true },
          { label: 'Frische Zone (noch keine Rejection/MSS/Bestätigung)', met: isFresh },
          { label: 'Kurzfristiges Momentum bestätigt Trendrichtung', met: true },
          { label: `1H-MS bestätigt intakten ${bull ? 'bullish' : 'bearish'}-Trend`, met: htfMsConfirmsTrend },
        ],
        regime,
        reversalObs,
        zoneBrokenNoRetest,
      }));
    }
  }

  // Scenario C: pure momentum continuation in the SHORT-TERM direction,
  // ONLY if aligned with 4H trend and during morning hours.
  // Optimierung (08.07.2026): +0.23R erreichbar mit Morning-Filter +
  // SL-Buffer 1.0×ATR (statt 1.5×). Kürzere Haltedauer, weniger Fake-Outs.
  //
  // 🗑️ DISABLED (10.07.2026): Backtest zeigte nur 20% WR mornings (13/64 gewonnen).
  // 71 Szenarien über 6 Monate, davon 0 Gewinner. Strukturelles Problem in diesem
  // Regime — entfernt, um Morning Briefing Qualität zu verbessern (91% WR nur mit B).
  if (false && shortTermBias && shortTermBias === htfBias && session.key === 'orb') {
    const momBull = shortTermBias === 'bullish';
    const momLevels = activeLevels4h.filter(l => l.type === (momBull ? 'supply' : 'demand'))
      .filter(l => (momBull ? l.price > lastClose : l.price < lastClose));
    const nearestMomTarget = momLevels.sort((a, b) => Math.abs(a.price - lastClose) - Math.abs(b.price - lastClose))[0];
    if (nearestMomTarget) {
      const buffer = tacticalAtr ? tacticalAtr * 1.0 : Math.abs(lastClose) * 0.0015;
      const sl = momBull ? lastClose - buffer : lastClose + buffer;
      scenarios.push(buildScenario({
        type: 'momentum_continuation',
        label: `Momentum-Fortsetzung ${momBull ? '(Long)' : '(Short)'} bis ${nearestMomTarget.price.toFixed(1)}`,
        direction: momBull ? 'LONG' : 'SHORT',
        zonePrice: lastClose,
        sl,
        targets: [nearestMomTarget.price],
        checklist: [
          { label: 'Kurzfristiges Momentum aktiv', met: true },
          { label: 'Übereinstimmung mit 4H-Trend', met: true },
          { label: `Nächste ${momBull ? 'Supply' : 'Demand'}-Zone als Ziel vorhanden`, met: true },
        ],
        regime,
        reversalObs,
      }));
    }
  }

  // Scenario D: Consolidation Breakout with Liquidity Sweep Retest
  // ICT/Smart Money entry: strong trend → consolidation → sweep → retest breakout.
  // Nur mornings + trend-aligned, wie Scenario C.
  //
  // Zwei Fixes nach dem 6-Monats-Backtest (Jul 2026), der zeigte, dass D
  // strukturell NIE feuern konnte (0 Treffer in 5.023 Sim-Schritten, 0 im
  // Live-Log):
  // 1. findConsolidationPhase verankerte die Konsolidierung immer an den
  //    LETZTEN 5 Kerzen des Fensters, findLiquiditySweep/findRetestBreakout
  //    suchen aber in Bars DANACH — die es am Live-Edge nie gibt. Jetzt:
  //    Konsolidierung darf vor k=3..12 Bars geendet haben (Sub-Fenster),
  //    Sweep+Retest spielen sich in diesen k Bars ab, und die Retest-
  //    Breakout-Kerze muss die AKTUELLE Kerze sein (Entry jetzt).
  // 2. Schwellwert 0.5×ATR war auf 15m unerfüllbar — nur 0,03% aller
  //    5-Kerzen-Fenster sind so eng (gemessen über 10.381 Fenster).
  //    Kalibriert auf 1.3×ATR (~10. Perzentil = echte, aber erreichbare
  //    Engstelle).
  if (shortTermBias && shortTermBias === htfBias && (session.key === 'orb' || session.key === 'main') && tacticalBars && tacticalBars.length > 40) {
    const swings = lib.findSwings(tacticalBars, 2);
    let consolidation = null, sweep = null, retest = null;
    for (let k = 3; k <= 12; k++) {
      const sub = tacticalBars.slice(0, tacticalBars.length - k); // indices align with tacticalBars
      if (sub.length < 20) break;
      const c = lib.findConsolidationPhase(sub, 5, 1.3);
      if (!c) continue;
      const s = lib.findLiquiditySweep(tacticalBars, c, swings, htfBias);
      if (!s) continue;
      const r = lib.findRetestBreakout(tacticalBars, c, s, htfBias, 10);
      // entry signal only if the breakout candle is the current (latest) bar —
      // an older breakout is already running, not a fresh entry
      if (!r || r.retestBarIndex !== tacticalBars.length - 1) continue;
      consolidation = c; sweep = s; retest = r;
      break;
    }
    if (consolidation && sweep && retest) {
      const buffer = tacticalAtr ? tacticalAtr * 0.5 : Math.abs(retest.entryPrice) * 0.0015;
      const sl = bull
        ? Math.min(sweep.sweptLevel, consolidation.low) - buffer
        : Math.max(sweep.sweptLevel, consolidation.high) + buffer;
      const targetPool = activeLevels4h
        .filter(l => bull ? l.price > retest.entryPrice : l.price < retest.entryPrice)
        .map(l => l.price);
      const targets = targetPool.length
        ? [targetPool.sort((a, b) => bull ? a - b : b - a)[0]]
        : [];

      if (targets[0]) {
        scenarios.push(buildScenario({
          type: 'consolidation_breakout',
          label: `${bull ? 'Long' : 'Short'} Sweep Retest Breakout (Consolidation)`,
          direction: bull ? 'LONG' : 'SHORT',
          zonePrice: retest.entryPrice,
          sl,
          targets,
          checklist: [
            { label: 'Trend bestätigt (HH/HL oder LL/LH)', met: true },
            { label: 'Konsolidierungsphase erkannt', met: true },
            { label: 'Liquidity Sweep stattgefunden', met: true },
            { label: 'Retest-Breakout (Richtungskerze)', met: true },
            { label: 'Nächste Zone vorhanden', met: !!targets[0] },
          ],
          regime,
          reversalObs,
        }));
      }
    }
  }

  return scenarios;
}

// ---------- OBSERVE section (OODA format) ----------
// Narrative read per timeframe — WHY the scenarios below make sense, not a
// data dump. Deliberately drops the raw level listing (visible on the chart
// already); only mentions a specific price when it explains something (a
// break, a rejection, a target) that the scenarios build on.
function describeObserve12h(obs) {
  if (!obs || !obs.lastCandles.length) return null;
  const last = obs.lastCandles[obs.lastCandles.length - 1];
  const isGreen = last.close > last.open;
  let text = isGreen
    ? '12H: Letzte Kerze bullisch — der übergeordnete Rahmen bleibt intakt.'
    : '12H: Letzte Kerze bärisch — deutliche Gegenbewegung auf der großen Zeitebene.';
  if (obs.pdhl && obs.pdhl.pdh != null && last.high >= obs.pdhl.pdh) {
    text += ` Das Vortages-Hoch (${obs.pdhl.pdh.toFixed(1)}) wurde dabei angelaufen.`;
  }
  return text;
}

function describeObserve4h(obs) {
  if (!obs || !obs.lastCandles.length) return null;
  const last = obs.lastCandles[obs.lastCandles.length - 1];
  const isGreen = last.close > last.open;
  const sentences = [`4H: Letzte Kerze ${isGreen ? 'bullisch' : 'bärisch'}.`];
  if (obs.pdhl && obs.pdhl.pdl != null && last.close < obs.pdhl.pdl) {
    sentences.push(`Das Vortages-Tief (${obs.pdhl.pdl.toFixed(1)}) wurde per Close unterschritten — relevant als mögliche Gegentrend-Marke.`);
  }
  if (obs.fvgs && obs.fvgs.length) {
    sentences.push('Es gibt noch offene 15min-FVGs, die als Ziel für einen Bounce dienen können.');
  }
  return sentences.join(' ');
}

function describeObserveTactical(obs) {
  if (!obs || !obs.lastCandles.length) return null;
  const { lastCandles, tf } = obs;
  const allRed = lastCandles.every(c => c.close < c.open);
  const allGreen = lastCandles.every(c => c.close > c.open);
  const pattern = allRed ? 'durchgehend rote Kerzen (klare Abwärts-Stufentreppe)'
    : allGreen ? 'durchgehend grüne Kerzen (klare Aufwärts-Stufentreppe)'
    : 'gemischtes Bild, keine klare Richtung';
  const last = lastCandles[lastCandles.length - 1];
  let pdlNote = '';
  if (obs.pdhl && obs.pdhl.pdl != null && last.close < obs.pdhl.pdl) pdlNote = ` PDL (${obs.pdhl.pdl.toFixed(1)}) bereits durchbrochen.`;
  let sweepNote = '';
  if (obs.sweepMss) {
    const s = obs.sweepMss;
    const dirWord = s.type === 'bullish' ? 'aufwärts' : 'abwärts';
    sweepNote = ` Kürzlich Sweep+MSS erkannt: Liquidität bei ${s.sweptLevel.toFixed(1)} genommen, danach MSS ${dirWord} über/unter ${s.mssLevel.toFixed(1)} bestätigt.`;
  }
  return `${tf}: Letzte ${lastCandles.length} Kerzen zeigen ${pattern}. Aktuell ${last.close.toFixed(1)}.${pdlNote}${sweepNote}`;
}

function describeHtfBiasSection(shortTermBias, htfBias) {
  const shortLabel = shortTermBias === 'bullish' ? 'bullisch' : shortTermBias === 'bearish' ? 'bärisch' : 'unklar';
  const medLabel = htfBias === 'bullish' ? 'bullisch' : htfBias === 'bearish' ? 'bärisch' : 'unklar';
  if (shortLabel === medLabel) return `Kurzfristig und übergeordnet ziehen beide in dieselbe Richtung: ${medLabel}.`;
  return `Kurzfristig läuft's grad ${shortLabel}, aber der übergeordnete 4H-Trend bleibt ${medLabel} — das ist ein Gegenzug innerhalb des größeren Bildes, keine Umkehr.`;
}

// Erzählt, was der Kurs relativ zu Trend/Zonen/Premium-Discount gemacht hat —
// ersetzt die reine Regime/PDHL-Auflistung durch eine Begründung, warum die
// unten gezeigten (oder fehlenden) Entries so zustande kommen.
function describeMarketNarrative(htfBias, lastBosTrend, premiumDiscount, activeLevels4h, lastClose) {
  if (!htfBias) return 'Kein bestätigter 4H-BOS im analysierten Fenster – der Trend ist unklar, daher aktuell keine Setup-Richtung.';

  const dir = htfBias === 'bullish' ? 'bullisch' : 'bärisch';
  const breakVerb = htfBias === 'bullish' ? 'nach oben durchbrochen' : 'nach unten durchbrochen';
  const dirWord = htfBias === 'bullish' ? 'Demand' : 'Supply';
  const sentences = [`Der Kurs hat zuletzt die Struktur bei ${lastBosTrend.level.toFixed(1)} ${breakVerb} und damit den 4H-Trend auf ${dir} gedreht.`];

  if (premiumDiscount) {
    const zoneLabel = premiumDiscount.zone === 'discount' ? 'Discount' : 'Premium';
    const favWord = premiumDiscount.favorable ? 'günstig' : 'eher ungünstig';
    const forWhat = htfBias === 'bullish' ? 'für weitere Käufe' : 'für weitere Verkäufe';
    sentences.push(`Aktuell bei ${lastClose}, damit im ${zoneLabel}-Bereich der letzten Schwankung (${premiumDiscount.low.toFixed(1)}–${premiumDiscount.high.toFixed(1)}, Mitte ${premiumDiscount.midpoint.toFixed(1)}) – das ist ${favWord} ${forWhat}.`);
  }

  if (activeLevels4h && activeLevels4h.length) {
    const list = activeLevels4h.map(l => l.price.toFixed(1)).join(', ');
    sentences.push(`In Trendrichtung stehen aktive 4H-${dirWord}-Level bei ${list} – diese werden auf eine Reaktion beobachtet.`);
  } else {
    sentences.push(`Aktuell gibt es aber kein aktives 4H-${dirWord}-Level in Trendrichtung, daher kein Setup.`);
  }

  return sentences.join(' ');
}

// Coach-voice intro/outro, but facts in between as scannable bullets — the
// user tried prose-only for the checklist and asked for the bullets +
// colored-emoji checklist back, keeping the direct, personal framing.
export function describeScenario(s, idx) {
  const typeLabel = s.type === 'trend_reversal_poi' ? 'A: Trend-Reversal an POI' : s.type === 'counter_trend' ? 'B: Gegentrend-Fade' : s.type === 'consolidation_breakout' ? 'D: Konsolidierungs-Breakout' : `Typ: ${s.type}`;
  const dirWord = s.direction === 'LONG' ? 'Long' : 'Short';
  const ratingText = s.probability === 'B+'
    ? 'Solide Chance, wenn die Bestätigung kommt.'
    : s.probability === 'B'
      ? 'Brauchbar, aber noch nicht ganz rund — warte auf mehr Bestätigung.'
      : 'Eher schwach im Moment, nur mit Vorsicht angehen.';
  const tp = s.targets[0];

  const lines = [`🎯 Szenario ${typeLabel}: ${s.label} — dein ${dirWord}-Plan, falls der Kurs bei ${s.zonePrice.toFixed(1)} reagiert.`];
  lines.push(`• Zone: ${s.zonePrice.toFixed(1)}`);
  lines.push(`• Stopp: ${s.sl.toFixed(1)}`);
  lines.push(`• Ziel: ${tp != null ? tp.toFixed(1) : 'n/a'}`);
  lines.push(`• Lotsize: ${s.regime.lotsize}`);
  lines.push('• Confluence:');
  s.checklist.forEach(c => lines.push(`   ${c.met ? '🟢' : '🔴'} ${c.label}`));
  if (s.warningOb) {
    lines.push(`⚠️ Order Block gegen diese Richtung bei ${s.warningOb.low.toFixed(1)}–${s.warningOb.high.toFixed(1)} — könnte den Move früh abwürgen.`);
  }
  lines.push(`Mein Rating: ${s.probability}. ${ratingText}`);
  if (s.historicalStats && s.historicalStats.resolvedCount >= 3) {
    const { winRate, wins, resolvedCount } = s.historicalStats;
    lines.push(`📊 Erfahrungswert: ${wins}/${resolvedCount} Szenarien dieses Typs haben bisher ihr Ziel erreicht (${Math.round(winRate * 100)}%).`);
  }
  return lines.join('\n');
}

// OODA structure, step 1 of the redesign (user-requested): OBSERVE (per-
// timeframe facts) + HTF-BIAS (short vs medium term) replace the old flat
// MARKTLAGE block. Scenario planning / no-trade zones / session-based action
// plan are deliberately NOT here yet — those need new detection (Sweep+MSS)
// and session-window definitions that don't exist yet; next steps.
// User's own ORB (session-configurable, currently 09:00-09:30) and "VWAP
// Auto Anchored" indicators, read directly off their chart (not
// recomputed) — user-specified, 28.07.2026: these + PDH/PDL/zones/FVGs are
// what they build their daily discretionary plan from every morning.
function describeOrbVwap(orbVwap, lastClose) {
  if (!orbVwap || (orbVwap.vwap == null && orbVwap.orbHigh == null)) return null;
  const parts = [];
  if (orbVwap.orbHigh != null && orbVwap.orbLow != null) {
    const range = orbVwap.orbHigh - orbVwap.orbLow;
    const position = lastClose > orbVwap.orbHigh ? 'über der ORB-Range (Breakout nach oben)'
      : lastClose < orbVwap.orbLow ? 'unter der ORB-Range (Breakout nach unten)'
      : 'innerhalb der ORB-Range';
    parts.push(`ORB: Hoch ${orbVwap.orbHigh.toFixed(1)}, Tief ${orbVwap.orbLow.toFixed(1)} (Range ${range.toFixed(1)} Pkt) — Kurs aktuell ${position}.`);
  }
  if (orbVwap.vwap != null) {
    const diff = lastClose - orbVwap.vwap;
    parts.push(`VWAP: ${orbVwap.vwap.toFixed(1)} — Kurs ${diff >= 0 ? diff.toFixed(1) + ' Pkt darüber' : Math.abs(diff).toFixed(1) + ' Pkt darunter'}.`);
  }
  return parts.join(' ');
}

export function buildBriefing({ regime, htfBias, lastBosTrend, shortTermBias, premiumDiscount, activeLevels4h, scenarios, lastClose, dataWarnings, dateDisplay, timeDisplay, session, observe12h, observe4h, observeTactical, orbVwap }) {
  const lines = [];
  const sessionNote = session
    ? (session.inWindow ? `Aktuelle Phase: ${session.label}.` : 'Du bist aktuell außerhalb deiner Handelsfenster — gute Gelegenheit, dich in Ruhe vorzubereiten.')
    : '';
  lines.push(`DE40 steht bei ${lastClose}, ${dateDisplay} ${timeDisplay}. ${sessionNote}`);
  lines.push('');

  if (dataWarnings.length) {
    for (const w of dataWarnings) lines.push(`⚠️ ${w}`);
    lines.push('');
  }

  lines.push('So sieht der Markt gerade aus:');
  [describeObserve12h(observe12h), describeObserve4h(observe4h), describeObserveTactical(observeTactical), describeOrbVwap(orbVwap, lastClose)]
    .filter(Boolean)
    .forEach(l => lines.push(l));
  lines.push('');

  lines.push(describeHtfBiasSection(shortTermBias, htfBias));
  lines.push(describeMarketNarrative(htfBias, lastBosTrend, premiumDiscount, activeLevels4h, lastClose));
  lines.push('');

  if (scenarios && scenarios.length) {
    lines.push('Das sind deine Optionen:');
    scenarios.forEach((s, idx) => {
      if (idx > 0) lines.push('');
      lines.push(describeScenario(s, idx));
    });
  } else {
    // No B/D setup qualifies today — most often because no opposing 4H
    // level exists yet for B to fade into. User-specified, 28.07.2026: still
    // surface the nearest levels worth watching instead of just "nichts
    // ableitbar" — but explicitly as observation only, NOT a trade idea.
    // B/D's own entry conditions (backtest-calibrated, 87.8%/100% WR) are
    // deliberately left untouched here — this is not a third scenario type.
    lines.push('Aktuell kein B/D-Setup aktiv (kein Trend oder keine aktive Gegentrend-Zone).');
    const nearest = (activeLevels4h || [])
      .slice()
      .sort((a, b) => Math.abs(a.price - lastClose) - Math.abs(b.price - lastClose))
      .slice(0, 2);
    if (nearest.length) {
      lines.push('');
      lines.push('👀 Kein Trade-Signal, nur zur Beobachtung — die nächstgelegenen aktiven 4H-Level:');
      nearest.forEach(l => lines.push(`   • ${l.type === 'demand' ? 'Demand' : 'Supply'} bei ${l.price.toFixed(1)} (${Math.abs(l.price - lastClose).toFixed(1)} Pkt entfernt)`));
    }
  }

  return lines.join('\n');
}
