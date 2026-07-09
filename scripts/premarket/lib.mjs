/**
 * DE40 Pre-Market analysis engine — implements the detection rules from the
 * operating spec exactly (swing N=2 fractals, close-confirmed MSS/BOS,
 * OB = open-to-wick zones tied to a specific BOS event, classic 3-candle FVG,
 * ATR-based HTF S/D zones, 0.05%-tolerance S/R clustering, regime classification).
 */

// ---------- indicators ----------

export function atr(bars, period = 14) {
  const trs = [];
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i].high, l = bars[i].low, pc = bars[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const result = new Array(bars.length).fill(null);
  for (let i = period; i < bars.length; i++) {
    let sum = 0;
    for (let j = i - period; j < i; j++) sum += trs[j];
    result[i] = sum / period;
  }
  return result;
}

// ---------- swing points (N=2 fractal, section 2) ----------

export function findSwings(bars, n = 2) {
  const highs = [], lows = [];
  for (let i = n; i < bars.length - n; i++) {
    const h = bars[i].high, l = bars[i].low;
    let isHigh = true, isLow = true;
    for (let k = 1; k <= n; k++) {
      if (bars[i - k].high >= h || bars[i + k].high >= h) isHigh = false;
      if (bars[i - k].low <= l || bars[i + k].low <= l) isLow = false;
    }
    if (isHigh) highs.push({ price: h, time: bars[i].time, index: i });
    if (isLow) lows.push({ price: l, time: bars[i].time, index: i });
  }
  return { highs, lows };
}

// ---------- HH/HL/LH/LL structure labeling ----------
// Raw fractal highs/lows (findSwings) don't strictly alternate — it's
// common to get two or more same-type fractals in a row with no opposite-
// type fractal confirmed in between (e.g. two separate high fractals before
// the next low). A proper swing-structure read needs a strictly alternating
// high/low sequence first: collapse any same-type run down to its single
// most extreme point — the highest of a run of highs, the lowest of a run
// of lows (user-specified, 09.07.2026: "es gilt immer der tiefste Punkt als
// HL oder LL und der höchste Punkt als HH und LH" — and no two lows, or two
// highs, back to back). Everything downstream (labeling, counter-trend
// filtering) then reads off this alternating list, not the raw fractals.
function buildAlternatingSwings(bars, n) {
  const { highs, lows } = findSwings(bars, n);
  const merged = [
    ...highs.map(h => ({ ...h, swingType: 'high' })),
    ...lows.map(l => ({ ...l, swingType: 'low' })),
  ].sort((a, b) => a.index - b.index);

  const alternating = [];
  for (const point of merged) {
    const last = alternating[alternating.length - 1];
    if (last && last.swingType === point.swingType) {
      const moreExtreme = point.swingType === 'high' ? point.price > last.price : point.price < last.price;
      if (moreExtreme) alternating[alternating.length - 1] = point;
    } else {
      alternating.push(point);
    }
  }
  return alternating;
}

