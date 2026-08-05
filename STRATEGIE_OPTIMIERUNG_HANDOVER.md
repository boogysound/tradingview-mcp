# DE40 Pre-Market Trading Strategie — Optimierungs-Handover

**Stand:** 2026-08-05, Teil 37 (User hat TradingView-Chart-Broker auf Tickmill umgestellt, plant spätestens ab Oktober 2026 live mit Tickmill zu handeln — Re-Backtest von B/A/UT/S3/InsideBar auf echter Tickmill-Kurshistorie + Einrechnung von Tickmills realem DE40-Spread [0,91pt]. Kernbefund: B/A/S3 überstehen den Broker-Wechsel UND echte Kosten mit weiter klar positivem ExpR; UT [+0,024R→−0,011R] und InsideBar [+0,105R→+0,002R] verlieren ihre Kante fast vollständig nach Kosten — beide waren bisher die vielversprechendsten Kaspareit-Live-Test-Funde, das kippt jetzt. Live-System selbst brauchte keine Code-Änderung für den Broker-Wechsel [war nie GBEBROKERS-hartcodiert]. Details in Teil 37 unten.) Teil 36 (Live-Test-Modus für ALLE verbleibenden Strategien eingerichtet — S2, S4 [beide Richtungen], S5, DailyDax, VCP [alle 3 Presets], InsideBar. User-Entscheidung: auch die eindeutig abgelehnten Funde live beobachten, gleicher Präzedenzfall wie S1 [Bar-Level-Simulation könnte zu grob gewesen sein]. 6 neue Checker + Jobs, alle bootstrap+kickstart-verifiziert [Exit 0], `ms-check` unbeeinflusst. Jetzt 13 launchd-Jobs insgesamt. `insidebar_engine.mjs` bekam eine neue `computeFilterState()`-Exportfunktion [regressionsfrei verifiziert], `dailydax_engine.mjs`s `resample()` wurde exportiert. Teil 35: InsideBar M1-Feingranularitäts-Verifikation — bestätigt, gleiches Muster wie S3s Teil 26: nur 2/105 Trades kippen, feine Simulation sogar leicht besser. InsideBar ist damit neben S3 der am gründlichsten geprüfte Fund der Aufarbeitung. Teil 34: S4 Filter/Pyramiding-Sweep — Root-Cause-Korrektur zu Teil 31: der Flaschenhals war `maxOpenTrades=1` [Baseline-Vereinfachung], nicht die Magic-Trend-Filter; LONG auch gelockert keine belastbare Edge [Regime-Artefakt], SHORT schwächeres, nicht robust bestätigtes Signal. Teil 33: InsideBar kombinierter Sweep — breiteste/dichteste Robust-Nachbarschaft der Aufarbeitung [74% Beide-Fenster-positiv]. Teil 32: InsideBar gebaut — **damit alle 8 ursprünglichen Kaspareit-Strategien mindestens einmal gebaut+gebacktestet.** Teil 31: S4 gebaut — reale Strategie ist "Xpct"/DC-RSI auf H4, nicht die SuperTrend-Sektion. Teil 30: S2 kombinierter Sweep — eindeutigste "keine Edge"-Bestätigung der Aufarbeitung [0/1.500 Kombinationen beide Fenster positiv]. Teil 29: S2 gebaut — klar KEINE Edge. Teil 28: Kaspareit-Quellen dauerhaft nach `kaspareit-docs/` kopiert. Teil 24-27: S3 gebaut+gesweept+15m-verifiziert+**Live-Test-Modus aktiv**. Ältere Historie siehe jeweilige Teil-Abschnitte unten.)
**System:** TradingView CDP + Node.js Automation (~/tradingview-mcp)
**Status:** ✅ Produktiv (`launchd`). Zwei aktive, backtestete Strategien: **B** (Fresh-Zone-Fade, 71,4% WR/+0,43R, 6 Monate validiert) und **A** (Trend-Reversal an POI, 34,9% WR/+0,13R, ~2 Monate validiert — kleinere Stichprobe, moderat statt stark). D bleibt technisch aktiv, feuert aber praktisch nie. Briefing referenziert zusätzlich die User-eigenen ORB/VWAP-Indikatoren (Teil 7). Das ursprüngliche UT-Bot+SMI+EMA-Momentum-EA (Teil 14) trug anfangs auch den Namen "Strategie C" — nie live gegangen (negative Expectancy), Buchstabe daher wieder frei; wird ab hier nur noch als "UT-Bot+SMI+EMA-EA" bezeichnet, siehe Namens-Hinweis in Teil 14. **Kaspareit-Trading-EA-Bibliothek** (S1–S5, VCP, UT, DailyDax, InsideBar — User hat bezahlte Mitgliedschaft, 8 kommerzielle MT5-EAs) wird schrittweise aus PDFs/Set-Files nachgebaut. **Kaspareit S1 läuft jetzt live im Test-Modus unter dem Namen "Strategie C"** (`com.boogy.de40-strategie-c-check`, alle 15 Min, DE40 H1, klar markierte 🧪-Telegram-Alerts) — sammelt echte Signal-Daten, siehe Teil 16. **Kaspareit UT läuft ebenfalls live im Test-Modus** (`com.boogy.de40-ut-check`, alle 15 Min, DE40 15m, gleiches 🧪-Alert-Muster) — siehe Teil 19-21; UT ist der bisher stärkste, am wenigsten fragile Backtest-Fund der gesamten Kaspareit-Aufarbeitung (breite Train+Test-positive Nachbarschaft, 5/6 Monate stabil), aber weiterhin nur ein Train/Test-Split, kein .set-File. S5/DailyDax bleiben reine Backtest-Artefakte (kein Live-Test bisher). **Kaspareit S3 läuft jetzt ebenfalls live im Test-Modus** (`com.boogy.de40-s3-check`, alle 15 Min, DE40 H1-Entry/H4-Magic-Trend-Filter, gleiches 🧪-Alert-Muster) — siehe Teil 24-27; der bisher am gründlichsten geprüfte Fund nach UT (kombinierter Sweep + dedizierte 15m-Feingranularitäts-Reverifikation, deren einziger Vorbehalt sich nicht bestätigte), aber weiterhin nur ein Train/Test-Split. **Kaspareit S2 zeigt nach vollem Sweep (Teil 29+30) eindeutig KEINE Edge** — 0/1.500 Kombinationen Train+Test beide positiv, klarste Ablehnung der gesamten Aufarbeitung, nicht weiterverfolgt auf DE40 H1. **Kaspareit S4 ist jetzt gebaut+gebacktestet** (Teil 31) — reale Strategie ist "Xpct"/DC-RSI auf H4 (nicht die SuperTrend-Sektion), aber nur 5/9 Trades über 14 Monate, zu wenig für jede Aussage. Fahrplan für die verbleibende Strategie (InsideBar) steht am Ende von Teil 16. **Broker-Wechsel auf Tickmill (Teil 37, 05.08.2026):** User handelt spätestens ab Oktober 2026 live über Tickmill — Live-Chart läuft bereits auf `TICKMILL:DE40` (keine Code-Änderung nötig, System war nie broker-hartcodiert). Re-Backtest + echte Kosteneinrechnung (Tickmill DE40 Spread 0,91pt) zeigt: B/A/S3 bleiben klar positiv, aber **UT [+0,024R→−0,011R] und InsideBar [+0,105R→+0,002R] verlieren ihre Kante nach echten Kosten fast vollständig** — beide vorherigen Live-Test-Spitzenreiter sind damit als Oktober-Kandidaten aktuell nicht mehr zu empfehlen, Details in Teil 37.

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

## 🐛 Session-Log 29.07.2026, Teil 10 — Mitigierte FVGs blieben bis zu ~13h auf dem Chart

**Auslöser:** User meldete eine durchbrochene bärische FVG, die bereits
mitigiert war, aber weiterhin auf dem Chart stand — Wunsch: sie soll
verschwinden "in dem Moment, wo sie 50% durchbrochen wurde". User lieferte
zusätzlich eine vollständige Filter-Spezifikation für "relevante FVGs"
(Timeframe-Scope, Mindestgröße, Impuls-Kerze, 50%-Mitigation-Schwelle,
HTF-Bias-Kongruenz).

**Root Cause gefunden (live diagnostiziert):** Die 50%-Mitigation-Logik
selbst existierte bereits korrekt (`fvgFillFraction()` in `lib.mjs`,
verwendet über `state.isInvalidated()`s FVG-Zweig: `frac >= 0.5` → entfernen)
— das war NICHT der Bug. Der eigentliche Bug war die **Taktung**:
`check_scenarios.mjs` (alle 15 Min) berechnete zwar bereits frische FVG-Fill-
Fractions für den Szenario-Aufbau, glich sie aber nie gegen die bereits
gezeichneten FVG-Rechtecke im State ab. Die einzige Stelle, die mitigierte
FVG-Rechtecke tatsächlich entfernte, war `run.mjs`s volle Invalidierungs-
Runde — die aber nur zweimal täglich läuft (09:20/22:00). Eine taktische FVG,
die untertags über 50% Fill kreuzt, konnte dadurch bis zu ~13h veraltet auf
dem Chart stehenbleiben, bevor sie beim nächsten Voll-Lauf entfernt wurde.

**Fix:**
1. Neuer, leichter Cleanup-Durchlauf in `check_scenarios.mjs`: scannt bei
   jedem 15-Min-Lauf alle aktiven `fvg_bullish`/`fvg_bearish`-State-Einträge,
   ruft dafür `state.isInvalidated()` (dieselbe Funktion, kein Reimplement)
   auf, entfernt was die 50%-Schwelle überschritten hat. Bewusst NUR auf
   FVG-Einträge beschränkt (keine volle S/D/OB-Invalidierungs-Runde), damit
   der 15-Min-Takt günstig bleibt.
2. `wasActuallyRemoved()` (die "wirklich entfernt vs. nur versucht"-
   Unterscheidung aus dem Teil-8-Orphan-Fix) von `run.mjs` nach `draw.mjs`
   verschoben und exportiert — jetzt von `run.mjs` UND `check_scenarios.mjs`
   geteilt statt dupliziert.

**Live verifiziert** (29.07.2026, direkt nach dem Fix manuell getriggert):
`check_scenarios.mjs`-Lauf meldete `fvgsMitigated: 1` — die vom User
gemeldete FVG wurde sofort entfernt, ohne auf den nächsten Voll-Lauf zu
warten.

**Zur User-Filter-Spezifikation eingeordnet:** Timeframe-Scope, Mindestgröße
und Impuls-Kerze werden bereits in `findFVGs()` durchgesetzt; die 50%-
Schwelle existierte bereits, nur Docht-basiert (`b.high`/`b.low`) statt
Close-basiert — das ist mindestens so aggressiv wie eine Close-Prüfung (löst
nie später aus als diese), daher keine Änderung nötig. 5-Minuten-FVGs als
eigene Kategorie fehlen aktuell (nur 15min/1H taktisch + 4H/12H) — User
bestätigte, das wird nicht gebraucht, keine Änderung vorgenommen.

**Verifiziert:** Lint 0 Fehler, Unit-Suite 141/141 grün.

---

## 🎯 Session-Log 29.07.2026, Teil 11 — Market-Shift-Alert komplett neu konzipiert

**Auslöser:** User: "Hier kann man einiges besser machen" — das bisherige
Design (LTF=5min, HTF=1H, Alert bei JEDEM MS unabhängig von Richtung, plus
Chart-Marker) passte nicht mehr zur aktuellen Marktlage: 4H/12H sehen seit
Wochen choppy aus ohne klaren Trend, 15min/1H sind aktuell die aussagekräftigeren
Timeframes. Zusätzlich sollte ein LTF-MS nur noch relevant sein, wenn er eine
Rückkehr in die HTF-Trendrichtung nach einer Gegentrend-Bewegung markiert —
nicht jeder beliebige MS. Und: keine Chart-Marker mehr, ausschließlich Telegram.

**Vier Design-Entscheidungen mit dem User geklärt (AskUserQuestion), bevor
Code geschrieben wurde** — architektonische Weichenstellungen, keine reine
Textänderung:
1. **HTF-Referenz:** dynamisch — 15min ODER 1H, je nachdem welcher frischer
   (= klarer) ist. Konkret umgesetzt: `findBosEvents()` auf beiden
   Timeframes, das mit dem zeitlich jüngeren letzten BOS gewinnt (gleiche
   "wer hatte mehr Zeit sich zu bestätigen"-Logik wie schon beim
   ursprünglichen 1H-vs-4H-Entscheid, Teil 1).
2. **LTF-Referenz:** 1min (statt bisher 5min) für schnellere Reaktion.
3. **Ersetzen statt zusätzlich:** komplett neues System statt einer dritten
   Variante daneben.
4. **Counter-Trend-Filter:** die einfache Variante — reduziert sich auf
   `ltfMs.direction === htfBias`, da `detectMarketShift()` per Definition nur
   dann `potential`/`confirmed` meldet, wenn die vorherige Richtung das
   Gegenteil von `direction` war. Kein separates Gegentrend-Lookback nötig.

**Implementiert:**
1. `ms_alerts.mjs` komplett neu geschrieben: `pickHtfBias(bars15, bars1h)`
   (Freshness-Tiebreak) + `checkAndAlertTrendResumptionMS({bars15, bars1h,
   bars1})` ersetzt `checkAndAlertMarketShifts()`. Neue, kurze Nachrichten
   exakt nach User-Vorgabe:
   - Potenziell: `Potenzieller MS: HTF ↓; erwartet LTF MS bei [Kurswert]`
   - Bestätigt: `Bestätigter MS: HTF ↓; LTF ebenfalls bärisch bestätigt.`
   Dedup weiterhin signatur-basiert (nicht zeitbasiert), jetzt ein einzelner
   `lastSig`-Schlüssel statt drei Slots (ltf/htf/htf4h).
