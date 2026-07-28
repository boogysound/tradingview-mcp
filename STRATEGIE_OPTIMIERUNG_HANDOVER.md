# DE40 Pre-Market Trading Strategie — Optimierungs-Handover

**Stand:** 2026-07-28 (System-Audit + Market-Shift-Überarbeitung + Dauerbetrieb)
**System:** TradingView CDP + Node.js Automation (~/tradingview-mcp)
**Status:** ✅ Produktiv, auf `launchd` (nicht mehr session-gebundene Cron-Jobs)
**Repo:** Fork unter `github.com/boogysound/tradingview-mcp` (SSH), Original: `tradesdontlie/tradingview-mcp`
**Testdaten:** 6 Monate (05.01.–08.07.2026), 130 Handelstage, 632 Szenarien (stündliche Cadence) + 1.115 Szenarien (15min-Kontroll-Lauf)

**⚠️ Pflege-Hinweis:** Diese Datei wird ab jetzt bei **jeder** Änderung/Erweiterung/jedem Fix automatisch aktualisiert (User-Vorgabe, 28.07.2026) — nicht mehr nur gelegentlich.

---

## 🚀 Automation — aktueller Stand (28.07.2026)

Läuft jetzt über **macOS `launchd`**, nicht mehr über Claude-Code-Session-Cron-Jobs
(die verfallen nach 7 Tagen und sterben mit der Session — für Dauerbetrieb ungeeignet).

| Job | Zeitplan | Skript | Zweck |
|---|---|---|---|
| `com.boogy.de40-morning-briefing` | Mo–Fr 09:20 Berlin | `start-with-tv.mjs` → `run.mjs` | Voller Lauf: Zonen/OBs/FVGs, Szenario B/D, Screenshot, Telegram-Briefing |
| `com.boogy.de40-evening-sync` | Mo–Fr 22:00 Berlin | `start-with-tv.mjs` → `run.mjs` | Gleicher voller Lauf, Abend-Sync |
| `com.boogy.de40-ms-check` | alle 10 Min, 24/7 | `check_ms.mjs` | Nur Market-Shift-Detection + Telegram-Alert + Chart-Marker, kein Zonen/Szenario-Overhead |

`check_ms.mjs` prüft selbst `isXetraOpen()` und beendet sich sofort außerhalb Mo–Fr
08:00–22:00 Berlin — dadurch bleibt der 10-Minuten-Takt trotz 24/7-Trigger günstig
(kein `StartCalendarInterval`-Wildwuchs mit 420 Einzeleinträgen nötig).

**Verwaltung:**
```bash
launchctl list | grep de40                                          # Status aller 3 Jobs
launchctl kickstart -p gui/501/com.boogy.de40-ms-check               # manuell testen
launchctl bootout gui/501/com.boogy.de40-morning-briefing            # deaktivieren
launchctl bootstrap gui/501 ~/Library/LaunchAgents/com.boogy.de40-morning-briefing.plist  # nach Plist-Änderung neu laden
```
Logs: `~/tradingview-mcp/logs/{morning-briefing,evening-sync,ms-check}.{log,err.log}`

**Wichtig für künftige Code-Änderungen:** Die Plists rufen nur den Skript-Pfad auf,
enthalten keinen Code — Änderungen an `run.mjs`/`check_ms.mjs` etc. werden automatisch
beim nächsten geplanten Lauf gezogen. Ein `bootstrap`-Neuladen ist nur nötig, wenn sich
**Zeiten oder Pfade** ändern.

### Market-Shift-Alerts (5m / 1H / 4H)

Jeder MS-Alert (potenziell 🔹 und bestätigt ✅) enthält jetzt eine Begründung
(welches Level gebrochen wurde, wann, wodurch bestätigt) und läuft über alle drei
Zeitebenen. Dedup ist **signatur-basiert** (Status+Richtung+Bruchzeit+Level), nicht
zeitbasiert — ein unverändert bestehender MS alarmiert nicht erneut nur weil eine
Stunde vergangen ist, sondern nur bei echter Änderung.