// ---------- Market Shift (MS) detection ----------
// State machine over the alternating swing sequence (see
// buildAlternatingSwings). Tracks the currently SETTLED regime (the last
// fully-confirmed direction) and, if a reversal attempt against it is under
// way, a PENDING trigger (the swing/level break awaiting confirmation).
//
// User-specified definition, 09.07.2026: in a bullish regime, a potential
// MS starts the moment the low protecting the current HH (the HL right
// before it — which, thanks to the cross-reset in the loop below, is
// exactly referenceLowPoint) gets broken. It's CONFIRMED once the next high
// forms as a LH (fails to reclaim the still-standing HH) rather than a
// fresh HH — a fresh HH instead means price reclaimed, so the attempt is
// INVALIDATED (no shift happened; back to a clean, unremarkable bullish
// regime with a fresh protective low). Mirrors symmetrically for a bearish
// regime (LH break -> potential bullish; confirmed by a subsequent HL that
// fails to break the still-standing LL; invalidated by a fresh LL).
//
// The latest raw CLOSE is checked directly against the active protective
// level too, not just fractal-confirmed swings (which lag by n bars) — the
// whole point of a responsive MS read is to not miss the moment it actually
// happens, which is exactly the staleness bug an earlier, swing-label-only
// version of this logic ran into (a live case 09.07.2026: a fresh LH+LL
// right after a clean uptrend read as just "bullish" until enough bars had
// passed for the fractal to confirm).
export function detectMarketShift(bars, n = 2) {
  const alternating = buildAlternatingSwings(bars, n);
  let referenceHighPoint = null, referenceLowPoint = null;
  let lastHighPoint = null, lastLowPoint = null;
  let settledDirection = null; // last fully-confirmed regime (null = never confirmed yet)
  let pending = null; // { direction, triggerPoint, brokenLevel } — a reversal attempt awaiting confirmation
  let lastConfirmedEvent = null; // { direction, triggerPoint, confirmPoint, brokenLevel }

  for (const point of alternating) {
    if (point.swingType === 'high') {
      if (referenceHighPoint == null) {
        referenceHighPoint = point;
      } else if (point.price > referenceHighPoint.price) {
        // Capture the OLD reference BEFORE overwriting it — this is the
        // actual level that got broken (e.g. the "letzte HL vor dem
        // aktuellen HH" the user refers to), needed later to draw a
        // horizontal line at the level that was violated, not at whatever
        // the reference has since moved on to (user-specified, 09.07.2026 —
        // found live: without this capture, referenceLowPoint/HighPoint had
        // already been reassigned by the time a caller reads it back out).
        const brokenHigh = referenceHighPoint;
        referenceHighPoint = point;
        if (lastLowPoint) referenceLowPoint = lastLowPoint;
        if (settledDirection === 'bearish') {
          pending = { direction: 'bullish', triggerPoint: point, brokenLevel: brokenHigh };
        } else {
          pending = null; // normal continuation (or bootstrap) — nothing pending against it
          if (settledDirection == null) settledDirection = 'bullish';
        }
      } else if (pending && pending.direction === 'bearish') {
        settledDirection = 'bearish';
        lastConfirmedEvent = { direction: 'bearish', triggerPoint: pending.triggerPoint, confirmPoint: point, brokenLevel: pending.brokenLevel };
        pending = null;
      }
      lastHighPoint = point;
    } else {
      if (referenceLowPoint == null) {
        referenceLowPoint = point;
      } else if (point.price < referenceLowPoint.price) {
        const brokenLow = referenceLowPoint;
        referenceLowPoint = point;
        if (lastHighPoint) referenceHighPoint = lastHighPoint;
        if (settledDirection === 'bullish') {
          pending = { direction: 'bearish', triggerPoint: point, brokenLevel: brokenLow };
        } else {
          pending = null;
          if (settledDirection == null) settledDirection = 'bearish';
        }
      } else if (pending && pending.direction === 'bullish') {
        settledDirection = 'bullish';
        lastConfirmedEvent = { direction: 'bullish', triggerPoint: pending.triggerPoint, confirmPoint: point, brokenLevel: pending.brokenLevel };
        pending = null;
      }
      lastLowPoint = point;
    }
  }

  const lastBar = bars[bars.length - 1];
  const now = lastBar.time;

  if (pending) {
    const invalidatedLive = pending.direction === 'bearish'
      ? (referenceHighPoint && lastBar.close > referenceHighPoint.price)
      : (referenceLowPoint && lastBar.close < referenceLowPoint.price);
    if (!invalidatedLive) {
      const level = pending.direction === 'bearish' ? referenceHighPoint.price : referenceLowPoint.price;
      return { status: 'potential', direction: pending.direction, break_time: pending.triggerPoint.time, level, brokenLevel: pending.brokenLevel, candlePrice: pending.triggerPoint.price, now };
    }
    // Invalidated live (ahead of the next swing fractal-confirming it) — fall through to the settled state below.
  } else {
    if (settledDirection === 'bullish' && referenceLowPoint && referenceHighPoint && lastBar.close < referenceLowPoint.price) {
      return { status: 'potential', direction: 'bearish', break_time: lastBar.time, level: referenceHighPoint.price, brokenLevel: referenceLowPoint, candlePrice: lastBar.close, now };
    }
    if (settledDirection === 'bearish' && referenceHighPoint && referenceLowPoint && lastBar.close > referenceHighPoint.price) {
      return { status: 'potential', direction: 'bullish', break_time: lastBar.time, level: referenceLowPoint.price, brokenLevel: referenceHighPoint, candlePrice: lastBar.close, now };
    }
  }

  if (lastConfirmedEvent) {
    const level = lastConfirmedEvent.direction === 'bearish' ? referenceHighPoint.price : referenceLowPoint.price;
    return { status: 'confirmed', direction: lastConfirmedEvent.direction, break_time: lastConfirmedEvent.confirmPoint.time, level, brokenLevel: lastConfirmedEvent.brokenLevel, candlePrice: lastConfirmedEvent.confirmPoint.price, now };
  }

  // Check for unconfirmed trend break: analyze the last 4 swings
  // Pattern: trend (2 swings) + break (1 swing) + non-confirmation (1 swing)
  // Bullish: LL, LH, HH, (not HL) → potential bullish MS at LH level
  // Bearish: HH, HL, LL, (not LH) → potential bearish MS at HL level
  if (alternating.length >= 4) {
    const recent = alternating.slice(-4);
    const [s1, s2, s3, s4] = [recent[0], recent[1], recent[2], recent[3]];

    // Bullish unconfirmed: LL, LH, HH, not-HL
    if (s1.swingType === 'low' && s2.swingType === 'high' && s3.swingType === 'high' && s4.swingType === 'low') {
      if (s3.price > s1.price && s2.price < s3.price && s4.price <= s2.price) {
        // HH appeared, but next low is not higher (not HL)
        return {
          status: 'potential',
          direction: 'bullish',
          break_time: s3.time,
          level: s2.price,  // HL expected here
          brokenLevel: { price: s2.price, time: s2.time },
          candlePrice: s3.price,
          now,
          unconfirmedTrendBreak: true
        };
      }
    }

    // Bearish unconfirmed: HH, HL, LL, not-LH
    if (s1.swingType === 'high' && s2.swingType === 'low' && s3.swingType === 'low' && s4.swingType === 'high') {
      if (s3.price < s1.price && s2.price > s3.price && s4.price >= s2.price) {
        // LL appeared, but next high is not lower (not LH)
        return {
          status: 'potential',
          direction: 'bearish',
          break_time: s3.time,
          level: s2.price,  // LH expected here
          brokenLevel: { price: s2.price, time: s2.time },
          candlePrice: s3.price,
          now,
          unconfirmedTrendBreak: true
        };
      }
    }
  }

  return { status: 'none', direction: settledDirection, now };
}

