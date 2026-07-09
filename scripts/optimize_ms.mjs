#!/usr/bin/env node
/**
 * MS Optimization Script
 * - Liest aktuell gespeicherte 4H/1H/5m-Daten
 * - Detektiert MS mit vollständiger Begründung
 * - Zeigt Analyse vor Shape-Änderung an
 * - Bereitet Löschung aller alter MS vor
 * - Erstellt neue MS basierend auf aktueller Analyse
 */

import { readFileSync } from 'fs';
import * as lib from './premarket/lib.mjs';

const DATA_DIR = '/Users/boogy/tradingview-mcp/backtests';
const STATE_DIR = '/Users/boogy/tradingview-mcp/state';

function loadBars(timeframe) {
  const map = { '4h': 'data_4h.json', '1h': 'data_1h.json', '5m': 'data_15m.json' };
  const file = map[timeframe];
  if (!file) throw new Error(`Unknown timeframe: ${timeframe}`);

  try {
    const data = JSON.parse(readFileSync(`${DATA_DIR}/${file}`, 'utf8'));
    return data.bars || data;
  } catch (e) {
    console.error(`❌ Fehler beim Laden von ${timeframe}: ${e.message}`);
    return [];
  }
}

function formatSwings(bars, n = 2) {
  const { highs, lows } = lib.findSwings(bars, n);
  const alternating = [];
  const merged = [
    ...highs.map(h => ({ ...h, type: 'HH/LH' })),
    ...lows.map(l => ({ ...l, type: 'HL/LL' })),
  ].sort((a, b) => a.index - b.index);

  for (const p of merged) {
    const last = alternating[alternating.length - 1];
    if (last && last.type === p.type) {
      if ((p.type.includes('HH') && p.price > last.price) || (p.type.includes('LL') && p.price < last.price)) {
        alternating[alternating.length - 1] = p;
      }
    } else {
      alternating.push(p);
    }
  }

  return alternating.slice(-8); // Last 8 swings
}

function formatMs(ms, timeframe) {
  if (!ms || ms.status === 'none') {
    return `✅ ${timeframe}: Keine Market Shift`;
  }

  const arrow = ms.direction === 'bullish' ? '↑' : '↓';
  const status = ms.status === 'confirmed' ? '✅ BESTÄTIGT' : '⚠️ POTENZIELL';

  let details = `\n${status} (${timeframe} ${arrow})\n`;
  details += `- Richtung: ${ms.direction === 'bullish' ? 'Bullisch (aufwärts)' : 'Bärisch (abwärts)'}\n`;

  if (ms.status === 'confirmed') {
    details += `- Gebrochenes Level: ${ms.brokenLevel?.price?.toFixed(1) || 'N/A'}\n`;
    details += `- Bestätigt um: ${new Date(ms.break_time * 1000).toISOString()}\n`;
  } else if (ms.status === 'potential') {
    details += `- Durchbruch erfolgt: ${new Date(ms.break_time * 1000).toISOString()}\n`;
    details += `- Erwartet: ${ms.direction === 'bullish' ? 'HL' : 'LH'} über/unter ${ms.level?.toFixed(1) || 'N/A'}\n`;
    if (ms.unconfirmedTrendBreak) {
      details += `- Typ: Trend-Bruch (keine Swing-Bestätigung noch)`;
    }
  }

  return details;
}

function analyzeStructure(ms, bars, timeframe) {
  const alternating = formatSwings(bars);
  const recent = alternating.slice(-4);

  console.log(`\n═══ ${timeframe} STRUKTUR ANALYSE ═══`);
  console.log(`\nLetzte 4 Swing-Punkte:`);
  recent.forEach((p, i) => {
    const label = i === recent.length - 1 ? ' (AKTUELL)' : '';
    console.log(`  [${i + recent.length - 4}] ${p.type}: ${p.price.toFixed(1)}${label}`);
  });

  if (ms?.status === 'confirmed') {
    console.log(`\n📊 BESTÄTIGUNG: Zwei Swings gegen den alten Trend`);
    console.log(`   Gebrochenes Niveau wurde bestätigt durch ${ms.direction} Swing`);
  } else if (ms?.status === 'potential' && ms?.unconfirmedTrendBreak) {
    console.log(`\n⚠️ TREND-BRUCH ERKANNT:`);
    console.log(`   - Trend zeigte: LL/LH (bärisch) → HH (neuer High)`);
    console.log(`   - ABER: Nächster Low ist nicht höher (kein HL)`);
    console.log(`   - Erwartet: Bestätigung wenn Preis > ${ms.level?.toFixed(1)} geht`);
  } else if (ms?.status === 'potential') {
    console.log(`\n⏳ POTENZIELLES SETUP: Wartet auf Bestätigung`);
  }

  return { recent, analysis: true };
}

