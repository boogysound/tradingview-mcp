import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';

/**
 * B-Parameter-Sweep
 * Testet verschiedene SL-Buffer und Target-Multiplier Kombinationen
 * und gibt die Performance-Unterschiede aus.
 */

const BRIEFING_PATH = '../scripts/premarket/briefing.mjs';
const SIM_SCRIPT = 'sim_6m.mjs';
const RESULTS_FILE = 'sim_6m_results_60min.json';

const PARAMETERS = [
  { name: 'AGGRESSIV', slBuffer: 0.0021, targetMult: 3.5 },
  { name: 'BALANCED (current)', slBuffer: 0.0018, targetMult: 3.0 },
  { name: 'KONSERVATIV', slBuffer: 0.0015, targetMult: 2.5 },
];

const results = [];

for (const param of PARAMETERS) {
  console.log(`\n🔄 Teste: ${param.name} (SL=${param.slBuffer}, Target=${param.targetMult}×)...`);

  // Lies briefing.mjs
  let briefingCode = fs.readFileSync(BRIEFING_PATH, 'utf8');

  // Ersetze B-Parameter
  const slLine = `const buffer = Math.abs(nearestCounter) * ${param.slBuffer};`;
  const targetLine = `const targets = [bull ? nearestCounter + ${param.targetMult} * slDist : nearestCounter - ${param.targetMult} * slDist];`;

  briefingCode = briefingCode
    .replace(/const buffer = Math\.abs\(nearestCounter\) \* 0\.0018;/, slLine)
    .replace(/const targets = \[bull \? nearestCounter \+ 3 \* slDist : nearestCounter - 3 \* slDist\];/, targetLine);

  // Schreib modifizierte Version
  fs.writeFileSync(BRIEFING_PATH, briefingCode, 'utf8');

  // Führe Backtest aus
  try {
    execSync(`node ${SIM_SCRIPT}`, { cwd: './backtests', stdio: 'pipe' });
    const backtest_result = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
    const b_perf = backtest_result.byType.counter_trend;

    results.push({
      params: param,
      winRate: b_perf.winRate.toFixed(1),
      expR: b_perf.expR.toFixed(2),
      avgWinRR: b_perf.avgWinRR.toFixed(2),
    });

    console.log(`  ✅ WR=${b_perf.winRate.toFixed(1)}% | ExpR=${b_perf.expR.toFixed(2)}R`);
  } catch (e) {
    console.log(`  ❌ Fehler beim Ausführen des Backtests`);
  }
}

// Restore original
console.log(`\n🔄 Stelle original briefing.mjs wieder her...`);
execSync('git checkout ' + BRIEFING_PATH, { cwd: '..', stdio: 'pipe' }).catch(() => {});

// Ausgabe
console.log('\n\n📊 B-PARAMETER-SWEEP ERGEBNISSE:');
console.log('==================================');
results.forEach((r, i) => {
  console.log(`\n${i + 1}. ${r.params.name}`);
  console.log(`   SL-Buffer: ${r.params.slBuffer.toFixed(4)}, Target: ${r.params.targetMult}×`);
  console.log(`   WR: ${r.winRate}% | ExpR: ${r.expR}R | AvgWinRR: ${r.avgWinRR}`);
});

const best = results.reduce((a, b) => parseFloat(b.expR) - parseFloat(a.expR) > 0 ? b : a);
console.log(`\n🏆 BESTE VARIANTE: ${best.params.name}`);
console.log(`   +${best.expR}R ExpR (war: +1.37R)`);
