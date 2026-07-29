# DE40 Pre-Market Trading Strategie — Optimierungs-Handover

**Stand:** 2026-07-29, Teil 9 (4H-Level-Self-Dedupe type-agnostic gefixt + TradingView-Neustart-Eskalation auf SIGKILL)
**System:** TradingView CDP + Node.js Automation (~/tradingview-mcp)
**Status:** ✅ Produktiv (`launchd`). Zwei aktive, backtestete Strategien: **B** (Fresh-Zone-Fade, 71,4% WR/+0,43R, 6 Monate validiert) und **A** (Trend-Reversal an POI, 34,9% WR/+0,13R, ~2 Monate validiert — kleinere Stichprobe, moderat statt stark). D bleibt technisch aktiv, feuert aber praktisch nie. Briefing referenziert zusätzlich die User-eigenen ORB/VWAP-Indikatoren (Teil 7).

**⏸️ Beobachtungsphase (User-Entscheidung, 28.07.2026):** Beide Strategien (A/B) laufen 1-2 Wochen unverändert live (bis ca. 04.–11.08.2026), bevor weiter optimiert wird — bewusste Pause, um echte Live-Daten zu sammeln statt auf denselben kleinen Backtest-Stichproben weiter zu verfeinern (Overfitting-Risiko). Die ORB/VWAP-Ergänzung (Teil 7) ist davon ausgenommen — reine Zusatzinformation im Briefing-Text, ändert keine Strategie-Logik.
**Repo:** Fork unter `github.com/boogysound/tradingview-mcp` (SSH), Original: `tradesdontlie/tradingview-mcp`
**Testdaten:** B: Backtest v4 (Feb–Jul 2026, 15m, 10.489 Bars) ersetzt v2/v3. A: neuer Backtest (31.05.–28.07.2026, 5m, 11.298 Bars) — siehe Backtest v5 unten. v2/v3 bleiben nur als historisches Dokument stehen.

**⚠️ Pflege-Hinweis:** Diese Datei wird bei **jeder** Änderung/Erweiterung/jedem Fix automatisch aktualisiert (User-Vorgabe, 28.07.2026) — nicht mehr nur gelegentlich.

---

## 🚀 Automation — aktueller Stand (28.07.2026)

Läuft jetzt über **macOS `launchd`**, nicht mehr über Claude-Code-Session-Cron-Jobs
(die verfallen nach 7 Tagen und sterben mit der Session — für Dauerbetrieb ungeeignet).

| Job | Zeitplan | Skript | Zweck |
|---|---|---|---|
| `com.boogy.de40-morning-briefing` | Mo–Fr 09:20 Berlin | `start-with-tv.mjs` → `run.mjs` | Voller Lauf: Zonen/OBs/FVGs, Szenario B/D, Screenshot, Telegram-Briefing |
| `com.boogy.de40-evening-sync` | Mo–Fr 22:00 Berlin | `start-with-tv.mjs` → `run.mjs` | Gleicher voller Lauf, Abend-Sync |
| `com.boogy.de40-ms-check` | alle 10 Min, 24/7 | `check_ms.mjs` | Nur Market-Shift-Detection + Telegram-Alert + Chart-Marker, kein Zonen/Szenario-Overhead |
| `com.boogy.de40-scenario-check` | alle 15 Min, 24/7 | `check_scenarios.mjs` | **NEU (28.07.2026):** liest bereits gezeichnete 4H-Level aus dem State (kein Redraw), baut Szenarien neu, alarmiert per Telegram sobald eines voll grün ist (5/5 Confluence) |

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
Logs: `~/tradingview-mcp/logs/{morning-briefing,evening-sync,ms-check,scenario-check}.{log,err.log}`

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

## 🚨 Session-Log 28.07.2026, Teil 3 — Kritische Korrektur (User-getrieben)