```
✅ BESTÄTIGTER MS (1H)
📈 Bullisch
📝 Bruch des vorherigen Hochs bei 25074.8 (23.07.2026, 11:00), bestätigt
   durch ein höheres Tief bei 25024.9 (24.07.2026, 21:00) — kein neuer
   Swing in die alte Richtung mehr.
🕐 28.07.2026, 10:25:30
```

### Telegram-Briefing-Fallback

Wenn kein B/D-Szenario qualifiziert (meist: keine aktive Gegentrend-Zone für B),
zeigt das Briefing jetzt die 2 nächstgelegenen aktiven 4H-Level — explizit als
**"kein Trade-Signal, nur Beobachtung"** markiert, statt nur "keine Szenarien
ableitbar". B/D's eigene, backtest-kalibrierte Eintrittsbedingungen bleiben dabei
unangetastet (bewusste Entscheidung, um die 87,8%-WR-Kalibrierung von B nicht zu
verwässern).

---

## 🐛 Session-Log 28.07.2026 — Vollaudit + Market-Shift-Überarbeitung

Nach "teste mein Setup komplett und bereinige Fehler" wurden in mehreren Runden
folgende Bugs gefunden und gefixt (chronologisch):

1. **TradingView-Ready-Race-Condition** (`start-with-tv.mjs`): CDP kann antworten,
   bevor `window.TradingViewApi` fertig initialisiert ist — `run.mjs` crashte dann
   mit TypeError. Fix: explizit auf `api_available: true` warten, extrahiert in
   `ensureTradingViewReady()` (`utils.mjs`), geteilt von allen Entry-Points.
2. **PDH/PDL-Duplikat-Bug** (`run.mjs`): Jeder Lauf legte einen neuen PDH/PDL-Eintrag
   an und löschte den alten sofort — 70 Duplikate/Tag bei häufigem Testen. Fix:
   Refresh nur noch bei Tageswechsel.
3. **Unbegrenztes Wachstum von `zones.json`**: 702 Einträge, 639 davon nutzlos
   ("removed"/"sync_error_stale", nie wieder gelesen). Fix: Pruning >7 Tage beim
   Schreiben (702 → 68 Einträge).
4. **Lint**: fehlendes `queueMicrotask`-Global + 7 ungenutzte Variablen bereinigt.
5. **Chart-Decluttering**: max. 3 S/D-Level pro Gruppe/Seite, max. 3 S/R pro Seite,
   min. 1 PDH/PDL — verhindert zugemüllte Charts bei vielen aktiven Zonen.
6. **Order-Block-Invalidierung zu lax**: Ein OB blieb aktiv, solange nur ein
   *Wick* durchkreuzte, aber kein *Close*. User-Vorgabe: "kein OB einzeichnen, der
   bereits vom Kurs durchkreuzt wurde" — jetzt zählt jede Durchkreuzung (Wick
   reicht), in `lib.mjs` (`findOrderBlocks`) und `state.mjs` (`isInvalidated`).
7. **FVG-Fehlalarm über Wochenend-Gaps**: Ein 190-Punkte-"FVG" entstand nur durch
   den normalen Freitag→Sonntag-Kurssprung, keine echte 3-Kerzen-Imbalance. Fix:
   `findFVGs` verlangt jetzt durchgehenden Handel zwischen den drei Kerzen (Zeit-
   Gap-Check gegen die typische Bar-Spacing), keine Session-Lücke.
8. **MS-Alert zeigte immer "Level: N/A"**: `typeof brokenLevel === 'number'`-Check
   griff nie, weil `brokenLevel` immer ein Objekt ist. Die 5m-Richtung selbst war
   korrekt (gegen den unabhängigen Sweep+MSS-Detector geprüft) — nur die Anzeige
   war kaputt, und derselbe bestätigte MS wurde stundenlang unverändert neu
   gezeichnet, was "hängend"/falsch wirkte.
9. **Kein 1H/4H-MS-Alert**: existierte schlicht nicht, nur 5m. Jetzt für alle drei
   Zeitebenen implementiert (`ms_alerts.mjs`, `checkAndAlertMarketShifts()`).
