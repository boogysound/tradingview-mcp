#!/usr/bin/env node
/**
 * Wrapper für run.mjs: Startet TradingView automatisch, wenn keine Verbindung besteht.
 * Chart-API-Wartelogik lebt in ensureTradingViewReady() (utils.mjs) — geteilt
 * mit check_ms.mjs, damit beide Entry-Points dieselbe getestete Logik nutzen.
 *
 * Selbstheilung (06.08.2026, Teil 38): run.mjs läuft wiederholt (mittlerweile
 * mehrfach pro Woche, siehe Handover Teil 8/9/38) in einen TradingView/CDP-
 * Freeze — der CDP-Port bleibt erreichbar, aber die Seite reagiert nicht
 * mehr auf JS-Evaluate-Aufrufe. Bisher musste das jedes Mal manuell per
 * `pkill -9` + Retrigger behoben werden — inkl. mindestens 5 unbemerkt
 * fehlgeschlagenen evening-sync-Läufen in Folge (niemand triggert die
 * abends nach). run.mjs läuft jetzt als Kindprozess statt per `import()`,
 * damit dieser Wrapper seinen Exit-Code sehen kann: schlägt der erste
 * Versuch fehl, wird TradingView hart neu gestartet und EIN zweiter
 * Versuch unternommen (exakt die Handlung, die bisher jedes Mal manuell
 * ausgeführt wurde). Scheitert auch der (oder wird TradingView nach dem
 * Neustart gar nicht mehr rechtzeitig bereit — live beobachtet: ein Kaltstart
 * nach `pkill -9` kann länger als ensureTradingViewReady()s normale 60s
 * dauern), geht eine kurze Telegram-Warnung raus, damit ein ausgefallener
 * Lauf nicht mehr lautlos verschwindet.
 */
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { ensureTradingViewReady } from './utils.mjs';
import { sendTelegramBriefing } from './telegram.mjs';

const RUN_MJS_PATH = fileURLToPath(new URL('./run.mjs', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function runOnce() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [RUN_MJS_PATH], { stdio: 'inherit' });
    child.on('exit', (code) => resolve(code == null ? 1 : code));
    child.on('error', (e) => { console.error('❌ Konnte run.mjs nicht starten:', e.message); resolve(1); });
  });
}

async function sendFailureAlert(detail) {
  console.error(`\n❌ ${detail} — sende Telegram-Warnung.`);
  try {
    const alert = await sendTelegramBriefing(`⚠️ DE40-Briefing fehlgeschlagen: ${detail}`);
    console.error('Telegram-Fehleralarm:', JSON.stringify(alert));
  } catch (e) {
    console.error('Telegram-Fehleralarm selbst fehlgeschlagen:', e.message);
  }
}

// Cold start after a hard `pkill -9` can legitimately take longer than a
// warm reconnect's usual 60s budget (live beobachtet, 06.08.2026: erster
// Versuch nach Neustart warf "Chart-API nach 60s nicht bereit") — bis zu
// zwei volle Versuche statt einem, und ein Fehlschlag hier wird abgefangen
// statt den ganzen Wrapper über den äußeren catch abstürzen zu lassen.
async function restartTradingView() {
  console.log('\n♻️  TradingView-Neustart (Selbstheilung nach Fehlschlag)...');
  await new Promise((resolve) => {
    const kill = spawn('pkill', ['-9', '-f', 'TradingView']);
    kill.on('exit', resolve);
    kill.on('error', resolve);
  });
  await sleep(2000);

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      console.log(`🔍 Prüfe TradingView-Verbindung (Neustart-Versuch ${attempt}/2)...`);
      const health = await ensureTradingViewReady({ onLog: console.log });
      console.log('✅ TradingView online:');
      console.log('   Symbol:', health.chart_symbol);
      console.log('   Resolution:', health.chart_resolution);
      console.log('   API verfügbar:', health.api_available);
      return true;
    } catch (e) {
      console.error(`   Neustart-Versuch ${attempt}/2 fehlgeschlagen: ${e.message}`);
    }
  }
  return false;
}

async function main() {
  console.log('🔍 Prüfe TradingView-Verbindung...');
  const health = await ensureTradingViewReady({ onLog: console.log });
  console.log('✅ TradingView online:');
  console.log('   Symbol:', health.chart_symbol);
  console.log('   Resolution:', health.chart_resolution);
  console.log('   API verfügbar:', health.api_available);

  console.log('\n▶️  Starte run.mjs (Versuch 1/2)...\n');
  let code = await runOnce();
  // process.exit(0), not return — this wrapper's own CDP connection
  // (ensureTradingViewReady() above) leaves an open handle that otherwise
  // keeps the process alive indefinitely after main() resolves (found live,
  // 06.08.2026: a wrapper sat around for ~2h after successfully finishing,
  // never actually exiting — the OLD import()-based version never hit this
  // because run.mjs's own process.exit() killed the whole process; now that
  // run.mjs is a child, the parent needs its own explicit exit).
  if (code === 0) process.exit(0);

  console.error(`\n⚠️  run.mjs fehlgeschlagen (Exit ${code}) — versuche Selbstheilung.`);
  const restarted = await restartTradingView();
  if (!restarted) {
    await sendFailureAlert('TradingView kam nach dem Neustart nicht rechtzeitig wieder online. Bitte manuell prüfen.');
    process.exit(1);
  }

  console.log('\n▶️  Starte run.mjs (Versuch 2/2, nach TradingView-Neustart)...\n');
  code = await runOnce();
  if (code === 0) process.exit(0);

  await sendFailureAlert(`run.mjs auch nach Neustart fehlgeschlagen (Exit ${code}, 2 Versuche insgesamt).`);
  process.exit(1);
}

main().catch(async (err) => {
  console.error('❌ Unerwarteter Fehler im Wrapper selbst:', err.stack || err.message);
  await sendFailureAlert(`Wrapper-Absturz: ${err.message}`);
  process.exit(1);
});