// ---------- Market Shift Confluence Validation ----------
// Rule: HTF MS can only exist if it matches LTF direction
// "Was sich auf dem kleinen TF abzeichnet, muss später auch auf dem großen TF bestätigt werden"
// No HTF MS without prior LTF confirmation
//
// Returns { ltfMs, htfMs, isConfluent, reason }
export function validateMsConfluence(ltfMs, htfMs) {
  // If LTF has no MS, don't draw any HTF MS either
  if (ltfMs.status === 'none') {
    return {
      ltfMs,
      htfMs: { status: 'none', direction: null },
      isConfluent: true,
      reason: 'No LTF MS → HTF suppressed'
    };
  }

  // If LTF MS exists, HTF must have same direction (or none)
  if (htfMs.status === 'none') {
    return {
      ltfMs,
      htfMs,
      isConfluent: true,
      reason: `LTF ${ltfMs.direction} exists, no HTF MS`
    };
  }

  // Both exist: directions must match
  if (ltfMs.direction === htfMs.direction) {
    return {
      ltfMs,
      htfMs,
      isConfluent: true,
      reason: `Confluence ✅: LTF ${ltfMs.direction} = HTF ${htfMs.direction}`
    };
  }

  // Mismatch: suppress HTF, keep LTF
  return {
    ltfMs,
    htfMs: { status: 'none', direction: null },
    isConfluent: false,
    reason: `Mismatch ❌: LTF ${ltfMs.direction} ≠ HTF ${htfMs.direction} → HTF suppressed`
  };
}

// ---------- Market Shift Age Detection ----------
// Check if an MS is "old" (different from current) by comparing key attributes
// Used for cleanup: delete old MS when new ones are detected
//
// Returns true if this MS is different/old compared to the current one
export function isMsOld(previousMs, currentMs) {
  // If both are 'none', not old
  if (previousMs?.status === 'none' && currentMs?.status === 'none') {
    return false;
  }

  // If one is 'none' and other isn't, it's old
  if ((previousMs?.status === 'none') !== (currentMs?.status === 'none')) {
    return true;
  }

  // If directions differ, it's old (reversal happened)
  if (previousMs?.direction !== currentMs?.direction) {
    return true;
  }

  // If status differs (e.g. potential → confirmed), it's potentially new
  if (previousMs?.status !== currentMs?.status) {
    return false; // Evolution of same MS, not old
  }

  // If break_time differs significantly (>1 hour), it's a new MS
  if (previousMs?.break_time && currentMs?.break_time) {
    const timeDiff = Math.abs((currentMs.break_time - previousMs.break_time) * 1000); // seconds to ms
    if (timeDiff > 3600000) { // 1 hour
      return true;
    }
  }

  return false;
}

// Backtest-oriented sibling of detectMarketShift: instead of only the
// CURRENT state, walks the entire alternating swing sequence once and
// returns every confirmed-MS event that occurred historically (09.07.2026,
// for evaluating "was ist der Erfolg, wenn man bestätigte MS als Entry
// Trigger benutzt"). Same state machine (deliberately duplicated rather
// than refactored to share code with detectMarketShift, to avoid any risk
// of changing the already-verified live detection logic while adding this).
// Each event: { direction, triggerPoint, confirmPoint, brokenLevel, level }
// — `level` is the still-standing opposite reference AT THE MOMENT of
// confirmation (the same "must not be reclaimed" threshold detectMarketShift
// exposes live), usable as a stop-loss anchor.
export function detectMarketShiftEvents(bars, n = 2) {
  const alternating = buildAlternatingSwings(bars, n);
  let referenceHighPoint = null, referenceLowPoint = null;
  let lastHighPoint = null, lastLowPoint = null;
  let settledDirection = null;
  let pending = null;
  const events = [];

  for (const point of alternating) {
    if (point.swingType === 'high') {
      if (referenceHighPoint == null) {
        referenceHighPoint = point;
      } else if (point.price > referenceHighPoint.price) {
        const brokenHigh = referenceHighPoint;
        referenceHighPoint = point;
        if (lastLowPoint) referenceLowPoint = lastLowPoint;
        if (settledDirection === 'bearish') {
          pending = { direction: 'bullish', triggerPoint: point, brokenLevel: brokenHigh };
        } else {
          pending = null;
          if (settledDirection == null) settledDirection = 'bullish';
        }
      } else if (pending && pending.direction === 'bearish') {
        settledDirection = 'bearish';
        events.push({ direction: 'bearish', triggerPoint: pending.triggerPoint, confirmPoint: point, brokenLevel: pending.brokenLevel, level: referenceHighPoint.price });
        pending = null;
      }
      lastHighPoint = point;
    } else {
      if (referenceLowPoint == null) {
        referenceLowPoint = point;
      } else if (point.price < referenceLowPoint.price) {
        const brokenLow = referenceLowPoint;
        referenceLowPoint = point;
        if (lastHighPoint) referenceHighPoint = lastHighPoint;
        if (settledDirection === 'bullish') {
          pending = { direction: 'bearish', triggerPoint: point, brokenLevel: brokenLow };
        } else {
          pending = null;
          if (settledDirection == null) settledDirection = 'bearish';
        }
      } else if (pending && pending.direction === 'bullish') {
        settledDirection = 'bullish';
        events.push({ direction: 'bullish', triggerPoint: pending.triggerPoint, confirmPoint: point, brokenLevel: pending.brokenLevel, level: referenceLowPoint.price });
        pending = null;
      }
      lastLowPoint = point;
    }
  }
  return events;
}

// ---------- MSS/BOS state machine (section 3) ----------
// A break only counts once a candle CLOSES beyond the last relevant swing
// high/low (wicks don't count). After a break, the reference swing advances
// to the next swing point formed beyond that break, so the same level can't
// fire twice.
export function findBosEvents(bars, n = 2) {
  const { highs, lows } = findSwings(bars, n);
  const events = [];

  let hPtr = 0, lPtr = 0;
  let activeHigh = highs[hPtr] || null;
  let activeLow = lows[lPtr] || null;

  for (let i = n; i < bars.length; i++) {
    if (activeHigh && bars[i].index === undefined) { /* bars have no index field; use i directly */ }
    if (activeHigh && i > activeHigh.index && bars[i].close > activeHigh.price) {
      events.push({ type: 'bullish', break_index: i, break_time: bars[i].time, level: activeHigh.price, swing_index: activeHigh.index });
      while (hPtr < highs.length && highs[hPtr].index <= i) hPtr++;
      activeHigh = highs[hPtr] || null;
    }
    if (activeLow && i > activeLow.index && bars[i].close < activeLow.price) {
      events.push({ type: 'bearish', break_index: i, break_time: bars[i].time, level: activeLow.price, swing_index: activeLow.index });
      while (lPtr < lows.length && lows[lPtr].index <= i) lPtr++;
      activeLow = lows[lPtr] || null;
    }
  }
  events.sort((a, b) => a.break_index - b.break_index);
  return events;
}

