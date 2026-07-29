/**
 * Full-confluence ("alle Signale grün") Telegram alert — shared by run.mjs
 * (twice-daily full run) and check_scenarios.mjs (frequent standalone check).
 * Mirrors ms_alerts.mjs's signature-based dedup: a scenario that stays fully
 * green does not re-alert every run just because time passed, only when it
 * first reaches (or changes within) full confluence.
 *
 * User-specified, 28.07.2026: root cause of "no all-green Telegram message
 * in days" was that 3 of Scenario B's 5 checklist items were hardcoded
 * `met: false` stubs (see buildScenarios in briefing.mjs) — full confluence
 * was structurally impossible before that fix. Once wired to real detection,
 * a full-confluence moment can form and fade well within the twice-daily
 * run.mjs cadence (09:20/22:00), so this needs its own frequent, independent
 * check — same idea as check_ms.mjs for Market Shifts.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { describeScenario } from './briefing.mjs';
import { sendTelegramBriefing } from './telegram.mjs';

const SCENARIO_ALERTS_STATE_PATH = '/Users/boogy/tradingview-mcp/state/scenario_alerts.json';

function signatureOf(s) {
  return `${s.type}|${s.direction}|${s.zonePrice.toFixed(1)}|${s.metCount}/${s.totalCount}`;
}

export async function checkAndAlertFullConfluence(scenarios) {
  mkdirSync('/Users/boogy/tradingview-mcp/state', { recursive: true });
  const alertsState = existsSync(SCENARIO_ALERTS_STATE_PATH) ? JSON.parse(readFileSync(SCENARIO_ALERTS_STATE_PATH, 'utf8')) : {};
  const telegramResults = [];
  let alertsSent = 0;

  for (const s of scenarios || []) {
    if (s.metCount < s.totalCount) continue;
    const key = `${s.type}_${s.direction}`;
    const sig = signatureOf(s);
    if (alertsState[key] === sig) continue;
    alertsState[key] = sig;
    try {
      const text = `🟢🟢 ALLE SIGNALE ERFÜLLT 🟢🟢\n\n${describeScenario(s)}`;
      const r = await sendTelegramBriefing(text);
      telegramResults.push({ type: s.type, direction: s.direction, ...r });
      alertsSent++;
    } catch (e) {
      telegramResults.push({ type: s.type, direction: s.direction, sent: false, error: e.message });
    }
  }
  writeFileSync(SCENARIO_ALERTS_STATE_PATH, JSON.stringify(alertsState, null, 2));
  return { alertsSent, telegramResults };
}