Ausgelöst durch scharfe, kritische Live-Prüfung des Users direkt gegen den
echten TradingView-Chart ("überprüfe deine Ergebnisse selbst einmal kritisch
wie ein erfolgreicher Trader") — deckte drei substanzielle Bugs auf, die in
Teil 2 trotz Backtest-Verifikation unentdeckt blieben, weil der verfügbare
Datensatz zu klein war (nur 3 Tage 15m-Historie, siehe unten) und die
Backtest-Ergebnisse (100% WR, exakt 3,00R) fälschlich als Bestätigung statt
als Warnsignal gelesen wurden.

**1. Target-Sign-Bug (kritisch) — Szenario B's Zielpreis lag auf der
FALSCHEN Seite des Entries.**
`briefing.mjs`, Zeile 89: `targets = [bull ? nearestCounter + 3*slDist :
nearestCounter - 3*slDist]` — dasselbe Vorzeichen wie `sl`, nicht das
gegenteilige. Konkret am Live-Beispiel (Short, Zone 25412,6 / SL 25458,3 /
"Ziel" 25549,8): das Ziel lag ÜBER SL, nicht darunter — für einen Short
(Gewinn bei fallendem Kurs) muss das Ziel unterhalb des Entries liegen.
**Konsequenz:** `checkScenarioOutcome`/`resolveScenario`s Touch-Bedingung
(`b.low <= zonePrice` bei Short) impliziert bereits `b.low <= target`, wenn
Ziel auf der falschen Seite liegt — jeder berührte Trade wurde dadurch
praktisch sofort als Gewinn gewertet, unabhängig vom tatsächlichen
Kursverlauf danach. Das erklärt die verdächtig perfekten 100%-WR/exakt-3R-
Zahlen aus Teil 2's eigenem Backtest-Vergleich — die waren ein Mess-Artefakt,
keine echte Strategie-Performance. **Fix:** Vorzeichen umgedreht
(`bull ? -3*slDist : +3*slDist`). Nach dem Fix, gleicher (3-Tage-)Datensatz:
12 Szenarien → 7 (weniger Duplikate durch längere reale Haltedauer), WR
100% → 33,3% (1 Gewinn, 2 Verluste, 4 offen). **Die historische
87,8%-WR-Zahl für B ist damit vermutlich seit ihrer Kalibrierung
(09.–10.07.2026) durchgehend verfälscht gewesen — komplett neu
backtesten, bevor B wieder als verlässlich behandelt wird.**

**2. Entkoppelte Confluence-Checks — "MSS in Gegenrichtung" konnte grün
zeigen, obwohl das MSS-Event nichts mit der Zone zu tun hatte.**
Live-Beweis: Alert für Zone 25390,9 zeigte "MSS in Gegenrichtung" ✅, aber
das zugrunde liegende MSS-Event lag bei 25537,2/25478,1 — **87 bis 146
Punkte entfernt**, 25 Stunden alt. `mssAgainstTrend` prüfte nur
`sweepMss.type === reactionDirection`, keinerlei Preis- oder Zeitnähe zur
tatsächlichen Zone. **Fix:** Zwei Gates ergänzt — (a) Frische auf eine
Handelssession verkürzt (8h statt der bisherigen 2-Tage-"tactical
recentEnough"-Konvention, die andernorts für OBs/FVGs sinnvoll ist, hier
aber zu lax war), (b) Nähe-Pflicht: `sweptLevel`/`mssLevel` muss innerhalb
1,5× taktischem ATR der Zone liegen. Dieselbe 8h-Frische auch auf
`findZoneRejection`/`findConfirmation5m` angewendet (waren zuvor auf die
2-Tage-Konvention gesetzt — im konkreten Live-Fall zufällig noch frisch,
aber strukturell zu lax).

**3. "Durchbrochen ohne Retest" wurde nicht als Invalidierung erkannt.**
User-Beobachtung: Preis hatte die Zone bereits nach oben durchbrochen
(Supply-Level, Close über Zone), ohne dass je eine Rejection/Bestätigung
stattfand — die Linie blieb trotzdem stehen, weil der bisherige
`isScenarioResolved`-Check nur SL/TP-Kreuzung prüfte (SL liegt mit 0,18%
Puffer spürbar weiter weg als ein knapper Zonen-Durchbruch). **Fix:** neues
Feld `zoneBrokenNoRetest` auf dem Szenario-Objekt (in `buildScenario`,
`briefing.mjs`) — true wenn Kurs auf der ungültigen Seite der Zone steht
UND weder Rejection noch 5min-Bestätigung je erkannt wurden. `lib.
isScenarioResolved()` prüft dieses Feld jetzt zusätzlich zu SL/TP. Live
verifiziert: unmittelbar nach dem Fix zeigte es korrekt `true` (Kurs über
der Zone, keine Rejection), und nach weiterer Kursbewegung zurück unter die
Zone (mit erkannter Rejection) korrekt wieder `false` — reagiert also
responsiv auf echte Marktbewegung, nicht nur auf einen einmaligen Snapshot.

**Alle 3 Fixes live gegen den echten Chart verifiziert** (nicht nur im
Backtest): Checklist zeigt jetzt für dieselbe Zone ehrliche, uneinheitliche
Ergebnisse (z.B. 4/5 statt eines falschen 5/5), die veraltete/falsche Linie
wurde vom Chart entfernt und durch eine mit korrektem TP (jetzt auf der
richtigen Seite) ersetzt. Unit-Suite weiterhin 220/220 grün, Backtest läuft
ohne Crash durch (Lint 0 Fehler).

**TradingView ist während dieser Session einmal eingefroren** (User meldete
einen Dialog "fortfahren/neustarten"; page-level Health-Check hing >2min
fest, obwohl der CDP-Port selbst noch antwortete). Per `pkill -9` beendet
und über `ensureTradingViewReady()` sauber neu gestartet — kein Datenverlust,
da alle State-Dateien (`zones.json` etc.) unabhängig vom TV-Prozess
persistiert werden.

**Offen für nächste Sitzung:** vollständiger 6-Monats-Re-Backtest mit der
korrigierten Target-Formel (siehe unten) — erst DANACH lässt sich sagen, ob
B überhaupt noch eine reale Edge hat, und wie groß sie ist.

---

## 🎯 Session-Log 28.07.2026, Teil 2 — Grade-System-Fix + Full-Confluence-Alert

Auslöser: User erhielt seit Tagen keine Telegram-Nachricht, in der alle Signale
auf grün standen.

**Root Cause gefunden:** In `buildScenarios()` (`briefing.mjs`) waren 3 der 5
Checklist-Punkte von Szenario B ("Rejection an der Zone", "MSS in
Gegenrichtung", "5min-Bestätigung") fest auf `met: false` hartcodiert —
nie wirklich berechnet, obwohl die nötigen Detection-Funktionen
(`findConfirmation5m`, `findSweepMSS`) und Daten (`bars5`, `sweepMss`,
`nowSec`) längst unbenutzt in die Funktion durchgereicht wurden. Damit
konnte `metCount` nie über 2/5 hinauskommen → Grade blieb strukturell für
immer bei "C" (das bereits bekannte "Grade-System zeigt immer C"-Problem),
und "alle Signale grün" war unmöglich, unabhängig von der echten Marktlage.

**Fix:**
1. Neue Funktion `findZoneRejection()` (`lib.mjs`) — Einzelkerzen-Docht-
   Ablehnung exakt am Zone-Preis (analog zum bereits vorhandenen Sweep-
   Erkennungsmuster in `findSweepMSS`).
2. Alle 3 Checklist-Punkte in Szenario B jetzt auf echte Detection verdrahtet:
   `findZoneRejection` (Rejection), `sweepMss.type`-Abgleich (MSS in
   Gegenrichtung), `findConfirmation5m` (5min-Bestätigung).
3. **Verifiziert per Backtest (A/B-Vergleich, gleiche Daten, Checklist-Fix
   ge-stashed vs. angewendet):** alle Trade-Felder (Entry/SL/Target/Outcome)
   1:1 identisch — nur `grade` änderte sich (vorher 12/12 "C", danach
   3× "B+" / 9× "B"). Grade greift nirgends ins Trading ein, ist rein
   kosmetisch — der Fix kann die Win-Rate/ExpR strukturell nicht verändern.
4. Szenario D war NICHT betroffen — dessen Checklist ist zwar auch
   hartcodiert `true`, aber das ist korrekt: D wird nur ins Array gepusht,
   nachdem Konsolidierung+Sweep+Retest bereits real erkannt wurden, die
   Objekt-Existenz selbst ist also schon der Beweis.

**Neu: Full-Confluence-Telegram-Alert** — analog zu den MS-Alerts, aber für
"alle Signale grün" (nicht nur sichtbar in der 09:20/22:00-Briefing, die die
~13h-Lücke sonst verpasst hätte):
- `scenario_alerts.mjs`: `checkAndAlertFullConfluence(scenarios)`, signatur-
  basiertes Dedup (Typ+Richtung+Zone+metCount/totalCount) in
  `state/scenario_alerts.json` — analog zu `market_shift_alerts.json`.
- `check_scenarios.mjs`: neuer schlanker Check (liest 4H-Level aus dem
  State statt neu zu zeichnen), läuft alle 15 Min über
  `com.boogy.de40-scenario-check` (etwas seltener als ms-check, da eine
  Zeitebene + Daily-Bars mehr geholt werden und B's Confluence sich
  langsamer verschiebt als reine MS-Struktur).
- `run.mjs` ruft dieselbe Funktion mit denselben Dedup-State auf — die
  beiden Jobs alarmieren garantiert nie doppelt für denselben Moment.
- **Live verifiziert, 28.07.2026 ~15:50:** `check_scenarios.mjs` fand auf
  eigenem 15-Min-Takt eine echte 5/5-Confluence (Szenario B, Short, Zone
  25390.9, Grade B+) und verschickte die erste echte "alle Signale
  grün"-Nachricht überhaupt. Der direkt danach manuell getriggerte
  `morning-briefing`-Lauf erkannte dieselbe Signatur bereits als
  gemeldet und alarmierte korrekt NICHT doppelt.

**Neu: Empfohlene Entry/SL/TP-Linien auf dem Chart** (User-Wunsch,
28.07.2026) — `drawScenarioLevels()` in `draw.mjs`, gerufen aus `run.mjs`
direkt vor dem Screenshot UND aus `check_scenarios.mjs` (alle 15 Min). Ein
Slot pro Szenario-Typ (`b`/`d`), immer remove-then-redraw (wie MS-Marker)
über `state/scenario_lines.json`, damit ein nicht mehr aktives Szenario
keine Alt-Linien hinterlässt. Drei farbige `horizontal_ray`-Linien: Entry
(blau), SL (rot, gestrichelt), TP (grün, gestrichelt), jeweils mit
Preis+Label. Live getestet — Linien wurden im Morning-Briefing-Lauf korrekt
gezeichnet (state-Datei zeigt echte TradingView-Entity-IDs).

**Nachtrag (User-Wunsch, gleicher Tag): "lösche immer alle eingezeichneten
Entries, wenn sie nicht mehr valide sind".** Lücke gefunden: die
zugrundeliegende 4H-Zone bleibt im State oft noch "active", lange nachdem
SL oder TP bereits vom Kurs erreicht wurde — `buildScenarios()` hätte das
Szenario also weiter vorgeschlagen und `drawScenarioLevels` dieselben
veralteten Linien immer wieder neu gezeichnet. Fix: neue Funktion
`lib.isScenarioResolved(scenario, lastClose)` prüft direkt gegen den
aktuellen Kurs (SL oder TP bereits gekreuzt?), unabhängig vom Zonen-
Lifecycle-Timing. Vor jedem `drawScenarioLevels`-Aufruf (in `run.mjs` UND
`check_scenarios.mjs`) werden bereits aufgelöste Szenarien rausgefiltert —
damit verschwinden veraltete Linien spätestens nach ~15 Min (nicht erst
beim nächsten der zwei täglichen Läufe, also potenziell erst nach bis zu
13h).

**TradingView Long/Short-Position-Tool geprüft und verworfen (vorerst):**
User fragte, ob sich das native TV-Tool statt der 3 Linien nutzen ließe.
Per CDP direkt getestet (draw → inspect properties → remove, gleiches
Muster wie `verifyDottedLinestyleCode()`): das Tool ist technisch über
`shape: 'long_position'`/`'short_position'` erreichbar, aber es ist primär
ein Position-Sizing-Rechner (Felder wie `accountSize`, `leverage`, `risk`,
`qty`), keine einfache 3-Preise-rein-Box-raus-Zeichnung. Der angeforderte
Entry-Preis wurde beim ersten Test stillschweigend ignoriert (Tool setzte
einen anderen Preis), und explizite `stopLevel`/`profitLevel`-Overrides
führten dazu, dass gar keine Form gezeichnet wurde (kein Fehler, einfach
nichts sichtbar). Da falsch angezeigte SL/TP-Preise auf dem Live-Chart
echte Trading-Entscheidungen verfälschen könnten, wurde bewusst NICHT
umgestellt — bei den 3 separaten Linien bleibt jede Preisangabe exakt und
nachvollziehbar. Falls das Tool später doch gewünscht wird: mehr Zeit für
Reverse-Engineering der genauen Override-Semantik einplanen, nicht raten.

**Alle 4 launchd-Jobs live einzeln getestet (28.07.2026):**
morning-briefing (voller Lauf inkl. Telegram Text+Foto+Entry/SL/TP-Linien),
evening-sync (identisches Skript), ms-check (Alert + Dedup bestätigt),
scenario-check (Alert + Dedup bestätigt) — alle Exit 0, alle Telegram-
Zustellungen erfolgreich. Unit-/E2E-Suite: 220/220 grün.

---

## 🐛 Session-Log 28.07.2026, Teil 1 — Vollaudit + Market-Shift-Überarbeitung

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
Läufe von `check_ms.mjs` (inkl. worst-case Timeframe-Sprung). Alle 3 launchd-Jobs
(`morning-briefing`, `evening-sync`, `ms-check`) einzeln manuell via
`launchctl kickstart` getriggert und bestätigt — jeweils Exit 0, Telegram-
Zustellung (Text + Foto) erfolgreich.

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

**⚠️ ACHTUNG (28.07.2026, Teil 3): Diese Zahlen sind mit hoher
Wahrscheinlichkeit durch den Target-Sign-Bug verfälscht** (Szenario B's
Zielpreis lag auf der falschen Seite des Entries, wodurch praktisch jeder
berührte Trade als Gewinn gezählt wurde — Details in Session-Log Teil 3).
Der Bug existierte seit der 09.–10.07.2026-Kalibrierung, also während des
gesamten hier dokumentierten Backtest-Zeitraums. Bis zum Re-Backtest mit der
korrigierten Formel: **87,8% WR / +2,37R für B nicht als verlässlich
behandeln.**

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

**⚠️ Alle 4 Kernaussagen oben basieren auf dem durch den Target-Sign-Bug
verfälschten Datensatz — siehe Backtest v3 direkt darunter für die
korrigierten, echten Zahlen.**

---

## 📊 Backtest v3 (28.07.2026, korrigierte Formel — die verlässliche Zahl)

Frisch gefetchte 15m-Historie (02.02.–28.07.2026, 10.489 Bars — TradingViews
Lazy-Load stoppte dort, ~5,9 statt 6 Monate, aber deutlich mehr als die
3-Tage-Stichprobe aus Teil 3) + 4H/1H/Daily, mit der **korrigierten**
Target-Formel (Ziel auf der richtigen Seite des Entries) durch
`backtests/sim_6m.mjs` gejagt. 124 Handelstage, 4.814 Sim-Schritte (15min-
Cadence), 295 geloggte Szenarien gesamt.

### Gesamt (Szenario B — Counter-Trend-Fade)
**63 Erfolge / 193 Misserfolge** (285 gesamt, 26 nie getriggert, 3 offen)
→ **24,6% WR, −0,02R ExpR**

Bei 3R-Zielsetzung liegt die Break-even-Win-Rate exakt bei 25% — 24,6% ist
statistisch nicht von "kein Edge" zu unterscheiden. **B zeigt in diesem
Datensatz keine profitable Kante, weder positiv noch stark negativ — im
Wesentlichen Zufall nach Payout-Struktur.**

| Aufschlüsselung | n | WR | ExpR | Anmerkung |
|---|---|---|---|---|
| Gesamt | 285 | 24,6% | −0,02R | |
| Grade B+ (beste Confluence) | 68 | 15,9% | −0,37R | ⚠️ Schlechter als B und C |
| Grade B | 148 | 25,2% | +0,01R | |
| Grade C (schwächste Confluence) | 69 | 32,8% | +0,31R | ⚠️ Besser als B+ |
| Vormittags | 142 | 31,5% | +0,26R | |
| Nachmittags | 143 | 17,8% | −0,29R | |
| D (alle Consolidation-Varianten) | 10 | 0% | −1,0R | 0 Gewinne von 10 |

**Kernaussagen (ersetzen die 4 oben):**
1. **B hat keine nachgewiesene Edge.** Die frühere 87,8%-WR war komplett
   das Target-Sign-Artefakt aus Teil 3 — sobald jeder berührte Trade korrekt
   anhand des tatsächlichen Kursverlaufs bewertet wird, verschwindet der
   "Edge" fast vollständig.
2. **Die Grade-Rangfolge ist invertiert** (B+ schlechter als C) — ein
   deutliches Warnsignal, dass die Confluence-Checkliste selbst (Rejection/
   MSS/5min-Bestätigung/1H-MS) aktuell keine prädiktive Kraft hat, unabhängig
   von der Frage, ob B überhaupt eine Edge hat. Nicht weiter untersucht in
   dieser Sitzung — offener Punkt.
3. **D zeigt in dieser (kleinen, n=10) Stichprobe ebenfalls keine Edge** —
   0/10 Gewinne. Zu wenige Signale für eine belastbare Aussage, aber
   definitiv keine Bestätigung der alten "100% WR"-Zahl.
4. **Konsequenz (umgesetzt in Teil 5):** Kernaussage 2 (invertierte Grade-
   Rangfolge) wurde weiterverfolgt statt als offener Punkt liegen gelassen —
   siehe Backtest v4 direkt darunter.

---

## 📊 Backtest v4 (28.07.2026, Teil 5 — Szenario B neu konzipiert)

**Auslöser:** die invertierte Grade-Rangfolge aus Backtest v3 (B+ schlechter
als C) wurde nicht als Bug, sondern als echtes Marktverhalten erkannt: "hohe
Confluence" bedeutete, dass Rejection/MSS/5min-Bestätigung bereits
stattgefunden hatten, BEVOR die Zone überhaupt als Kandidat qualifizierte —
die Zone war zu diesem Zeitpunkt also schon aktiv getestet. Klassische TA:
der erste Test eines Levels ist stärker als ein Retest.

**Neu-Konzeption (User-bestätigt, 28.07.2026):**
- **Fresh-Zone-Gate:** B feuert nur noch, wenn die Zone NOCH KEINE Rejection/
  MSS/5min-Bestätigung zeigt (genaues Gegenteil der alten Logik — vorher
  war das eine optionale Confluence, jetzt eine harte Voraussetzung).
- **1:1 Risk:Reward** (vorher 3:1) — Ziel liegt im selben Abstand wie der
  Stop, nur auf der Gewinnseite.
- **Alignment-Filter:** kurzfristiges Momentum (letzte 3 Kerzen) muss mit
  dem 4H-Trend übereinstimmen (vorher keine Bedingung für B).
- Kein Liquidity Sweep/Retest (das bleibt exklusiv Szenario D's Logik) —
  MS wird weiterhin berechnet, aber jetzt als Ausschlusskriterium
  verwendet (muss ABWESEND sein), nicht als Bestätigung.

**Ergebnis (echte Simulation mit dem tatsächlich deployten Code, nicht nur
Post-hoc-Filterung des alten Logs):**

| | Backtest v3 (altes Design) | Backtest v4 (Fresh-Zone-Redesign) |
|---|---|---|
| Win-Rate | 24,6% | **71,4%** |
| ExpR | −0,02R | **+0,43R** |
| Aufgelöste Trades | 256 | 56 (75 gesamt, 18 nie getriggert, 1 offen) |
| Ziel-Verhältnis | 3:1 | 1:1 |

**Monatsstabilität** (Gesamt-Log, dominiert von B): jeden Monat positiv oder
nahe neutral, keine Ausreißer-Monate:

| Monat | ExpR |
|---|---|
| Feb 2026 | +0,29R |
| Mär 2026 | −0,14R |
| Apr 2026 | +0,20R |
| Mai 2026 | +0,50R |
| Jun 2026 | +0,56R |
| Jul 2026 | 0,00R |

**Session-Split (Beobachtung, nicht weiter verfolgt):** Vormittags 82,1% WR
/ +0,64R (50 Trades) vs. Nachmittags 47,1% WR / −0,06R (25 Trades) — ein
zusätzlicher Vormittags-Filter könnte die Edge weiter verbessern, wurde in
dieser Sitzung aber bewusst nicht mehr nachgezogen (Risiko von Overfitting
durch zu viele sequenzielle Verfeinerungen auf demselben 6-Monats-Datensatz).
Offener Punkt für spätere Sitzung, mit frischeren/mehr Daten.

**Live verifiziert** (28.07.2026): Bei aktueller Marktlage (4H-Trend
bullisch, kurzfristiges Momentum bärisch → nicht aligned) feuert B korrekt
NICHT — 0 Szenarien, Chart-Linien korrekt leer. Bestätigt, dass der neue
Alignment-Filter wie vorgesehen greift.

---

## 🐛 Session-Log 29.07.2026, Teil 8 — Chart-Orphan-Bug (User-gemeldet)

**Auslöser:** User meldete 2 PDH-Linien, mehrere doppelte 4H-Level und bereits
mitigierte FVGs, die trotzdem noch auf dem Chart standen.

**Root Cause gefunden (live diagnostiziert, nicht geraten):** `zones.json`
verzeichnete nur 15 aktive/historische Einträge, aber der echte Chart zeigte
34 Shapes — 14 komplett untracked. Genaue Identifikation der 14 Orphans
bestätigte beide Symptome exakt:
- 2x `horizontal_line` "PDH 25558.9" / "PDL 25177.8" — eine alte, bereits als
  "removed" markierte PDHL neben der aktuellen (25555.13/25302.94).
- 6x `horizontal_ray` "4H Demand"/"4H Supply" — zwei davon exakt auf demselben
  Preis wie aktuell getrackte, aktive 4H-Level (25089.09 und 25295.42) —
  echte visuelle Duplikate.
- 3x `rectangle` "FVG bullish (15m)" — genau die vom User gemeldeten,
  längst mitigierten FVGs, die im State korrekt nicht mehr aktiv waren, aber
  nie tatsächlich vom Chart entfernt wurden.
- 3x `12H Demand`/`12H Supply` Rays — gleicher Bug, vom User nicht explizit
  erwähnt, aber derselbe Fund.

**Der eigentliche Bug** (`run.mjs`, 6 Entfernungsstellen + 2 weitere beim
S/R-Flip/Umfärben): jede Stelle setzte `entry.status = 'removed'`
**unconditional** direkt nach dem `remove()`-Aufruf — ohne zu prüfen, ob die
CDP-Entfernung tatsächlich geklappt hat. `remove()` kann `{removed: false}`
zurückgeben (API-Aufruf lief, aber die Form existiert danach immer noch —
z.B. ein transientes CDP-Timing-Problem), und das wurde genauso behandelt
wie ein echter Erfolg. Nach `PRUNE_AGE_SEC` (7 Tage) wird der State-Eintrag
dann komplett gelöscht — die einzige verbleibende Spur, dass diese Form
jemals existierte, verschwindet, und die Form bleibt für immer als Orphan
auf dem Chart zurück, ohne dass je wieder etwas versucht, sie zu entfernen.

**Fix:**
1. Neue Helper-Funktion `wasActuallyRemoved(r)` in `run.mjs` — unterscheidet
   "Form war schon weg" (harmlos, `error` enthält "not found") von "Form
   existiert nachweislich noch" (`removed: false`, kein Error) — nur im
   ersten Fall UND bei echtem `removed: true` wird der State-Eintrag als
   `'removed'` markiert. Bei echtem Fehlschlag bleibt der Eintrag `active`
   und wird im nächsten Lauf automatisch erneut versucht (`dataWarnings`
   macht das sichtbar statt es stillschweigend zu verlieren).
2. Angewendet an allen 6 Stellen, die den Status setzen, plus 2 weiteren
   (S/R-Flip-Konvertierung, Level-Umfärbung bei erster Berührung), die
   `tv_entity_id` überschreiben und daher denselben Orphan-Effekt hätten
   auslösen können — dort als Warnung statt Status-Änderung, da die
   Konvertierung ohnehin weiterlaufen muss.
3. **Einmalige Bereinigung:** alle 14 gefundenen Orphans direkt vom Chart
   entfernt (verifiziert: 34 → 20 Shapes, exakt passend zur Summe aller
   getrackten IDs über `zones.json` + `market_shift.json` +
   `scenario_lines.json`).

**Verifiziert:** Unit-Tests 141/141 grün (schnell, keine Live-TradingView-
Abhängigkeit). Backtest unverändert (dieser Fix betrifft nur die Chart-
Zeichnungs-Buchhaltung, nicht die Szenario-Logik). Live-Lauf (morning-
briefing, 29.07.2026 09:22): `dataWarnings: []`, alle Removals korrekt
`"removed": true`, keine neuen Orphans, Telegram erfolgreich zugestellt.

**Nebenbefund — wiederkehrendes TradingView/Test-Hänge-Muster:** Während
dieser Sitzung fror TradingView zweimal ein (0% CPU über mehrere Minuten,
CDP-Port antwortet, aber Seiten-JS-Evaluate hängt) — via `pkill -9` +
`ensureTradingViewReady()` neu gestartet (kein Datenverlust, State ist
unabhängig persistiert). Zusätzlich hängt die volle E2E-Test-Suite
(`test:all`) reproduzierbar exakt nach dem `ui_hover`-Test — unabhängig von
dieser Sitzung's Code-Änderungen, vermutlich ein Umgebungs-/Timing-Problem
in der UI-Automatisierung selbst. **Nicht in dieser Sitzung behoben** —
`npm run test:unit` (141 Tests, keine Live-Abhängigkeit) bleibt der
verlässliche schnelle Check; `test:all`/e2e nur mit Vorsicht und Geduld
laufen lassen, ggf. TradingView vorher frisch neu starten.

---

## 🐛 Session-Log 29.07.2026, Teil 9 — 4H-Level-Duplikat (User-gemeldet) + Neustart-Eskalation

**Auslöser:** User meldete zwei aktive 4H-Level bei 25.511 und 25.509, nur
2pts auseinander — visuell nicht unterscheidbar, wollte Ausschluss künftiger
Fälle plus sofortige Bereinigung.

**Root Cause gefunden (live diagnostiziert):** Live-Check zeigte
`3bX0mF` @ 25509.71 = "4H Demand", `7dFkmg` @ 25511.78 = "4H Supply" — zwei
verschiedene Typen, beide zur exakt selben Millisekunde erzeugt
(`created_at` identisch). `sdLevels4h` (`run.mjs`) hatte anders als
`sdLevels12h` noch **gar kein** Self-Dedupe gegen bereits aktive 4H-Level —
der Kommentar an dieser Stelle sagte das für 12H bereits explizit
("12H levels were never deduped against EACH OTHER"), aber die 4H-Seite war
nie nachgezogen worden. Zusätzlich verglichen die bestehenden 12H-Self-Dedupe
(`near12hSelf`) und die 4H-vs-12H-Prüfung (`near12h`) nur **gleichen Typ**
(Demand-vs-Demand) — ein Demand+Supply-Paar 2pts auseinander wäre also selbst
mit reinem Same-Type-Fix durchgerutscht. Da `sd_level_4h` in `draw.mjs`s
`COLORS` pro Zeitebene, nicht pro Typ eingefärbt ist (beide orange
`#FF9800`), sind so knapp beieinanderliegende Demand/Supply-Level auf dem
Chart optisch nicht unterscheidbar — exakt das gemeldete Symptom.

**Fix (`run.mjs`):**
1. Neue `near4hSelf`-Prüfung (analog `near12hSelf`), verhindert dass ein
   frischer 4H-Kandidat gezeichnet wird, wenn bereits ein aktives 4H-Level
   in Toleranz (`NEAR_12H_PCT` = 0,05% / ~13pts) liegt.
2. `near12hSelf`/`near4hSelf` UND der Post-hoc-Cleanup-Block (vormals nur
   12H, jetzt für beide Zeitebenen) sind jetzt **typ-agnostisch** — verglichen
   wird nur noch die Preisnähe, nicht mehr zusätzlich `type === type`. Ein
   Demand+Supply-Paar in Toleranz ist genauso redundant/verwirrend wie zwei
   gleichtypige Level.
3. Bei Preis-Gleichstand (identisches `created_at`) gewinnt das ältere Array-
   Element (stabiler Sort) — konsistent angewendet sowohl im Code-Fix als
   auch bei der manuellen Live-Bereinigung unten.

**Verifiziert:** Lint 0 Fehler, Unit-Suite 141/141 grün. Kein weiteres
Duplikat-Paar im aktuellen State gefunden (State-weiter Scan nach dem Fix).

**Live-Bereinigung:** `7dFkmg` (25511.78, "4H Supply", jüngeres der beiden)
via `removeOne()` vom Chart entfernt (verifiziert: 20 → 19 Shapes), State-
Eintrag auf `status: 'removed'`, `removed_reason: 'duplicate_4h_self'`
gesetzt. `3bX0mF` (25509.71, "4H Demand") bleibt aktiv.

**Nebenbefund während der Live-Bereinigung — TradingView erneut gewedged:**
`getShapeById()` schlug für **alle** 20 Shapes mit "no such shape" fehl,
obwohl `listDrawings()` sie korrekt auflistete — reproduzierbar, kein
Zufallstreffer (zweimal hintereinander getestet). Health-Check selbst
brauchte beim ersten Aufruf dieser Sitzung >120s (normalerweise <1s).
`launch({kill_existing:true})`s eingebauter Kill-Schritt (`pkill -f
TradingView`, reines SIGTERM) konnte den alten Prozess NICHT beenden — er
lief nach dem "Neustart" munter weiter (PID 29921, unverändert), während der
neue Prozess mangels freiem CDP-Port sofort wieder starb. Erst manuelles
`kill -9` auf die alte PID + sauberer Neustart über `launch({kill_existing:
false})` behob es (neuer Health-Check danach: 2s statt >120s). **Damit war
der eigentliche "kaputte Shape"-Befund allerdings ein Artefakt eines Fehlers
in meinem eigenen Diagnose-Skript** (`getProperties(id)` statt korrekt
`getProperties({entity_id: id})` aufgerufen) — nach Korrektur funktionierte
`getProperties` bereits vor dem Neustart einwandfrei. Der Neustart war
trotzdem berechtigt: der ursprüngliche, wiederholt beobachtete Health-Check-
Hänger (>120s) ist ein reales, unabhängiges Symptom des bekannten
Freeze-Musters (siehe Teil 8 Nebenbefund).

**Zusätzlicher Fix (`src/core/health.js`, `launch()`s `killExisting()`):**
Da dies der zweite dokumentierte Fall ist, in dem ein gewedgter TradingView-
Prozess SIGTERM (`pkill -f`) schlicht ignoriert (erster Fall: Teil 8
Nebenbefund, damals manuell mit `pkill -9` behoben), eskaliert
`killExisting()` jetzt automatisch: erst `pkill -f` (SIGTERM, gibt dem
Prozess die Chance auf sauberes Beenden), kurze Wartezeit, dann `pgrep -f
TradingView`-Check — läuft der Prozess noch, folgt `pkill -9 -f TradingView`
(SIGKILL). Windows (`taskkill /F`) war bereits vorher forciert, keine
Änderung nötig dort. Lint 0 Fehler, Unit-Suite weiterhin 141/141 grün
(`tests/launch.test.js` deckt nur den win32/MSIX-Pfad ab und ist auf macOS
ohnehin geskippt — unberührt von dieser Änderung).

---

## 🔎 Session-Log 28.07.2026, Teil 7 — ORB + VWAP im Briefing referenziert

**Auslöser:** User nutzt bereits zwei aktive TradingView-Indikatoren — "VWAP
Auto Anchored" und "ORB" (ein öffentliches Pine-Script, Session-konfigurierbar,
aktuell 09:00-09:30) — als Teil seiner eigenen, diskretionären Tagesstrategie
(zusammen mit PDH/PDL, Zonen, Imbalances). Wunsch: das 09:20-Morning-Briefing
soll darauf Bezug nehmen.

**Wichtige Design-Entscheidung:** die vorhandenen Indikator-WERTE werden
direkt vom Chart gelesen (`getStudyValues()`), nicht selbst nachgerechnet —
damit stimmt das Briefing exakt mit dem überein, was der User selbst auf
seinem Chart sieht (inkl. seiner eigenen ORB-Session-Konfiguration, aktuell
09:00-09:30, nicht die ursprünglich genannten 15 Minuten).

**Technischer Fund:** Beide Indikatoren sind nur zuverlässig lesbar, wenn der
Chart auf 5m-Auflösung steht (User-Hinweis, per Live-Test bestätigt — auf
4H/12H zeigte `getStudyValues()` den ORB-Indikator gar nicht an). `run.mjs`
wechselt die Auflösung beim Bar-Fetch mehrfach (12H→4H→15m→1H→5m→Daily) —
die Lesung musste deshalb GENAU zwischen dem 5m-Fetch und dem darauffolgenden
Daily-Fetch platziert werden (sonst steht der Chart schon auf 'D').

**Implementiert:**
- `utils.mjs`: `readOrbVwap()` — liest `getStudyValues()`, findet die Studies
  per Name-Regex (`/vwap/i`, `/^orb\b/i`), parst deutsch formatierte Zahlen
  ("25.442,86" → 25442.86), liefert `{vwap, orbHigh, orbLow}` (null-safe,
  kein Crash falls eine Study fehlt).
- `run.mjs`: Aufruf direkt nach `fetchBars(5, 500)`, vor dem Daily-Fetch.
- `briefing.mjs`: neue `describeOrbVwap()`-Zeile im "So sieht der Markt
  gerade aus"-Block — ORB-Range + Position des Kurses relativ dazu, VWAP-Wert
  + Abstand des Kurses. Rein informativ, ändert keine Szenario-Logik (A/B
  bleiben unverändert, wie in der Beobachtungsphase vorgesehen).

**Live verifiziert** (28.07.2026, echter Morning-Briefing-Lauf): Briefing-Text
zeigte korrekt "ORB: Hoch 25555.1, Tief 25435.0 (Range 120.1 Pkt) — Kurs
aktuell innerhalb der ORB-Range. VWAP: 25433.2 — Kurs 72.4 Pkt darüber."
Telegram-Zustellung erfolgreich (Text + Foto). Als Nebenbefund im selben Lauf:
Szenario A feuerte zum ersten Mal live (Long Reversal an POI 25480.1, B+,
Liquidity-Sweep-Trigger) — bestätigt, dass die Teil-6-Implementierung auch
unter echten Marktbedingungen korrekt auslöst.

---

## 📊 Backtest v5 (28.07.2026, Teil 6 — Neues Szenario A)

**Auslöser:** User war enttäuscht, dass nur 1 von 4 Szenarien wirklich lief,
und beschrieb eine eigene, ICT-nahe Strategie: Top-Down-Analyse bestimmt den
Trend, S/D UND S/R als Points of Interest, bei Gegentrend-Pullback wird an
diesen POIs auf einen Richtungswechsel zurück in den Haupttrend gewartet,
Entry-Trigger ist ein Market Shift oder Liquidity Sweep, Order Blocks/FVGs
sind Bonus-Konfirmation, Ziel mindestens 1:2 RR an der nächsten realen Zone.

**Timeframe-Hierarchie (User-verfeinert, zwei Rückfragen geklärt):**
- Trend: **1H BOS** (bewusst getrennt von B/D's 4H — eigenes `aHtfBias`)
- POI-Pool: S/D-Zonen aus **12H + 4H**, plus S/R-Linien (tactical)
- FVG-Bonus: **12H + 4H + 15min**
- Entry-Trigger: Market Shift ODER Liquidity Sweep auf **5min**, PLUS die
  aktuelle 5m-Kerze muss selbst eine Reaktionskerze in Reversal-Richtung
  sein (steht für den User-gewünschten 1m-Entry — TradingViews 1m-Historie
  reicht nur 16 Tage zurück, zu wenig für einen Backtest; 5m-Näherung
  User-bestätigt)
- Bonus-Konfirmation (Order Block + FVG): "mehr Konfluenz = besser" (User-
  bestätigt, klassische ICT-Lesart, NICHT wie B's invertierte Fresh-Zone-Logik)
- Ziel: R:R ≥ 2, immer die nächste reale Zone in Trendrichtung

**Datenlage:** TradingViews 5m-Lazy-Load reicht nur bis 31.05.2026 zurück
(11.298 Bars) — deutlich kürzer als B's 6 Monate. Erster Versuch mit reinem
5m-Trigger (ohne 1H-Trend-Umstellung, ohne 12H-Zonen) zeigte −0,09R (kein
Edge); nach der User-Verfeinerung (1H-Trend, 12H+4H-Zonen, 5m-Doppel-Check
als 1m-Näherung) deutlich besser:

| | Erster Versuch | Nach Verfeinerung (deployed) |
|---|---|---|
| Win-Rate | 28,0% | **34,9%** |
| ExpR | −0,09R | **+0,13R** |
| Aufgelöste Trades | 72 | 60 (66 gesamt, 3 offen) |
| Juni ExpR | −0,04R | +0,12R |
| Juli ExpR | −0,13R | +0,14R |

**Wichtige Einordnung:** +0,13R ist moderat, nicht so stark wie B's +0,43R,
und die Stichprobe (~2 Monate statt 6) ist deutlich kleiner. **Dieselbe
Konfluenz-Inversion wie bei B zeigte sich ein drittes Mal**: Confluence=1
(nur ein Trigger) lief mit +0,46R besser als Confluence=3 mit −0,31R (n=9,
klein) — User entschied sich bewusst für die größere Gesamt-Stichprobe statt
auf die stärkere, aber kleinere Confluence=1-Untermenge einzuschränken.
**Dieses Muster (weniger Bestätigung = frischer/besser) ist jetzt über zwei
unabhängig entwickelte Strategien hinweg konsistent — ein generelles
Verhaltensmuster von DE40 in diesem Regime, nicht ein Zufall einer
einzelnen Strategie.**

**Implementiert in `briefing.mjs`** (`buildScenarios`, neuer `aHtfBias`-Pfad,
Typ `trend_reversal_poi`), neue Inputs durch `run.mjs` und `check_scenarios.mjs`
verdrahtet: `aHtfBias` (1H BOS), `activeLevels12h`, `srLevels`, `fvgs12h`,
`fvgs4h`. Chart-Zeichnung (`draw.mjs`) und Full-Confluence-Alert
(`scenario_alerts.mjs`) funktionieren automatisch mit, da sie generisch über
alle Szenario-Typen laufen. **Live verifiziert** (28.07.2026): bei aktueller
Marktlage (1H/4H/kurzfristig alle bullisch aligned, kein Gegentrend-Pullback)
feuert A korrekt NICHT — 0 Szenarien, Chart-Linien korrekt leer.

**Neue Backtest-Dateien:** `backtests/fetch_5m.mjs`, `backtests/fetch_1m.mjs`
(1m nur 16 Tage nutzbar, nicht fürs Backtesting verwendet), `backtests/
sim_scenario_a_poi.mjs`, `backtests/data_5m.json`, `backtests/data_1m.json`.

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

1. **Fresh-Zone-Fade (B)** — ✅ Neu konzipiert (Teil 5) nach dem Target-Sign-
   Bug-Fund: Fresh-Zone-Gate + 1:1 RR + Alignment-Filter. **71,4% WR, +0,43R
   über 56 aufgelöste Trades, 6 Monate, positiv/flach in allen 6 Monaten.**
   Stärkste validierte Strategie im System.

2. **Trend-Reversal an POI (A)** — ✅ Komplett neu gebaut (Teil 6, User-
   Design): 1H-Trend, 12H+4H-POI (S/D+S/R), MS/Sweep-Trigger auf 5m,
   OB/FVG-Bonus. **34,9% WR, +0,13R über 60 aufgelöste Trades, ~2 Monate**
   (kürzere, kleinere Stichprobe als B — moderat statt stark validiert).

3. **Consolidation Breakout (D)** — Zielpreis-Logik war hier korrekt (nutzt
   echte 4H-Levels statt Multiplikator, kein Target-Sign-Bug), aber Teil-4-
   Re-Backtest zeigt ebenfalls 0/10 Gewinne (kleine Stichprobe) — auch hier
   die alte "100% WR"-Zahl NICHT mehr als Bestätigung werten. Feuert
   praktisch nie (1x in 6 Monaten) — technisch aktiv, praktisch irrelevant.

4. **4H-Trend + 5m Confirmation** — 55–60% predictive power combined
5. **Market Shift Confluence Validation** — HTF nur wenn matches LTF, verhindert falsche Signale
6. **Konservative Outcome-Semantik** — Same-Bar SL+TP = SL zählt (keine geschönten Zahlen)
7. **MS-Detection über 5m/1H/4H** mit Begründung, signatur-basiertem Dedup — seit 28.07.2026
8. **Dauerbetrieb via launchd** — überlebt Session-Ende, Neustart, kein 7-Tage-Verfall
9. **Grade-System für B** — zeigt echte, uneinheitliche B+/B/C-Verteilung
   statt immer "C" (Root Cause gefixt Teil 2, weitere Genauigkeits-Fixes
   Teil 3 — siehe unten). Grade selbst greift nirgends ins Trading ein.
10. **Full-Confluence-Telegram-Alert** — eigene, häufige (15 Min) Nachricht
    sobald ein Szenario 5/5 Confluence erreicht, live verifiziert 28.07.2026.
    Läuft generisch über alle Szenario-Typen (A/B/D).
11. **Empfohlene Entry/SL/TP-Linien auf dem Chart** — live verifiziert
    28.07.2026, jetzt auch für Szenario A (eigener Chart-Slot).
12. **Zonen-Nähe/Frische-Pflicht für Confluence-Checks** (Teil 3) — Rejection/
    MSS/5min-Bestätigung müssen jetzt session-frisch (8h) UND (bei MSS)
    ATR-nah an der Zone sein, nicht nur irgendein Event der letzten 2 Tage
    irgendwo auf dem Chart.
13. **"Durchbrochen ohne Retest"-Erkennung** (Teil 3) — `zoneBrokenNoRetest`
    entfernt die Entry-Linie, sobald der Kurs die Zone ohne jemals erkannte
    Rejection/Bestätigung durchbrochen hat, auch wenn SL/TP noch nicht
    erreicht sind.

## ❌ Was nicht funktioniert

1. ~~**Trend-Bounce (A)**~~ — 🗑️ Das ALTE Szenario A (reine Bounce-Logik
   ohne Reversal-Trigger) wurde 08.07.2026 entfernt (alle 9 Parameter-
   Kombinationen negativ). Das NEUE Szenario A (Teil 6, "Trend-Reversal an
   POI") ist ein komplett anderer Aufbau und ist jetzt aktiv — siehe "Was
   funktioniert" oben.
2. **Momentum mornings (C)** — 🗑️ Disabled 10.07.2026 (20,3% WR, −0,17R ExpR)
3. **D als häufiges Setup** — auch gefixt nur ~1 Signal/6 Monate (sehr restriktiv)
4. **TradingView Long/Short-Position-Tool** — geprüft 28.07.2026, bewusst NICHT
   für Entry/SL/TP-Zeichnung verwendet (Preis-Kontrolle über die API unklar/
   unzuverlässig, Risiko falscher SL/TP-Anzeige auf dem Live-Chart). Details
   in Session-Log Teil 2.
5. **Counter-Trend 2R-Fade (B) — KEINE nachgewiesene Edge** (Teil 4, voller
   Re-Backtest mit korrigierter Formel): 24,6% WR / −0,02R über 285 echte
   Trades, 124 Handelstage. Break-even bei 3R liegt bei 25% — statistisch
   nicht von Zufall unterscheidbar. Die alte 87,8%-Zahl war komplett das
   Target-Sign-Bug-Artefakt. **Das System sendet aktuell weiterhin Live-
   Signale für eine Strategie ohne nachgewiesene Edge — mit dem User klären,
   ob pausiert oder weiterentwickelt wird, bevor auf B-Signale gehandelt wird.**
6. **Grade-Rangfolge invertiert** (Teil 4) — Grade B+ (15,9% WR, −0,37R) lief
   schlechter als Grade C (32,8% WR, +0,31R). Die Confluence-Checkliste
   selbst scheint aktuell keine prädiktive Kraft zu haben — nicht weiter
   untersucht, offener Punkt für nächste Sitzung.
7. **Consolidation Breakout (D) — ebenfalls keine bestätigte Edge** (Teil 4):
   0/10 Gewinne im Re-Backtest, allerdings zu wenige Signale für eine
   belastbare Aussage in beide Richtungen.
6. **Confluence-Checks liefen bis Teil 3 ohne Zonen-Nähe-Pflicht** — konnten
   grün zeigen für Events, die nichts mit der jeweiligen Zone zu tun hatten
   (live nachgewiesen: MSS 87-146 Punkte entfernt). Gefixt, aber jeder
   VOR Teil 3 verschickte Telegram-Alert (inkl. der ersten "alle Signale
   grün"-Nachricht aus Teil 2) hatte diesen Fehler noch.

---

## 📁 Datei-Struktur (aktuell, 28.07.2026)

```
~/tradingview-mcp/
├── scripts/premarket/
│   ├── run.mjs                # Voller Lauf: Zonen/OBs/FVGs, Szenarien, Screenshot, Briefing
│   ├── check_ms.mjs            # Schlanker 10-Min-MS-Checker (kein Zonen-Overhead)
│   ├── check_scenarios.mjs     # NEU (28.07.2026): schlanker 15-Min-Full-Confluence-Checker
│   ├── start-with-tv.mjs       # Auto-Start-Wrapper: startet TradingView falls nötig, dann run.mjs
│   ├── ms_alerts.mjs           # Geteilte MS-Detection/Alert/Draw-Logik (von run.mjs + check_ms.mjs genutzt)
│   ├── scenario_alerts.mjs     # NEU (28.07.2026): Full-Confluence-Alert (von run.mjs + check_scenarios.mjs genutzt)
│   ├── lib.mjs                 # Core detections (BOS, MS, FVG, S/D, Order Blocks, Zone Rejection)
│   ├── briefing.mjs            # Scenario builders A/B/D + Fallback ohne Szenario
│   ├── state.mjs                # Zone-State I/O, Invalidierung
│   ├── utils.mjs                # Berlin-Zeit (Intl-basiert), fetchBars (Retry), ensureTradingViewReady, readOrbVwap (NEU Teil 7)
│   ├── telegram.mjs             # Telegram-Versand
│   └── draw.mjs                 # TradingView Shape-Rendering (inkl. drawScenarioLevels seit 28.07.2026)
│
├── backtests/fetch_history_6m.mjs     # 6M-Historie via CDP (D/4H/1H/15m)
├── backtests/fetch_5m.mjs             # NEU (Teil 6): 5m-Historie via CDP (nur ~2 Monate ladbar)
├── backtests/fetch_1m.mjs             # NEU (Teil 6): 1m-Historie via CDP (nur ~16 Tage ladbar, nicht fürs Backtesting genutzt)
├── backtests/sim_6m.mjs               # Backtest-Replay für B/D (STEP_MIN=15|60)
├── backtests/sim_scenario_a_poi.mjs   # NEU (Teil 6): Backtest-Replay für A
├── backtests/sim_6m_results.json      # Backtest summary B/D (Teil 4/5, korrigierte Formel)
├── backtests/sim_6m_log.json          # Every simulated scenario (B/D)
├── backtests/sim_scenario_a_results.json  # NEU: Backtest summary A
├── backtests/sim_scenario_a_log.json      # NEU: Every simulated scenario (A)
│
├── state/zones.json                   # Active S/D levels, OBs, FVGs (auto-pruned >7 Tage)
├── state/scenario_log.json            # Live scenarios + outcomes + stats
├── state/market_shift.json            # Aktuelle 5m/1H/4H MS-Marker (Chart-Entity-IDs)
├── state/market_shift_alerts.json     # MS-Alert-Dedup (signatur-basiert)
├── state/scenario_alerts.json         # Full-Confluence-Alert-Dedup (signatur-basiert)
├── state/scenario_lines.json          # Entry/SL/TP-Linien-Entity-IDs pro Szenario-Slot (a/b/d)
│
├── logs/{morning-briefing,evening-sync,ms-check,scenario-check}.{log,err.log}  # launchd-Logs
│
└── STRATEGIE_OPTIMIERUNG_HANDOVER.md  # Diese Datei — wird bei jeder Änderung aktualisiert
```

`~/Library/LaunchAgents/com.boogy.de40-{morning-briefing,evening-sync,ms-check,scenario-check}.plist`
— die eigentlichen launchd-Job-Definitionen (außerhalb des Repos).

---

**Für nächste Sitzung:**
1. Diese Handover lesen (aktuell auf Stand 29.07.2026, Teil 8)
1a. Chart-Orphan-Bug ist gefixt (Teil 8) — falls trotzdem wieder Duplikate
    auftauchen: `dataWarnings` im nächsten Lauf auf "fehlgeschlagen"-Meldungen
    prüfen (der Fix macht fehlgeschlagene Removals jetzt sichtbar statt sie
    stillschweigend zu verlieren), dann live den Chart-Shape-Count gegen die
    Summe aus `zones.json`+`market_shift.json`+`scenario_lines.json`
    vergleichen (Methode ist in Teil 8 dokumentiert).
1a-2. `npm run test:all` (E2E) hängt reproduzierbar nach `ui_hover` — nicht
    in dieser Sitzung behoben, vermutlich Umgebungsproblem. `npm run
    test:unit` für schnelle, verlässliche Checks nutzen.
1b. ORB/VWAP-Referenz im Briefing ist live verifiziert (Teil 7) — falls die
    Zeile fehlt oder "N/A" zeigt, zuerst prüfen ob der User seine ORB/VWAP-
    Indikatoren noch auf dem Chart hat (Name muss weiterhin "ORB" bzw.
    etwas mit "VWAP" enthalten) und ob der Chart zum Lesezeitpunkt wirklich
    auf 5m stand (siehe `readOrbVwap()`-Kommentar in `utils.mjs`).
2. Beide aktiven Strategien (A + B) sind live deployed und backtestet —
   B stark validiert (6 Monate), A moderat validiert (~2 Monate, kleinere
   Stichprobe). Sobald mehr 5m/1m-Historie natürlich verfügbar ist (Zeit
   vergeht), lohnt sich ein erneuter A-Backtest auf einem größeren Fenster.
3. **Offener Punkt (nicht in dieser Sitzung untersucht):** die invertierte
   Konfluenz-Rangfolge (weniger Bestätigung = besser) zeigte sich jetzt
   3x — bei B UND bei A, in zwei unabhängigen Designs. Das ist entweder ein
   echtes, stabiles Marktverhalten für DE40 in diesem Regime (am
   wahrscheinlichsten, da so konsistent), oder ein noch nicht gefundener,
   gemeinsamer Bug in der zugrundeliegenden Detection-Logik (z.B.
   `detectMarketShift`/`findSweepMSS`). Falls Zeit: einmal gezielt prüfen,
   ob die Muster wirklich real sind oder eine gemeinsame Ursache haben.
4. `launchctl list | grep de40` — laufen alle 4 Jobs (inkl. scenario-check)?
5. `scenario_log.json` checken: neu detektierte Szenarien da (jetzt auch
   Typ `trend_reversal_poi` für A)?
6. Telegram-Chat überprüfen: MS-Alerts + Full-Confluence-Alerts + Morning-Briefing (09:20) angekommen?
7. Offener Punkt: TradingView Long/Short-Position-Tool könnte später nochmal für die Entry/SL/TP-Zeichnung evaluiert werden, aber nur mit echtem Reverse-Engineering der `stopLevel`/`profitLevel`-Semantik — nicht raten (siehe Session-Log Teil 2).
8. Bei Disk-Problemen: `df -h /` — Ursache war unabhängig vom Trading-Projekt.
9. Falls TradingView während eines Laufs einfriert (Dialog "fortfahren/
   neustarten"): `pkill -9 -f "TradingView --remote-debugging-port"` dann
   `ensureTradingViewReady()` — kein Datenverlust, State ist unabhängig
   persistiert (siehe Teil 3).
10. Szenario C bleibt disabled (`if (false && ...)` in briefing.mjs) — 20,3%
    WR im alten Backtest, kein Salvage-Weg gefunden. Nicht ohne neuen Grund
    reaktivieren.

Good luck! 🎯