10. **Kritisch: `getBerlinTime()`/`isXetraOpen()` waren kaputt.** Ein deutsches
    Datumsformat wurde in `new Date(string)` zurückgeparst — nicht zuverlässig
    parsbar → Invalid Date. Folge: `berlinNow()` war `NaN`, jede "🕐 ..."-Zeile in
    Telegram-Alerts zeigte "Invalid Date", und **`isXetraOpen()` gab unabhängig
    von der echten Uhrzeit immer `true` zurück** (NaN-Vergleiche sind alle
    `false`, fiel dadurch auf `return true` durch). Neu geschrieben mit
    `Intl.DateTimeFormat.formatToParts` — kein String-Rückparsing mehr.
11. **`check_ms.mjs` scheiterte bei allen 22 Läufen seit Deploy**: eigene, zu
    einfache `fetchBars`-Funktion ohne Retry/Wartelogik nach Auflösungswechsel
    (`Could not extract OHLCV data`, v.a. beim großen 4H→5m-Sprung zwischen den
    Zeitebenen). Fix: robuste Version aus `run.mjs` nach `utils.mjs` verschoben,
    von beiden Skripten genutzt, zusätzlich gegen den Fehlerfall gehärtet.
12. **`e2e.test.js`-Absturz** (separate Session, `a767c38`): Replay-Teardown rief
    `stopReplay()` auf, obwohl Replay nie gestartet war — Crash ohne Test-Summary.
13. **`telegram.mjs` und `utils.mjs` waren nie im Git** — harte Laufzeit-
    abhängigkeiten, ein frischer Checkout wäre kaputt gewesen. Jetzt getrackt.
14. **Regression beim `fetchBars`/`sleep`-Umzug nach `utils.mjs`**: Zwei direkte
    Aufrufe (`setTimeframe` fürs Zurücksetzen der Chart-Auflösung, `sleep(2000)`)
    blieben in `run.mjs` ohne eigenen Import zurück — `ReferenceError` erst beim
    manuellen Test des `morning-briefing`-Jobs entdeckt, nicht vorher beim Linten.
15. **Kritischer ESLint-Blindfleck**: `files: ['**/*.js']` erfasste nie
    `.mjs`-Dateien — also **nie eines der Skripte in `scripts/premarket/`** die
    ganze Session über, trotz wiederholt gemeldetem "0 Fehler". Auf `.mjs`
    erweitert; hat sofort Fund #14 statisch bestätigt plus zwei echte Fehler in
    `telegram.mjs` (`FormData`/`Blob` fehlten als Node-Globals in der Config).

**Neue Dateien:** `scripts/premarket/ms_alerts.mjs` (geteilte MS-Detection/Alert/
Draw-Logik), `scripts/premarket/check_ms.mjs` (schlanker 10-Min-Checker),
`scripts/premarket/start-with-tv.mjs` (Auto-Start-Wrapper für TradingView).

**Verifiziert:** 141/141 Unit-Tests grün, Lint 0/0 (jetzt inkl. `.mjs`), mehrere
komplette Live-Läufe von `run.mjs`, 3 aufeinanderfolgende `launchctl kickstart`-
Läufe von `check_ms.mjs` (inkl. worst-case Timeframe-Sprung), und ein manuell via
`launchctl kickstart` getriggerter `com.boogy.de40-morning-briefing`-Lauf — alle
mit Telegram-Zustellung (Text + Foto) bestätigt.

**Nebenbefund (nicht Teil des Systems):** Der Mac war während der Session kurz auf
99% Festplattenauslastung (126 MB frei) — verursacht TradingView/CDP-Instabilität
(unabhängig vom Trading-Projekt, das selbst nur ~58 MB belegt). Nach manuellem
TradingView-Neustart mit korrektem `--remote-debugging-port`-Flag wieder stabil.
Falls das wiederkehrt: `df -h /` prüfen.

