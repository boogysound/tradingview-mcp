/**
 * Scenario-entry Telegram alerts — shared by run.mjs (twice-daily full run)
 * and check_scenarios.mjs (frequent standalone check). Signature-based
 * dedup (not time-based): a scenario that stays in the same state does not
 * re-alert every run just because time passed, only when it first appears
 * or its confluence count changes.
 *
 * User-specified, 28.07.2026: root cause of "no all-green Telegram message
 * in days" was that 3 of Scenario B's 5 checklist items were hardcoded
 * `met: false` stubs (see buildScenarios in briefing.mjs) — full confluence
 * was structurally impossible before that fix. Once wired to real detection,
 * a full-confluence moment can form and fade well within the twice-daily
 * run.mjs cadence (09:20/22:00), so this needs its own frequent, independent
 * check — same idea as check_ms.mjs for Market Shifts.
 *
 * Widened 29.07.2026 (Teil 12, user-specified): originally only alerted at
 * FULL confluence (metCount === totalCount) — but any scenario with a
 * computed target (`targets[0] != null`) is a live, actionable setup even
 * before full confluence. Now alerts on every scenario that has a drawable
 * target, with a lighter "🔹 POTENZIELLER ENTRY" header + confluence
 * checklist below full confluence, and the original "🟢🟢 ALLE SIGNALE
 * ERFÜLLT 🟢🟢" header once it reaches 100%. The signature includes
 * metCount/totalCount, so a confluence change (in either direction) sends a
 * fresh message with the updated checklist — matching "immer potenzielle
 * Entries" rather than a one-time notification that goes stale.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { describeScenario } from './briefing.mjs';
import { sendTelegramBriefing } from './telegram.mjs';

const SCENARIO_ALERTS_STATE_PATH = '/Users/boogy/tradingview-mcp/state/scenario_alerts.json';

function signatureOf(s) {
  return `${s.type}|${s.direction}|${s.zonePrice.toFixed(1)}|${s.metCount}/${s.totalCount}`;
}

export async function checkAndAlertScenarioEntries(scenarios) {
  mkdirSync('/Users/boogy/tradingview-mcp/state', { recursive: true });
  const alertsState = existsSync(SCENARIO_ALERTS_STATE_PATH) ? JSON.parse(readFileSync(SCENARIO_ALERTS_STATE_PATH, 'utf8')) : {};
  const telegramResults = [];
  let alertsSent = 0;

  for (const s of scenarios || []) {
    // Only scenarios with a computed target are actionable enough to alert on.
    if (s.targets[0] == null) continue;
    const key = `${s.type}_${s.direction}`;
    const sig = signatureOf(s);
    if (alertsState[key] === sig) continue;
    alertsState[key] = sig;
    try {
      const header = s.metCount >= s.totalCount ? '🟢🟢 ALLE SIGNALE ERFÜLLT 🟢🟢' : `🔹 POTENZIELLER ENTRY (${s.metCount}/${s.totalCount})`;
      const text = `${header}\n\n${describeScenario(s)}`;
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
