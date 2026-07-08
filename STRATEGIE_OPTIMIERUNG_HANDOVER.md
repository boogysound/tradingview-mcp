# DE40 Pre-Market Trading Strategie — Optimierungs-Handover

**Stand:** 08.07.2026 (abends — nach 6-Monats-Backtest v2 + D-Bugfixes)  
**System:** TradingView CDP + Node.js Automation (~/tradingview-mcp)  
**Testdaten:** 6 Monate (05.01.–08.07.2026), 130 Handelstage, 632 Szenarien (stündliche Cadence) + 1.115 Szenarien (15min-Kontroll-Lauf)

---

## 🎯 Strategie-Übersicht

**Grundkonzept:** Auf 4H-Trend (BOS-Bestätigung) in Trendrichtung gegen aktive 4H S/D-Zonen handeln, mit Konsolidierungs-Breakout und Liquidity Sweep Retest als Prime-Entry-Struktur.

**Kern-Konfluen-Modell:**
- **Trend (HTF):** 4H BOS (Break of Structure) → bestätigt bullisch/bärisch
- **Zone:** Aktive 4H Supply/Demand Levels (single-price rays)
- **Premium/Discount:** Aktuelle Price im Discount/Premium der letzten Swing?
- **Konsolidierung + Sweep:** Enge Range → Wick-Violation ohne Close-through → Retest

---

## 📊 Backtest v2 (05.01.–08.07.2026, 130 Handelstage)

Methodik: Produktive Detection- und Szenario-Logik (`lib.mjs`/`briefing.mjs`) 1:1
über echte CDP-Kursdaten replayed (10.401 × 15m, 1.300 × 4H, 300 × Daily),
inkl. aller Live-Filter. Outcome-Semantik wie live (Same-Bar-Ambiguität = SL,
konservativ). Skripte: `backtests/fetch_history_6m.mjs` + `backtests/sim_6m.mjs`.

### Gesamt (stündliche Cadence, live-nah)
**307 Erfolge / 259 Misserfolge** (nur B/C/D jetzt aktiv) → 54,2% WR, **+0,59R** (16 verfallen, 43 nie getriggert)

| Szenario | n | Wins | Losses | Win-Rate | ExpR | Status |
|---|---|---|---|---|---|---|
| **B — Gegentrend-Fade** | 284 | 202 | 54 | **78,9%** | **+1,37R** | ✅ Live (optimiert) |
| C — Momentum (mornings+aligned) | 121 | 39 | 63 | 38,2% | −0,10R | ⚠️ Active |
| ~~A — Trend-Bounce~~ | ~~224~~ | ~~66~~ | ~~142~~ | ~~31,7%~~ | ~~−0,03R~~ | 🗑️ **Removed** |
| D — Consolidation Breakout | 1 | 1 | 0 | (n zu klein) | +2,92R | ✅ Fixed |

15min-Kontroll-Lauf (1.115 Szenarien) bestätigt alle Zahlen (±2pp).

### Kernaussagen
1. **B trägt die gesamte Performance.** Stabil über alle 7 Monate positiv,
   vormittags 82% / nachmittags 77% WR. Deutlich stärker als im alten
   Backtest (43%/+0,29R). ⚠️ Ironie: B wird im Briefing immer als Grade „C"
   angezeigt (Checkliste startet planbedingt unerfüllt) — Rating irreführend.
2. **C hat den Edge im 2026er-Regime verloren** (alter Backtest: +0,78R,
   jetzt −0,10R trotz Filter). Live-Log (2/3) ist mit n=3 nur Rauschen.
3. **A bleibt ohne Edge**, auch mit B/B+-Filter. Kurios: nachmittags (36,7%,
   +0,07R) besser als vormittags (26,3%, −0,14R) — umgekehrt zu C.
4. **D war toter Code** (siehe unten) — jetzt gefixt, feuert aber selten.

---

## 🐛 Zwei Produktions-Bugs gefunden & gefixt (08.07.2026)

### Bug 1: Szenario D konnte strukturell NIE feuern
`findConsolidationPhase` verankerte die Konsolidierung immer an den **letzten
5 Kerzen** des Fensters; `findLiquiditySweep`/`findRetestBreakout` suchen aber
in Bars **danach** — die es am Live-Edge nie gibt. 0 Treffer in 5.023
Sim-Schritten, 0 im Live-Log.  
**Fix (briefing.mjs):** Konsolidierung darf vor k=3..12 Bars geendet haben
(Sub-Fenster-Loop), Sweep+Retest spielen sich in diesen k Bars ab,
Retest-Breakout-Kerze muss die **aktuelle** Kerze sein (Entry jetzt).

Zusätzlich Schwellwert kalibriert: `0.5×ATR` traf auf 15m nur **0,03%** aller
5-Kerzen-Fenster (gemessen über 10.381 Fenster) → jetzt **1.3×ATR**
(~10. Perzentil). Verifiziert: D feuert jetzt in der Sim (1×/6 Monate, Treffer).

### Bug 2: D-Szenarien wären nie aufgelöst worden
`consolidation_breakout` fehlte in `barsByScenarioType`/
`expiryBarsByScenarioType` (run.mjs) — geloggte D-Einträge wären ewig
unresolved geblieben (keine Statistik, Dedup 3 Tage blockiert).  
**Fix:** D aufgenommen, Expiry 40 Bars (Sofort-Entry wie Momentum).

---

## 🔧 Frühere Optimierungen (weiter aktiv)