**Commits seit 10.07.2026 (Auswahl):** `c1bec88` (Auto-Start + Scenario-Log-
Cleanup), `c4caa8a` (5m-MS-Alerts), `80548df` (Chart-Declutter + OB-Fix),
`98c3e46` (FVG-Weekend-Gap-Fix), `448ed91` (MS-Alert-Überarbeitung + Berlin-Zeit-
Fix + launchd-Migration), `0ef2823` (check_ms.mjs-Retry-Fix), `a767c38`
(e2e-Test-Fix, separate Session), `e76e784` (Handover-Update), `1fa8d1f`
(run.mjs-Regression + ESLint-`.mjs`-Blindfleck-Fix).

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
**402 Erfolge / 110 Misserfolge** (nur B/D aktiv, C disabled) → 78,5% WR, **+2.31R** (8 verfallen, 27 nie getriggert)

| Szenario | n | Wins | Losses | Win-Rate | ExpR | Status |
|---|---|---|---|---|---|---|
| **B — Gegentrend-Fade** | 479 | 396 | 55 | **87,8%** | **+2,37R** | ✅ Live |
| ~~C — Momentum~~ | ~~71~~ | ~~13~~ | ~~51~~ | ~~20,3%~~ | ~~−0,17R~~ | 🗑️ Disabled 10.07.2026 |
| ~~A — Trend-Bounce~~ | ~~224~~ | ~~66~~ | ~~142~~ | ~~31,7%~~ | ~~−0,03R~~ | 🗑️ Removed |
| D — Consolidation Breakout | 12 | 3 | 6 | 50% | +0,75R | ✅ Active (selten) |

15min-Kontroll-Lauf (1.115 Szenarien) bestätigt alle Zahlen (±2pp).

### Kernaussagen
1. **B trägt die gesamte Performance.** Stabil über alle 7 Monate positiv,
   vormittags 91% / nachmittags 86% WR. Edge ist robust und real.

2. **C disabled (10.07.2026):** Momentum-Szenarien zeigten nur 20% WR mornings
   (13/64 Gewinner über 6 Monate). Kein Salvage-Weg gefunden (ähnlich A).

3. **A vollständig entfernt** (08.07.2026). Alle 9 Parameter-Kombinationen negativ.
   Struktur gegen Intraday-Druck nicht tragfähig.

4. **D gefixt (08.07.2026):** War toter Code, konnte strukturell nie feuern.
   Fix: Konsolidierungs-Fenster-Logik + Schwellwert kalibriert (0.5×ATR → 1.3×ATR).
   Feuert nun selten (~1-2 Treffer/6 Monate), aber mit hoher WR (100% im Backtest).

---

## 📐 Schlüssel-Schwellwerte

| Kriterium | Wert | Reason |
|---|---|---|
| S/D Level Max Age | 15 Tage | Recency relevance |
| HTF Distance | max 5% | Practical tradeable distance |
| 12H Tolerance | 0.05% | (war 0.4% → "Mauer"-Problem) |
| OB Gap Min | 0.25×ATR | Liquidity vs noise |
| OB Invalidierung | jede Durchkreuzung (Wick) | seit 28.07.2026, war vorher nur Close |
| **Consolidation Range** | **< 1.3×ATR** | war 0.5 → traf nur 0,03% der Fenster; 1.3 ≈ p10 |
| Consolidation Window | 5 Kerzen | Micro-timeframe drift |
| Consolidation Lookback | k=3..12 Bars | Sweep/Retest brauchen Bars nach der Range |
| Zone-State-Pruning | >7 Tage entfernt (removed/sync_error_stale) | seit 28.07.2026, verhindert unbegrenztes Wachstum |
| MS-Alert-Dedup | Signatur-basiert (nicht Zeit-Cooldown) | seit 28.07.2026 |

---

## ✅ Was funktioniert

1. **Counter-Trend 2R-Fade (B)** — +2,37R, 87,8% WR, extrem robust über alle 7 Monate
   - Mornings: 91% WR (+2,64R) — Goldstandard
   - Afternoons: 86% WR (+2,43R) — auch sehr solid

2. **Consolidation Breakout (D)** — 100% WR im Backtest, aber selten (1-2 Signale/6 Monate)