async function main() {
  console.log('🔍 MS OPTIMIERUNGS-ANALYSE\n');
  console.log(`Zeitstempel: ${new Date().toISOString()}\n`);

  // Load all timeframes
  const bars4h = loadBars('4h');
  const bars1h = loadBars('1h');
  const bars5m = loadBars('5m');

  if (!bars4h.length || !bars1h.length) {
    console.error('❌ Keine Daten gefunden. Bitte erst fetch_history_6m.mjs laufen lassen.');
    process.exit(1);
  }

  // Detect MS on each timeframe
  console.log('🔎 MARKET SHIFT DETEKTION:\n');

  const ms4h = lib.detectMarketShift(bars4h, 2);
  const ms1h = lib.detectMarketShift(bars1h, 2);
  const ms5m = bars5m.length >= 20 ? lib.detectMarketShift(bars5m, 2) : { status: 'none' };

  // Display results
  console.log('═══════════════════════════════════════════\n');
  console.log(formatMs(ms4h, '4H'));
  console.log(formatMs(ms1h, '1H'));
  console.log(formatMs(ms5m, '5m'));
  console.log('\n═══════════════════════════════════════════\n');

  // Apply confluence validation
  const confluenceResult1h = lib.validateMsConfluence(ms5m, ms1h);
  const confluenceResult4h = lib.validateMsConfluence(ms5m, ms4h);

  console.log('🔗 CONFLUENCE VALIDATION (LTF=5m als Primär-Signal)\n');
  console.log(`1H vs 5m: ${confluenceResult1h.reason}`);
  console.log(`4H vs 5m: ${confluenceResult4h.reason}`);
  console.log('\n═══════════════════════════════════════════\n');

  // Show what will be drawn
  console.log('📊 ZU ZEICHNENDE SHAPES:\n');
  if (confluenceResult1h.isConfluent && confluenceResult1h.htfMs.status !== 'none') {
    console.log(`✅ 1H MS: ${confluenceResult1h.htfMs.direction.toUpperCase()} (KONFORM mit 5m)`);
  } else if (!confluenceResult1h.isConfluent) {
    console.log(`❌ 1H MS: GELÖSCHT (nicht konform mit 5m)`);
  } else {
    console.log(`⊘ 1H MS: keine vorhanden`);
  }

  if (ms5m.status !== 'none') {
    console.log(`✅ 5m MS: ${ms5m.direction.toUpperCase()} (PRIMÄR-SIGNAL)`);
  } else {
    console.log(`⊘ 5m MS: keine vorhanden`);
  }

  console.log('\n═══════════════════════════════════════════\n');

  // Detailed structure analysis
  if (ms4h.status !== 'none') {
    analyzeStructure(ms4h, bars4h, '4H');
  }
  if (ms1h.status !== 'none') {
    analyzeStructure(ms1h, bars1h, '1H');
  }
  if (ms5m.status !== 'none') {
    analyzeStructure(ms5m, bars5m, '5m');
  }

  // Summary & action plan
  console.log('\n═══════════════════════════════════════════');
  console.log('\n📋 ZUSAMMENFASSUNG:\n');

  const activeMs = [
    { tf: '4H', ms: ms4h },
    { tf: '1H', ms: ms1h },
    { tf: '5m', ms: ms5m }
  ].filter(m => m.ms.status !== 'none');

  if (activeMs.length === 0) {
    console.log('✅ Keine Market Shifts aktiv\n');
    console.log('🎯 Aktion: check_market_shift.mjs lädt alle MS-Shapes');
  } else {
    console.log(`${activeMs.length} aktive Market Shift(s) gefunden:\n`);
    activeMs.forEach(({ tf, ms }) => {
      const type = ms.status === 'confirmed' ? '✅ BESTÄTIGT' : '⚠️ POTENZIELL';
      const direction = ms.direction === 'bullish' ? '↑ Bullisch' : '↓ Bärisch';
      console.log(`  • ${type} ${tf} - ${direction}`);
    });
    console.log('\n🎯 Aktion: Alle bestehenden MS-Shapes löschen und neu zeichnen');
  }

  console.log('\n═══════════════════════════════════════════\n');
  console.log('✅ Analyse abgeschlossen\n');
  console.log('📌 Nächster Schritt: npm run ms-optimize-live\n');

  // Return structured data for programmatic use
  process.exitCode = 0;
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
