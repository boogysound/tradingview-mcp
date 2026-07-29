# DE40 Pre-Market-Analyse — Ausführungsauftrag

Du bist eine frische Session ohne Erinnerung an vorherige Läufe. Führe die DE40
Pre-Market-Analyse GENAU nach diesem Ablauf aus. Die komplette fachliche
Spezifikation (Regime-Klassifikation, Swing/MSS/BOS-Regeln, OB/FVG/S-D/S-R-
Definitionen, Farbtabelle, Invalidierungsregeln) ist bereits vollständig als
Code implementiert unter `~/tradingview-mcp/scripts/premarket/`. Du musst diese
Logik NICHT neu herleiten — führe das Skript aus und interpretiere sein Ergebnis.

## Ablauf

1. Prüfe, ob TradingView Desktop mit aktivem Remote-Debugging-Port läuft:
   ```
   curl -s http://localhost:9222/json/version
   ```
   Falls das fehlschlägt: TradingView neu starten mit
   `~/tradingview-mcp/scripts/launch_tv_debug_mac.sh 9222` und 15 Sekunden warten.

2. Health-Check:
   ```
   cd ~/tradingview-mcp && node src/cli/index.js status
   ```
   Wenn `cdp_connected` nicht `true` ist: **Lauf abbrechen**, Fehlermeldung
   ausgeben, KEINE Platzhalter-Analyse liefern. Nicht weitermachen.

3. Prüfe, dass das Chart-Symbol DE40 zeigt (`chart_symbol` im obigen Status).
   Falls nicht DE40: nicht automatisch umschalten (Broker-Ticker könnten
   abweichen) — stattdessen im Briefing unter Punkt 1 vermerken und den Nutzer
   informieren, dass die Analyse trotzdem auf dem aktuell gezeigten Symbol lief.

4. Analyse-Pipeline ausführen:
   ```
   cd ~/tradingview-mcp && node scripts/premarket/run.mjs
   ```
   Dieses eine Kommando erledigt bereits: OHLC-Fetch für 12H/4H/1H/15min/Daily,
   Swing-/BOS-/OB-/FVG-/Zonen-/S-R-Berechnung, Regime-Klassifikation,
   Invalidierungs-Check gegen den bestehenden State (`state/zones.json`),
   gezieltes Entfernen invalidierter/veralteter Chart-Objekte, Zeichnen neuer
   Zonen in den vorgegebenen Farben, Speichern der Briefing-Datei unter
   `~/briefings/briefing_<datum>.md`, und Telegram-Versand (falls
   `~/.claude/telegram_token` und `~/.claude/telegram_chat_id` vorhanden sind —
   sonst wird das übersprungen und im JSON-Output vermerkt, das ist normal und
   kein Fehler, solange diese Dateien noch nicht angelegt wurden).

5. Lies die JSON-Ausgabe und den Briefing-Text aus dem Kommando-Output. Wenn
   `success: false` oder ein Absturz auftritt: Fehler klar benennen, NICHT
   improvisieren oder eine eigene Analyse "von Hand" nachliefern.

6. Gib das Briefing (Abschnitt "===== BRIEFING TEXT =====" im Output) als
   Antwort dieser Session aus — vollständig, unverändert. Wenn
   `dataWarnings` nicht leer ist, hebe das am Anfang deiner Antwort hervor
   (z.B. 15min-Datenausweichen auf 1H).

7. Wenn `telegramResult.sent === false`: erwähne kurz den Grund (fehlende
   Zugangsdaten), aber das ist kein Abbruchgrund — die Analyse selbst ist trotzdem
   vollständig gelaufen und in der State-Datei sowie am Chart sichtbar.

## Wichtig

- Keine Order-Ausführung, kein Broker-API-Zugriff — es existiert kein
  entsprechendes Tool. Diese Automatisierung liefert nur Analyse + Zeichnung +
  Briefing, keine Entry-Entscheidung.
- `~/tradingview-mcp/scripts/premarket/run.mjs` ist die alleinige Quelle der
  fachlichen Logik. Wenn das Skript einen Fehler wirft, behebe ihn nicht
  eigenmächtig mit geänderter Fachlogik — melde ihn stattdessen klar, damit er
  bewusst (nicht automatisiert) korrigiert werden kann.
- BOT_TOKEN/CHAT_ID niemals im Klartext in diese Datei oder in eine Antwort
  schreiben — sie werden ausschließlich aus den lokalen Dateien
  `~/.claude/telegram_token` (chmod 600) und `~/.claude/telegram_chat_id`
  gelesen.