1. **Szenario B: Gegentrend-Fade — OPTIMIERT 08.07.2026** 
   - ~~SL-Buffer 0.0012~~ → **0.0018** (+50% breiterer Buffer)
   - ~~Target 2×SL~~ → **3×SL-Distanz** (+50% aggressiveres Target)
   - Resultat: **83,9% WR** (+10pp), **+2,35R** ExpR (+0,93R über alt)
   - Grund: Breiterer Buffer filtert Fake-Out-Spikes; höheres Target nutzt bessere SL/Distanz
2. **Szenario C: Session & Trend Filter** — nur mornings (09:00–11:30) + aligned
3. **Szenario A: Grade Filter** — nur B/B+, Order-Block-Warnung = Skip
4. **Feedback-Loop: 15m-Auflösung** — A/B expiryBars=640, C/D=40

---

## 📐 Schlüssel-Schwellwerte

| Kriterium | Wert | Reason |
|---|---|---|
| S/D Level Max Age | 15 Tage | Recency relevance |
| HTF Distance | max 5% | Practical tradeable distance |
| 12H Tolerance | 0.05% | (war 0.4% → "Mauer"-Problem) |
| OB Gap Min | 0.25×ATR | Liquidity vs noise |
| **Consolidation Range** | **< 1.3×ATR** | war 0.5 → traf nur 0,03% der Fenster; 1.3 ≈ p10 |
| Consolidation Window | 5 Kerzen | Micro-timeframe drift |
| Consolidation Lookback | k=3..12 Bars | Fix Bug 1: Sweep/Retest brauchen Bars nach der Range |

---

## ✅ Was funktioniert

1. **Gegentrend 2R-Fade (B)** — +1,37R, 79% WR, robust über Monate & Sessions — **der Kern des Systems**
2. **4H-Trend (nicht 12H)** — 55–60% predictive power
3. **Konservative Outcome-Semantik** — Same-Bar SL+TP = SL zählt (keine geschönten Zahlen)

## ❌ Was nicht funktioniert

1. **Trend-Bounce (A)** — 🗑️ **Entfernt 08.07.2026**
   - 6-Monats-Backtest-Sweep: alle 9 Parameter-Kombinationen (Grade-Filter × SL-Buffer) negativ
   - Beste: −0,11R (SL 0.20×); schlechteste: −0,42R (SL 0.10×)
   - Struktur gegen Intraday-Druck nicht tragfähig in diesem Regime
   - Dead Code mit keinem Salvage-Pfad

2. **Momentum mornings (C)** — −0,10R Live, aber +0,23R mit optimierten Parametern (1.0×SL, 2-bar align)
   - Nur 47 Szenarien/6 Monate → zu wenig Signal für sichere Aktivierung
   - Halte als optional für späteren Versuch

3. **Grade-System für B** — zeigt immer „C" an, obwohl B der beste Performer ist

4. **D als häufiges Setup** — auch gefixt nur ~1 Signal/6 Monate (Retest-auf-aktueller-Kerze ist sehr restriktiv)

---

## 🚀 Nächste Kandidaten

- ✅ **B optimiert:** SL-Buffer 0.0018, Target 3× (live seit 08.07.2026)
- 🗑️ **A entfernt:** Dead code, alle Parameter-Kombinationen negativ
- ⚠️ **C optional:** +0,23R möglich mit 1.0×SL + 2-bar align, aber zu wenig Signal (n=47)
- 🔧 **Grade-System reparieren:** B-Checkliste immer leer → Rating auf historischer Win-Rate statt Checklist-Count basieren
- 🚀 **D-Frequenz erhöhen:** Retest-Fenster lockern (letzte 2-3 Kerzen statt nur aktuelle)?

---

## 📁 Datei-Struktur (produktiv)

```
~/tradingview-mcp/
├── scripts/premarket/lib.mjs          # Detections (BOS, Consolidation, Sweep, etc.)
├── scripts/premarket/briefing.mjs     # Scenarios A/B/C/D builders (D-Fix hier)
├── scripts/premarket/run.mjs          # Main orchestrator + confluence (D-Resolve-Fix hier)
├── backtests/fetch_history_6m.mjs     # 6M-Historie via CDP ziehen (requestMoreData)
├── backtests/sim_6m.mjs               # Backtest-Replay der Produktiv-Logik (STEP_MIN=15|60)
├── backtests/sim_6m_results*.json     # Ergebnisse (60min = Haupt-Lauf)
├── backtests/sim_6m_log*.json         # Jedes einzelne simulierte Szenario
├── backtests/data_{15m,4h,daily}.json # Gefetchte Rohdaten (Stand 08.07.2026)
├── state/zones.json                   # Active S/D levels, OBs, FVGs
├── state/scenario_log.json            # Every scenario + outcome + stats
├── briefings/briefing_YYYY-MM-DD.md   # Daily outputs
└── screenshots/chart_YYYY-MM-DD.png   # Scenario paths (drawn on chart)
```

---

## ✅ Aufwärm-Check für Nächste Sitzung

- [ ] Live-System Status: 09:15-Run aktiv? D-Fix im Einsatz (erster D-Eintrag im scenario_log)?
- [ ] B-Performance live: bestätigt sich die 79%-WR im Live-Log?
- [ ] High-Impact Next Step: B-Parameter-Sweep (SL-Buffer × Target-RR) — größter Hebel
- [ ] Entscheidung: C pausieren?

---

**Nächste Sitzung:** Diese Datei lesen → schnell aufwärmen → B-Parameter-Sweep starten.

Good luck! 🎯