// ---------- Order Blocks — user's exact definition ----------
// Bullish OB: candle c is bearish and CLOSES below the previous candle's low
// (decisive break, not just a wick); the very next candle is bullish and its
// move creates a 3-candle FVG together with the candle after that (c.high <
// bars[j+2].low) — but the gap alone isn't enough: user-calibrated against
// real chart examples confirmed gap size must be >= minGapAtrMult x ATR14, or
// it's just a technical/insignificant gap, not the "deutlicher schneller
// Anstieg" (V-shaped, sharp move) the definition requires (default 0.25,
// tightened from an initial 0.5 down to where it still excludes noise-level
// gaps but stops missing valid setups). The move must also go on to produce
// a confirmed BOS within `horizon` bars (default 25). Zone = full high..low
// of candle c (not open-based). Bearish OB is the mirror image.
export function findOrderBlocks(bars, bosEvents, horizon = 25, minGapAtrMult = 0.25) {
  const atrArr = atr(bars, 14);
  const findConfirmingBos = (implIdx, direction) =>
    bosEvents.find(e => e.type === direction && e.break_index >= implIdx && e.break_index <= implIdx + horizon);

  const obs = [];
  for (let j = 1; j < bars.length - 2; j++) {
    const prev = bars[j - 1], c = bars[j], impulse = bars[j + 1], after = bars[j + 2];
    const atrV = atrArr[j];
    if (!atrV) continue;

    if (c.close < c.open && c.close < prev.low) {
      const gap = after.low - c.high;
      if (impulse.close > impulse.open && gap >= atrV * minGapAtrMult) {
        const confirmed = findConfirmingBos(j + 1, 'bullish');
        if (confirmed) {
          obs.push({
            type: 'bullish', low: c.low, high: c.high, time: c.time, index: j,
            bos_index: confirmed.break_index, bos_time: confirmed.break_time, swing_broken: confirmed.level,
          });
        }
      }
    }

    if (c.close > c.open && c.close > prev.high) {
      const gap = c.low - after.high;
      if (impulse.close < impulse.open && gap >= atrV * minGapAtrMult) {
        const confirmed = findConfirmingBos(j + 1, 'bearish');
        if (confirmed) {
          obs.push({
            type: 'bearish', low: c.low, high: c.high, time: c.time, index: j,
            bos_index: confirmed.break_index, bos_time: confirmed.break_time, swing_broken: confirmed.level,
          });
        }
      }
    }
  }
  // section 9.2: invalidated once a candle CLOSES all the way through the
  // zone to the opposite side (a wick test/bounce does NOT invalidate it)
  for (const o of obs) {
    o.mitigated = false;
    for (let k = o.bos_index + 1; k < bars.length; k++) {
      if (o.type === 'bullish' && bars[k].close < o.low) { o.mitigated = true; break; }
      if (o.type === 'bearish' && bars[k].close > o.high) { o.mitigated = true; break; }
    }
  }
  // dedupe (same pivot candle can be referenced by more than one BOS in edge cases)
  const seen = new Set();
  return obs.filter(o => {
    const k = `${o.type}_${o.index}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ---------- Fair Value Gap (section 5) — classic 3-candle imbalance ----------
export function findFVGs(bars) {
  const gaps = [];
  for (let i = 1; i < bars.length - 1; i++) {
    const k1 = bars[i - 1], k3 = bars[i + 1];
    if (k3.low > k1.high) gaps.push({ type: 'bullish', low: k1.high, high: k3.low, time: bars[i].time, index: i });
    else if (k3.high < k1.low) gaps.push({ type: 'bearish', low: k3.high, high: k1.low, time: bars[i].time, index: i });
  }
  return gaps;
}

export function fvgFillFraction(gap, bars) {
  let filled = 0;
  for (let k = gap.index + 1; k < bars.length; k++) {
    const b = bars[k];
    if (gap.type === 'bullish') {
      if (b.low <= gap.low) return 1;
      if (b.low < gap.high) filled = Math.max(filled, (gap.high - b.low) / (gap.high - gap.low));
    } else {
      if (b.high >= gap.high) return 1;
      if (b.high > gap.low) filled = Math.max(filled, (b.high - gap.low) / (gap.high - gap.low));
    }
  }
  return filled;
}

// ---------- Engulfing candle detection ----------
// A candle that completely engulfs (higher high AND lower low) the previous candle.
function isEngulfingCandle(current, previous) {
  return current.high > previous.high && current.low < previous.low;
}

// ---------- Supply/Demand zones (section 6, HTF: 12H/4H) ----------
// Base candle(s) with small range right before an expansion candle
// (range > 1.5x ATR14) that leads to a confirmed BOS.
export function findSDZones(bars, bosEvents, maxPerSide = 3) {
  const atrArr = atr(bars, 14);
  const zones = [];
  // finds a BOS of the given direction whose break happens during/shortly
  // after the expansion leg (not necessarily the very next candle — a leg
  // can take a few bars to actually clear the reference swing)
  const findConfirmingBos = (impulseIdx, direction, horizon = 10) =>
    bosEvents.find(e => e.type === direction && e.break_index >= impulseIdx && e.break_index <= impulseIdx + horizon);

  for (let i = 15; i < bars.length - 1; i++) {
    const atrV = atrArr[i];
    if (!atrV) continue;
    const candle = bars[i];
    if (candle.high - candle.low > atrV * 0.6) continue; // not a base candle

    let baseStart = i;
    while (baseStart > 0 && baseStart > i - 3 && (bars[baseStart - 1].high - bars[baseStart - 1].low) <= atrV * 0.6) baseStart--;

    const baseSlice = bars.slice(baseStart, i + 1);
    const baseLow = Math.min(...baseSlice.map(b => b.low));
    const baseHigh = Math.max(...baseSlice.map(b => b.high));

    const next = bars[i + 1];
    const nextRange = next.high - next.low;
    if (nextRange < atrV * 1.5) continue;

    const bull = next.close > next.open && next.close > baseHigh;
    const bear = next.close < next.open && next.close < baseLow;
    if (!bull && !bear) continue;

    // must lead to a CONFIRMED BOS within a reasonable horizon of the impulse
    const confirmed = findConfirmingBos(i + 1, bull ? 'bullish' : 'bearish');
    if (!confirmed) continue;

    let mitigated = false;
    for (let k = i + 2; k < bars.length; k++) {
      if (bull && bars[k].close < baseLow) { mitigated = true; break; }
      if (bear && bars[k].close > baseHigh) { mitigated = true; break; }
    }

    zones.push({
      type: bull ? 'demand' : 'supply', low: baseLow, high: baseHigh,
      time: bars[baseStart].time, index: i, mitigated, bos_time: confirmed.break_time,
    });
  }

  const unmit = zones.filter(z => !z.mitigated);
  const pool = unmit.length ? unmit : zones;
  const demand = pool.filter(z => z.type === 'demand').sort((a, b) => b.index - a.index).slice(0, maxPerSide);
  const supply = pool.filter(z => z.type === 'supply').sort((a, b) => b.index - a.index).slice(0, maxPerSide);
  return [...demand, ...supply];
}

// ---------- Premium/Discount ----------
// Midpoint of the CURRENT leg — not just "the last high" and "the last low"
// independently, which could pair points from two different, unrelated legs
// (e.g. a fresh lower low that formed AFTER the swing high during a pullback
// would wrongly get paired with that high, measuring a down-leg instead of
// the up-leg). Per the user's reference diagram: for a bullish structure the
// swing LOW comes first, THEN the swing HIGH forms after it — same coherent
// move. So: anchor on the most recent swing high, then find the most recent
// swing low that precedes it (mirrored for bearish).
// Below the midpoint of an up-leg = Discount (relatively cheap, favourable
// for buying); above = Premium (unfavourable). Mirrored for a down-leg.
export function computePremiumDiscount(bars, trend, n = 2) {
  const { highs, lows } = findSwings(bars, n);
  if (!highs.length || !lows.length) return null;

  let anchorHigh, anchorLow;
  if (trend === 'bullish') {
    anchorHigh = highs[highs.length - 1];
    anchorLow = [...lows].reverse().find(l => l.index < anchorHigh.index);
  } else {
    anchorLow = lows[lows.length - 1];
    anchorHigh = [...highs].reverse().find(h => h.index < anchorLow.index);
  }
  if (!anchorHigh || !anchorLow) return null;

  const midpoint = (anchorHigh.price + anchorLow.price) / 2;
  const currentPrice = bars[bars.length - 1].close;
  const zone = trend === 'bullish'
    ? (currentPrice < midpoint ? 'discount' : 'premium')
    : (currentPrice > midpoint ? 'premium' : 'discount');
  const favorable = trend === 'bullish' ? zone === 'discount' : zone === 'premium';
  return { high: anchorHigh.price, low: anchorLow.price, midpoint, currentPrice, zone, favorable };
}

// ---------- Sweep + MSS (Market Structure Shift) ----------
// Sweep: a candle's wick violates a swing low/high without CLOSING beyond it
// (rejection — a liquidity grab, not a real break). MSS: a later candle
// CLOSES beyond a swing point in the OPPOSITE direction, confirming a
// structural reversal after the sweep. Distinct from a plain BOS: BOS is a
// single close-through break; this requires wick-rejection first, then a
// confirming break the other way.
export function findSweepMSS(bars, n = 2, horizonBars = 10) {
  const { highs, lows } = findSwings(bars, n);
  const results = [];

  for (const low of lows) {
    for (let i = low.index + 1; i <= low.index + horizonBars && i < bars.length; i++) {
      const c = bars[i];
      if (c.low < low.price && c.close > low.price) {
        const relevantHigh = highs.find(h => h.index > low.index && h.index <= i);
        if (relevantHigh) {
          for (let k = i + 1; k <= i + horizonBars && k < bars.length; k++) {
            if (bars[k].close > relevantHigh.price) {
              results.push({ type: 'bullish', sweepIndex: i, sweepTime: c.time, sweptLevel: low.price, mssIndex: k, mssTime: bars[k].time, mssLevel: relevantHigh.price });
              break;
            }
          }
        }
        break;
      }
    }
  }

  for (const high of highs) {
    for (let i = high.index + 1; i <= high.index + horizonBars && i < bars.length; i++) {
      const c = bars[i];
      if (c.high > high.price && c.close < high.price) {
        const relevantLow = lows.find(l => l.index > high.index && l.index <= i);
        if (relevantLow) {
          for (let k = i + 1; k <= i + horizonBars && k < bars.length; k++) {
            if (bars[k].close < relevantLow.price) {
              results.push({ type: 'bearish', sweepIndex: i, sweepTime: c.time, sweptLevel: high.price, mssIndex: k, mssTime: bars[k].time, mssLevel: relevantLow.price });
              break;
            }
          }
        }
        break;
      }
    }
  }

  results.sort((a, b) => a.sweepIndex - b.sweepIndex);
  return results;
}

// ---------- Scenario outcome tracking (self-feedback loop) ----------
// Checks a logged scenario against real price action since it was logged:
// did it ever get touched (for A/B, which need the zone reached first — for
// C/momentum, zonePrice is already ~current price so this resolves almost
// immediately), and after that, which came first — SL or target? Used to
// build a historical win-rate per scenario type, so displayed probabilities
// stop being static guesses and start reflecting what actually happened.
export function checkScenarioOutcome(entry, bars, expiryBars = 40) {
  const future = bars.filter(b => b.time > entry.loggedBarTime);
  if (!future.length) return { resolved: false, outcome: null };

  const isLong = entry.direction === 'LONG';
  let zoneTouchedAt = -1;
  for (let i = 0; i < future.length; i++) {
    const b = future[i];
    if (b.low <= entry.zonePrice && entry.zonePrice <= b.high) { zoneTouchedAt = i; break; }
  }

  if (zoneTouchedAt === -1) {
    if (future.length >= expiryBars) return { resolved: true, outcome: 'not_triggered' };
    return { resolved: false, outcome: null };
  }

  for (let i = zoneTouchedAt; i < future.length; i++) {
    const b = future[i];
    const hitSl = isLong ? b.low <= entry.sl : b.high >= entry.sl;
    const hitTarget = isLong ? b.high >= entry.target : b.low <= entry.target;
    // Both hit in the same bar is ambiguous (can't tell which came first
    // intrabar) — assume the worse outcome (SL) rather than overstate the win rate.
    if (hitSl) return { resolved: true, outcome: 'sl_hit' };
    if (hitTarget) return { resolved: true, outcome: 'target_hit' };
  }
  if (future.length - zoneTouchedAt >= expiryBars) return { resolved: true, outcome: 'expired_pending' };
  return { resolved: false, outcome: null };
}

// ---------- Short-term (momentum) bias ----------
// Majority direction of the last n candles — a momentum read, deliberately
// different in nature from the BOS-based (structural) trend. Calibrated
// against real data: BOS-based bias only hit ~53% over a 5-candle-ahead
// horizon (too slow to react to what just happened), while last-3-candles
// direction hit ~59% over that same short horizon — but flips to noticeably
// WORSE than BOS over longer horizons (momentum mean-reverts), so this is
// only appropriate for a short/immediate read, not a durable trend signal.
export function computeLastNBias(bars, n = 3) {
  if (bars.length < n) return null;
  const slice = bars.slice(-n);
  const up = slice.filter(c => c.close > c.open).length;
  const down = n - up;
  if (up > down) return 'bullish';
  if (down > up) return 'bearish';
  return null;
}

// ---------- S/D Levels — user's manual-drawing definition ----------
// A single price level (NOT a range): the OPEN of the last opposite-colour
// candle before a move, calibrated against the user's own hand-drawn 12H/4H
// rays. Demand = open of the last red candle before a bullish move; Supply =
// open of the last green candle before a bearish move. "Before a move" means
// price travels >= minMoveAtrMult x ATR14 away from that open within
// horizonBars candles — calibrated against real confirmed examples (which
// ranged 0.44x-5.08x ATR; 0.8x keeps the noise out without being too strict).
export function findSDLevels(bars, { minMoveAtrMult = 0.4, horizonBars = 5, nowSec = null } = {}) {
  const atrArr = atr(bars, 14);
  const levels = [];
  // Typical bar spacing, used below to detect a still-forming candle.
  const barDurationSec = bars.length >= 2 ? bars[1].time - bars[0].time : null;
  // Bound is `- 1` (need at least one future bar), not `- horizonBars`: the
  // excursion loop below already caps at bars.length on its own, so requiring
  // the full horizon up front only served to permanently blind-spot the most
  // recent candles — exactly the ones a "today's levels" system most needs,
  // since they'd never accumulate horizonBars of future data until it's too
  // late to matter. A move that hasn't fully developed yet just won't clear
  // the ATR threshold yet; it's picked up naturally once more bars form.
  for (let i = 14; i < bars.length - 1; i++) {
    const c = bars[i];
    // A still-forming candle's open/close (and even its reported time) can
    // shift while live — found via a real bug: the same live candle got
    // recorded at two slightly different provisional timestamps across two
    // runs, once as red (demand) and once as green (supply) after price
    // moved further within it before closing. Skip until its window is over.
    if (nowSec != null && barDurationSec != null && (c.time + barDurationSec) > nowSec) continue;
    const atrV = atrArr[i];
    if (!atrV) continue;
    const isRed = c.close < c.open;
    const isGreen = c.close > c.open;
    if (!isRed && !isGreen) continue;

    let maxExcursion = 0;
    for (let k = i + 1; k <= i + horizonBars && k < bars.length; k++) {
      if (isRed) maxExcursion = Math.max(maxExcursion, bars[k].high - c.open);
      else maxExcursion = Math.max(maxExcursion, c.open - bars[k].low);
    }
    if (maxExcursion < atrV * minMoveAtrMult) continue;

    levels.push({ type: isRed ? 'demand' : 'supply', price: c.open, time: c.time, index: i });
  }
  return levels;
}

// ---------- Support/Resistance (section 7) — 0.05% tolerance, >=2 touches ----------
export function findSRLevels(bars, { tolerancePct = 0.0005, maxLevels = 8, n = 2 } = {}) {
  const { highs, lows } = findSwings(bars, n);
  const cluster = (points) => {
    const sorted = [...points].sort((a, b) => a.price - b.price);
    const clusters = [];
    for (const p of sorted) {
      const c = clusters.find(c => Math.abs(c.avg - p.price) / c.avg <= tolerancePct);
      if (c) { c.points.push(p); c.avg = c.points.reduce((s, q) => s + q.price, 0) / c.points.length; c.lastIndex = Math.max(c.lastIndex, p.index); }
      else clusters.push({ avg: p.price, points: [p], lastIndex: p.index });
    }
    return clusters;
  };
  const clustersH = cluster(highs).filter(c => c.points.length >= 2);
  const clustersL = cluster(lows).filter(c => c.points.length >= 2);
  const all = [
    ...clustersH.map(c => ({ ...c, type: 'resistance' })),
    ...clustersL.map(c => ({ ...c, type: 'support' })),
  ];
  all.sort((a, b) => (b.points.length - a.points.length) || (b.lastIndex - a.lastIndex));
  return all.slice(0, maxLevels).map(c => ({ price: c.avg, touches: c.points.length, type: c.type, lastTime: bars[c.lastIndex].time }));
}

// ---------- Europe/Berlin calendar/session helpers ----------
// DE40 regime rules (ORB window, Sommerpause) are defined in Frankfurt local
// time regardless of the machine's own timezone, so every date/time-of-day
// check goes through this.
export function berlinDateTimeParts(unixSec) {
  const d = new Date(unixSec * 1000);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map(p => [p.type, p.value]));
  const hour = parseInt(parts.hour, 10) % 24; // "24:00" at local midnight in some ICU versions
  return {
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
    dateDisplay: `${parts.day}.${parts.month}.${parts.year}`,
    timeDisplay: `${String(hour).padStart(2, '0')}:${parts.minute}`,
    minutesOfDay: hour * 60 + parseInt(parts.minute, 10),
    month: parseInt(parts.month, 10),
  };
}

const ORB_END_MINUTES = 9 * 60 + 30; // 09:30 Europe/Berlin

// ---------- Trading session windows (Europe/Berlin, user-specified) ----------
// Fixed daily windows used to frame the briefing's action plan / no-trade
// notes. Order matters for classifySession — first match wins, so keep
// non-overlapping windows in chronological order.
export const SESSION_WINDOWS = [
  { key: 'orb', startMinutes: 9 * 60, endMinutes: ORB_END_MINUTES, label: 'ORB-Fenster (nur beobachten, kein Trade)' },
  { key: 'main', startMinutes: ORB_END_MINUTES, endMinutes: 11 * 60 + 30, label: 'Hauptfenster' },
  { key: 'noTradeNyOpen', startMinutes: 14 * 60 + 45, endMinutes: 15 * 60 + 15, label: 'No-Trade-Zone (NY Open Sweep)' },
];

export function classifySession(minutesOfDay) {
  for (const w of SESSION_WINDOWS) {
    if (minutesOfDay >= w.startMinutes && minutesOfDay < w.endMinutes) {
      return { key: w.key, label: w.label, inWindow: true };
    }
  }
  return { key: 'outside', label: 'außerhalb der definierten Handelsfenster', inWindow: false };
}

// Range accumulated so far today, restricted to bars up to ORB-end — used by
// the EXTREM-regime "Tages-Range > 200 Punkte vor ORB-Ende" criterion.
export function todayRangeBeforeOrbEnd(bars, nowSec) {
  const today = berlinDateTimeParts(nowSec).dateStr;
  const relevant = bars.filter(b => {
    const p = berlinDateTimeParts(b.time);
    return p.dateStr === today && p.minutesOfDay <= ORB_END_MINUTES;
  });
  if (!relevant.length) return 0;
  return Math.max(...relevant.map(b => b.high)) - Math.min(...relevant.map(b => b.low));
}

// ---------- Regime classification ----------
// User-specified criteria (point-based, not ATR/percentage-based):
// EXTREM if any of overnight-gap > 100pts, today's pre-ORB range > 200pts,
// current price > 300pts from last 4H close, or Sommerpause (Jul/Aug, which
// is *always* EXTREM regardless of the price criteria).
export function classifyRegime({ bars4h, dailyBars, tacticalBars, lastClose, nowSec }) {
  const { month } = berlinDateTimeParts(nowSec);
  const isSommerpause = month === 7 || month === 8;

  let overnightGapPts = null;
  if (dailyBars && dailyBars.length >= 2) {
    const today = dailyBars[dailyBars.length - 1];
    const prev = dailyBars[dailyBars.length - 2];
    overnightGapPts = Math.abs(today.open - prev.close);
  }

  const last4hClose = bars4h.length ? bars4h[bars4h.length - 1].close : null;
  const distanceFrom4hClosePts = last4hClose != null ? Math.abs(lastClose - last4hClose) : null;
  const todayRangePts = todayRangeBeforeOrbEnd(tacticalBars, nowSec);

  const reasons = [];
  if (overnightGapPts != null && overnightGapPts > 100) reasons.push(`Overnight-Gap ${overnightGapPts.toFixed(1)} Punkte (> 100)`);
  if (todayRangePts > 200) reasons.push(`Tages-Range vor ORB-Ende ${todayRangePts.toFixed(1)} Punkte (> 200)`);
  if (distanceFrom4hClosePts != null && distanceFrom4hClosePts > 300) reasons.push(`Kurs ${distanceFrom4hClosePts.toFixed(1)} Punkte vom letzten 4H-Close entfernt (> 300)`);

  const isExtreme = isSommerpause || reasons.length > 0;

  return {
    regime: isExtreme ? 'EXTREM' : 'NORMAL',
    isSommerpause,
    lotsize: isExtreme ? 0.01 : 0.02,
    maxTrades: isExtreme ? 1 : 2,
    // Informational only — the user makes all trading decisions themselves,
    // this system never suppresses or filters setups based on regime.
    requireFullConfluence: isExtreme,
    overnightGapPts, todayRangePts, distanceFrom4hClosePts,
    reasons,
  };
}

// ---------- Price-distance relevance filter (HTF zones/OBs) ----------
// A zone/OB that price hasn't revisited stays "active" forever under pure
// mitigation logic even once it's months old and far away — this drops zones
// whose nearest edge is more than maxPct away from the current price, so only
// practically tradeable HTF zones get drawn.
export function isPriceRelevant(low, high, currentPrice, maxPct = 0.05) {
  if (low <= currentPrice && currentPrice <= high) return true;
  const distance = Math.min(Math.abs(currentPrice - low), Math.abs(currentPrice - high));
  return distance <= currentPrice * maxPct;
}

// ---------- Previous Day High/Low (PDHL) ----------
// Extracts yesterday's high and low from daily bars.
// Returns { pdh, pdl, time } or { pdh: null, pdl: null } if unavailable.
export function calculatePDHL(dailyBars) {
  if (!dailyBars || dailyBars.length < 2) return { pdh: null, pdl: null, time: null };
  const yesterday = dailyBars[dailyBars.length - 2];
  return {
    pdh: yesterday.high,
    pdl: yesterday.low,
    time: yesterday.time,
  };
}

// ---------- 5min entry confirmation ----------
// "BOS auf 5min in Trade-Richtung nach Zonentest": a 5min candle must close
// beyond the last local swing high/low, and that break must happen after
// price has touched the entry zone. Falls back to a simple close-in-direction
// reaction candle if no BOS triggers (BOS on 5min is rare).
export function findConfirmation5m(bars5, zoneLow, zoneHigh, direction, { nowSec, maxAgeSec = 2 * 24 * 3600 } = {}) {
  const recent = nowSec != null ? bars5.filter(b => (nowSec - b.time) <= maxAgeSec) : bars5;
  const touchIdx = recent.findIndex(b => b.low <= zoneHigh && b.high >= zoneLow);
  if (touchIdx === -1) return { confirmed: false, touched: false, method: null };

  const touchTime = recent[touchIdx].time;
  const bosEvents = findBosEvents(recent);
  const bosMatch = bosEvents.find(e => e.type === direction && e.break_time >= touchTime);
  if (bosMatch) return { confirmed: true, touched: true, method: 'bos', time: bosMatch.break_time, level: bosMatch.level };

  for (let k = touchIdx + 1; k < recent.length; k++) {
    const b = recent[k];
    const reaction = direction === 'bullish' ? b.close > b.open : b.close < b.open;
    if (reaction) return { confirmed: true, touched: true, method: 'fallback', time: b.time, level: b.close };
  }
  return { confirmed: false, touched: true, method: null };
}

// ---------- Consolidation Breakout Setup (Szenario D) ----------
// After a strong trend move, identify: (1) consolidation phase, (2) liquidity
// sweep within consolidation, (3) retest breakout. Entry on the retest-breakout
// candle that closes beyond the consolidation range in the trend direction.

export function findConsolidationPhase(bars, n = 5, atrMultiplier = 0.5) {
  if (bars.length < n) return null;
  const atrArr = atr(bars, 14);
  const recent = bars.slice(-n);
  const atrVal = atrArr[atrArr.length - 1];
  if (!atrVal) return null;

  const high = Math.max(...recent.map(b => b.high));
  const low = Math.min(...recent.map(b => b.low));
  const range = high - low;

  // Consolidation = tight range, less than half of ATR
  if (range < atrVal * atrMultiplier) {
    return { high, low, range, atrVal, startIndex: bars.length - n, endIndex: bars.length - 1 };
  }
  return null;
}

export function findLiquiditySweep(bars, consolidation, swings, direction) {
  // After consolidation, look for a wick-only violation of a swing in/near consolidation
  // direction = 'bullish' (sweep a swing low) or 'bearish' (sweep a swing high)
  if (!consolidation || !swings) return null;

  const afterConsolidation = bars.slice(consolidation.endIndex + 1);
  if (afterConsolidation.length < 2) return null;

  const relevantSwings = direction === 'bullish' ? swings.lows : swings.highs;
  if (!relevantSwings.length) return null;

  // Find the nearest swing to consolidation
  const nearestSwing = relevantSwings
    .filter(s => s.index <= consolidation.endIndex)
    .sort((a, b) => b.index - a.index)[0];

  if (!nearestSwing) return null;

  // Scan for wick violation (touch but no close-through)
  for (let i = 0; i < Math.min(afterConsolidation.length, 5); i++) {
    const b = afterConsolidation[i];
    const isWickViolation = direction === 'bullish'
      ? b.low < nearestSwing.price && b.close > nearestSwing.price
      : b.high > nearestSwing.price && b.close < nearestSwing.price;

    if (isWickViolation) {
      return {
        sweptLevel: nearestSwing.price,
        sweepBar: b,
        sweepIndex: consolidation.endIndex + 1 + i,
      };
    }
  }
  return null;
}

export function findRetestBreakout(bars, consolidation, liquiditySweep, direction, maxLookAhead = 10) {
  // After sweep closes back inside, find when price breaks OUT of consolidation
  // in the trend direction on a new candle = retest breakout entry signal.
  if (!consolidation || !liquiditySweep) return null;

  const afterSweep = bars.slice(liquiditySweep.sweepIndex + 1);
  if (afterSweep.length < 1) return null;

  const boundaryClosed = direction === 'bullish' ? consolidation.high : consolidation.low;

  // Find the first candle that closes beyond consolidation range in trend direction
  for (let i = 0; i < Math.min(afterSweep.length, maxLookAhead); i++) {
    const b = afterSweep[i];
    const breaksOut = direction === 'bullish'
      ? b.close > boundaryClosed
      : b.close < boundaryClosed;

    if (breaksOut) {
      return {
        retestBarIndex: liquiditySweep.sweepIndex + 1 + i,
        retestBar: b,
        entryPrice: b.close,
        consolidationBreached: boundaryClosed,
      };
    }
  }
  return null;
}