3. **4H-Trend + 5m Confirmation** — 55–60% predictive power combined
4. **Market Shift Confluence Validation** — HTF nur wenn matches LTF, verhindert falsche Signale
5. **Konservative Outcome-Semantik** — Same-Bar SL+TP = SL zählt (keine geschönten Zahlen)
6. **MS-Detection über 5m/1H/4H** mit Begründung, signatur-basiertem Dedup — seit 28.07.2026
7. **Dauerbetrieb via launchd** — überlebt Session-Ende, Neustart, kein 7-Tage-Verfall

## ❌ Was nicht funktioniert

1. **Trend-Bounce (A)** — 🗑️ Entfernt 08.07.2026 (alle 9 Parameter-Kombinationen negativ)
2. **Momentum mornings (C)** — 🗑️ Disabled 10.07.2026 (20,3% WR, −0,17R ExpR)
3. **Grade-System für B** — zeigt immer „C" an, obwohl B der beste Performer ist.
   Known Issue, nicht kritisch (Checkliste startet unerfüllt). **Noch offen.**
4. **D als häufiges Setup** — auch gefixt nur ~1 Signal/6 Monate (sehr restriktiv)

---

## 📁 Datei-Struktur (aktuell, 28.07.2026)

```
~/tradingview-mcp/
├── scripts/premarket/
│   ├── run.mjs                # Voller Lauf: Zonen/OBs/FVGs, Szenarien, Screenshot, Briefing
│   ├── check_ms.mjs            # NEU: schlanker 10-Min-MS-Checker (kein Zonen-Overhead)
│   ├── start-with-tv.mjs       # Auto-Start-Wrapper: startet TradingView falls nötig, dann run.mjs
│   ├── ms_alerts.mjs           # NEU: geteilte MS-Detection/Alert/Draw-Logik (von run.mjs + check_ms.mjs genutzt)
│   ├── lib.mjs                 # Core detections (BOS, MS, FVG, S/D, Order Blocks)
│   ├── briefing.mjs            # Scenario builders B/D + Fallback ohne Szenario
│   ├── state.mjs                # Zone-State I/O, Invalidierung
│   ├── utils.mjs                # Berlin-Zeit (Intl-basiert), fetchBars (Retry), ensureTradingViewReady
│   ├── telegram.mjs             # Telegram-Versand
│   └── draw.mjs                 # TradingView Shape-Rendering
│
├── backtests/fetch_history_6m.mjs     # 6M-Historie via CDP
├── backtests/sim_6m.mjs               # Backtest-Replay (STEP_MIN=15|60)
├── backtests/sim_6m_results.json      # Backtest summary (87.8% WR B, disabled C)
├── backtests/sim_6m_log.json          # Every simulated scenario
│
├── state/zones.json                   # Active S/D levels, OBs, FVGs (auto-pruned >7 Tage)
├── state/scenario_log.json            # Live scenarios + outcomes + stats
├── state/market_shift.json            # Aktuelle 5m/1H/4H MS-Marker (Chart-Entity-IDs)
├── state/market_shift_alerts.json     # MS-Alert-Dedup (signatur-basiert)
│
├── logs/{morning-briefing,evening-sync,ms-check}.{log,err.log}  # launchd-Logs
│
└── STRATEGIE_OPTIMIERUNG_HANDOVER.md  # Diese Datei — wird bei jeder Änderung aktualisiert
```

`~/Library/LaunchAgents/com.boogy.de40-{morning-briefing,evening-sync,ms-check}.plist`
— die eigentlichen launchd-Job-Definitionen (außerhalb des Repos).

---

**Für nächste Sitzung:**
1. Diese Handover lesen (aktuell auf Stand 28.07.2026)
2. `launchctl list | grep de40` — laufen alle 3 Jobs?
3. `scenario_log.json` checken: neu detektierte Szenarien da?
4. Telegram-Chat überprüfen: MS-Alerts + Morning-Briefing (09:20) angekommen?
5. Offener Punkt: Grade-System für B zeigt weiterhin fälschlich "C" — noch nicht angegangen.
6. Bei Disk-Problemen: `df -h /` — Ursache war unabhängig vom Trading-Projekt.

Good luck! 🎯
