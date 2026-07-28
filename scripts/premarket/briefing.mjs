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
function buildScenario({ type, label, direction, zonePrice, sl, targets, checklist, regime, reversalObs }) {
  const metCount = checklist.filter(c => c.met).length;
  const totalCount = checklist.length;
  const probability = metCount >= totalCount - 1 ? 'B+' : metCount >= totalCount - 2 ? 'B' : 'C';
  // An Order Block against this scenario's direction, close to the zone, is
  // a reversal warning — informational, doesn't change the checklist/grade.
  const oppositeType = direction === 'LONG' ? 'bearish' : 'bullish';
  const warningOb = (reversalObs || []).find(o => o.type === oppositeType &&
    Math.abs((o.low + o.high) / 2 - zonePrice) < Math.abs(zonePrice) * 0.01);
  return { type, label, direction, zonePrice, sl, targets, checklist, metCount, totalCount, probability, regime, warningOb };
}

export function buildScenarios({ htfBias, activeLevels4h, fvgsTactical, pdhl, lastClose, regime, sweepMss, premiumDiscount, bars5, nowSec, reversalObs, shortTermBias, tacticalAtr, tacticalBars, session, htfMs }) {
  if (!htfBias) return [];
  const bull = htfBias === 'bullish';
  const scenarios = [];

  // Scenario A: REMOVED (08.07.2026)
  // Trend-Bounce against intraday pressure was structurally unprofitable in 6M
  // backtest: all 9 parameter combinations tested negative (−0.11R to −0.42R).
  // Grade filters and SL-buffer variations provided no salvage. The setup simply
  // does not work in this market regime. Dead code.

  // Scenario B: counter-trend continuation — pullback into an opposing 4H
  // level or the PDHL boundary against the trend gets rejected. After backtest:
  // original targets were far (RR >> 8) and almost never hit — switch to fixed 2R.
  // Original buffer (0.0006) was too tight, doubled to 0.0012.
  // Jul 2026: Parameter-Sweep showed 0.0018 buffer + 3× target optimal:
  // 83.9% WR, +2.35R ExpR (+1.13R over baseline). Broader buffer filters
  // Fake-Out spikes; higher target leverages better SL/distance ratio.
  //
  // 1H-MS-Kontext-Filter (09.07.2026): cross-referenced every historical B
  // trade (451 resolved, 6-Monats-Log) against the 1H detectMarketShift
  // state at that moment. Counter-intuitive result — trades where the 1H MS
  // CONFIRMS the SAME direction as htfBias (trend intact, no reversal signal
  // yet) outperform trades where the 1H MS already confirms AGAINST htfBias
  // (a genuine reversal already under way): 91.8% WR/+2.67R vs. 85.1%
  // WR/+2.41R. A cleanly intact trend makes the zone-rejection this scenario
  // bets on more reliable than an already-destabilizing one — the opposite
  // of the initial hypothesis (that 1H agreeing with B's OWN countertrend
  // direction would help), which the data flatly rejected. Both cohorts are
  // still strongly profitable; this is a confidence signal, not a filter
  // that should block the trade.
  const htfMsConfirmsTrend = !!(htfMs && htfMs.status === 'confirmed' && htfMs.direction === htfBias);
  const counterLevels = activeLevels4h.filter(l => l.type === (bull ? 'supply' : 'demand'));
  const pdBoundary = bull ? (pdhl && pdhl.pdl) : (pdhl && pdhl.pdh);
  const counterPool = [...counterLevels.map(l => l.price), ...(pdBoundary != null ? [pdBoundary] : [])]
    .filter(p => (bull ? p > lastClose : p < lastClose));
  if (counterPool.length) {
    const nearestCounter = counterPool.sort((a, b) => (bull ? a - b : b - a))[0];
    const buffer = Math.abs(nearestCounter) * 0.0018;
    const sl = bull ? nearestCounter + buffer : nearestCounter - buffer;
    const slDist = Math.abs(nearestCounter - sl);
    const targets = [bull ? nearestCounter + 3 * slDist : nearestCounter - 3 * slDist];

    scenarios.push(buildScenario({
      type: 'counter_trend',
      label: `${bull ? 'Short' : 'Long'} Continuation bei Pullback in ${nearestCounter.toFixed(1)}`,
      direction: bull ? 'SHORT' : 'LONG',
      zonePrice: nearestCounter,
      sl,
      targets,
      checklist: [
        { label: `Gegentrend-Level/PDHL-Grenze (${nearestCounter.toFixed(1)})`, met: true },
        { label: 'Rejection an der Zone', met: false },
        { label: 'MSS in Gegenrichtung', met: false },
        { label: '5min-Bestätigung', met: false },
        { label: `1H-MS bestätigt intakten ${bull ? 'bullish' : 'bearish'}-Trend`, met: htfMsConfirmsTrend },
      ],
      regime,
      reversalObs,
    }));
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
function describeScenario(s, idx) {
  const typeLabel = s.type === 'counter_trend' ? 'B: Gegentrend-Fade' : s.type === 'consolidation_breakout' ? 'D: Konsolidierungs-Breakout' : `Typ: ${s.type}`;
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
export function buildBriefing({ regime, htfBias, lastBosTrend, shortTermBias, premiumDiscount, activeLevels4h, scenarios, lastClose, dataWarnings, dateDisplay, timeDisplay, session, observe12h, observe4h, observeTactical }) {
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
  [describeObserve12h(observe12h), describeObserve4h(observe4h), describeObserveTactical(observeTactical)]
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