2. **Keine Chart-Marker mehr** (User: "ich brauche keine MS mehr im Chart
   eingezeichnet... ausschließlich Telegram"): `drawMarketShiftMarker()`
   komplett aus `draw.mjs` entfernt. Die 4 noch aktiven alten MS-Marker-
   Shapes (ltf-hline, htf-vline+hline, htf4h-hline) live vom Chart entfernt,
   `state/market_shift.json` (die zugehörige Tracking-Datei) gelöscht — wird
   von nichts mehr geschrieben.
3. `check_ms.mjs` (10-Min-Job) und `run.mjs` (Voll-Lauf) holen jetzt
   `bars1`/`bars15`/`bars1h` statt `bars5`/`bars1h`/`bars4h` für diesen
   Zweck. **Wichtig:** `htfMs` (1H-`detectMarketShift`) ist ein SEPARATER,
   bereits bestehender Input für Szenario B's Confluence-Check ("1H-MS
   bestätigt intakten Trend", `briefing.mjs`) — unverändert gelassen, in
   `run.mjs` jetzt eigenständig berechnet statt als Nebenprodukt des alten
   Alert-Aufrufs.
4. `wasActuallyRemoved()` von `run.mjs` nach `draw.mjs` verschoben (bereits
   in Teil 10 begonnenes Muster), da die MS-Marker-Cleanup diesen Helper
   ebenfalls kurz brauchte.

**Live verifiziert (29.07.2026, ungewöhnlich direkt):** Der planmäßige
`check_ms.mjs`-Cronjob (alle 10 Min) griff automatisch auf den neuen Code
zu, WÄHREND an diesem Fix noch gearbeitet wurde, und verschickte bereits
`{"alertsSent":1,"htfBias":"bullish","htfSource":"1H",...}` — eine echte
"Bestätigter MS: HTF ↑; LTF ebenfalls bullisch bestätigt."-Nachricht ging
raus. Ein direkt danach manuell getriggerter Lauf dedupte korrekt (gleiche
Signatur bereits gemeldet) → `alertsSent:0`. Keine neuen Chart-Marker in
diesem Lauf (kein "✂️ Old MS removed"-Log mehr).

**Nebenbefund:** Zwei unversionierte Scratch-Skripte
(`scripts/aggressive_ms_cleanup.mjs`, `scripts/cleanup_and_redraw_ms.mjs`,
bereits vorher als fragwürdig markiert, nie committed) importieren das jetzt
entfernte `drawMarketShiftMarker` und sind dadurch kaputt — betrifft keinen
launchd-Job oder committeten Code, daher keine Änderung vorgenommen.

**Verifiziert:** Lint 0 Fehler (1 vorbestehende, unabhängige Warnung in
`lib.mjs` zu ungenutztem `isEngulfingCandle`), Unit-Suite 141/141 grün.

---

## 🎯 Session-Log 29.07.2026, Teil 12 — Telegram-Alert für JEDEN potenziellen Entry

**Auslöser:** User sah einen Entry auf dem Chart, aber es kam keine Telegram-
Nachricht mit einer Begründung dazu. Frage geklärt, dann Wunsch geäußert:
"ich möchte, dass ich immer potenzielle Entries auf Telegram erhalte".

**Root Cause (Erklärung, kein Bug):** Chart-Zeichnung und Telegram-Alert
liefen über zwei komplett unabhängige Gates. `drawScenarioLevels()`
(`draw.mjs`) zeichnet die Entry/SL/TP-Linien für JEDES Szenario mit einem
berechneten Target — unabhängig vom Confluence-Stand. `checkAndAlertFullConfluence()`
(`scenario_alerts.mjs`) hatte dagegen eine harte Bedingung
`if (s.metCount < s.totalCount) continue;` — Telegram kam ausschließlich bei
5/5 ("alle Signale grün"). Ein Szenario bei z.B. 2/5 oder 4/5 bekam also
einen Chart-Entry, aber nie eine Nachricht dazu.

**Fix (`scenario_alerts.mjs`):**
1. Funktion umbenannt: `checkAndAlertFullConfluence` → `checkAndAlertScenarioEntries`.
2. Gate geändert von `metCount < totalCount` auf `targets[0] == null` —
   exakt dieselbe Bedingung, die `drawScenarioLevels()` selbst benutzt, um zu
   entscheiden ob überhaupt Chart-Linien gezeichnet werden. Chart und
   Telegram sind damit strukturell in Lockstep, nicht nur zufällig meistens
   gleich.
3. Nachrichten-Header abhängig vom Confluence-Stand: weiterhin
   "🟢🟢 ALLE SIGNALE ERFÜLLT 🟢🟢" bei 5/5, sonst neu
   "🔹 POTENZIELLER ENTRY (metCount/totalCount)" — Rest der Nachricht (Zone,
   Stopp, Ziel, Confluence-Checkliste mit 🟢/🔴 pro Punkt, Rating) unverändert
   über die bereits bestehende `describeScenario()` wiederverwendet.
4. Signatur-Dedup (`type|direction|zonePrice|metCount/totalCount`)
   unverändert übernommen — ändert sich der Confluence-Stand (in beide
   Richtungen), geht eine neue Nachricht mit aktualisierter Checkliste raus;
   bleibt er gleich, keine Wiederholung. Entspricht "immer potenzielle
   Entries" als laufendes Update, nicht nur eine einmalige Benachrichtigung.
5. Aufrufer in `run.mjs` und `check_scenarios.mjs` sowie Kommentare
   entsprechend angepasst (Funktionsname + Header-Texte).

**Verifiziert:** Lint 0 Fehler, Unit-Suite 141/141 grün. Live-Lauf (`check_scenarios.mjs`)
direkt danach: `scenarios: []` (aktuell kein aktives Szenario) — kein Crash,
korrektes Verhalten bei leerer Liste. Der eigentliche Alert-Pfad (Nachricht
mit neuem Header) konnte mangels aktivem Szenario in diesem Moment nicht
live am echten Signal verifiziert werden — greift beim nächsten Szenario mit
berechnetem Target automatisch, gleicher Code-Pfad wie der bereits
produktiv bewiesene Full-Confluence-Alert.

---

## 🎯 Session-Log 29.07.2026, Teil 13 — Durchbrochene 4H/12H-Level → S/R statt Löschen

**Auslöser:** User sah eine 4H-Linie, die mehrfach durchbrochen wurde und
"nicht mehr funktioniert" — Wunsch: in eine hellblaue S/R-Linie umwandeln
statt löschen, weiter beobachten, bei fortgesetzter Irrelevanz dann löschen.

**Bestehendes Verhalten (kein Bug, aber inkonsistent):** S/D-ZONEN
(`sd_zone_demand`/`supply`, Rechtecke) bekamen bei der 2. Verletzung bereits
seit längerem die S/R-Flip-Behandlung ("Convert breached S/D zones to S/R
levels", `run.mjs`). S/D-LEVEL (`sd_level_demand`/`supply`, einzelne
Preis-Rays) hatten diese Behandlung NICHT — bei `break_count >= 2` ("2 echte
Brüche, Close durch") wurden sie bisher komplett gelöscht
(`sd_level_not_respected`). Live im State gefunden: viele historische Level
mit `break_count` bis zu 43 (!), alle gelöscht statt umgewandelt.

**Root Cause für "warum sehe ich das erst jetzt so extrem" (Cadence-Gap):**
Das Break-Count-Tracking für 4H/12H-Level (`checkLevelInteraction()`) läuft
ausschließlich im vollen `run.mjs`-Lauf (zweimal täglich, 09:20/22:00) — nicht
in den 10/15-Minuten-Checks. Letzter Voll-Lauf vor diesem Fix: 09:20 Uhr;
aktuelle Uhrzeit beim User-Hinweis: ~19:48 Uhr — fast 10 Stunden ohne Update.
In der Zwischenzeit hatte der Kurs mehrere Level längst mehrfach durchbrochen,
ohne dass das System es bereits verarbeitet hatte.

**Fix (`run.mjs`, S/D-Level-Lifecycle-Block):** Bei `break_count >= 2` wird
jetzt — statt gelöscht — exakt wie bei Zonen konvertiert: alte Ray entfernen,
neue `horizontal_line` in `COLORS.sr_level` (`#00FFFF`, Cyan/"hellblau")
zeichnen, Typ auf `sr_flip_support`/`sr_flip_resistance` setzen. Ab dann
"beobachtet" sich die Linie von selbst — `isInvalidated()`s bereits
bestehender S/R-Zweig entfernt sie endgültig, sobald 2 aufeinanderfolgende
Closes sie erneut durchbrechen (kein Sonderfall nötig, bestehender Mechanismus
greift automatisch).

**Live verifiziert (29.07.2026, ~20:22):** Voll-Lauf manuell getriggert (die
letzte planmäßige Ausführung war ~10 Stunden alt) — 4 Level sofort korrekt
konvertiert statt gelöscht:
- 4H Supply 25470.29 → Resistance (touch_count 11, break_count 7)
- 4H Demand 25509.71 → Support (touch_count 7, break_count 6)
- 4H Supply 25349.38 → Resistance (touch_count 2, break_count 7)
- 12H Supply 25267.45 → Resistance (touch_count 13, break_count 15)

Farbe live per `getProperties()` bestätigt: `linecolor: "#00FFFF"` — das ist
technisch Cyan/Türkis, nicht reines Blau. Falls ein anderer Farbton gewünscht
ist, einfach Bescheid geben (User noch nicht gefragt/bestätigt).

**Fortsetzung 30.07.2026 (nach Sitzungs-Unterbrechung durch Rechner-Ruhezustand)
— User bestätigte auf Nachfrage: Farbe (Cyan `#00FFFF`) passt, UND der
Cadence-Gap soll geschlossen werden ("ja, beides machen").**

**Cadence-Fix:** Der S/D-Level-Lifecycle-Block (Touch-Coloring + S/R-Flip-
Konvertierung bei 2. echtem Bruch) aus `run.mjs` nach `state.mjs` extrahiert
als `applySdLevelLifecycle(zonesState, barsByTf, {...})` — jetzt von
`run.mjs` UND `check_scenarios.mjs` (15-Min-Takt) geteilt, exakt gleiches
Muster wie die FVG-Mitigation in Teil 10. `check_scenarios.mjs` holt sich
dafür zusätzlich `dottedCode` per `verifyDottedLinestyleCode()` (bisher nur
in `run.mjs` genutzt) und schreibt den State nur, wenn tatsächlich etwas
konvertiert/eingefärbt wurde (`levelsConverted`/`levelsColored` als
Rückgabewerte, analog `fvgsMitigated`).

**Live verifiziert (30.07.2026) — gleich zweifach, unabhängig voneinander:**
1. Der planmäßige 09:20-Morning-Briefing-Cronjob griff automatisch auf den
   neuen Code zu (launchd ruft nur den Skript-Pfad auf, kein Git nötig) und
   konvertierte `sd_level_demand_240_..._25388` (25388.14) → `sr_flip_support`,
   `converted_at: 07:20:45 UTC` (= 09:20 Berlin) — bevor die
   `check_scenarios.mjs`-Erweiterung überhaupt fertig war.
2. **Nebenbefund (Selbstkorrektur nötig):** Beim Verifizieren eines
   möglichen zirkulären Imports (`state.mjs` importiert jetzt `draw.mjs`)
   wurde versehentlich `import('./scripts/premarket/run.mjs')` in einem
   Node-Einzeiler verwendet, um nur auf Ladefehler zu prüfen — das führt
   aber `run.mjs`s Top-Level-`main()` sofort aus, genau wie ein normaler
   Skript-Aufruf. Ergebnis: ein echter, ungeplanter Voll-Lauf inkl. echtem
   Telegram-Text+Foto-Versand und 2 automatischen Chart-Bereinigungen
   (`declutter_max_per_group`). Inhalt war korrekt/aktuell, nur außerplanmäßig
   verschickt — dem User sofort transparent gemeldet. Für künftige
   Ladeprüfungen: `node --check <datei>` (reine Syntaxprüfung, kein
   Ausführen) statt `import()`. Dieser ungeplante Lauf konvertierte dabei
   selbst 2 weitere Level: 4H Demand 25509.71 → Support, 4H Supply 25349.38
   → Resistance (`converted_at: 08:44:05 UTC` = 10:44 Berlin).

Kein zirkulärer Import gefunden: `draw.mjs` importiert nur aus
`src/core/drawing.js`, `lib.mjs` hat gar keine Imports.

**Verifiziert:** Lint 0 Fehler (sowohl `eslint scripts/premarket/` als auch
`npm run lint` für `src/`), Unit-Suite 141/141 grün. 3 echte S/R-Flip-
Konversionen live bestätigt (1 planmäßig, 2 durch den ungeplanten Lauf).

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

## 🆕 Kaspareit-Trading-EA-Bibliothek: S1/S5/DailyDax (30.07.2026, Teil 15)

**Auslöser:** User hat eine bezahlte Mitgliedschaft bei Kaspareit-Trading und alle
Setfiles + PDFs für 8 kommerzielle MT5-EAs bereitgestellt (ursprünglich
`~/Downloads/Alle Setfiles_23.01.26/`: S1–S5, VCP, UT, DailyDax, InsideBar), mit dem Auftrag,
daraus eigenständig Handelssignale zu entwickeln, zu testen/optimieren und zu
kombinieren "solange bis hervorragende Ergebnisse" erzielt werden. Kein .mq5-
Quellcode vorhanden — nur PDFs, Changelogs und .set-Parameterdateien.

**⚠️ Update 30.07.2026 (Teil 28):** dauerhaft ins Repo kopiert nach
`kaspareit-docs/` (User löscht seinen Downloads-Ordner gelegentlich, Ordner
war zwischenzeitlich in dieser Sitzung tatsächlich kurz verschwunden) —
künftige Sitzungen sollen von dort lesen, nicht mehr von `~/Downloads`.

**User-Entscheidungen (30.07.2026):**
- Start mit den 3 Strategien höchster Doku-Konfidenz: **S1, S5, DailyDax**
  (vollständig dokumentierte Williams-%R- bzw. EMA/ADX-Logik — im Gegensatz
  zu VCP/InsideBar, deren Kernformel in den PDFs nicht spezifiziert ist).
- Historie passend zur jeweiligen Strategie neu laden (nicht nur DE40).
- Sauberer Train/Test-Split (70/30) statt freiem Optimieren, um dem
  Overfitting-Risiko zu begegnen, das schon bei A/B zur bewussten
  Beobachtungsphase geführt hat (s.o.).

**Alle 8 Strategien wurden aus den Docs extrahiert** (Kern-Trigger, Exit-Logik,
Filter, Konfidenz-Einschätzung) — nur S1/S5/DailyDax bisher auch gebaut+
gebacktestet. VCP/UT/S2/S3/S4/InsideBar stehen noch aus.

**Neue Historie (via TradingView CDP, `backtests/fetch_new_instruments.mjs`):**
`data_ustec_1h.json` (GBEBROKERS:USTEC, 4300 Bars, 05.11.2025–30.07.2026),
`data_ustec_15m.json` (11.729 Bars, 01.02.–30.07.2026), `data_us30_daily.json`
(FOREXCOM:US30, 1300 Bars, 5 Jahre), `data_xauusd_daily.json` (OANDA:XAUUSD,
1300 Bars, 5 Jahre), `data_de40_30m.json` (GBEBROKERS:DE40, 6300 Bars,
10.12.2025–30.07.2026). **Achtung beim nächsten Mal:** für diesen Fetch mussten
`de40-ms-check` und `de40-scenario-check` (launchd) kurz pausiert werden, weil
sie den Chart-Symbolwechsel sonst live mitgelesen hätten (sie rufen nur
`setTimeframe`, nie `setSymbol` — gehen von DE40 als Dauerzustand aus). Beide
danach wieder geladen, Chart auf GBEBROKERS:DE40 zurückgesetzt.

**Ergebnisse (Default-Preset-Werte aus den echten .set-Files, kein eigenes Tuning):**

| Strategie | Instrument | Trades | Train Exp.R | Test Exp.R | Overall Exp.R |
|---|---|---|---|---|---|
| S1 | USTEC H1 (long+short) | 158 | -0,24 | -0,35 | **-0,24R** |
| S1 | USTEC M15 (long+short) | 449 | -0,33 | -0,34 | **-0,34R** |
| S5 | GER40 D1 | 8 | — | — | zu wenig Trades (n=8), keine Aussage möglich |
| S5 | US30 D1 | 126 | -0,33 | -0,42 | **-0,35R** |
| S5 | XAUUSD D1 | 40 | **+0,25** | **+0,02** | +0,17R — Edge verschwindet fast komplett Out-of-Sample |
| DailyDax | DE40 M30 | 49 | **+0,11** | **-0,12** | +0,05R — gleiches Overfitting-Muster wie XAUUSD |

**Fazit:** Keine der 3 bestdokumentierten Strategien zeigt mit ihren echten
Preset-Werten eine robuste, Out-of-Sample bestätigte Edge. US30 und beide
USTEC-Zeitrahmen sind in Train UND Test konsistent negativ (kein Zufallsrauschen
einer Teilperiode). XAUUSD und DailyDax zeigen genau das Muster, vor dem der
Train/Test-Split schützen soll: sieht in der Trainingsperiode gut aus, die Edge
schmilzt im unangetasteten Testfenster fast auf null. GER40 hat schlicht zu
wenige Signale (8 in 300 Tagesbars) für eine Aussage.

**Wichtige Erkenntnis bei S1 (kein Bug, aber Methodik-Caveat):** In beiden
Zeitrahmen wird der Break-Even-Trigger (0,3–0,6× SL) fast immer VOR dem ersten
Partial-TP (0,7–1,9× SL) erreicht. Da nur OHLC-Bars (kein Tick-Pfad) vorliegen,
wird ein Bar, der beide Schwellen im selben Bar durchläuft, konservativ als
"BE ausgelöst, dann direkt am BE gestoppt" gewertet — die Backtest-Engine sieht
praktisch nie einen Partial-TP-Treffer (1 von 607 Trades über beide TFs). Das
ist wahrscheinlich pessimistisch verzerrt ggü. echter Tick-Ausführung, aber das
Grundmuster (BE-Trigger enger als Partial-TP) ist eine reale Eigenschaft dieser
Preset-Werte, unabhängig von der Backtest-Granularität.

**Wichtige Erkenntnis bei DailyDax:** 46 von 49 Trades (94%) wurden nicht durch
SL/TP/Trailing beendet, sondern durch die feste Exit-Zeit (15:00) glattgestellt
— die ATR(1,H6)-basierte SL/TP-Kette (1× ATR eines einzelnen H6-Bars) ist auf
DE40 offenbar so weit gefasst, dass sie im 3,5h-Handelsfenster kaum je erreicht
wird. Die tägliche Exit-Zeit dominiert das Ergebnis, nicht die eigentliche
Trade-Management-Logik.

**Offene Annahmen (Doku ließ diese Werte/Formeln offen):**
- S1: HLOTT-Range-Filter (Formel in keiner der 3 gelesenen Strategien
  dokumentiert) NICHT implementiert — Live-EA hätte tendenziell WENIGER
  Signale als dieser Backtest. SL_method=0 als ATR angenommen (Donchian-
  Alternative ignoriert).
- S5: Initiale SL-Distanz nirgends explizit benannt — angenommen als Abstand
  zum SuperTrend-Wert bei Entry. MA1/MA2-Rolle undokumentiert, nur MA3-
  Prefilter (dokumentiert) angewendet.
- DailyDax: H3/H6-Bars aus der 1h-Historie UTC-epoch-resampled (nicht
  Broker-Server-Zeit-aligned) — gleiche Vereinfachung wie die synthetischen
  4H-Bars in `sim_6m.mjs`.

**Dateien:** `backtests/fetch_new_instruments.mjs`, `backtests/strategy_s1.mjs`
(+ `sim_s1_{h1,m15}_results.json`/`_log.json`), `backtests/strategy_s5.mjs`
(+ `sim_s5_results.json`, `sim_s5_{GER40,US30,XAUUSD}_log.json`),
`backtests/strategy_dailydax.mjs` (+ `sim_dailydax_results.json`/`_log.json`).

**Update 30.07.2026 (User-Entscheidung: HLOTT recherchieren):** HLOTT ist das
öffentliche Community-Indikator-Paar "HOTT/LOTT" (High/Low Optimized Trend
Tracker) von Kivanc Ozbilgic, aufbauend auf Anil Ozeksis Original-OTT — kein
Kaspareit-eigenes Geheimnis, sondern ein bekannter Open-Source-Indikator
(VIDYA/CMO-adaptive MA + Trailing-Stop-Band, zweimal berechnet: einmal auf
Highest(high,N) → HOTT, einmal auf Lowest(low,N) → LOTT; Handelsregel:
close>HOTT=Long erlaubt, close<LOTT=Short erlaubt, dazwischen = Flat-Zone/kein
Trade). Formel aus öffentlichen Beschreibungen rekonstruiert (kein Raw-Pine-
Source auffindbar) in `backtests/hlott.mjs`, jetzt in `strategy_s1.mjs`
eingebaut (beide Varianten mit/ohne Filter laufen zum Vergleich).

**Ergebnis:** HLOTT reduziert die Trade-Anzahl spürbar (H1: 158→122, M15:
449→380 Trades), ändert die Expectancy aber kaum (H1: -0,24R→-0,25R; M15:
-0,34R→-0,34R unverändert). Die vorherige negative Bilanz lag also NICHT am
fehlenden HLOTT-Filter — die dominante Ursache bleibt das oben beschriebene
BE-vor-TP1-Muster (Break-Even-Trigger enger als der erste Partial-TP).

**Dateien (neu):** `backtests/hlott.mjs` (reusable HOTT/LOTT-Modul),
`backtests/sim_s1_{h1,m15}_noHlott_results.json`/`_log.json` (Vergleichslauf
ohne Filter, zusätzlich zu den bereits bestehenden mit-Filter-Ergebnissen).

**Update 30.07.2026 (User-Entscheidung: S1 profitabel bekommen, Parameter-Sweep):**
`backtests/s1_engine.mjs` neu extrahiert (Indikatoren+Sim geteilt zwischen
`strategy_s1.mjs` und `sweep_s1.mjs`, Indikator-Cache da nur Exit/Risk-Params
geswept werden). `sweep_s1.mjs`: Grid aus 9 BE-Multiplier × 5 ATR-SL-Skalen ×
3 Target-Skalen (135 Kombis) pro Richtung/TF, Selektion NUR auf den ersten 70%
(Train), Report des fixen Gewinner-Configs auf den letzten 30% (Test) — Test
fließt nie in die Auswahl zurück (sonst wäre es nur Overfitting mit Umweg).

**Ergebnis:**

| TF/Richtung | Baseline Test | Bestes Train-Ergebnis | Test damit |
|---|---|---|---|
| H1 LONG | -0,35R | **+0,145R** (BE=3R, ATR×0,5, Target×0,75) | **-0,32R** |
| H1 SHORT | -0,43R | -0,082R (immer noch negativ im Train!) | -0,29R |
| M15 LONG | -0,32R | -0,178R (immer noch negativ im Train!) | -0,46R |
| M15 SHORT | -0,46R | kein Sweep-Ergebnis mit ≥20 Trades im Train (nur 6 Signale total — Entry-Bedingung feuert zu selten) |

**Fazit:** Selbst nach 540 Backtests (135 Kombis × 4 TF/Richtungen) über genau
den Hebel, der als Ursache identifiziert wurde (BE zu eng vs. TP1), bleibt S1
in 3 von 4 Fällen bereits IM TRAINING negativ — das Exit/Risk-Tuning allein
kann eine fehlende Entry-Edge nicht reparieren. Der eine Fall mit positivem
Training (H1 LONG, +0,145R) bricht Out-of-Sample auf -0,32R ein — klassisches
Overfitting-Muster, genau das der Train/Test-Split aufdecken sollte. **Schluss:
das dokumentierte S1-Entry-Signal (WPR-Arm + Breakout + 2×SuperTrend + 3-EMA-
Reihenfolge + HLOTT) zeigt auf USTEC H1/M15 keine belastbare Edge — das liegt
am Entry, nicht an Exit-Parametern.**

**Dateien:** `backtests/s1_engine.mjs` (geteilte Engine), `backtests/sweep_s1.mjs`,
`backtests/sweep_s1_results.json` (volle Grid-Ergebnisse inkl. Top-10 pro Fall).

**Update 30.07.2026 (User-Entscheidung: Entry-Parameter sweepen):**
`sweep_s1_entry.mjs` — 4. Hebel-Dimension WPR_Period × Number_Of_LookBack_
Candles × Entry_Candles_Period × Filter-Stack an/aus (2×SuperTrend+3-EMA+
HLOTT), 6×7×7×2=588 Kombis pro Richtung/TF (2352 gesamt), gleiche Train-
Only-Selektion + Test-Validierung wie beim Exit-Sweep.

**Ergebnis — noch eindeutiger als der Exit-Sweep:**

| TF/Richtung | Bestes Train-Ergebnis (von 588 Kombis) | Konfiguration |
|---|---|---|
| H1 LONG | -0,115R | WPR=25, Lookback=40, EntryCandles=12, Filter AN |
| H1 SHORT | -0,118R | WPR=15, Lookback=10, EntryCandles=1, Filter AN |
| M15 LONG | -0,268R | WPR=25, Lookback=5, EntryCandles=12, Filter AUS |
| M15 SHORT | -0,138R | WPR=20, Lookback=20, EntryCandles=18, Filter AN |

**In KEINEM der 4 Fälle wird das Training überhaupt positiv** — nicht nur
Out-of-Sample, sondern schon im Trainingsfenster selbst, über 588 Entry-
Timing-Varianten hinweg. Zusammen mit dem Exit-Sweep (Teil 15, oben) sind das
jetzt 2892 Backtests (540+2352) über die zwei naheliegendsten Stellschrauben
(Entry-Timing und Exit/Risk), ohne einen einzigen robusten Treffer.

**Schlussfolgerung:** Das WPR-Arm+Breakout-Entry-Signal von S1 hat auf USTEC
H1/M15 in diesem Zeitfenster (Nov 2025–Jul 2026 bzw. Feb–Jul 2026) keine
nachweisbare Edge — weder Entry-Timing- noch Exit/Risk-Tuning reicht, um das
zu drehen. Weiteres Suchen im selben Parameterraum wäre reine Data-Dredging-
Gefahr (irgendwann findet man durch Zufall eine Kombi, die zufällig gut
aussieht — das war explizit der Fehler, den der Train/Test-Split verhindern
sollte). **Empfehlung: S1 auf USTEC nicht weiterverfolgen**, stattdessen
anderes Instrument (DE40) oder andere Strategie (S5/VCP/UT/S2) angehen.

**Dateien:** `backtests/sweep_s1_entry.mjs`, `backtests/sweep_s1_entry_results.json`
(volle Grid-Ergebnisse inkl. Top-15 pro Fall).

**Update 30.07.2026 (User: "ich weiß, dass diese Strategie mit den richtigen
Einstellungen profitabel ist, das wurde in MT5 mehrfach gezeigt — finde einen
Weg"):** Vollständige S1-PDF nochmal Seite für Seite gelesen (nicht nur die
Agenten-Zusammenfassung) — dabei zwei echte Lücken im Nachbau gefunden:

1. **5.07-5.10 (separate Trailing-SuperTrend):** `Trailing_type=2` = "trailen
   nur bis Breakeven" — ein SEPARATER SuperTrend (`ST_trail_Periode`/
   `_Multiplier`, eigene Werte je Config) zieht den SL vor Erreichen des BE
   kontinuierlich nach, bis BE erreicht ist (danach fixiert). War in der
   ersten Fassung komplett nicht implementiert (SL war statisch ab Entry).
   Zusätzlich (3.03): `BE_SL_trailed=false` in allen 4 Presets → die BE-
   Auslöseschwelle bezieht sich auf den AKTUELLEN (nachgezogenen), nicht den
   initialen SL-Abstand. Jetzt in `s1_engine.mjs` implementiert (nur wenn
   die Richtung des Trailing-ST mit der Trade-Richtung übereinstimmt — sonst
   würde ein gegenläufig gedrehter Trail einen SL auf der falschen
   Kursseite erzeugen).
2. **ECHTER BUG gefunden und gefixt:** `Breakeven_Step_Pct=0.01` habe ich
   zunächst als "1% des Preises" gelesen (≈256 Punkte Buffer auf USTEC bei
   ~25600) — aber PDF 3.04 sagt explizit, der Zweck ist nur, **Gebühren
   wieder reinzuholen**. 256 Punkte Buffer (8× größer als das eigentliche
   Trade-Risiko von ~30-80 Punkten) ist dafür absurd. Optimizer-Bounds
   (0.001–0.1) ergeben nur Sinn, wenn der Rohwert bereits in Prozent-PUNKTEN
   steht (0.01 = 0,01%, nicht 1%) — Faktor-100-Fehler. Vorher schob dieser
   Bug den SL bei Long-Trades sogar ÜBER den Entry-Preis (ein "Gewinn" von
   +8R, der eigentlich ein BE-Bug war). Gefixt: `beStepPct / 100`.

**Ergebnis (Baseline-Presets, vor/nach den beiden Fixes):**

| TF/Richtung | Vorher (Bug) | Nachher (korrigiert) |
|---|---|---|
| H1 LONG | -0,21R / 0% WR | **+0,02R / 74,6% WR** |
| H1 SHORT | -0,18R / 0% WR | -0,19R / 77,8% WR |
| M15 LONG | -0,35R / 0% WR | -0,15R / 65,8% WR |
| M15 SHORT | -0,17R / 0% WR | -0,09R / 64,7% WR |

Massive Verbesserung — Win-Rate von 0% auf 65-78%, Expectancy nahe null statt
klar negativ. Getestet auch mit `Trailing_type=0`-Variante (durchgängiges statt
bis-BE-begrenztes Trailen, `compare_trail_modes.mjs`) — macht praktisch keinen
Unterschied (die meisten Trades schließen vorher über TP1/TP2/finalen TP oder
den initialen SL, bevor "danach weiter trailen oder nicht" überhaupt relevant
wird).

**Sweeps mit korrigierter Engine wiederholt** (`sweep_s1.mjs`, `sweep_s1_entry.mjs`):
Jetzt findet der Entry-Sweep in 3 von 4 Fällen positives Training (H1 LONG
+0,38R, M15 LONG +0,06R, M15 SHORT +0,06R bei Win-Raten 68-89%) — aber der
Train/Test-Gap bleibt: alle 4 Testergebnisse weiterhin negativ (-0,12R bis
-0,24R). Die Bug-Fixes haben das Bild stark verbessert, aber noch keine
robuste Out-of-Sample-Profitabilität erzeugt.

**Status:** Kein Cop-out, aber an dieser Stelle angekommen ohne weitere
konkrete Anhaltspunkte (z.B. welches Symbol/Broker/Zeitraum der User in MT5
gesehen hat) wäre weiteres Parameter-Raten zunehmend Data-Dredging. Nächste
konkrete, nicht-geratene Hebel: (a) S1 auf GER40/DE40 testen (Set-File dafür
liegt in `S1/Archiv/`, bisher nicht getestet — anderes Instrument, gleiche
Logik); (b) User nach Details des gesehenen MT5-Backtests fragen (Symbol,
Broker, Zeitraum, welches der Setfiles), um gezielt statt breit zu suchen.

**Dateien:** `backtests/compare_trail_modes.mjs` (Diagnose-Script).

**Update 30.07.2026 (weiter, zwei zusätzliche Experimente):**
1. **GER40/DE40 getestet** (`strategy_s1_de40.mjs`, `BASE_CONFIGS.de40` in
   `s1_engine.mjs`) — nur ein LONG-Setfile existiert dafür in `S1/Archiv/`
   (kein SHORT). DE40 H1: -0,05R Train / -0,18R Test, 83%/67% WR. DE40 M15:
   +0,07R Train / -0,23R Test, 86%/74% WR. Gleiches Muster wie USTEC: sehr
   hohe Win-Rate, Expectancy um die Nulllinie, Train/Test-Gap bleibt.
2. **Partial-TP-Prozentsätze gesweept** (`sweep_s1_partials.mjs`, 33%/33%
   Baseline gegen kleinere Teilverkäufe 10-50% in beide Richtungen, "mehr
   laufen lassen"-Hypothese) — verbessert vereinzelt das Training leicht,
   verschlechtert aber in JEDEM Fall das Testergebnis. Kein robuster Hebel.

**Zusammenfassendes Fazit nach 6 Experimenten** (Exit-Sweep, Entry-Sweep,
Trailing-Modus, GER40-Test, Partial-TP-Sweep, plus die 2 echten Bugfixes):
Das wiederkehrende Signatur-Muster — sehr hohe Win-Rate (65-91%), Expectancy
nahe/unter null, jede gefundene "Verbesserung" verschlechtert sich Out-of-
Sample — ist inzwischen so konsistent über Instrumente/Zeitrahmen/Hebel
hinweg, dass es eher eine echte Eigenschaft dieser Strategie in diesem
Backtest-Fenster ist als ein Implementierungsfehler. Die zwei gefundenen
Bugs (Trailing-bis-BE fehlte komplett, BE-Step-Faktor-100-Fehler) waren
echte, wirkungsvolle Fixes — Win-Rate ging von 0% auf 65-91%. Ohne konkretere
Anhaltspunkte (welches Symbol/Broker/Zeitraum/Setfile der User im MT5-
Backtest gesehen hat) wäre alles Weitere zunehmend Data-Dredging.

**Dateien (neu):** `backtests/strategy_s1_de40.mjs`, `backtests/sim_s1_de40_results.json`,
`backtests/sweep_s1_partials.mjs`, `backtests/sweep_s1_partials_results.json`.

---

## 🆕 Teil 16 — Strategie C [Kaspareit S1] Test-Modus LIVE (30.07.2026) + Fahrplan Kaspareit-Bibliothek

**Auslöser:** User hat keine MT5-Referenzdaten zum Abgleich verfügbar, will
S1 aber nicht aufgeben, bevor die nächste Strategie angegangen wird: *"Ich
bin bereit, einen Testmodus für S1 zu aktivieren... Sie soll in Telegram
Nachrichten entsprechend markiert sein. So sammeln wir in den nächsten
Wochen gute Daten."* — pragmatischer Mittelweg zwischen "aufgeben" und
"weiter blind Parameter raten": echte Live-Signale sammeln statt weiter im
selben Backtest-Fenster zu suchen.

### Was gebaut wurde

- **`scripts/premarket/check_strategie_c.mjs`** — neuer, eigenständiger Live-
  Checker (Vorbild: `check_scenarios.mjs`). Läuft auf dem bereits laufenden
  DE40-Chart (GBEBROKERS:DE40, H1) — **kein Symbolwechsel, keine Kollision**
  mit ms-check/scenario-check. Nutzt exakt `BASE_CONFIGS.de40.LONG` aus
  `backtests/s1_engine.mjs` (das einzige je veröffentlichte S1-Setfile für
  GER40, kein SHORT vorhanden) — Backtest-Engine und Live-Checker teilen sich
  denselben Code, kein Doppelbau.
- **Historien-Problem gelöst:** Der Live-Chart-Buffer liefert defaultmäßig
  nur ~300 H1-Bars — zu wenig fürs längste EMA (Periode 330). Checker lädt
  jetzt vor jedem Lauf per `requestMoreData()` (gleicher Mechanismus wie
  `backtests/fetch_history_6m.mjs`) auf mind. 450 Bars nach, bevor er
  rechnet (~15 Iterationen à 1,5s im Worst Case, für einen alle-15-Min-
  Hintergrundjob unkritisch).
- **Dedup:** pro Bar-Zeitstempel (`state/strategie_c_dedup.json`) — ein Signal
  meldet sich nur einmal, beim ersten Lauf nach Bar-Schluss.
  **Signal-Log:** `state/strategie_c_signals.json` — jedes gemeldete Signal wird
  mit Entry/SL/TP1/TP2/Final geloggt, damit sich nach ein paar Wochen die
  echte Performance auswerten lässt (Skript dafür existiert noch nicht,
  siehe Fahrplan unten).
- **Telegram:** jede Nachricht beginnt mit "🧪 STRATEGIE C TEST-SIGNAL (DE40, H1) —
  NUR Datensammlung, KEIN Live-Trade" — unverwechselbar von den A/B/C-Alerts.
- **launchd:** `com.boogy.de40-strategie-c-check`, alle 15 Min, 24/7,
  selbst-guarded über `isXetraOpen()` (identisches Muster wie ms-check/
  scenario-check). **Geladen und aktiv** seit 30.07.2026.

### Wie es weitergeht (User-Entscheidung noch offen)

Nach ein paar Wochen Live-Daten braucht es ein Auswertungs-Skript (liest
`state/strategie_c_signals.json`, matched gegen tatsächliche Kursbewegung seit
Signal, vergleicht Win-Rate/Exp.R gegen die Backtest-Zahlen aus Teil 15/16
oben). **Noch nicht gebaut** — nächster konkreter Schritt, sobald genug
Signale gesammelt sind (grobe Faustregel: mind. 15-20 Signale für eine erste
Einschätzung, siehe MIN_TRAIN_TRADES-Konvention in den Sweep-Skripten).

### Fahrplan restliche Kaspareit-Bibliothek (damit nichts doppelt/lückenhaft läuft)

| Strategie | Status | Doku-Konfidenz | Nächster Schritt |
|---|---|---|---|
| **S1** | Gebaut, gebacktestet, Bugs gefixt, **Live-Test-Modus aktiv** | Hoch | Live-Daten abwarten (Wochen), dann Auswertungs-Skript bauen |
| **S5** | Gebaut, gebacktestet, **Exit/Risk- UND Entry-Sweep gefahren (Teil 17+18)** — kein robuster Treffer, ~450 Backtests insgesamt | Hoch | Wie bei S1: weiteres Suchen im selben Parameterraum wäre Data-Dredging. Empfehlung: S5 auf USTEC/anderen Instrumenten testen, oder nächste Kaspareit-Strategie (VCP/UT/S2/S3/S4/InsideBar) angehen |
| **DailyDax** | Gebaut, gebacktestet, Exit/Risk- UND Entry-Sweep gefahren (Teil 22) — **eindeutig keine Edge**, jede Parameteränderung verschlechtert das Ergebnis | Hoch | Nicht weiterverfolgen (analog S1 auf USTEC) — andere Strategie (VCP/S2/S3/S4/InsideBar) angehen |
| **VCP** | Gebaut, gebacktestet, Exit/Risk- UND Entry-Sweep gefahren (Teil 23) — ger40Long/tickmillDe40Long ohne Edge, ger40Short schwacher unsicherer Fund | Niedrig (Kontraktions-/Breakout-Formel bleibt unbestätigte Annahme) | ger40Short: Kontraktionsformel gegen echte MT5-Referenz verifizieren, bevor irgendein Live-Test erwogen wird |
| **UT** | Gebaut, gebacktestet, alle Sweeps gefahren, **Live-Test-Modus aktiv (Teil 21)** — `com.boogy.de40-ut-check`, DE40 15m | Mittel (kein .set-File, alle Defaults außer EMA1=200 sind Annahmen) | Live-Daten abwarten (Wochen), dann Auswertungs-Skript bauen (analog S1) |
| **S2** | Gebaut, gebacktestet, kombinierter Exit+Entry-Sweep gefahren (Teil 29+30) — **eindeutigste "keine Edge"-Bestätigung der Aufarbeitung**: 0/1.500 Kombinationen Train+Test beide positiv, nur 5/1.425 zeigen überhaupt positives Test-ExpR | Mittel-Hoch (2 PDFs + 2 echte Presets; be_start/be_step-Einheit + ATR-Gate erfordern Annahmen, siehe `s2_engine.mjs`-Kopf) | Nicht weiterverfolgen auf DE40 H1 (analog S1/USTEC) — falls gewünscht: anderes Instrument testen, kein weiteres Data-Dredging im selben Datensatz |
| **S3** | Gebaut, gebacktestet, kombinierter Exit+Entry-Sweep + 15m-Feingranularitäts-Verifikation, **Live-Test-Modus aktiv** (Teil 24-27) — dichteste Robust-Nachbarschaft der ganzen Aufarbeitung (riskScale=0,5: 89% Beide-Fenster-positiv mit Magic-Trend-Filter an), Vorbehalt zur SL<Balken-Range-Simulationsgenauigkeit per 15m-Reverifikation geprüft und NICHT bestätigt (Ergebnis sogar leicht besser, 0/117 noch mehrdeutig) | Mittel-Hoch (SuperTrend-Entry+Dual-Magic-Trend klar dokumentiert; TP_pips-Einheit + BE-Sektion erfordern Annahmen, siehe `s3_engine.mjs`-Kopf) | Live-Daten abwarten (Wochen), dann Auswertungs-Skript bauen (analog S1/UT) |
| **S4** | Gebaut, gebacktestet, Filter/Pyramiding-Sweep gefahren (Teil 31+34) — Flaschenhals war `maxOpenTrades=1` [Baseline-Vereinfachung], nicht die Magic-Trend-Filter [Root-Cause-Korrektur]; LONG auch gelockert KEINE belastbare Edge [Regime-Artefakt], SHORT schwächeres, nicht robust bestätigtes Signal (25% Beide-positiv) | Mittel (DC-RSI ausreichend spezifiziert, aber Set-Files sind MT5-Optimizer-Output; BE-Einheit ungeklärt) | LONG nicht weiterverfolgen; SHORT bräuchte dedizierten Risk/Exit-Sweep mit maxOpenTrades als festem Parameter |
| **InsideBar** | Gebaut, gebacktestet, kombinierter Sweep + M1-Feingranularitäts-Verifikation (Teil 32+33+35) — **breiteste/dichteste Robust-Nachbarschaft der Aufarbeitung**, per M1-Reverifikation bestätigt (nur 2/105 Trades kippen, Ergebnis sogar leicht besser) | Hoch (entgegen ursprünglicher Einschätzung — sauberste Doku aller Kaspareit-Strategien) | Am gründlichsten geprüfter Fund neben S3 — Live-Test-Modus wäre plausibler nächster Schritt, User-Entscheidung ausstehend |

**✅ Mit Teil 32 (30.07.2026) sind alle 8 ursprünglich bereitgestellten
Kaspareit-Strategien (S1–S5, VCP, UT, DailyDax, InsideBar) mindestens
einmal gebaut+gebacktestet.** **✅ Mit Teil 36 laufen jetzt ALLE 8 zusätzlich
live im Test-Modus** — nicht nur die überzeugenden Funde (UT, S3,
InsideBar — neben S3 der am gründlichsten geprüfte Fund, per M1-
Verifikation bestätigt), sondern auf User-Wunsch AUCH die eindeutig
abgelehnten (S2, DailyDax, VCP, S4-Long, S5) und der schwächere,
unbestätigte S4-Short-Fund — gleicher Präzedenzfall wie S1 (prüft ob die
Bar-Level-Simulation zu grob war, unabhängig vom Backtest-Urteil). A/B
(Original-System) bleibt in Beobachtungsphase.

**Etablierte Methodik, die für alle weiteren Strategien wiederverwendet werden
sollte (nicht neu erfinden):**
- Eigene `<strategie>_engine.mjs` (Indikatoren + Sim getrennt von Sweep-
  Skripten, siehe `s1_engine.mjs`) + Indikator-Cache nach Struktur-Parametern.
- Historie passend zur Strategie laden (`backtests/fetch_new_instruments.mjs`
  als Vorlage) — **immer** `de40-ms-check`/`de40-scenario-check` pausieren
  vorm Symbolwechsel auf dem Live-Chart, danach wieder laden (siehe Teil 15).
  Bereits gecachte Historie prüfen, bevor neu gefetcht wird (DE40: D/4H/1H/
  15m/5m/1m/30m liegen schon vor).
  Bereits vorhanden: `data_ustec_1h.json`, `data_ustec_15m.json`,
  `data_us30_daily.json`, `data_xauusd_daily.json`, `data_de40_30m.json`.
- Sauberer Train(70%)/Test(30%)-Split für JEDEN Sweep, Auswahl nur auf Train,
  Test nie zur Auswahl benutzt (User-Vorgabe, gilt für alle Strategien).
- Explizite Annahmen im Dateikopf dokumentieren, wenn die PDF eine Formel
  nicht hergibt (wie bei HLOTT/hlott.mjs) — lieber eine begründete Annahme
  mit Web-Recherche als eine stille Lücke.
- Bei überraschend schlechten/perfekten Ergebnissen: erst auf Implementierungs-
  Bugs prüfen (Einheiten-/Faktor-100-Fehler wie bei `Breakeven_Step_Pct`
  sind der häufigste Fehlertyp), bevor man die Strategie als "keine Edge"
  abschreibt.
- Live-Test-Modus (wie S1) ist eine legitime Zwischenstufe zwischen
  "Backtest sagt X" und "endgültiges Urteil" — besonders wenn Bar-Level-
  Simulation eine reale Einschränkung hat (kein Intrabar-Pfad).

**Dateien:** `scripts/premarket/check_strategie_c.mjs`,
`~/Library/LaunchAgents/com.boogy.de40-strategie-c-check.plist`,
`state/strategie_c_signals.json`, `state/strategie_c_dedup.json`.

---

## 🆕 Teil 17 — S5 Exit/Risk-Parameter-Sweep (30.07.2026)

**Auslöser:** Fahrplan aus Teil 16 — S5 war gebaut+gebacktestet (Teil 15,
Baseline-Presets), aber noch nicht gesweept. Analog zu S1
(`sweep_s1.mjs`/`s1_engine.mjs`) sauber nachgezogen: Engine extrahiert,
Sweep gebaut, gleicher Train(70%)/Test(30%)-Split, Auswahl nur auf Train.

**Vorarbeit — Engine-Extraktion (`backtests/s5_engine.mjs`):** Indikatoren
(Williams %R, SuperTrend, MA3) + Simulation aus `strategy_s5.mjs` in eine
geteilte, cachte Engine gezogen (gleiches Muster wie `s1_engine.mjs`) —
**verifiziert bit-identisch** gegen den alten Monolithen (`diff` von
`sim_s5_results.json` vor/nach Refactor: keine Abweichung). `strategy_s5.mjs`
importiert jetzt nur noch aus der Engine.

**Sweep-Design (3 Dimensionen, `backtests/sweep_s5.mjs`):**
- `riskScale` (0.5–2.0, 5 Werte): skaliert die SuperTrend-basierte initiale
  Risk-Distanz NACH ihrer Berechnung (post-hoc, wie S1s `atrMult` über
  `atrArr`) — analog zu S1s ATR-Scale-Dimension.
- `targetScale` (0.75/1.0/1.5): skaliert tp1Pct/tp2Pct/tpFinalPct gemeinsam,
  gleiche relative Abstände — analog zu S1s Target-Scale-Dimension.
- `beMultR` (0=aus, 0.3–3.0, 10 Werte): **komplett neuer** Breakeven-
  Mechanismus (in den echten S5-Presets ist `use_be=false` — existierte im
  Code bisher gar nicht). Da S1s zentraler Fund war "BE sitzt enger als
  TP1", testet diese Dimension gezielt, ob ein BE-Hebel S5 genauso helfen
  könnte wie sein Fix S1 geholfen hat, statt "BE aus" unhinterfragt als
  gegeben hinzunehmen. Kein dokumentierter Step-Puffer für S5 vorhanden
  (anders als S1s `beStepPct`) — vereinfachend auf BE = exakt Entry gesetzt.
150 Kombis (5×3×10) pro Instrument, `MIN_TRAIN_TRADES=20` wie bei S1.

**Ergebnis:**

| Instrument | Baseline Test | Bestes Train-Ergebnis | Test damit |
|---|---|---|---|
| GER40 | n=0 (kein Test-Trade) | **Kein gültiges Ergebnis** — nie ≥20 Trades im Train (max. 8 total) | — |
| US30 | -0,422R | **+0,013R** (riskScale=1, targetScale=0,75, beMultR=0,3) | **-0,129R** |
| XAUUSD | +0,02R | +0,49R (riskScale=0,5) — **siehe Caveat unten, kein echter Effekt** | +0,039R |

**Fazit US30:** Gleiches Muster wie bei S1s Exit-Sweep — 150 Kombis über
genau die Hebel, die S1 tatsächlich verbessert hatten (BE-Timing,
Risk-/Target-Breite), finden ein leicht positives Trainingsergebnis
(+0,013R), das Out-of-Sample sofort wieder negativ wird (-0,129R). Kein
robuster Treffer, konsistent mit Teil 15s Einschätzung ("US30 konsistent
negativ Train UND Test").

**Fazit GER40:** Weiterhin zu wenige Signale (max. 8 Trades über 300
Tagesbars) für jede Art von Parameter-Auswahl — der Sweep bestätigt nur,
dass hier nichts Belastbares herauskommt, keine neue Erkenntnis.

**Wichtiger Caveat XAUUSD (kein Bug, aber ein Mess-Artefakt entdeckt):**
XAUUSD läuft mit `rsi_closing=true` — der Exit-Pfad schließt ausschließlich
bei WPR-Gegenextrem, liest SL/TP/BE-Preise nie. `targetScale`/`beMultR`
haben deshalb erwartungsgemäß NULL Einfluss (alle Top-10-Einträge zeigen
identische Win-Rate 61,5%/64,3% unabhängig vom BE-Wert — bestätigt die
Doku-Annahme aus Teil 15). **`riskScale` verändert aber trotzdem den
gemeldeten ExpR (+0,245R → +0,49R bei riskScale=0,5), obwohl sich am
tatsächlichen Trade-Ausgang (Entry/Exit-Preis, $-Gewinn) nichts ändert** —
weil die R-Normalisierung (`realizedR = ΔPreis / risk`) durch `risk` teilt,
und `risk` selbst mit `riskScale` skaliert wird. Ein kleinerer Nenner macht
denselben absoluten Gewinn/Verlust zu einer größeren R-Zahl — eine reine
Report-Artefakt-Verzerrung, keine echte Verbesserung der Strategie. **Für
`rsi_closing`-Strategien ist `riskScale` daher kein sinnvoller Sweep-Hebel**
(nur für die SL/TP-basierten Instrumente wie US30/GER40 aussagekräftig) —
wichtige Lektion für künftige Sweeps anderer Kaspareit-Strategien mit
gemischten Exit-Modi.

**Gesamtfazit:** Kein Instrument zeigt nach dem Exit/Risk-Sweep eine
robuste Out-of-Sample-Edge — gleiches Bild wie bei S1 (Exit/Risk-Tuning
allein repariert keine fehlende Entry-Edge). Nächster nicht-geratener
Hebel für S5 wäre analog zu S1s Entry-Sweep: WPR-Period/Buy-Sell-Level
variieren, oder MA3-Period, statt weiter im selben Exit/Risk-Raum zu
suchen (Data-Dredging-Risiko sonst identisch zu S1).

**Verifiziert:** Unit-Suite 141/141 grün (unberührt, Backtest-Ordner nicht
Teil des Lint-Scopes), `eslint backtests/s5_engine.mjs backtests/
strategy_s5.mjs backtests/sweep_s5.mjs` 0 Fehler, `sim_s5_results.json`
vor/nach Engine-Refactor bit-identisch (`diff` bestätigt).

**Dateien (neu):** `backtests/s5_engine.mjs`, `backtests/sweep_s5.mjs`,
`backtests/sweep_s5_results.json`. **Geändert:** `backtests/strategy_s5.mjs`
(jetzt Engine-Import statt Monolith, Verhalten unverändert).

---

## 🆕 Teil 18 — S5 Entry-Parameter-Sweep (30.07.2026)

**Auslöser:** Direkter Folgeauftrag zu Teil 17 ("mach den S1-Entry-Sweep-
Ansatz jetzt auch für S5") — Exit/Risk-Sweep fand keine Edge, nächster
nicht-geratener Hebel (Fahrplan aus Teil 17) ist Entry-Timing, analog zu
S1s zweitem Sweep (`sweep_s1_entry.mjs`).

**Sweep-Design (`backtests/sweep_s5_entry.mjs`, 4 Dimensionen wie bei S1):**
- `wprPeriod` (WPR-Länge, Grid `[2,3,4,6,9,14]` — enthält alle 3 dokumentierten
  Baseline-Werte 2/3/4).
- `levelExtremity` (t): kollabiert `buyLevel=-t`/`sellLevel=-(100-t)` in
  EINE Dimension statt zwei, weil alle 3 Presets identisch `-80/-20`
  verwenden (Summe -100) — nie unabhängig entkoppelt in den echten
  Set-Files. Grid `[60,65,70,75,80,85,90]`, enthält Baseline t=80.
- `ma3Period` (MA3-Prefilter-Länge, Grid `[20,50,75,100,150,200]`, enthält
  Baseline 100).
- `filtersOn`: MA3-Prefilter an/aus — S5s Analogon zu S1s 2×SuperTrend+
  3-EMA+HLOTT-Stack-Toggle (S5 hat nur EINEN Filter, nicht drei). Bei
  `filtersOn=false` wird `ma3Period` nicht durchiteriert (irrelevant,
  spart Rechenzeit).
Exit/Risk bleiben auf dem dokumentierten Baseline-Wert (riskScale=1,
targetScale=1, beMultR=0) — isoliert den Entry-Effekt, exakt wie bei S1.
Gleiche Traindisziplin: `MIN_TRAIN_TRADES=20`, Auswahl nur auf Train,
Test nie zur Auswahl benutzt. 6×7×6×2 (bzw. ×1 bei filtersOn=false) =
294 Kombis/Instrument, <200ms Laufzeit (kleine Daily-Datensätze).

**Ergebnis:**

| Instrument | Baseline Test | Bestes Train-Ergebnis (≥20 Trades) | Test damit |
|---|---|---|---|
| GER40 | n=0 | -0,586R (wprPeriod=2, t=80, Filter aus) — **kein einziger ≥20-Trades-Kandidat mit positivem Train** | -1,0R (n=1) |
| US30 | -0,422R | -0,008R (wprPeriod=4, t=60, Filter an, MA3=200) — quasi Break-even, nicht wirklich positiv | **-0,552R** |
| XAUUSD | +0,02R | **+2,036R** (wprPeriod=14, t=85, Filter aus, n=52) | **-0,503R** |

**GER40/US30:** Gleiches Bild wie überall bisher — selbst mit gelockerten
Entry-Parametern findet sich kein Kandidat, der gleichzeitig genug Trades
(≥20) UND ein echt positives Trainingsergebnis liefert. US30s "bester"
Treffer ist im Train nur noch −0,008R (praktisch Zufallsrauschen um Null)
und im Test klar negativ. **Kein Instrument/Parameter-Kombination über
Exit/Risk- UND Entry-Sweep hinweg (insgesamt ~450 Backtests) zeigt eine
belastbare Out-of-Sample-Edge für S5** — deckungsgleich mit S1s
Gesamtfazit aus Teil 15.

**XAUUSD — eindrücklichstes Overfitting-Beispiel bisher in der gesamten
Kaspareit-Aufarbeitung:** Train zeigt +2,036R bei 73,1% WR (52 Trades,
deutlich über der Mindestschwelle — kein Kleine-Zahlen-Artefakt), Test
bricht auf -0,503R ein, obwohl die Win-Rate mit 58,3% gar nicht so
schlecht aussieht. Mehrere ungefilterte Top-Kandidaten zeigen sogar noch
extremere Trainings-Werte (+5,978R, +4,754R etc.), wurden aber korrekt
durch `MIN_TRAIN_TRADES=20` verworfen (nur 7-13 Trades) — die Sweep-
Disziplin hat hier sichtbar genau das verhindert, wonach sie gebaut wurde.

**Wichtiger Nebenfund (Struktur-Erkenntnis, kein Bug):** Der `rsi_closing`-
Exit-Modus (XAUUSD) hat **KEINEN Stop-Loss** — die Position läuft bis zum
Gegenextrem von Williams %R, unabhängig davon, wie weit der Kurs vorher
dagegen gelaufen ist. Verifiziert am bereits bestehenden Baseline-Log
(`sim_s5_XAUUSD_log.json`, unverändert von diesem Sweep): schlechtester
Trade **-3,365R**, drei weitere unter -1,0R. Das erklärt, warum XAUUSD so
extrem sweep-sensitiv ist — ein einzelner ungebremster Ausreißer-Trade im
Testfenster kann das gesamte Testergebnis kippen, was Trainings-Configs,
die zufällig genau diesen Trade vermeiden, künstlich gut aussehen lässt.
**Für jede künftige Kaspareit-Strategie mit einem RSI/Indikator-Closing-
Exit-Modus (ohne festen SL) gilt: Sweep-Ergebnisse für dieses Instrument
sind fundamental instabiler als bei SL/TP-basierten Instrumenten — bei der
Bewertung berücksichtigen, nicht nur auf ExpR schauen.**

**Verifiziert:** `eslint backtests/sweep_s5_entry.mjs` 0 Fehler. Unit-Suite
unberührt (Backtest-Ordner nicht Teil des Lint/Test-Scopes von `src/`).

**Dateien (neu):** `backtests/sweep_s5_entry.mjs`,
`backtests/sweep_s5_entry_results.json`.

---

## 🆕 Teil 19 — Strategie UT gebaut + gebacktestet + Exit/Entry-Sweeps (30.07.2026)

**Auslöser:** Fahrplan aus Teil 16 — direkter Folgeauftrag ("mach mit UT
weiter, analog zum Vorgehen bei S1/S5"). Vollständiger Durchlauf: Doku
lesen, Engine bauen, Baseline + Vergleich mit dem alten Teil-14-EA,
Exit/Risk-Sweep, Entry-Sweep — gleiche Methodik wie bei S1/S5.

### Doku-Lage — deutlich dünner als bei S1/S5

**Kein einziges `.set`-File existiert für UT** (`UT/Archiv/` ist leer,
anders als bei S1/S5, wo echte Kaspareit-Presets vorlagen). Nur zwei PDFs
(`Kurzanleitung UT.pdf`, `Parametererklärung für UT.pdf`) mit reinen
Feld-Erklärungen, fast ohne konkrete Default-Werte. Konfidenz dadurch
niedriger als S1/S5 — die "Baseline" ist ein vernünftiger Startpunkt zum
Sweepen, kein verifiziertes Werks-Preset.

**Regeln (aus den 2 PDFs):**
- **Trigger:** SMI kreuzt seine Signal/D-Linie — Kreuzung nach oben = Long,
  nach unten = Short.
- **UT-Bot-Pfeil muss gleichzeitig zustimmen** (Bestätigung, nicht Trigger
  — andere Hierarchie als beim alten, informellen Teil-14-EA, das dieselben
  zwei Bedingungen forderte, aber UT-Bot als Primärsignal beschrieb).
- **EMA 1** (dokumentierter Default: **200**) bestätigt Trend, EMA 2
  optional (kein Default → hier aus).
- SL am Tief/Hoch der letzten n Kerzen, Partial-TP1/TP2 + Final-TP als
  %-SL (identischer Mechanismus wie S1/S5), optionales Breakeven.

**Explizite Annahmen (Datei-Kopf von `ut_engine.mjs`):** UT-Bot key=1/
ATR=10 und SMI %K=10/%D=3/EMA=3 (bereits für Teil-14 recherchierte
Public-Indikator-Defaults, wiederverwendet), SL-Lookback=3 Kerzen
(unbelegt, von Teil-14 übernommen), Partial-Close 33%/33% (Konvention wie
S1/S5), BE-Offset=0 (kein Puffer, wie bei S5), **kein Zero-Line-Gate**
(Teil-14s eigene Zusatzbedingung "SMI+Signal beide unter/über Null" kommt
NICHT aus der echten Doku — bewusst nicht übernommen), Trailing-Stop (4
Modi laut Doku) **nicht implementiert** (wie S5s unbenutzter SuperTrend-
Trailing-Zweig), Session-Filter **nicht implementiert** (keine
Default-Zeiten dokumentiert — Baseline handelt ungefiltert, anders als
Teil-14s Ad-hoc-09:00–23:00-Fenster).

### Baseline + Vergleich mit Teil-14-EA (DE40 5m/15m, gleiche Daten)

| | Teil-14-EA (`strategy_c_momentum.mjs`) | UT-Baseline (`strategy_ut.mjs`) |
|---|---|---|
| 15m | -0,206R (136 Trades) | **+0,001R** (625 Trades) |
| 5m | -0,083R (144 Trades) | **+0,028R** (715 Trades) |

Die echte UT-Regel (kein Zero-Line-Gate, anderer Exit-Mechanismus mit
Partial-TPs statt fixem 1:2 RR) erzeugt deutlich mehr Signale und liegt
bereits ungetuned nahe am Break-even statt klar negativ — kein Beweis
einer Edge, aber ein spürbar besserer Ausgangspunkt als der alte EA.

### Exit/Risk-Sweep (`sweep_ut.mjs`, 3 Dimensionen wie bei S5: riskScale × targetScale × beMultR)

| TF | Baseline Test | Bestes Train-Ergebnis | Test damit |
|---|---|---|---|
| 15m | +0,033R | **+0,069R** (riskScale=0,5, targetScale=1,5) | **+0,084R** |
| 5m | -0,083R | +0,115R (riskScale=0,5, targetScale=1,5) | **-0,128R** (Kollaps) |

**15m ist der bisher einzige Fall in der gesamten Kaspareit-Aufarbeitung
(S1+S5+UT), in dem Train UND Test GLEICHZEITIG positiv sind — UND das
nicht nur bei einer einzelnen Zelle, sondern über eine ganze Nachbarschaft
im Top-10** (riskScale 0,5–1,0 × targetScale 1,0–1,5 zeigen fast alle
sowohl Train als auch Test im positiven Bereich, z.B. +0,022R/+0,055R,
+0,014R/+0,077R, +0,013R/+0,047R). Das unterscheidet sich strukturell von
jedem bisherigen "ein Config sieht gut aus, bricht dann ein"-Muster.
**Trotzdem: nur ein einziger Train/Test-Split getestet (kein Walk-Forward/
k-fold), Größenordnung klein (+0,02R bis +0,08R pro Trade)** — das ist ein
Kandidat, keine bestätigte Edge. 5m bleibt eindeutig negativ im Test.

### Entry-Sweep (`sweep_ut_entry.mjs`, 4 Dimensionen wie bei S1/S5: utKey × utAtrPeriod × smiK × EMA1-Period × Filter an/aus)

| TF | Bestes Train-Ergebnis | Test damit |
|---|---|---|
| 15m | +0,091R (utKey=3, utAtr=5, smiK=10, EMA1=300) | -0,03R |
| 5m | +0,203R (utKey=3, utAtr=7, smiK=10, EMA1=200) | **-0,149R** (Kollaps) |

**Wichtiger Dämpfer für den 15m-Fund oben:** Anders als beim Exit-Sweep
ist die 15m-Entry-Top-15-Liste NICHT robust — 11 von 15 Top-Configs zeigen
negativen Test trotz starkem Train (nur 3 knapp positiv, +0,015R bis
+0,026R). Alle Top-Configs clustern um `utKey=3` (3× empfindlicher als die
Baseline-Annahme 1) — ein klares Überanpassungs-Muster, identisch zu S1/S5s
Entry-Sweeps. 5m zeigt erneut einen sauberen, durchgängigen Kollaps über
die gesamte Top-15 (alle Train stark positiv 0,17-0,20R, alle Test negativ
-0,04R bis -0,15R) — keine Ambiguität, 5m hat keine Edge.

**Gesamtfazit UT:** 5m ist eindeutig ohne Edge (Baseline mäßig, Exit-Sweep
bricht ein, Entry-Sweep überangepasst). **15m ist der einzige nicht
eindeutig negative Fall bisher** — der Exit-Sweep zeigt eine breite,
Train+Test-übergreifend konsistente kleine Verbesserung, ABER der
Entry-Sweep auf demselben Zeitrahmen liefert kein bestätigendes Bild
(überwiegend negativ im Test). Die beiden Sweep-Gewinner wurden NICHT
kombiniert getestet (Exit-Sweep hielt Entry auf Baseline, Entry-Sweep
hielt Exit auf Baseline) — offener Punkt für eine mögliche Folge-Sitzung.
**Einstufung: nicht widerlegt, aber auch nicht robust bestätigt** — anders
als bei S1/S5 wäre "S1-artiges Aufgeben" hier verfrüht, aber ein
Live-Test-Modus (wie bei S1, Teil 16) wäre ebenfalls verfrüht ohne
Walk-Forward-Validierung oder eine kombinierte Exit+Entry-Optimierung.

**Verifiziert:** `eslint backtests/ut_engine.mjs backtests/strategy_ut.mjs
backtests/sweep_ut.mjs backtests/sweep_ut_entry.mjs` 0 Fehler. Unit-Suite
141/141 grün (unberührt). `sim_ut_results.json` vor/nach der
`filterOpts`-Erweiterung von `ut_engine.mjs` bit-identisch (`diff`
bestätigt, Baseline-Verhalten unverändert).

**Dateien (neu):** `backtests/ut_engine.mjs`, `backtests/strategy_ut.mjs`,
`backtests/sweep_ut.mjs`, `backtests/sweep_ut_entry.mjs`,
`backtests/sim_ut_results.json`, `backtests/sweep_ut_results.json`,
`backtests/sweep_ut_entry_results.json`.

---

## 🆕 Teil 20 — UT: kombinierter Exit+Entry-Sweep, DE40 15m (30.07.2026)

**Auslöser:** Direkter Folgeauftrag zu Teil 19 ("mach den kombinierten
Exit+Entry-Sweep für UT 15m") — der explizit offen gelassene Punkt aus
Teil 19 (Exit-Sweep hielt Entry auf Baseline, Entry-Sweep hielt Exit auf
Baseline, nie kombiniert). Nur 15m getestet — 5m war in BEIDEN separaten
Sweeps bereits eindeutig tot, kein Grund für den Mehraufwand dort.

**Sweep-Design (`backtests/sweep_ut_combined.mjs`):** volles kartesisches
Produkt aus Teil 19s Entry-Grid (utKey × utAtrPeriod × smiK × EMA1-Period
× Filter an/aus, ~900 Kombis) und Exit-Grid (riskScale × targetScale ×
beMultR, 150 Kombis) = **135.000 Backtests**, ~111s Laufzeit (Indikator-
Cache pro Entry-Struktur wiederverwendet über alle 150 Exit-Varianten).
Gleiche Train(70%)/Test(30%)-Disziplin, `MIN_TRAIN_TRADES=20`.

**Naive Bestenauswahl (reine Train-ExpR-Maximierung über den vollen Raum)
überfittet wie erwartet:** Sieger `utKey=3, utAtrPeriod=5, smiK=7,
ema1Period=300, riskScale=0,5, targetScale=1,5` → Train **+0,165R**, Test
**-0,032R**. Entry-Parameter (v.a. `utKey=3`, 3× aggressiver als die
Baseline-Annahme) dominieren die Train-Rangliste, halten aber wie bei den
separaten Entry-Sweeps (Teil 18/19) nicht Out-of-Sample.

**Robustheits-Analyse (zusätzlich zur reinen Bestenauswahl):** von allen
135.000 Kombis zeigen **2.460 (1,82%)** gleichzeitig Train UND Test
positiv — nach Test-ExpR sortiert clustert diese Teilmenge extrem eng um
**`smiK=10` (= Baseline-Annahme!), `ema1Period=300`, `targetScale=1,5`,
`riskScale≤0,75`, `beMultR=0`** — nur `utKey`/`utAtrPeriod` variieren
innerhalb dieses Clusters noch spürbar. Gezielter Scan des vollen
Sub-Würfels (`smiK=10 × ema1Period=300 × targetScale=1,5 × beMultR=0`,
150 Kombis über utKey×utAtrPeriod×riskScale): **75 von 150 (50%) positiv
in Train UND Test**, und das Muster ist **monoton in `riskScale`** — von
`riskScale=0,5` (bester Bereich, Test bis +0,17R) über `0,75`/`1,0`
(neutral) bis `1,5`/`2,0` (fast durchgehend negativ), über nahezu den
gesamten `utKey`/`utAtrPeriod`-Bereich hinweg konsistent. Das ist ein
**interpretierbarer struktureller Zusammenhang** (engerer Stop relativ zum
Kerzen-Extrem + breiteres Ziel = günstigeres effektives CRV bei ~30-36%
Win-Rate), keine verstreute Zufallsstreuung wie bei den bisherigen
Entry-Sweep-Funden.

**Monatsstabilität geprüft** (Konvention aus Strategie B, Backtest v4) für
den Kandidaten mit der geringsten Abweichung von der dokumentierten
Baseline (nur `ema1Period` 200→300, `riskScale` 1→0,5, `targetScale` 1→1,5
verändert — `utKey`/`utAtrPeriod`/`smiK` bleiben auf den recherchierten
Public-Indikator-Defaults):

| Monat | n | ExpR | WR |
|---|---|---|---|
| 2026-02 | 64 | -0,231R | 25,0% |
| 2026-03 | 127 | +0,244R | 37,8% |
| 2026-04 | 98 | +0,029R | 33,7% |
| 2026-05 | 102 | +0,247R | 35,3% |
| 2026-06 | 116 | +0,082R | 29,3% |
| 2026-07 | 99 | +0,113R | 36,4% |

**5 von 6 Monaten positiv** (nur Feb 2026 negativ — kleinste Stichprobe,
fällt zudem in die EMA(300)-Einschwingphase am Datensatz-Anfang, plausibel
ein Warmup-Artefakt statt eines echten Struktur-Bruchs). Das ist die
bisher stabilste Monats-Verteilung der gesamten Kaspareit-Aufarbeitung
außerhalb von Strategie B selbst.

**Einordnung — vorsichtig bleiben trotz des guten Bildes:**
1. Immer noch nur EIN Train/Test-Split (kein Walk-Forward/k-fold) —
   dieser Sweep prüft Robustheit *innerhalb* des Splits breiter (viele
   Nachbar-Configs statt einer Zelle), ersetzt aber keine echte
   Out-of-Time-Validierung mit mehreren unabhängigen Fenstern.
2. UT hat weiterhin kein `.set`-File — `utKey`/`utAtrPeriod`/`smiK`/
   Sessions/Trailing bleiben Annahmen, keine verifizierten Werks-Presets.
3. Größenordnung bleibt bescheiden (~0,08-0,17R je nach Ecke des Clusters,
   nicht das +0,4R-Niveau von Strategie B).
4. **Trotzdem: das ist der bisher stärkste, am wenigsten fragile Fund der
   gesamten S1/S5/UT-Aufarbeitung** — kein Single-Cell-Zufallstreffer,
   sondern eine breite, monoton strukturierte, monatlich größtenteils
   stabile Nachbarschaft, die einen Train/Test-Split UND eine unabhängige
   Monats-Aufschlüsselung übersteht.

**Empfehlung (User-Entscheidung offen):** Dieser Kandidat ist reif für
entweder (a) eine echte Walk-Forward-Validierung (mehrere rollierende
Splits) als nächsten harten Test, oder (b) einen Live-Test-Modus analog zu
S1 (Teil 16, 🧪-markierte Telegram-Alerts, keine echten Trades) um echte
Signal-Daten zu sammeln, während die Backtest-Zuversicht weiter reift.
Beides sind vernünftige nächste Schritte — welcher zuerst, ist eine
User-Entscheidung, kein automatischer nächster Schritt.

**Verifiziert:** `eslint backtests/sweep_ut_combined.mjs` 0 Fehler.

**Dateien (neu):** `backtests/sweep_ut_combined.mjs`,
`backtests/sweep_ut_combined_results.json`.

---

## 🆕 Teil 21 — Strategie UT: Live-Test-Modus aktiv (30.07.2026)

**Auslöser:** Direkter Folgeauftrag zu Teil 20 ("Live-Test-Modus für UT 15m
analog zu S1 einrichten") — User hat sich für Option (b) aus Teil 20s
Empfehlung entschieden (Live-Test statt/vor Walk-Forward-Validierung).

### Was gebaut wurde

- **`scripts/premarket/check_ut.mjs`** — neuer, eigenständiger Live-Checker,
  1:1 nach dem Vorbild von `check_strategie_c.mjs` (S1s Live-Test-Modus,
  Teil 16). Läuft auf dem bereits laufenden DE40-Chart (GBEBROKERS:DE40,
  15m) — **kein Symbolwechsel, keine Kollision** mit ms-check/
  scenario-check/strategie-c-check.
- **Verwendete Config:** exakt Teil 20s "minimale Abweichung von der
  Baseline"-Kandidat — `{ ...BASE_CONFIG, ema1Period: 300, riskScale: 0.5,
  targetScale: 1.5, beMultR: 0 }` (nur diese 3 Werte von der dokumentierten/
  recherchierten Baseline verändert, `utKey`/`utAtrPeriod`/`smiK` bleiben
  auf den Public-Indikator-Defaults) — derjenige Fund aus Teil 20 mit der
  breitesten, am wenigsten fragilen Train+Test-positiven Nachbarschaft.
- **Historien-Problem gelöst** (gleiches Muster wie S1): Live-Chart-Buffer
  liefert defaultmäßig nur ~300 Bars — zu wenig für `ema1Period=300`.
  Checker lädt vor jedem Lauf per `requestMoreData()` auf mind. 450 Bars
  nach.
- **Dedup:** pro Bar-Zeitstempel (`state/ut_dedup.json`). **Signal-Log:**
  `state/ut_signals.json` — jedes gemeldete Signal mit Entry/SL/TP1/TP2/
  Final geloggt (Auswertungs-Skript analog zu S1s noch ausstehendem folgt,
  sobald genug Signale vorliegen).
- **Telegram:** jede Nachricht beginnt mit "🧪 STRATEGIE UT TEST-SIGNAL
  (DE40, 15m) — NUR Datensammlung, KEIN Live-Trade" — unverwechselbar von
  den A/B/C-Alerts (UT bekommt keinen eigenen Buchstaben, da A-D bereits
  vergeben sind).
- **launchd:** `com.boogy.de40-ut-check`, alle 15 Min, 24/7, selbst-guarded
  über `isXetraOpen()` (identisches Muster wie die anderen Checker).
  **Geladen und aktiv** seit 30.07.2026.

**Verifiziert:** `eslint scripts/premarket/check_ut.mjs` 0 Fehler. Manuell
per `node` UND per `launchctl kickstart -p gui/501/com.boogy.de40-ut-check`
getestet — beide Male Exit 0, `state/ut_dedup.json`/`ut_signals.json`
korrekt angelegt (leer, kein frisches Signal in diesem Lauf). Parallel
`de40-ms-check` per `launchctl kickstart` gegengetestet — lief fehlerfrei
weiter (ein FATAL in `ms-check.err.log` stammte nachweislich vom 28.07.2026,
nicht vom aktuellen Lauf — per `stat -f "%Sm"` verifiziert, kein neuer
Fehler durch den UT-Checker verursacht).

### Wie es weitergeht

Nach ein paar Wochen Live-Daten braucht es ein Auswertungs-Skript (liest
`state/ut_signals.json`, matched gegen tatsächliche Kursbewegung seit
Signal, vergleicht Win-Rate/Exp.R gegen die Backtest-Zahlen aus Teil 19/20).
**Noch nicht gebaut** — analog zu S1s offenem Punkt (Teil 16), gleiche
Faustregel: mind. 15-20 Signale für eine erste Einschätzung.

**Dateien (neu):** `scripts/premarket/check_ut.mjs`,
`~/Library/LaunchAgents/com.boogy.de40-ut-check.plist`,
`state/ut_signals.json`, `state/ut_dedup.json`.

---

## 🆕 Teil 22 — Strategie DailyDax: Exit/Risk- + Entry-Sweep (30.07.2026)

**Auslöser:** "arbeite weiter" — Fortsetzung des Fahrplans (Teil 16/19):
DailyDax war seit Teil 15 gebaut+gebacktestet, aber "noch kein Sweep
gefahren". Gleiche Methodik wie S1/S5/UT: Engine extrahieren, verifizieren,
dann Exit/Risk- und Entry-Sweep.

**Engine-Extraktion (`backtests/dailydax_engine.mjs`):** wie bei S5/UT aus
dem Monolithen (`strategy_dailydax.mjs`) gezogen — **verifiziert
bit-identisch** gegen den alten Code (`diff` von `sim_dailydax_results.json`
vor/nach Refactor: keine Abweichung).

**Performance-Bug gefunden und gefixt (kein Korrektheits-, nur ein
Geschwindigkeitsproblem):** `berlinMinutesOfDay()`/der Datums-String
konstruierten bei JEDEM Bar-Durchlauf ein neues `Intl.DateTimeFormat`-Objekt
(teure ICU-Lookups) — bei einem Einzellauf unmerklich (<1s), aber
`sweep_dailydax.mjs`s erster Testlauf brauchte dadurch **131,8s** für nur
105 Kombis. Fix: beide Formatter als Modul-Level-Konstanten hochgezogen
(stateless, sicher wiederverwendbar) — danach **1,5s**, ~87× schneller,
Ergebnisse zahlengleich verifiziert. Gleiches Muster wäre auch für S1/S5/UT
theoretisch relevant gewesen, dort aber nie spürbar geworden (kürzere
Bar-Serien / weniger Sweep-Kombis in der Praxis).

### Exit/Risk-Sweep (`sweep_dailydax.mjs`) — bewusst NICHT die S1/S5/UT-Standardvorlage

**Wichtiger Unterschied zu S1/S5/UT:** Teil 15s eigener Fund — 46 von 49
Baseline-Trades schließen über die FESTE EXIT-ZEIT (15:00 Berlin), nicht
über SL/TP/Trailing. Ein Sweep, der nur `riskScale`/`targetScale`/`beMultR`
variiert (wie bei S1/S5/UT), würde am eigentlich entscheidenden Hebel
vorbeigehen. Stattdessen 3 auf DailyDax zugeschnittene Dimensionen:
`exitMinutes` (13:00–16:00 in 30-Min-Schritten) × `riskScale` (0,5–2,0) ×
`targetScale` (0,75–1,5). `MIN_TRAIN_TRADES` auf 15 gesenkt (DailyDax
handelt max. 1×/Tag, Baseline-Train-Set hat nur 36 Trades — S1/S5/UTs
Schwelle 20 wäre hier zu eng).

**Ergebnis — eindeutig negativ, sogar eindeutiger als bei S1/S5:**

| | Baseline | Bestes Train-Ergebnis | Test damit |
|---|---|---|---|
| | Test: -0,119R | +0,155R (exitMinutes=15:00 [=Baseline!], riskScale=0,5) | **-0,317R** |

**JEDER der Top-15-Kandidaten schneidet im Test schlechter ab als die
unveränderte Baseline** (-0,317R bis -0,567R vs. -0,119R) — nicht nur
"kein Verbesserungspotenzial", sondern das Gegenteil: Tuning verschlechtert
das Ergebnis durchgängig. Zusätzlich bestätigt: `targetScale` ist für diese
Strategie ein **totes Feld** — Zeilen mit identischem `exitMinutes`/
`riskScale` aber unterschiedlichem `targetScale` liefern exakt identische
Resultate (TP-Level werden schlicht so gut wie nie erreicht, exakt wie in
Teil 15 dokumentiert). Auch die Verschiebung der Exit-Zeit selbst bringt
nichts — der Gewinner-Wert IST die Baseline (15:00).

### Entry-Sweep (`sweep_dailydax_entry.mjs`, 4 Dimensionen: adxThreshold × ema1Period × ema2Period × Filter an/aus)

**Ergebnis — gleiches Bild:** Bestes Train-Ergebnis (mit ≥15 Trades)
+0,164R (ema1=20 [Baseline], ema2=75, adxThreshold=30, n=24) → Test
**-0,268R** (n=6, kleine Stichprobe). Wichtiger: in der UNGEGATETEN
Top-15-Liste (nach reinem Train-ExpR, oft nur 1-13 Trades) ist **jeder
einzelne Eintrag im Test negativ** — von -0,144R bis -0,746R, ausnahmslos.
Kein einziger Kandidat über beide Sweeps hinweg (Exit/Risk + Entry, ~430
Backtests gesamt) zeigt eine Verbesserung gegenüber der unveränderten
Baseline, geschweige denn eine robuste Out-of-Sample-Edge.

**Gesamtfazit DailyDax:** Eindeutigeres "keine Edge"-Ergebnis als S1 oder
S5 — dort gab es wenigstens vereinzelt Konfigurationen nahe der Nulllinie;
hier verschlechtert JEDE getestete Parameteränderung (Exit-Zeit, Risk-
Skalierung, Target-Skalierung, ADX-Schwelle, EMA-Perioden) das Ergebnis
gegenüber dem unveränderten Werks-Preset. Die kleine Baseline-Stichprobe
(49 Trades über ~8 Monate, max. 1 Trade/Tag) macht das Testfenster (13
Trades) zwar statistisch wackelig, aber die Richtung ist über alle
Sweep-Dimensionen hinweg konsistent negativ, nicht nur in einer Ecke.
**Empfehlung: DailyDax auf DE40 M30 nicht weiterverfolgen** — analog zu
S1s "auf USTEC nicht weiterverfolgen"-Empfehlung (Teil 15). Kein Live-Test-
Modus gerechtfertigt (anders als bei S1/UT, wo trotz negativem Backtest ein
begründeter Zweifel an der Bar-Level-Simulation bestand — hier spricht
nichts dafür, dass Tick-Ausführung das Bild ändern würde, da ohnehin fast
alle Trades über die Uhrzeit statt über Kursbewegung geschlossen werden).

**Verifiziert:** `eslint backtests/dailydax_engine.mjs backtests/
strategy_dailydax.mjs backtests/sweep_dailydax.mjs backtests/
sweep_dailydax_entry.mjs` 0 Fehler. Unit-Suite 141/141 grün (unberührt).
`sim_dailydax_results.json` vor/nach Engine-Refactor UND vor/nach dem
Intl.DateTimeFormat-Perf-Fix bit-identisch (`diff` bestätigt beide Male).

**Dateien (neu):** `backtests/dailydax_engine.mjs`,
`backtests/sweep_dailydax.mjs`, `backtests/sweep_dailydax_entry.mjs`,
`backtests/sweep_dailydax_results.json`,
`backtests/sweep_dailydax_entry_results.json`. **Geändert:**
`backtests/strategy_dailydax.mjs` (Engine-Import statt Monolith, Verhalten
unverändert).

---

## 🆕 Entry/SL/TP-Linien vom Chart entfernt (30.07.2026, User-Wunsch)

**Auslöser:** "kannst du bitte in Zukunft keine Entries mehr im Chart
einzeichnen? Ich finde das sieht dann unübersichtlich aus." — direkte
Rücknahme des in Teil 2 (28.07.2026) eingeführten Features
(`drawScenarioLevels()`, Entry/SL/TP als `horizontal_ray`-Linien für
Szenario A/B/D).

**Umgesetzt:** Aufrufe in `run.mjs` und `check_scenarios.mjs` entfernt,
die tote Funktion + ungenutzte Farb-Konstanten (`scenario_entry/sl/tp`)
aus `draw.mjs` gelöscht (kein auskommentierter Code stehen gelassen).
`state/scenario_lines.json` war zum Zeitpunkt der Änderung bereits leer
(`{"a":{},"b":{},"d":{}}`) — keine Linien mussten live vom Chart entfernt
werden, nur das künftige Neuzeichnen wurde gestoppt.

**Verifiziert:** `eslint`/`node --check` auf allen 3 geänderten Dateien
sauber, Unit-Suite 141/141 grün, `check_scenarios.mjs` live per
`launchctl kickstart` getestet — läuft fehlerfrei durch (Exit 0, korrekte
Telegram-Alerts weiterhin, keine Referenz auf die entfernte Funktion mehr).
Die Empfehlungen selbst (Entry/SL/TP-Preise) bleiben im Telegram-Briefing-
Text vollständig erhalten — nur die Chart-Visualisierung entfällt.

**Geändert:** `scripts/premarket/run.mjs`, `scripts/premarket/
check_scenarios.mjs`, `scripts/premarket/draw.mjs`.

---

## 🆕 Teil 23 — Strategie VCP gebaut + gebacktestet + Exit/Entry-Sweeps (30.07.2026)

**Auslöser:** "mach mit VCP weiter, analog zum bisherigen Vorgehen" —
Fahrplan aus Teil 16. Gleicher voller Durchlauf wie bei UT: Doku lesen,
Engine bauen, Baseline mit echten Presets, Exit/Risk-Sweep, Entry-Sweep.

### Doku-Lage — niedrigste Konfidenz aller bisher gebauten Strategien

Anders als UT gibt es für VCP **reichlich `.set`-Files** (28 Presets über
6 Broker × 6 Instrumente × Long/Short) — das Problem liegt woanders: die
eigentliche VCP-Muster-Erkennungsformel (ATR-Kontraktion + Pivot-Breakout)
wird in der PDF NUR über ihre Parameter benannt (`VCP_Period`,
`Pivot_Lookback`, `Vol_Factor`, `VCP_Nachlauf_Bars`), **nie die exakte
Vergleichsformel selbst spezifiziert** — exakt die im Fahrplan (Teil 16)
vorhergesagte Lücke ("Breakout-/Squeeze-Formel nicht spezifiziert").

**Explizite Annahme (Datei-Kopf von `vcp_engine.mjs`, deutlich riskanter
als alle bisherigen Annahmen):** Kontraktion = "aktuelles ATR(vcpPeriod)
≤ ATR(vcpPeriod) von vor `pivotLookback` Bars, mal `volFactor`" —
`pivotLookback` dient dabei doppelt als Pivot-Fenster UND als Vergleichs-
Lag für die Volatilität, da die .set-Files kein zweites Zeitfenster dafür
hergeben. Pivot High/Low = Extremum der letzten `pivotLookback` Bars
(gleiche Konvention wie S1/UTs Breakout-Fenster). TTM Squeeze als
öffentliche "Squeeze Momentum Indicator"-Formel (BB-vs-KC-Breite +
Linreg-Momentum) nachgebaut, nicht Kaspareit-spezifisch hergeleitet.
Williams-Fractal-Trailing **nicht implementiert** — in JEDEM geprüften
.set-File (über alle Broker/Instrumente) auf `false`.

**Baseline (DE40 H1, `data_1h.json`, 3300 Bars, ~8 Monate) mit 3 echten
Presets:**

| Preset | Filter | Train | Test | Overall |
|---|---|---|---|---|
| ger40Long (FTMO) | TTM/Volume aus | +0,013R (190) | -0,425R (62) | -0,095R |
| ger40Short (FTMO) | TTM/Volume aus | -0,355R (43) | -0,258R (24) | -0,320R |
| tickmillDe40Long | TTM+Volume AN | -0,398R (48) | -0,475R (20) | -0,420R |

Engine-Sanity bestätigt: R-Werte sauber begrenzt (max. beobachteter Wert
2,01R = exakt der theoretische Maximalwert aus 33%@1R+33%@2R+34%@3R),
keine NaN, plausible Preis-/SL-Abstände — kein Implementierungsfehler,
die Baseline-Presets zeigen einfach keine Edge (`tickmillDe40Long` bestätigt
außerdem, dass TTM Squeeze + Volume-Filter-Code korrekt läuft, ohne
Absturz oder Null-Trades).

### Exit/Risk-Sweep (`sweep_vcp.mjs`) — VCPs echter BE-Parameter statt eines erfundenen

Anders als bei S5/UT (wo BE neu hinzugefügt wurde) hat VCP bereits einen
**echten, dokumentierten** BE-Mechanismus (`Break_Even_RR`) — der Sweep
variiert daher `beRR` direkt (0=aus) statt einen synthetischen Wert zu
erfinden. 3 Dimensionen: riskScale × targetScale × beRR, gleiche
Train/Test-Disziplin.

**Ergebnis — eindeutiges Overfitting, teils dramatisch:**

| Preset | Bestes Train-Ergebnis | Test damit |
|---|---|---|
| ger40Long | +0,266R (riskScale=1, targetScale=1,5, beRR=0) | **-0,691R**, Win-Rate bricht auf 3,3% ein |
| ger40Short | +0,080R (riskScale=1,5, targetScale=0,75, beRR=1,5) | -0,172R |

### Entry-Sweep (`sweep_vcp_entry.mjs`, 4 Dimensionen: pivotLookback × volFactor × vcpPeriod × Filter an/aus)

**ger40Long:** durchgängig negativ bei jeder Stichprobengröße ≥20 Trades
(z.B. Train +0,243R/Test -0,306R bei n=69/26; Train +0,209R/Test -0,405R
bei n=51/14) — klares "keine Edge"-Bild wie bei S1/S5/DailyDax.

**ger40Short — schwacher, deutlich unsichererer Fund als bei UT 15m:**
Bestes Ergebnis mit ≥20 Trades: Train +0,220R/Test **+0,163R** (n=49/15,
pivotLookback=20, volFactor=0,9, vcpPeriod=20, Filter aus) — beide
positiv. Eine kleine Nachbarschaft ähnlicher Configs (pivotLookback=20,
volFactor≤1,0, vcpPeriod=20) zeigt wiederholt schwach-positive bis
neutrale Werte in beiden Fenstern. **Aber:** diese Nachbarschaft ist
deutlich dünner besetzt als UTs Fund aus Teil 20 (nur 3-4 unterstützende
Nachbar-Zellen hier vs. 75 von 150 bei UT) und beruht zusätzlich auf der
oben genannten, ungesicherten Kontraktions-Formel-Annahme — zwei
Unsicherheitsebenen übereinander, nicht nur eine.

**Gesamtfazit VCP:** ger40Long und tickmillDe40Long zeigen keine Edge,
klar und durchgängig negativ über Exit/Risk- UND Entry-Sweep. ger40Short
zeigt einen schwachen, nicht robust bestätigten Silberstreif — deutlich
schwächer und unsicherer als UTs 15m-Fund (Teil 19/20), weil hier
zusätzlich zur üblichen Train/Test-Unsicherheit auch noch die
Kern-Mustererkennungsformel selbst eine unbestätigte Annahme ist.
**Kein Live-Test-Modus gerechtfertigt** — dafür wäre mindestens eine
Verifikation der Kontraktionsformel gegen eine echte MT5-Referenz nötig
(z.B. über den vom User erwähnten "in MT5 gesehenen Live-Bot"), nicht nur
ein Backtest auf einer Annahme, die selbst schon Verifikation bräuchte.

**Verifiziert:** `eslint backtests/vcp_engine.mjs backtests/
strategy_vcp.mjs backtests/sweep_vcp.mjs backtests/sweep_vcp_entry.mjs`
0 Fehler. Unit-Suite 141/141 grün (unberührt).

**Dateien (neu):** `backtests/vcp_engine.mjs`, `backtests/strategy_vcp.mjs`,
`backtests/sweep_vcp.mjs`, `backtests/sweep_vcp_entry.mjs`,
`backtests/sim_vcp_results.json`, `backtests/sweep_vcp_results.json`,
`backtests/sweep_vcp_entry_results.json`.

---

## 🆕 Teil 24 — Strategie S3 gebaut + gebacktestet (30.07.2026)

**Auslöser:** "Ja, mach mit S3 weiter" — Fahrplan aus Teil 16, S3 vor S2/S4/
InsideBar priorisiert (klarste Spezifikation der 4 verbliebenen: CHANGELOG
bestätigt explizit SuperTrend-basierte Logik seit v7, kein RSI/Xpct mehr).

### Doku-Lage — konkrete Presets vorhanden, aber Versions-Drift zwischen PDF und Set-Files

PDF (`Strategie 3 7.11 Parametererklärung.pdf`, 10 Seiten) beschreibt Stand
ver7.11/7.12. Die 2 verfügbaren `.set`-Files sind älter (`26.04.2024_
Strat3_halbauto.set` = ver7.0, `13.11.24_Strat3_H1_Nasdaq_vollauto.set` =
ver7.06) — zwischen diesen Versionen wurden laut CHANGELOG mehrfach Felder
umbenannt/umstrukturiert (u.a. Breakeven-Sektion). Die vollauto-Datei wurde
als Baseline gewählt: einziger Preset mit explizitem Instrument+Timeframe-
Bezug ("H1 Nasdaq"), direkt auf DE40 übertragbar (beide Indizes in
Dezimal-Indexpunkten notiert, keine klassische FX-Pip-Umrechnung nötig).

**Kern-Logik (Sektionen 8-10 der PDF):**
- **Entry-Trigger:** primärer SuperTrend (Periode/Multiplikator, auf dem
  Chart-Timeframe selbst) **flippt** die Richtung — anders als bei S1/UT,
  wo SuperTrend nur ein Bestätigungsfilter ist, nicht der Trigger selbst.
- **Dual-Magic-Trend-Filter (Sektionen 4-5):** Trade nur wenn BEIDE Magic-
  Trend-Indikatoren (unabhängig konfigurierbar: Periode/ATR-Mult/ATR-
  Periode/Timeframe) mit der Flip-Richtung übereinstimmen. "Magic Trend"
  ("Trend Magic") ist ein öffentlich bekannter CCI+ATR-Ratchet-Band-
  Indikator (nicht Kaspareit-spezifisch) — Standardformel 1:1 übernommen.
  Beide Sample-Presets berechnen MT1+MT2 auf H4 bei H1-Chart — echtes
  Multi-Timeframe-Alignment implementiert (`alignHtf()`: letzter
  ABGESCHLOSSENER H4-Bar zum Zeitpunkt jedes H1-Bars, kein Repainting).
- **Exit:** fester SL in Indexpunkten (`SL_pips`) + festes TP als
  R-Multiple des SL.

**Explizite Annahmen (Datei-Kopf `s3_engine.mjs`):**
1. Pip = 1 Indexpunkt für diese Instrumentenklasse (DE40/Nasdaq beide in
   reinen Dezimal-Indexpunkten notiert) — `SL_pips=85` direkt als
   85-Punkte-Stop verwendet.
2. **Kritischste Annahme:** `TP_pips=2.8` aus dem vollauto-Set wird als
   R-MULTIPLE interpretiert, nicht als 2,8 literale Punkte. Live geprüft
   (A/B-Vergleich, gleiche Daten): literale 2,8-Punkte-Lesart ergibt
   91,7%/93,1% Win-Rate (Train/Test) bei nur **-0,053R/-0,038R** ExpR — ein
   strukturell kaputtes System (RR≈1:0,033, Breakeven bräuchte >96% WR).
   Die R-Multiple-Lesart (2,8× SL ≈ 238 Punkte, RR≈1:2,8) liegt dagegen im
   selben Bereich wie S1/S5/UTs eigene Final-TP-Multiples (3,0/~3/3,0) —
   dieselbe Fehlerkategorie wie S1s `beStepPct`-Korrektur (Teil 15): ein
   Feldname, der wörtlich genommen ein unplausibles System ergibt, wurde
   nicht stillschweigend übernommen, sondern gegen die Nachbar-Strategien
   plausibilisiert und explizit dokumentiert.
3. Breakeven/Trailing-nach-BE (Sektionen 11-12) **nicht implementiert**:
   halbauto (ver7.0) hat explizite `is_Breakeven`/`is_Breakeven_notrail`-
   Toggles (beide `false`), vollauto (ver7.06) hat gar keinen solchen
   Toggle mehr, nur rohe `be_start=9000`/`be_step=500`-Zahlen, die weder
   als Punkte (106× der eigenen SL-Distanz) noch als Prozent plausibel
   sind. Statt wie bei S1s Bug eine falsche Einheit zu raten: BE bleibt
   für die Baseline AUS, offener Punkt für einen künftigen Sweep, sobald
   die Einheit geklärt ist.
4. Basket-Modus, Corrections/Pyramiding (Sektionen 13-14), MA-Filter
   (2-3), zweiter Bestätigungs-SuperTrend (Sektion 10), Preis-/Zeitfilter
   (6-7) und HLOTT (17) sind in beiden Sample-Presets AUS — nicht
   implementiert (gleiche Konvention wie VCPs ungenutzter Williams-
   Fractal-Trailing-Zweig). `maxOpenTrades=1` spiegelt beider Presets
   `max_trades=1`.

### Baseline (DE40 H1, `data_1h.json`, 3300 Bars, ~8 Monate, echter vollauto-Preset)

| | Train | Test | Overall |
|---|---|---|---|
| Trades | 80 | 40 | 120 |
| Win-Rate | 38,8% | 30% | 35,8% |
| ExpR | **+0,472R** | **+0,14R** | **+0,362R** |

Long/Short-Split (Overall): Long 60 Trades, +0,203R/31,7% WR; Short 60
Trades, +0,52R/40% WR — beide Richtungen für sich genommen ebenfalls
positiv, Short deutlich stärker.

**Einordnung:** Erster echter Preset-Baseline-Lauf mit durchgängig
positivem ExpR in Train UND Test — anders als S1s erster Default-Lauf
(-0,24R/-0,34R, Teil 15) und näher an UTs Ausgangsbefund. Kleine
Test-Stichprobe (n=40) — wie bei allen bisherigen Funden gilt: kein
Live-Test-Modus ohne mindestens einen Exit/Risk- und Entry-Sweep zur
Robustheitsprüfung (gleiche Vorsicht wie bei S1/UT/VCP).

**Verifiziert:** `eslint backtests/s3_engine.mjs backtests/strategy_s3.mjs`
0 Fehler. Unit-Suite 141/141 grün (unberührt).

**Dateien (neu):** `backtests/s3_engine.mjs`, `backtests/strategy_s3.mjs`,
`backtests/sim_s3_results.json`, `backtests/sim_s3_de40_h1_log.json`.

**Nächster Schritt:** Exit/Risk- + Entry-Sweep (analog S1/S5/UT/VCP),
Train-Auswahl / Test-Bestätigung, bevor Live-Test-Modus erwogen wird.

---

## 🆕 Teil 25 — Strategie S3: kombinierter Exit+Entry-Sweep (30.07.2026)

**Auslöser:** "Ja, mach den Sweep" — offener Punkt aus Teil 24. Gleiche
kombinierte Methodik wie UTs Teil 20 (`sweep_s3_combined.mjs`): SuperTrend-
Periode × -Multiplikator × Magic-Trend-Filter an/aus × riskScale ×
targetScale, 2.100 Kombinationen, DE40 H1. Train-Auswahl (erste 70%),
Test nie zur Auswahl benutzt.

**Naiver "bester Train-Treffer" ist eindeutig Overfitting** — wie bei jedem
bisherigen Sweep zuerst geprüft, bevor irgendein Fund als echt behandelt
wird: die Top-15 nach reinem Train-ExpR sind ausnahmslos extreme
targetScale-Werte (≥2, meist 3-3,5×), mit Train-ExpR 1,0-1,4R aber
Test-ExpR oft NEGATIV (-0,1R bis -0,63R) bei kleinen Stichproben (n=16-25
im Test). Klassisches Muster: seltene große Gewinner blähen Train auf,
bestätigen sich im Test nicht.

**Aber: eine echte, breite, dichte Nachbarschaft existiert bei engerem
Risiko (`riskScale=0,5`, SL=42,5 Punkte statt 85):**

| riskScale | Kombinationen mit n≥30/15 | davon Train+Test BEIDE positiv |
|---|---|---|
| 0,5 (SL=42,5pt) | 420 | **275 (65,5%)** |
| 1,0 (SL=85pt, Baseline) | 412 | 139 (33,7%) |
| 1,5 (SL=127,5pt) | 289 | 58 (20%) |
| 2,0 (SL=170pt) | 154 | 25 (16%) |

Klarer, monotoner Trend: je enger der Stop relativ zur Baseline, desto
robuster/dichter die positive Nachbarschaft. **Wichtiger noch:** bei
`riskScale=0,5` trägt der Dual-Magic-Trend-Filter selbst nachweislich zur
Robustheit bei — mit Filter AN sind 187/210 (89%) der Kombinationen beide
Fenster positiv, mit Filter AUS nur 88/210 (42%). Das ist kein reiner
Stop-Mechanik-Zufall, der Filter selbst trägt echtes Signal.

Repräsentativer Kandidat aus dieser Nachbarschaft (nicht der extremste,
sondern ein mittiger Vertreter): `stPeriod=3, stMultiplier=1,
requireMagicTrend=true, riskScale=0,5 (SL=42,5pt), targetScale=0,75
(TP=2,1×R)` → **Train +0,412R/45,5% WR (n=101), Test +0,488R/48% WR
(n=50)** — Test sogar leicht besser als Train, große Stichproben in
beiden Fenstern.

**⚠️ Kritischer Vorbehalt, bevor dieser Fund als belastbar gilt:** Der
durchschnittliche H1-Balken auf DE40 hat eine High-Low-Range von **~79,4
Punkten** — größer als der hier getestete 42,5-Punkte-SL. Das heißt: ein
erheblicher Teil dieser Trades dürfte SL oder TP INNERHALB desselben oder
des nächsten Balkens erreichen, wo die reine OHLC-Bar-Level-Simulation
(kein Tick-/Intrabar-Pfad) strukturell unsicherer ist als bei den
größeren SL-Stufen (85-170pt, die alle unterhalb der durchschnittlichen
Balken-Range liegen). Zusätzlich simuliert der Sweep weiterhin ohne
Spread/Slippage — bei einem 42,5-Punkte-Stop wiegt ein typischer
DE40-Spread deutlich schwerer als bei 85-170 Punkten. Dieselbe
Vorsichts-Kategorie wie die dokumentierte "Same-Bar-Ambiguität" (repo-
weite Konvention), hier aber nicht nur ein Randfall, sondern potenziell
der Regelfall bei dieser SL-Größe.

**Fazit:** Kein Live-Test-Modus direkt aus diesem Sweep heraus — die
riskScale=0,5-Nachbarschaft ist der bisher dichteste/breiteste Fund der
gesamten Kaspareit-Aufarbeitung (dichter als UTs Teil-20-Fund), aber bei
einer SL-Größe, die die eigene Simulationsmethode strukturell weniger
vertrauenswürdig macht. Zwei plausible nächste Schritte (User-Entscheidung,
kein automatischer nächster Schritt): (a) denselben Sweep auf feinerer
Auflösung (15m/5m) wiederholen, wo 42,5 Punkte relativ zur Balken-Range
deutlich unauffälliger wären, oder (b) konservativ bei `riskScale=1,0`
(Original-Preset-SL, 85pt, oberhalb der Balken-Range) bleiben — dort
immer noch 33,7% Beide-positiv-Rate, deutlich über dem Zufallsniveau,
aber mit geringerem Simulations-Risiko.

**Verifiziert:** `eslint backtests/sweep_s3_combined.mjs` 0 Fehler.
Unit-Suite 141/141 grün (unberührt). Sweep-Laufzeit 133ms (2.100 Kombos).

**Dateien (neu):** `backtests/sweep_s3_combined.mjs`,
`backtests/sweep_s3_combined_results.json`.

---

## 🆕 Teil 26 — Strategie S3: 15m-Feingranularitäts-Verifikation (30.07.2026)

**Auslöser:** "Ja, mach die 15m-Verifizierung" — direkter Test des in Teil
25 offen gelassenen Vorbehalts (SL=42,5pt kleiner als die durchschnittliche
H1-Balken-Range ~79,4pt), statt die riskScale=0,5-Nachbarschaft ungeprüft
zu verwerfen ODER ungeprüft zu vertrauen.

**Methode (`verify_s3_15m.mjs`):** dieselben Entries (H1-SuperTrend-Flip +
Dual-Magic-Trend, unverändert) mit dem repräsentativen Sweep-Kandidaten
(`stPeriod=3, stMultiplier=1, riskScale=0,5, targetScale=0,75`), aber statt
SL/TP gegen die grobe H1-Balken-High/Low zu prüfen: ab dem ersten 15m-Bar
NACH dem Entry-H1-Bar-Close (Entry passiert exakt an dessen Close) durch
die 15m-Bars schreiten und die tatsächliche Reihenfolge SL-vs-TP direkt
beobachten. `data_15m.json` deckt nur 02.02.2026 an ab (H1-Fenster beginnt
24.11.2025) — die frühesten ~2,2 Monate des Train-Fensters sind dadurch
nicht neu verifizierbar, das GESAMTE Test-Fenster (ab 28.05.2026) aber
vollständig.

**Ergebnis — die Sorge bestätigt sich NICHT:**

| | H1-Original (grob) | 15m-Reverifiziert (fein) |
|---|---|---|
| Gesamte verifizierbare Teilmenge (n=117 von 151) | ExpR +0,484R, 47,9% WR | ExpR **+0,537R**, 49,6% WR |
| Nur Test-Fenster (n=50, vollständig abgedeckt) | ExpR +0,488R, 48% WR | ExpR **+0,55R**, 50% WR |

- **0 von 117** Trades bleiben auch auf 15m-Ebene noch mehrdeutig (SL und
  TP im selben 15m-Bar getroffen) — die durchschnittliche 15m-Balken-
  Range (~40,9pt) liegt zwar selbst noch nahe am SL, aber die zeitliche
  Auflösung (4 Sub-Bars pro H1-Bar) reichte in JEDEM einzelnen Fall aus,
  um die tatsächliche Reihenfolge eindeutig zu bestimmen.
- Nur **2 von 117** Trades kippen im Ergebnis (Gewinn↔Verlust) zwischen
  grober und feiner Simulation.
- Die feinere Simulation zeigt sogar ein LEICHT BESSERES Ergebnis als die
  grobe H1-Version — die konservative "Same-Bar=SL"-Konvention hat die
  Performance hier also eher unterschätzt als künstlich aufgebläht.

**Fazit:** Der in Teil 25 offen gelassene Vorbehalt hat sich bei genauerer
Prüfung nicht bestätigt — die riskScale=0,5-Nachbarschaft übersteht die
Feingranularitäts-Kontrolle vollständig intakt (sogar minimal verbessert),
nicht nur bei kleinerer Stichprobe zufällig unverändert. Bleibt: die
frühesten ~2,2 Monate des Train-Fensters sind weiterhin nicht auf diese
Weise überprüfbar (fehlende 15m-Historie), und Spread/Slippage bleiben
weiterhin unsimuliert (0-Kosten-Annahme wie bei allen bisherigen
Backtests). Damit ist S3 jetzt der am gründlichsten geprüfte Fund seit
UTs Teil 20 — Live-Test-Modus wäre der nächste plausible Schritt, aber
das bleibt bewusst eine User-Entscheidung (wie bei S1/UT), kein
automatischer nächster Schritt.

**Verifiziert:** `eslint backtests/verify_s3_15m.mjs` 0 Fehler. Unit-Suite
141/141 grün (unberührt).

**Dateien (neu):** `backtests/verify_s3_15m.mjs`.

---

## 🆕 Teil 27 — Strategie S3: Live-Test-Modus aktiv (30.07.2026)

**Auslöser:** Direkter Folgeauftrag zu Teil 26 ("Ja, richte den
Live-Test-Modus ein") — analog zu S1 (Teil 16) und UT (Teil 21).

### Was gebaut wurde

- **`scripts/premarket/check_s3.mjs`** — neuer, eigenständiger Live-
  Checker, 1:1 nach dem Vorbild von `check_strategie_c.mjs`/`check_ut.mjs`.
  Läuft auf dem bereits laufenden DE40-Chart (GBEBROKERS:DE40) — **kein
  Symbolwechsel, keine Kollision** mit ms-check/scenario-check/
  strategie-c-check/ut-check. **Anders als S1/UT:** S3 ist echt multi-
  timeframe (SuperTrend-Entry auf H1, Dual-Magic-Trend-Filter auf H4) —
  der Checker holt pro Lauf BEIDE Auflösungen via `fetchBars(60, …)` +
  `fetchBars(240, …)` (interner Resolution-Switch), statt nur einer.
- **Verwendete Config:** der repräsentative Sweep-Nachbarschafts-Kandidat
  aus Teil 25/26 — `{ ...BASE_CONFIG, stPeriod: 3, stMultiplier: 1,
  slPoints: 42.5, tpRMultiple: 2.1 }` (requireMagicTrend bleibt Default
  `true`) — derjenige Fund, dessen einziger offener Vorbehalt (SL <
  durchschnittliche H1-Balken-Range) per 15m-Reverifikation geprüft und
  NICHT bestätigt wurde.
- **Dedup:** pro Bar-Zeitstempel (`state/s3_dedup.json`). **Signal-Log:**
  `state/s3_signals.json` — jedes gemeldete Signal mit Entry/SL/TP
  geloggt (Auswertungs-Skript analog zu S1/UTs noch ausstehendem Punkt
  folgt, sobald genug Signale vorliegen).
- **Telegram:** jede Nachricht beginnt mit "🧪 STRATEGIE S3 TEST-SIGNAL
  (DE40, H1) — NUR Datensammlung, KEIN Live-Trade" — unverwechselbar von
  den A/B/C/UT-Alerts.
- **launchd:** `com.boogy.de40-s3-check`, alle 15 Min, 24/7, selbst-
  guarded über `isXetraOpen()` (identisches Muster wie die anderen
  Checker). **Geladen und aktiv** seit 30.07.2026 — jetzt 5 aktive
  Live-Test-Modus-artige/Dauerbetrieb-Jobs neben morning-briefing/
  evening-sync (siehe Automation-Tabelle oben).

**Verifiziert:** `eslint scripts/premarket/check_s3.mjs` 0 Fehler.
Unit-Suite 141/141 grün (unberührt). Manuell per `launchctl bootstrap` +
`launchctl kickstart -p gui/501/com.boogy.de40-s3-check` getestet — Exit
0, `state/s3_dedup.json`/`s3_signals.json` korrekt angelegt (leer, kein
frisches Signal in diesem Lauf — Entry-Bedingung ist selten, kein Fehler).
Parallel `de40-ms-check` per `launchctl kickstart` gegengetestet — lief
fehlerfrei durch (frische Alert-Zeilen im stdout), `ms-check.err.log`s
Zeitstempel per `stat -f "%Sm"` unverändert (28.07.2026) — das dort
stehende FATAL ist nachweislich alt, kein neuer Fehler durch den
S3-Checker verursacht (gleiche Gegenprüf-Methodik wie Teil 21).

### Wie es weitergeht

Nach ein paar Wochen Live-Daten braucht es ein Auswertungs-Skript (liest
`state/s3_signals.json`, matched gegen tatsächliche Kursbewegung seit
Signal, vergleicht Win-Rate/Exp.R gegen die Backtest-Zahlen aus Teil
24-26). **Noch nicht gebaut** — analog zu S1/UTs offenem Punkt, gleiche
Faustregel: mind. 15-20 Signale für eine erste Einschätzung.

**Dateien (neu):** `scripts/premarket/check_s3.mjs`,
`~/Library/LaunchAgents/com.boogy.de40-s3-check.plist`,
`state/s3_signals.json`, `state/s3_dedup.json`.

---

## 🆕 Teil 29 — Strategie S2 gebaut + gebacktestet (30.07.2026)

**Auslöser:** "Weiter mit S2 bauen" — Fahrplan aus Teil 16. Quelle: PDFs +
Set-Files liegen jetzt dauerhaft in `kaspareit-docs/S2/` (siehe Teil 28).

### Doku-Lage — zwei PDFs (Handelsregeln + Parametererklärung) + zwei echte Presets

Anders als bei UT (kein .set-File) oder VCP (Kernformel unbestätigt): S2
hat sowohl eine plain-English "Handelsregeln"-PDF als auch eine
Feld-für-Feld-Parametererklärung UND zwei echte Nasdaq-Presets ("6% high
risk", "konservativ", beide ver5.9) — insgesamt höhere Doku-Konfidenz als
S3. Kernlogik: SuperTrend-Entry (identischer Trigger-Mechanismus wie S3),
gated durch (alle real/an im konservativ-Preset) eine ZUSÄTZLICHE
Bestätigungs-SuperTrend, zwei EMA-Filter (MA1/MA2), Dual-Magic-Trend
(gleiche CCI+ATR-Formel wie S3) und HLOTT (wiederverwendet aus S1s
`hlott.mjs`). **Kein Take-Profit in beiden echten Presets** (`TP_pips=0`)
— der komplette Exit ist: fester initialer SL -> Trail bis Break-Even
über die primäre Entry-SuperTrend selbst -> nach BE Wechsel auf eine
SEPARATE Trailing-SuperTrend. Exakt derselbe Mechanismus, der für S1
bereits gebaut wurde (`useTrailToBE`/`stTrail` in `s1_engine.mjs`) —
wiederverwendet, nicht neu erfunden, da beide EAs vom selben Autor/derselben
EA-Familie stammen.

**Explizite Annahmen (Datei-Kopf `s2_engine.mjs`):**
1. Pip/Punkt = 1 Indexpunkt (`SL_pips=50` identisch in BEIDEN echten
   Presets — stabiler, plausibler Wert).
2. **Kritischste Annahme:** `be_start`/`be_step` sind NICHT auf derselben
   Skala wie `SL_pips`. Wörtlich genommen würde `be_start=7000` (konservativ)
   Break-Even erst bei 140× des 50-Punkte-SL aktivieren (praktisch nie),
   `be_start=19000` (high-risk) sogar bei 380×des SL — in BEIDEN Presets
   unplausibel für einen echten BE-Mechanismus. Durch 100 geteilt (rohe
   MT5-`_Point`- vs. ganze Indexpunkt-Skala, gängige Broker-Konvention)
   ergibt sich konservativ BE bei +70pt (1,4× SL) mit +0,5pt Puffer,
   high-risk bei +190pt (3,8× SL) ohne Puffer — beide plausibel und
   konsistent zueinander. Gleiche Fehlerkategorie wie S1s dokumentierter
   `beStepPct`-Fix und S3s `TP_pips`-als-R-Multiple-Fix.
3. `use_ATR`/`ATR_Period` (globaler Volatilitäts-Gate, Sektion 8 der PDF)
   hat KEINEN dokumentierten Schwellwert irgendwo (nur eine Periode, kein
   Vergleichswert) — **nicht implementiert**, statt einen Schwellwert zu
   erfinden (gleiche Behandlung wie S3s ungeklärte BE-Sektion).
4. Basket-Modus, Corrections/Pyramiding, Zeit-/Wochentag-/News-Filter
   sind im konservativ-Preset AUS oder strukturell irrelevant
   (`max_trades=1` — Basket-Verwaltung kollabiert auf den einen offenen
   Trade). Nicht implementiert (gleiche Konvention wie VCP/S3).

### Baseline (DE40 H1, `data_1h.json`, 3300 Bars, ~8 Monate, konservativ-Preset)

| | Train | Test | Overall |
|---|---|---|---|
| Trades | 58 | 22 | 80 |
| Win-Rate | 46,6% | 36,4% | 43,8% |
| ExpR | -0,427R | -0,542R | **-0,458R** |

Long (54 Trades): -0,397R/46,3% WR. Short (26 Trades): -0,585R/38,5% WR —
beide Richtungen für sich genommen ebenfalls negativ. Sanity-Check:
realizedR sauber begrenzt (-1,0 bis +0,515), 35/80 Trades erreichen
Break-Even, aber die meisten davon schließen kurz danach nahe +0,01R statt
weiter zu laufen — die (großzügige) Trailing-Distanz nach BE fängt
offenbar häufig eine schnelle Umkehr ab, kein Implementierungsfehler
(Werte plausibel, keine NaN/Ausreißer).

**Einordnung:** Anders als S3s erster Preset-Lauf (durchgängig positiv)
zeigt S2s konservativ-Preset hier klar KEINE Edge — negativ in Train UND
Test, negativ in beiden Richtungen. Näher an S1s eigenem ersten
Default-Lauf (Teil 15, -0,24R/-0,34R) als an S3/UT. Kein Live-Test-Modus
gerechtfertigt ohne mindestens einen Sweep, der prüft, ob irgendeine
Parameter-Nachbarschaft eine Edge zeigt (analog zu allen bisherigen
Strategien).

**Verifiziert:** `eslint backtests/s2_engine.mjs backtests/strategy_s2.mjs`
0 Fehler. Unit-Suite 141/141 grün (unberührt).

**Dateien (neu):** `backtests/s2_engine.mjs`, `backtests/strategy_s2.mjs`,
`backtests/sim_s2_results.json`, `backtests/sim_s2_de40_h1_log.json`.

---

## 🆕 Teil 30 — Strategie S2: kombinierter Exit+Entry-Sweep (30.07.2026)

**Auslöser:** "mach das" — direkter Folgeauftrag zu Teil 29s Vorschlag,
bevor S2 endgültig als "keine Edge" abgeschrieben wird. Gleiche kombinierte
Methodik wie bei S3 (Teil 25)/UT (Teil 20): `sweep_s2_combined.mjs`,
SuperTrend-Periode × -Multiplikator × Filter-Master-Toggle (alle 5
dokumentierten Filter zusammen an/aus, wie UTs `FILTERS_GRID`, keine
2^5-Kombinatorik jedes Filters einzeln) × riskScale (skaliert `slPoints`)
× beScale (skaliert `beStartPoints`+`beStepPoints` gemeinsam — S2 hat kein
Take-Profit zu skalieren, anders als S1/S3/UTs targetScale). 1.500
Kombinationen, DE40 H1. Train-Auswahl (erste 70%), Test nie zur Auswahl
benutzt.

**Ergebnis — die bisher eindeutigste "keine Edge"-Bestätigung der
gesamten Kaspareit-Aufarbeitung:**

- **0 von 1.500** Kombinationen zeigen Train UND Test gleichzeitig positiv
  (zum Vergleich: S3 hatte 812/2.100 bei riskScale=1, UT fand eine
  75/150-Nachbarschaft — S2 hat schlicht keine).
- Nur **5 von 1.425** Kombinationen mit einer sinnvollen Test-Stichprobe
  (≥10 Trades) zeigen überhaupt IRGENDEIN positives Test-ExpR (0,35%) —
  praktisch Rauschen, kein Muster.
- Durchschnittliches ExpR über das GESAMTE Raster: Train -0,274R, Test
  sogar noch schlechter bei -0,445R — negativ in praktisch jeder
  getesteten Ecke des Parameterraums, nicht nur am ungünstig gewählten
  Baseline-Preset.
- Selbst der naive "beste Train-Treffer" (+0,83R, n=39, stPeriod=1,
  stMultiplier=1, riskScale=0,5, beScale=2) bestätigt sich im Test klar
  NICHT (-0,475R, n=15) — dasselbe Overfitting-Muster, das bei jedem
  Sweep zuerst geprüft wird, bevor ein Fund als echt gilt.

**Fazit:** S2 zeigt auf DE40 H1 über einen breiten, systematisch
abgesuchten Parameterraum keine nachweisbare Edge — deutlicher und
eindeutiger als bei DailyDax oder VCP-Long (die zumindest vereinzelt
Overfitting-Spitzen zeigten). Kein Live-Test-Modus. Analog zu S1 auf
USTEC (Teil 16): nicht weiterverfolgen auf diesem Instrument/Timeframe —
falls später gewünscht, wäre ein anderes Instrument (analog zu S5s
USTEC/US30/XAUUSD-Test) der nächste sinnvolle Schritt, kein weiteres
Data-Dredging im selben DE40-H1-Datensatz.

**Verifiziert:** `eslint backtests/sweep_s2_combined.mjs` 0 Fehler.
Unit-Suite 141/141 grün (unberührt). Sweep-Laufzeit 167ms (1.500 Kombos).

**Dateien (neu):** `backtests/sweep_s2_combined.mjs`,
`backtests/sweep_s2_combined_results.json`.

---

## 🆕 Teil 31 — Strategie S4 gebaut + gebacktestet (30.07.2026)

**Auslöser:** "Weiter mit S4 bauen" — letzte verbliebene Strategie mit
konkreter Formel-Doku aus dem Fahrplan (Teil 16), InsideBar bleibt danach
übrig.

### Kritischer struktureller Fund: die "SuperTrend"-Sektion ist NICHT die echte Strategie

Die PDF heißt "Strategie 4 (**RSI/Donchian und Fibo-Strategie**)" — der
interne Codename laut CHANGELOG ist "Strat4_**xpct**". Die PDF beschreibt
zwar eine SuperTrend-Entry-Sektion identisch zu S2/S3, aber diese
"definiert den Einstieg" nur, WENN die separate "X percent setup"-Sektion
AUS ist. **Alle 7 echten Presets haben `Xpct_enable=true`** — das ist
immer die real eingesetzte Strategie. `Xpct_entry` wählt zwischen drei
Untermodi: 0/1 = Fibo (extern/intern) — **Kernformel in der PDF
nachweislich nicht spezifiziert** (bestätigt exakt die im Fahrplan
vorhergesagte Lücke), 2 = "DC-RSI" (Donchian-Channel + RSI, laut PDF "die
ALTE X%-Strategie") — ausreichend spezifiziert, UND der Modus, den **5 von
7 echten Presets tatsächlich verwenden** (inkl. beider gesampelter
LONG/SHORT-Presets). Nur DC-RSI wurde gebaut — Fibo bewusst nicht
nachgebaut, gleiche Behandlung wie VCPs unbestätigte Kernformel.

**DC-RSI-Mechanismus** (Arm-dann-Trigger, gleiches Muster wie S1s Williams
%R): RSI(period) ≤ Buy-Level armt einen Long (≥ Sell-Level einen Short —
beide echten Presets setzen Buy=Sell=50, also ein reiner Richtungsgate,
keine Extremwert-Umkehr). Kein dokumentiertes Ablauf-Fenster fürs Armieren
(anders als S1s WPR) — bleibt armiert bis Trigger oder Cancel. Trigger:
Kurs bricht über/unter den Donchian-Channel (`dcLength`). **Läuft auf
`Xpct_analysis_TF` = H4 in BEIDEN echten Presets**, unabhängig vom
M1-Basis-Chart — umgeht damit die im Fahrplan befürchtete
M1-Historien-Knappheit vollständig (H4-Cache deckt ~14 Monate ab, M1 nur
~16 Tage).

**Exit — KEIN R-Multiple, strukturell anders als S1/S2/S3/UT:** beide
echte Presets haben `SL_pips=0`/`TP_pips=0`. Der einzige Pro-Trade-Stop ist
ein sehr WEITER Katastrophen-Stop (Extremum der letzten 100 H4-Kerzen,
Basket-Sektion). Der eigentliche, namensgebende Exit ist "Xpct": schließe
den Trade, sobald der Basiswert sich um `xpctProfitTargetPct`% zugunsten
bewegt hat. Da die Belohnung in %-vom-Preis statt R-Multiplen definiert
ist, meldet `splitAgg()` hier %-Return statt R — Wiederverwendung der
R-Konvention wäre irreführend gewesen.

**Explizite Annahmen/Vorbehalte (Datei-Kopf `s4_engine.mjs`):**
1. Breakeven **nicht implementiert** — anders als S2/S3 gibt es hier
   KEINEN verlässlichen Cross-Check (SL_pips=0 in beiden Presets), und
   LONG (`be_start=600`) vs. SHORT (`be_start=6000`, 10× mehr, gleiche
   EA-Version) lassen sich unter keiner einzelnen Skalierungsannahme zu
   einem konsistenten Anteil am jeweiligen Xpct-Ziel auflösen. Lieber eine
   dokumentierte Lücke als eine geratene Einheit.
2. **Niedrigere Baseline-Konfidenz als S2/S3:** JEDES S4-Set-File trägt im
   eigenen Kopf den Hinweis "this file contains optimized parameters from
   XML analysis, generated by mt5_backtester analysis engine" — das sind
   MT5-Optimizer-OUTPUTS, keine handverlesenen sinnvollen Defaults (anders
   als S3s vollauto oder S2s konservativ). Als Sweep-Startpunkt behandeln,
   nicht als geprüften Werks-Preset.
3. HLOTT für BEIDE Richtungen deaktiviert, obwohl das echte SHORT-Preset
   es aktiviert hätte (M15-TF) — M15-DE40-Historie deckt nur ~6 Monate ab
   vs. H4s ~14, hätte LONG/SHORT auf unterschiedliche Fenster gezwungen.
   Dokumentierte Vereinfachung.
4. MA1/MA2, zusätzliche Bestätigungs-ST, Zeitfilter, Basket-%-SL/TP/BE/
   Trailing, Pyramiding (`max_trades`) aus/vereinfacht auf
   `maxOpenTrades=1` — gleiche Konvention wie alle bisherigen Engines.

### Baseline (DE40 H4, `data_4h.json`, 1300 Bars, ~14 Monate)

| | LONG | SHORT |
|---|---|---|
| Trades gesamt | 5 | 9 |
| Win-Rate | 40% | 55,6% |
| Ø Return/Trade | -1,058% | -1,201% |
| Exit: SL / Xpct-Ziel | 3 / 2 | 4 / 5 |

**⚠️ Zu wenig Trades für IRGENDEINE Aussage** — n=5 bzw. n=9 über 14
Monate ist weit unter der sonst in diesem Projekt verwendeten
Mindestschwelle (übliche `MIN_TRAIN_TRADES=20`), exakt dieselbe Vorsicht
wie bei S5s allererstem GER40-D1-Fund (Teil 15: "n=8, keine Aussage
möglich"). **Root Cause diagnostiziert, kein Bug:** rohe Donchian(5)-
Breakouts allein treten 175× (long)/130× (short) über die 1300 Bars auf,
und das RSI-Arm-Gate filtert praktisch nichts heraus (166 von 175
Breakout-Bars bereits armiert, da Buy-Level=50 sehr oft erreicht wird) —
der eigentliche Flaschenhals ist die Kombination aus zwei unabhängig
langsamen Magic-Trend-Filtern (H4 UND zusätzlich D1 bei LONG) plus
`maxOpenTrades=1`, die gemeinsam mit einem ohnehin seltenen Breakout
zusammenfallen müssen.

**Verifiziert:** `eslint backtests/s4_engine.mjs backtests/strategy_s4.mjs`
0 Fehler. Unit-Suite 141/141 grün (unberührt).

**Dateien (neu):** `backtests/s4_engine.mjs`, `backtests/strategy_s4.mjs`,
`backtests/sim_s4_results.json`.

**Nächster Schritt:** Kein Sweep sinnvoll, solange die Stichprobe so klein
ist — zuerst müsste ein Filter-Sweep (Magic-Trend AUS/gelockert) prüfen,
ob eine handhabbare Trade-Anzahl erreichbar ist, bevor Train/Test-ExpR
überhaupt aussagekräftig wird. User-Entscheidung, kein automatischer
nächster Schritt.

---

## 🆕 Teil 32 — Strategie InsideBar gebaut + gebacktestet (30.07.2026)

**Auslöser:** "Weiter mit InsideBar" — letzte Strategie aus der
ursprünglichen Kaspareit-Roadmap (Teil 15/16). **Mit diesem Build sind
jetzt alle 8 ursprünglich bereitgestellten Strategien (S1–S5, VCP, UT,
DailyDax, InsideBar) gebaut und gebacktestet.**

### Doku-Lage — deutlich besser als die Roadmap-Einschätzung vermuten ließ

Der Fahrplan (Teil 16) stufte InsideBar als "Niedrig (geometrischer
Inside-Bar-Test selbst nicht dokumentiert)" ein — diese Einschätzung
stammte aber nur aus dem Strategienamen, nicht aus der PDF selbst. Nach
tatsächlicher Lektüre: **die klassische Master-Bar/Inside-Bar-Breakout-
Geometrie ist vollständig spezifiziert** — tatsächlich die sauberste,
vollständigste Doku aller Kaspareit-Strategien:
- Eine "Master-Kerze" bei Bar i qualifiziert, wenn ihr Körper mindestens
  `master_body_pct`% (50%) der eigenen Hoch-Tief-Range ausmacht (filtert
  unentschlossene Doji-artige Kerzen heraus).
- Die NÄCHSTE Kerze (i+1) muss eine "Inside Bar" sein — Hoch ≤ Master-Hoch
  UND Tief ≥ Master-Tief (vollständig enthalten, Standarddefinition).
- Sobald dieses Paar entsteht, werden ab dem Schluss der Inside Bar ZWEI
  Pending-Stop-Orders aktiv: Buy-Stop am Master-Hoch, Sell-Stop am
  Master-Tief — verfallen nach `order_expiry` Minuten (120min = 24
  M5-Bars), wenn keine auslöst. Klassische Inside-Bar-Mechanik: gehandelt
  wird die Range der MASTER-Kerze, nicht die kleinere Inside-Bar-Range.
- SL = die GEGENÜBERLIEGENDE Extremstelle der Master-Kerze (`max_sl_pct`=
  100% in beiden echten Presets).
- Filter (EMA auf H1, SuperTrend auf H1, ATR auf M5-Basis-Chart mit
  ECHTEN Min/Max-Schwellwerten — anders als bei S2/S3/S4 diesmal wirklich
  implementierbar, kein unspezifizierter Gate).
- Exit: **BEIDE echten Presets haben `use_be=false` UND `trailmode=0`** —
  BE/Trailing sind echt AUS, nicht nur undokumentiert. Der Exit ist damit
  einfach: Master-Bar-SL + Partial-TP1/TP2 + Final-TP, alle als %-des-SL
  (identischer Mechanismus wie bereits bei S1/UT gebaut, hier
  wiederverwendet statt neu erfunden).

**Entry-Preis = der Stop-Order-Trigger-Preis selbst** (Master-Hoch/-Tief),
NICHT der Bar-Close — ein echter struktureller Unterschied zu S1-S4
(diese Strategie ist Pending-Order-basiert, nicht Market-Order-bei-Close).

**Dokumentierte Vereinfachung:** der Wochentags-/Sitzungs-Zeitfilter (35
echte Set-Felder, pro Wochentag 2 Sitzungen) wurde NICHT implementiert —
das echte Preset enthält an mehreren Stellen widersprüchliche
Start>Ende-Paare (z.B. Mittwoch Sitzung 1: Start 11:00, Ende 09:30) — zu
unsicher, um korrekt zu interpretieren, statt eine sichere, aber
möglicherweise falsche Filterung zu bauen. Bewusst dokumentiert, nicht
stillschweigend geraten.

### Baseline (DE40 M5, `data_5m.json`, 11.298 Bars, ~2 Monate — kürzestes Fenster aller Kaspareit-Builds, aber M5s hohe Signal-Frequenz gleicht das teilweise aus)

| | Train | Test | Overall |
|---|---|---|---|
| Trades | 116 | 48 | 164 |
| Win-Rate | 25,9% | 35,4% | 28,7% |
| ExpR | -0,029R | **+0,348R** | +0,081R |

Long (86 Trades): +0,043R. Short (78 Trades): +0,123R — beide leicht
positiv. **Ungewöhnliches Muster — das GEGENTEIL von Overfitting:** Test
schneidet BESSER ab als Train, nicht schlechter. Sanity-Check: realizedR
sauber begrenzt (-1,0 bis +2,845 = exakt der theoretische Maximalwert aus
33%@1,7R + 33%@2,8R + 34%@4,0R), keine Ausreißer.

**Einordnung:** Niedrige Win-Rate (28,7%) mit trotzdem leicht positivem
ExpR ist typisch für ein Trend-Breakout-System mit gutem Risk-Reward-Skew
(viele kleine -1R-Verluste, gelegentliche große Gewinner bis 4R) —
plausibel für die Master-Bar-Breakout-Konstruktion. Weder eindeutig
positiv (Train nahe null) noch eindeutig negativ (wie S2) — am ehesten
vergleichbar mit S1s ersten Funden: nicht verwerfen, aber auch nicht ohne
Sweep vertrauen.

**Verifiziert:** `eslint backtests/insidebar_engine.mjs backtests/
strategy_insidebar.mjs` 0 Fehler. Unit-Suite 141/141 grün (unberührt).

**Dateien (neu):** `backtests/insidebar_engine.mjs`,
`backtests/strategy_insidebar.mjs`, `backtests/sim_insidebar_results.json`,
`backtests/sim_insidebar_de40_m5_log.json`.

**Nächster Schritt:** Exit/Risk- + Entry-Sweep (analog S1/S5/UT/VCP/S3/S2),
um zu prüfen, ob eine robuste Nachbarschaft existiert, bevor Live-Test-
Modus erwogen wird. Mit InsideBar sind jetzt alle 8 Strategien der
ursprünglichen Kaspareit-Bibliothek mindestens einmal gebaut+gebacktestet.

---

## 🆕 Teil 33 — Strategie InsideBar: kombinierter Exit+Entry-Sweep (30.07.2026)

**Auslöser:** "Mach den Sweep für InsideBar und S4" — direkter
Folgeauftrag zu Teil 32s Empfehlung. Gleiche kombinierte Methodik wie bei
S2/S3 (`sweep_insidebar_combined.mjs`): Master-Körper-% × Filter-Master-
Toggle (EMA+SuperTrend+ATR zusammen) × Order-Verfallszeit-Skalierung ×
riskScale (skaliert `maxSlPct`) × targetScale (skaliert alle drei
%-des-SL-TP-Stufen gemeinsam). 1.200 Kombinationen, DE40 M5. Train-Auswahl
(erste 70%), Test nie zur Auswahl benutzt.

**Ergebnis — die BREITESTE, dichteste Robust-Nachbarschaft der gesamten
Kaspareit-Aufarbeitung, dichter noch als S3s Teil-25-Fund:**

Mit Filtern AN und langer Order-Verfallszeit (`expiryScale=4`, Pending-
Orders bleiben 96 M5-Bars/8h statt der ursprünglichen 24 Bars/2h aktiv)
zeigen **111 von 150** Kombinationen (74%) mit ausreichender Test-
Stichprobe Train UND Test gleichzeitig positiv — und das nahezu
GLEICHMÄSSIG über den gesamten Rest des Rasters (Master-Körper-% 30-70,
riskScale 0,5-1,5, targetScale 0,5-2,0), nicht nur in einer schmalen Ecke.
Zum Vergleich: mit Filtern AUS sinkt die Beide-positiv-Rate auf 37% — der
Filter trägt also nachweislich echtes Signal, exakt dasselbe Muster wie
bei S3s Magic-Trend-Filter.

Repräsentativer Kandidat (kein Extremwert, mittiger Vertreter der breiten
Nachbarschaft): `masterBodyPct=30, filtersOn=true, orderExpiryBars=96
(expiryScale=4), riskScale=0,5 (maxSlPct=50), targetScale=0,75` →
**Train +0,206R/40,6% WR (n=251), Test +0,165R/38,9% WR (n=108)** — sehr
eng beieinander liegende Werte in beiden Fenstern, große Stichproben.
Viele Nachbarzellen zeigen dasselbe Muster, teils mit Test SOGAR über
Train (z.B. gleicher masterBodyPct, targetScale=2,0: Train +0,079R/25,4%
WR, Test +0,767R/32,9% WR).

**Naiver "bester Train-Treffer" bleibt trotzdem klassisches Overfitting**
(wie bei jedem Sweep zuerst geprüft): die Top-Werte nach reinem Train-ExpR
sind ausnahmslos `filtersOn=false` mit hohem riskScale/targetScale, und
JEDER einzelne davon bricht im Test auf klar negative Werte ein (-0,11R
bis -0,564R). Der echte Fund liegt nicht am Rand des Rasters, sondern in
der breiten `filtersOn=true`-Fläche.

**Fazit:** InsideBar zeigt nach dem Sweep das bisher überzeugendste,
breiteste Robustheits-Bild der gesamten Kaspareit-Aufarbeitung — dichter
und gleichmäßiger als S3s Teil-25-Fund (der nur bei einer bestimmten
riskScale-Stufe dicht war). Zwei offene Punkte vor einem Live-Test-Modus:
(a) nur ~2 Monate Datenfenster (M5-Historie-Limit) — kürzestes Fenster
aller bisherigen Robust-Funde, (b) der Wochentags-Zeitfilter bleibt
unimplementiert (Teil 32). Eine 15m/Tick-Feingranularitäts-Verifikation
(analog S3 Teil 26) wäre der nächste sinnvolle Schritt, bevor Live-Test-
Modus erwogen wird — genau die gleiche Vorsicht, die sich bei S3 als
lohnend erwiesen hat.

**Verifiziert:** `eslint backtests/sweep_insidebar_combined.mjs` 0 Fehler.
Unit-Suite 141/141 grün (unberührt). Sweep-Laufzeit 707ms (1.200 Kombos).

**Dateien (neu):** `backtests/sweep_insidebar_combined.mjs`,
`backtests/sweep_insidebar_combined_results.json`.

---

## 🆕 Teil 34 — Strategie S4: Filter/Pyramiding-Sweep + Root-Cause-Korrektur (30.07.2026)

**Auslöser:** "Mach den Sweep für InsideBar und S4" — Test der in Teil 31
formulierten Diagnose ("gestapelte Magic-Trend-Filter sind der
Flaschenhals"), bevor Train/Test überhaupt aussagekräftig wird.

**⚠️ Root-Cause-Korrektur — die Teil-31-Diagnose war unvollständig/falsch:**
Direkter Test VOR dem vollen Sweep zeigt: beide Magic-Trend-Filter
komplett auszuschalten bewegt die Trade-Anzahl kaum (LONG 5→10, SHORT
9→17). Der eigentliche Flaschenhals ist `maxOpenTrades=1` — eine
Baseline-VEREINFACHUNG dieses Repos (Konvention bei jeder Kaspareit-
Engine), NICHT Teil des echten Presets (das `max_trades=100`, also echtes
Pyramiding, erlaubt). Allein `maxOpenTrades` auf praktisch unbegrenzt zu
setzen bringt LONG von 5 auf 47 Trades, SHORT von 9 auf 61 — ein viel
größerer Hebel als jeder Filter. `sweep_s4_filters.mjs` wurde entsprechend
um `maxOpenTrades` als vierte Dimension erweitert (useMt1 × useMt2 ×
dcLength × rsiPeriod × maxOpenTrades, 576 Kombos je Richtung).

**LONG — auch nach Lockerung keine belastbare Edge:** 0 von 29
Kombinationen mit ausreichender Stichprobe zeigen Train UND Test beide
positiv. Auffällig: mehrere Top-Train-Kandidaten zeigen im Test exakt
`+4,00%`-Return bei 100% Win-Rate — das ist der Xpct-Profit-Target-Wert
selbst, nicht variierbar. Das deutet auf einen **Regime-Artefakt** hin
(das Test-Fenster, die letzten ~30% der H4-Daten, scheint einen
anhaltenden Aufwärtslauf zu enthalten, in dem praktisch jeder Long, der
den weiten Katastrophen-SL überlebt, zwangsläufig das Ziel erreicht) —
keine generalisierbare Kante.

**SHORT — vielversprechender, aber nicht robust bestätigt:** 43 von 172
Kombinationen (25%) zeigen beide Fenster positiv. Bester ausbalancierter
Kandidat: `dcLength=4, rsiPeriod=14, maxOpenTrades=10, Mt1/Mt2 aus` →
Train +0,825%/58,1% WR (n=43), Test +0,335%/50% WR (n=20) — Test schwächer
als Train (übliche Overfitting-Richtung), aber beide klar positiv, keine
Regime-Artefakt-Anzeichen wie bei LONG.

**Fazit:** Kein Live-Test-Modus. LONG zeigt auch nach vollständiger
Filter-/Pyramiding-Lockerung keine belastbare Kante — Regime-Artefakt statt
echtes Signal. SHORT zeigt ein echtes, aber schwächeres und weniger
robustes Bild als InsideBar/S3 — würde einen dedizierten Risk/Exit-Sweep
mit `maxOpenTrades` als festem Parameter (nicht mehr auf 1 vereinfacht)
brauchen, um ernsthaft weiterverfolgt zu werden.

**Verifiziert:** `eslint backtests/sweep_s4_filters.mjs` 0 Fehler.
Unit-Suite 141/141 grün (unberührt). Sweep-Laufzeit 223ms (1.152 Kombos
gesamt, beide Richtungen).

**Dateien (neu):** `backtests/sweep_s4_filters.mjs`,
`backtests/sweep_s4_filters_results.json`.

---

## 🆕 Teil 35 — Strategie InsideBar: M1-Feingranularitäts-Verifikation (30.07.2026)

**Auslöser:** "Ja, mach die 15m-Verifizierung" — direkter Test von Teil
33s offenem Punkt, analog zu S3s Teil 26. Da InsideBars Baseline bereits
auf M5 läuft (nicht H1 wie bei S3), ist die feinere Vergleichsebene hier
M1 statt 15m — `data_1m.json` ist die feinste verfügbare Auflösung.

**Günstige Fenster-Überlappung:** `data_1m.json` deckt erst ab 12.07.2026
ab, aber der Train/Test-Cut der M5-Baseline liegt bei 10.07.2026 — nur 2
Tage früher. Dadurch fällt praktisch das GESAMTE verifizierbare
Sub-Sample automatisch in oder sehr nah am Test-Fenster (105 von 105
verifizierbaren Trades liegen exakt im Test-Fenster) — dieselbe günstige
Überlappung wie bei S3s Teil-26-Verifikation.

**Methode (`verify_insidebar_1m.mjs`):** repräsentativer Sweep-Kandidat
aus Teil 33 (`masterBodyPct=30`, Filter an, `orderExpiryBars=96`,
riskScale=0,5, targetScale=0,75) auf M5 simuliert, dann für jeden Trade
mit M1-abdeckung die EXAKT GLEICHE Schwellwert-Sequenz (SL → Partial-TP1 →
Partial-TP2 → Final-TP) gegen M1-Bars statt M5-Bars neu geprüft. Prüft nur
die Exit-Sequenzierung bereits ausgelöster Trades, nicht den Pending-
Order-Trigger selbst.

**Ergebnis — dieselbe beruhigende Bestätigung wie bei S3:**

| | M5-Original (grob) | M1-Reverifiziert (fein) |
|---|---|---|
| Verifizierbare Trades (n=105 von 359) | ExpR +0,175R, 39% WR | ExpR **+0,243R**, 41% WR |

Nur **2 von 105** Trades kippen im Ergebnis. Die feinere M1-Simulation
zeigt ein LEICHT BESSERES Ergebnis als die grobe M5-Version — dieselbe
konservative Same-Bar-Sequenzierung (SL zuerst) hat auch hier eher
unterschätzt als beschönigt.

**Einschränkung:** 254 von 359 Trades bleiben unverifizierbar (M1-Historie
reicht nur ~16 Tage zurück) — aber das GESAMTE Test-Fenster ist
abgedeckt, und genau dort bestätigt sich der Fund erneut.

**Fazit:** InsideBar ist jetzt neben S3 der am gründlichsten geprüfte Fund
der gesamten Kaspareit-Aufarbeitung (Baseline → kombinierter Sweep →
Feingranularitäts-Reverifikation, alle drei Schritte durchlaufen). Live-
Test-Modus wäre der nächste plausible Schritt — User-Entscheidung
ausstehend, wie immer.

**Verifiziert:** `eslint backtests/verify_insidebar_1m.mjs` 0 Fehler.
Unit-Suite 141/141 grün (unberührt).

**Dateien (neu):** `backtests/verify_insidebar_1m.mjs`.

---

## 🆕 Teil 36 — Live-Test-Modus für ALLE verbleibenden Strategien (30.07.2026)

**Auslöser:** Zuerst "Ja, richte den Live-Test-Modus ein" (InsideBar), dann
direkt danach "richte ihn für alle ein" — auf Nachfrage bestätigt: **alle**
verbleibenden gebauten Strategien (S2, S4, S5, DailyDax, VCP, InsideBar),
ausdrücklich AUCH die eindeutig abgelehnten Funde (S2, S4-Long, S5,
DailyDax, VCP-Long). Begründung des Users deckt sich mit dem bereits bei
S1 etablierten Präzedenzfall (Teil 15/16): Live-/Tick-Ausführung ist der
direkteste Weg zu prüfen, ob die Bar-Level-Simulation selbst zu grob war
— unabhängig vom Backtest-Urteil.

### Was gebaut wurde — 6 neue Checker, alle nach demselben Muster wie check_ut.mjs/check_s3.mjs

| Checker | Config | Timeframe(s) |
|---|---|---|
| `check_s2.mjs` | konservativ-Preset unverändert (Teil 29) | H1 |
| `check_s4.mjs` | beide Richtungen, `maxOpenTrades` auf 10 angehoben (Teil-34-Fix), sonst unverändert | H4 + Daily (MT2 D1, nur LONG) |
| `check_s5.mjs` | `BASE_CONFIGS.GER40` (einziges DE40-relevante Preset) | Daily |
| `check_dailydax.mjs` | `BASE_CONFIG` unverändert, Entry nur um 11:30 Berlin | 30m + H3/H6 (live resampled) + Daily |
| `check_vcp.mjs` | alle 3 echten Presets (ger40Long/ger40Short/tickmillDe40Long) gleichzeitig | H1 |
| `check_insidebar.mjs` | repräsentativer Sweep-Kandidat (Teil 33/35) | M5 + H1 (EMA/ST-Filter) |

**Zwei kleine, verifizierte Engine-Erweiterungen (keine Verhaltensänderung):**
- `insidebar_engine.mjs`: neue exportierte `computeFilterState()` — extrahiert
  aus `runBacktest()`s eigenem Indikator-Setup, damit der Live-Checker
  dieselbe EMA/SuperTrend/ATR-Berechnung nutzen kann, ohne sie zu
  duplizieren. Vor/nach dem Refactor per direktem Vergleich verifiziert:
  identisches `sim_insidebar_results.json`-Ergebnis.
- `dailydax_engine.mjs`: `resample()` exportiert (war intern), damit der
  Live-Checker aus einem frischen H1-Fetch selbst H3/H6 bauen kann (es
  gibt keine eigene H3/H6-Chart-Auflösung).

**InsideBar strukturell anders als jeder andere Checker:** die Strategie
platziert Pending-Stop-Orders, die bis zu 8h (96 M5-Bars) leben können,
bevor sie auslösen oder verfallen — `runBacktest()` gibt nur abgeschlossene
Trades zurück, keine gerade offenen Pending-Orders. `check_insidebar.mjs`
führt daher eine eigene, dateibasierte Pending-Order-Verwaltung
(`state/insidebar_pending.json`, dedupliziert nach Master-Bar-Zeitstempel)
über mehrere Läufe hinweg — alarmiert erst beim tatsächlichen AUSLÖSEN
einer Order, nicht schon beim Entstehen des Master/Inside-Musters.

### Verifikation

`eslint` über alle 6 neuen Checker + beide geänderten Engine-Dateien: 0
Fehler. Unit-Suite 141/141 grün (unberührt). Alle 6 Jobs per `launchctl
bootstrap` geladen und per `launchctl kickstart` einzeln getestet — Exit 0
für alle, saubere State-Dateien angelegt (leer, 0 frische Signale in
diesem Lauf — bei 6 gleichzeitig getriggerten Läufen auf derselben
TradingView-Instanz plausibel, kein Fehler). `de40-ms-check` danach
gegengeprüft: `ms-check.err.log`s Zeitstempel per `stat -f "%Sm"`
unverändert (weiterhin 28.07.2026) — keine Kollision durch die 6 neuen
Checker verursacht.

**Jetzt 13 laufende launchd-Jobs insgesamt** (2 volle Läufe, 2
Dauerbetrieb-Checker aus dem Original-System, 9 Kaspareit-Test-Modus-
Checker: S1/"Strategie C", UT, S3, S2, S4, S5, DailyDax, VCP, InsideBar).

**Dateien (neu):** `scripts/premarket/check_s2.mjs`,
`scripts/premarket/check_s4.mjs`, `scripts/premarket/check_s5.mjs`,
`scripts/premarket/check_dailydax.mjs`, `scripts/premarket/check_vcp.mjs`,
`scripts/premarket/check_insidebar.mjs`, 6× `~/Library/LaunchAgents/
com.boogy.de40-{s2,s4,s5,dailydax,vcp,insidebar}-check.plist`, je ein
`state/{strategie}_signals.json`+`_dedup.json` (InsideBar zusätzlich
`_pending.json`).

---

## 🆕 Teil 37 — Tickmill-Broker-Wechsel: Re-Backtest + echte Handelskosten (05.08.2026)

**Auslöser:** User hat den Broker auf dem live laufenden TradingView-Chart
eigenständig von GBEBROKERS auf Tickmill umgestellt und angekündigt,
spätestens ab Oktober 2026 live mit Tickmill zu handeln. Auftrag: "alles in
die Wege leiten" — auf Rückfrage präzisiert auf (1) Re-Backtest auf
Tickmills eigener Kurshistorie, dann (2) echte Handelskosten einrechnen.
Konto-Eröffnung/KYC/Einzahlung bei Tickmill bewusst NICHT übernommen
(außerhalb dessen, was hier automatisiert werden kann/darf).

### Schritt 0: Broker-Wechsel selbst brauchte keine Code-Änderung

Live-Health-Check bestätigte das Chart bereits auf `TICKMILL:DE40`. Prüfung
des gesamten Live-Pfads (`run.mjs`, `check_ms.mjs`, `check_scenarios.mjs`,
alle 9 Kaspareit-Checker) zeigt: **kein Skript hardcoded je einen
Broker-Ticker** — alle lesen nur, was gerade auf dem offenen Chart aktiv
ist (bewusste Design-Entscheidung, siehe Kommentar in `run.mjs`: *"a no-op
setSymbol call is risky if the exact ticker differs across brokers"*). Der
einzige Sicherheits-Check (`run.mjs`, `/DE40/i`-Regex) ist ticker-tolerant.
Einzige gefundene GBEBROKERS-Referenzen: Code-Kommentare + die
Backtest-Fetch-Skripte selbst (erwartet, da diese explizit historische
Daten von einem bestimmten Broker holen). **Alle 13 launchd-Jobs laufen
seit dem User-seitigen Wechsel automatisch auf Tickmill-Daten, ohne dass
etwas angefasst wurde.**

### Schritt 1: Tickmill-Kurshistorie geholt

Alle 11 Live-Checker (`ms-check`, `scenario-check`, 9 Kaspareit-Checker)
für die Dauer des Fetches pausiert (`launchctl bootout`, User-bestätigt,
nach Ablehnung durch den Auto-Mode-Classifier für die Bulk-Variante —
einzeln ausgeführt), da wiederholte Auflösungswechsel sonst mit einem
15-Min-Cron-Lauf kollidieren könnten (gleiche Vorsichtsmaßnahme wie
historisch für Symbolwechsel dokumentiert). Neues Skript
`backtests/fetch_tickmill_history.mjs` (Kombination aus
`fetch_history_6m.mjs`+`fetch_5m.mjs`+`fetch_1m.mjs`, alle 6 Zeitebenen in
einem Lauf) holte Daily/4H/1H/15m/5m/1m für `TICKMILL:DE40` → 6 neue
`backtests/data_tickmill_{daily,4h,1h,15m,5m,1m}.json`, OHNE die
bestehenden GBEBROKERS-`data_*.json` zu berühren (parallele Dateien, damit
beide Broker jederzeit vergleichbar bleiben). Abdeckung nahezu deckungsgleich
mit der GBEBROKERS-Historie (15m ab 01.02.2026, 1H ab 04.11.2025, 4H ab
24.09.2025, Daily ab 01.06.2025, 5m ab 14.06.2026, 1m ab 26.07.2026 — TV-
Lazy-Load-Limit pro Zeitebene, gleiches Muster wie bei GBEBROKERS). Alle 11
Checker danach wieder aktiviert (`launchctl bootstrap`) und per Kickstart
gegengeprüft — sauber, keine Kollision.

**Datenqualitäts-Fund (Tickmill-spezifisch, kein Bug im eigenen Code):**
Tickmills TradingView-Bars sind NICHT takt-phasen-aligned wie GBEBROKERS'
— Kerzen schließen z.B. auf `HH:05`/`HH:20` statt `HH:00`/`HH:15`, und der
Offset driftet sogar innerhalb desselben Datensatzes (5min am Anfang →
2min am Ende). `sim_6m.mjs`/`sim_scenario_a_poi.mjs`s Kadenz-Check
(`minutesOfDay % STEP_MIN`) geht von takt-alignten Bars aus und matchte
dadurch in den Tickmill-Kopien anfangs NULL Bars (0 Trading-Tage, 0
Sim-Steps — stiller Fehlschlag, kein Crash). **Fix:** phasen-unabhängige
Zählung über in-Session-Bar-Index statt Wall-Clock-Modulo, in den
Tickmill-Kopien der Sim-Skripte (nicht in den Live-Checkern nötig — die
lesen ohnehin nur den jeweils letzten Kerzenschluss, keine Modulo-Logik).

### Schritt 2: Re-Backtest mit den ECHTEN live-deployten Configs

Neue Tickmill-Parallel-Skripte (Original-GBEBROKERS-Skripte + -Daten
unverändert, nichts überschrieben): `sim_6m_tickmill.mjs` (B/D),
`sim_scenario_a_poi_tickmill.mjs` (A), `strategy_ut_tickmill.mjs` (UT, mit
Teil-20/21s Live-Config `ema1Period=300, riskScale=0.5, targetScale=1.5,
beMultR=0`), `strategy_s3_tickmill.mjs` (S3, mit Teil-24-27s Live-Config
`stPeriod=3, stMultiplier=1, slPoints=42.5, tpRMultiple=2.1`),
`strategy_insidebar_tickmill.mjs` (InsideBar, mit Teil-32/33s Live-Config
`masterBodyPct=30, orderExpiryBars=96, riskScale=0.5, targetScale=0.75`).

| Strategie | Ø SL-Distanz | GBEBROKERS (bisher) | Tickmill (0-Kosten) |
|---|---|---|---|
| B (counter_trend) | 49,2 Pkt | 71,4% WR / +0,43R | 67,1% WR / +0,34R, **alle 6 Monate positiv** |
| A (trend_reversal_poi) | 21,7 Pkt | 34,9% WR / +0,13R | 44,1% WR / +0,39R, beide Monate positiv |
| S3 (H1/H4) | 42,5 Pkt | 49,6% WR / +0,54R (15m-verifiziert) | 41,6% WR / +0,29R, 9/10 Monate positiv |
| InsideBar (M5/H1) | 11,4 Pkt | 40,6%/38,9% WR, +0,21R/+0,17R (Train/Test) | 34,1%/39,9% WR, +0,07R/+0,18R, alle 3 Monate positiv |
| UT (15m) | 37,4 Pkt | 5/6 Monate positiv, Cluster ~+0,08-0,17R | Train/Test nur noch +0,02R/+0,03R, **4/7 Monate negativ** |

**Zwischenfazit vor Kosten:** B/A/S3/InsideBar übertragen sich gut auf
Tickmill (gleiches Vorzeichen, meist moderat schwächer). UT ist die
Ausnahme — schrumpft auf eine Kante nahe null und verliert die
namensgebende Monatsstabilität (57% statt 17% negative Monate).

### Schritt 3: Echte Tickmill-Handelskosten eingerechnet

Recherche (`tickmill.com/instruments/de40`, `tickmill.com/uk/conditions/
trading-costs-fees`, 05.08.2026): Tickmill DE40 Index-CFD, **typischer
Spread 0,91 Pkt** (min. 0,8 Pkt), **keine separate Kommission** auf
Index-CFDs (Kosten vollständig im Spread eingepreist, anders als
Forex/Edelmetalle auf dem Raw-Account). Neues Skript
`backtests/apply_tickmill_costs.mjs`: zieht 0,91 Pkt als fixen
Round-Turn-Punktabzug von JEDEM Trade ab (Gewinn und Verlust gleichermaßen
— Spread fällt beim Entry an, unabhängig vom Ausgang), bevor R neu
berechnet wird. Dokumentierte Vereinfachung: bei Partial-TP-Systemen
(UT/InsideBar) wird der Spread einmal pro Trade angesetzt, nicht einmal
pro Teil-Exit (exakte Bid/Ask-Modellierung jedes Teil-Exits bräuchte eine
eigene Bid/Ask-Serie, die nicht gefetcht wird — transparent dokumentiert,
nicht verschwiegen).

| Strategie | ExpR vor Kosten | ExpR nach Kosten | Verdikt |
|---|---|---|---|
| B | +0,336R | **+0,317R** | ✅ Kaum betroffen |
| S3 | +0,29R | **+0,269R** | ✅ Kaum betroffen, 9/10 Monate weiter positiv |
| A | +0,387R | **+0,343R** | ✅ Hält (kleine Stichprobe bleibt Vorbehalt) |
| UT | +0,024R | **−0,011R** | 🔴 Kippt ins Minus, 5/7 Monate negativ |
| InsideBar | +0,105R | **+0,002R** | 🔴 Praktisch komplett aufgezehrt (Breakeven) |

**Kernbefund:** Der Kosten-Effekt ist proportional zur SL-Distanz — B/S3
mit weiten H1/H4-Stops (42-49pt) verlieren kaum ExpR, aber UT (37pt) und
besonders InsideBar (11pt, engster Stop der gesamten Aufarbeitung) hatten
bereits vor Kosten die dünnste Kante und genau die kippt jetzt. **UT und
InsideBar galten bisher als die zwei vielversprechendsten Kaspareit-Live-
Test-Funde — nach echten Tickmill-Kosten ist das nicht mehr haltbar.**

**Empfehlung für den Oktober-Wechsel (User-Entscheidung, kein
automatischer nächster Schritt):** B, A, S3 sind nach Broker-Wechsel UND
Kosten weiterhin klar positiv — plausible Kandidaten für echten
Tickmill-Live-Handel. UT und InsideBar würden aktuell nicht empfohlen,
ohne vorher zu klären, ob ein engerer/anderer Spread (z.B. Raw-Account
mit Kommission statt Classic-Spread) oder eine Anpassung der SL-Distanz
das Bild ändert — reine Fortsetzung des bisherigen Live-Test-Modus liefert
dafür aber weiterhin wertvolle echte Daten, unabhängig von dieser
Kosten-Projektion.

**Prozess:** Alle 11 pausierten launchd-Jobs sauber wieder aktiviert und
per Kickstart gegengeprüft (`ms-check` erfolgreich, altes FATAL im
err.log von 28.07. zeitstempel-verifiziert als stale). Keine
GBEBROKERS-Datei angefasst — vollständiger Direktvergleich bleibt jederzeit
möglich.

**Dateien (neu):** `backtests/fetch_tickmill_history.mjs`,
`backtests/sim_6m_tickmill.mjs`, `backtests/sim_scenario_a_poi_tickmill.mjs`,
`backtests/strategy_ut_tickmill.mjs`, `backtests/strategy_s3_tickmill.mjs`,
`backtests/strategy_insidebar_tickmill.mjs`,
`backtests/apply_tickmill_costs.mjs`, 6× `backtests/data_tickmill_*.json`,
je Strategie `sim_*_tickmill_results.json`+`_log.json`,
`backtests/tickmill_cost_adjusted_summary.json`.

---

## 🆕 UT-Bot + SMI + EMA Momentum-EA (30.07.2026, Teil 14)

**⚠️ Namens-Hinweis (30.07.2026, Teil 16):** Dieses EA hieß ursprünglich
"Strategie C" — nie live gegangen (negative Expectancy), der Buchstabe C
wurde daher freigegeben und läuft seit Teil 16 als Kaspareit-S1 (siehe dort).
Dieses EA hier hat ab jetzt KEINEN Buchstaben mehr, nur den technischen Namen.

**Auslöser:** User brachte eine komplett neue Strategie-Vorlage mit (Screenshot-Spec,
30.07.2026) — ein "EA" (Expert-Advisor-Terminologie) auf Basis UT-Bot-Alert +
Stochastic Momentum Index + EMA + Sessions/Tagesfilter, mit Pyramiding
(mehrere gleichgerichtete Trades bei neuen SMI-Kreuzungen), SL am 3-Kerzen-Extrem,
TP 1:2 RRR, Break-Even bei 1:1 RRR.

**Entscheidung (User, 30.07.2026):** Charakterlich das Gegenteil von A/B (Trend-
Continuation statt Zonen-Fade/Mean-Reversion) → als **eigenständiges EA**
gebaut, komplett getrennt von der Zonen-Logik (`lib.mjs`/`briefing.mjs`), damit
die laufende Beobachtungsphase von A/B (s.o.) nicht berührt wird. Plattform:
Pine Script/TradingView, Instrument: DE40 (wie A/B), Backtest: JS/CDP-Replay
statt Pine-Editor-UI-Automation (siehe [[feedback-backtest-automation]]).

**Offene Annahmen** (Spec ließ diese Werte offen, hier explizit gewählt):
- EMA-Länge 50, UT-Bot Key=1/ATR-Periode=10, SMI 10/3/3 (jeweils die
  öffentlichen Standard-Defaults der Original-Indikatoren)
- ATR = SMA of True Range (`lib.atr`), nicht Wilder/RMA — gleiche Vereinfachung
  wie schon in `sim_6m.mjs` dokumentiert
- "Sessions" (2 benannte Fenster) sind rein informativ, KEIN Trade-Filter — die
  Buy/Sell-Bedingungen der Spec referenzieren nur den Tages-Handelszeit-Filter,
  nie die Sessions. Umschaltbar via `requireSession`/"Sessions als Filter
  erzwingen".
- Ein Handelszeit-Fenster (09:00–23:00, Spec-Beispiel) für alle aktivierten
  Wochentage, keine Differenzierung pro Tag (Spec erlaubt das, aber ohne
  konkrete abweichende Werte).

**Dateien:**
- `backtests/strategy_c_momentum.mjs` — eigenständige Indikator- + Backtest-Engine
  (EMA/UT-Bot/SMI in reinem JS nachgebaut, Position-Management mit unabhängigem
  SL/TP/BE pro Trade, Pyramiding über neue SMI-Kreuzungen)
- `backtests/de40_strategy_c_momentum.pine` — Pine-Script-Version für TradingView
  (Strategy Tester). **Bekannte Einschränkung:** `strategy.exit` mit Pyramiding
  arbeitet auf dem Blended-Position-Average, nicht pro Einzeltrade — für exakte
  R-Multiple-Auswertung ist die JS-Engine maßgeblich, nicht der Pine-Tester.
- `backtests/sim_c_15m_results.json` / `sim_c_15m_log.json` (6 Monate, Feb–Jul 2026)
- `backtests/sim_c_5m_results.json` / `sim_c_5m_log.json` (~2 Monate, 31.05.–28.07.2026)

**Backtest-Ergebnis (erste Messung, Default-Parameter, kein Sweep):**

| TF | Zeitraum | Trades | Win-Rate | Exp. R/Trade | Long | Short |
|---|---|---|---|---|---|---|
| 15m | 02.02.–28.07.2026 (6 Mon.) | 136 | 23,7% | **-0,21R** | 18,4% / -0,31R | 29,2% / -0,09R |
| 5m | 31.05.–28.07.2026 (~2 Mon.) | 144 | 29,5% | **-0,08R** | 25,4% / -0,18R | 35,7% / +0,05R |

**Fazit:** Mit den gewählten Default-Parametern und exakt wie spezifiziert
zeigt dieses EA auf DE40 (15m wie 5m) eine **negative Expectancy** — deutlich
schwächer als B (+0,43R) und auch schwächer als A (+0,13R). Short-seitig etwas
weniger schlecht als Long. Bei 1:2 RRR liegt die Breakeven-Win-Rate bei ~33%
(vor BE-Effekten) — beide Timeframes bleiben klar darunter. Nicht live geschaltet.

**Nächste Schritte (falls User weiterverfolgen möchte):** Parameter-Sweep
(EMA-Länge, UT-Bot Key/ATR, SMI-Perioden) analog `sweep_a_params.mjs`/
`sweep_b_params.mjs`, bevor eine Umsetzung exakt wie spezifiziert nochmal
bewertet wird — oder Prüfung, ob SMI/EMA/UT-Bot als zusätzlicher Filter auf
bestehende A/B-Zonen-Entries (statt als eigenständige Trigger) eine bessere
Kombination ergibt.

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
├── backtests/strategy_c_momentum.mjs      # NEU (Teil 14): eigenständige Strategie C — Indikatoren+Backtest-Engine
├── backtests/de40_strategy_c_momentum.pine # NEU (Teil 14): Pine-Script-Version von Strategie C
├── backtests/sim_c_15m_results.json / sim_c_5m_results.json  # NEU (Teil 14): Backtest summary C (negative Expectancy)
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
