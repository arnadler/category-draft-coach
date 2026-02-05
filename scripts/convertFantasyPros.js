#!/usr/bin/env node
/**
 * Converts FantasyPros CSV projections to the app's players.json format.
 *
 * Usage: node scripts/convertFantasyPros.js
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const hittersPath = path.join(projectRoot, 'FantasyPros_2026_Projections_H.csv');
const pitchersPath = path.join(projectRoot, 'FantasyPros_2026_Projections_P.csv');
const outputPath = path.join(projectRoot, 'src/data/players.json');

// Simple CSV parser
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === '\r') continue;
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\n') {
      row.push(field);
      field = '';
      if (row.some(cell => cell.trim().length > 0)) rows.push(row);
      row = [];
      continue;
    }
    field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some(cell => cell.trim().length > 0)) rows.push(row);
  }

  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map(cells => {
    const obj = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = (cells[i] || '').trim();
    }
    return obj;
  });
}

// Normalize positions: LF/CF/RF -> OF, keep C/1B/2B/3B/SS/DH/SP/RP
function normalizePositions(posStr) {
  if (!posStr) return [];
  const parts = posStr.split(/[,/]+/).map(p => p.trim().toUpperCase());
  const normalized = [];
  const seen = new Set();

  for (const pos of parts) {
    let mapped = pos;
    if (pos === 'LF' || pos === 'CF' || pos === 'RF') {
      mapped = 'OF';
    }
    if (!seen.has(mapped) && ['C', '1B', '2B', '3B', 'SS', 'OF', 'DH', 'SP', 'RP'].includes(mapped)) {
      seen.add(mapped);
      normalized.push(mapped);
    }
  }
  return normalized;
}

// Parse number, handling empty strings
function num(val) {
  if (val == null || val === '') return undefined;
  const n = parseFloat(val.replace(/,/g, ''));
  return isFinite(n) ? n : undefined;
}

// Determine if player is pitcher based on positions
function isPitcher(positions) {
  return positions.includes('SP') || positions.includes('RP');
}

// Convert hitter row to Player object
function convertHitter(row, index) {
  const positions = normalizePositions(row.Positions);
  // Skip if this is primarily a pitcher (like Ohtani in hitters file with SP position)
  // Actually, keep them as hitters if they appear in hitters file

  return {
    playerId: `h${String(index + 1).padStart(3, '0')}`,
    name: row.Player,
    team: row.Team,
    positions: positions.length > 0 ? positions.filter(p => !['SP', 'RP'].includes(p)) : ['DH'],
    hitterOrPitcher: 'hitter',
    AB: num(row.AB),
    H: num(row.H),
    R: num(row.R),
    HR: num(row.HR),
    RBI: num(row.RBI),
    SB: num(row.SB),
    BB: num(row.BB),
    AVG: num(row.AVG),
    OBP: num(row.OBP),
    // Use row index as a rough ADP proxy (file is sorted by projected value)
    ADP: index + 1,
    overallRank: index + 1,
  };
}

// Convert pitcher row to Player object
function convertPitcher(row, index, hitterNames) {
  const positions = normalizePositions(row.Positions);
  const pitcherPositions = positions.filter(p => ['SP', 'RP'].includes(p));

  // Skip if this player is already in hitters (like Ohtani) - they're primarily hitters
  if (hitterNames.has(row.Player)) {
    console.log(`Skipping ${row.Player} from pitchers (already in hitters)`);
    return null;
  }

  return {
    playerId: `p${String(index + 1).padStart(3, '0')}`,
    name: row.Player,
    team: row.Team,
    positions: pitcherPositions.length > 0 ? pitcherPositions : ['SP'],
    hitterOrPitcher: 'pitcher',
    W: num(row.W),
    SV: num(row.SV),
    K: num(row.K),
    IP: num(row.IP),
    ER: num(row.ER),
    HA: num(row.H),  // Hits allowed
    BBA: num(row.BB), // Walks allowed
    ERA: num(row.ERA),
    WHIP: num(row.WHIP),
    // ADP offset by number of hitters
    ADP: index + 1,
    overallRank: index + 1,
  };
}

// Main
function main() {
  console.log('Reading CSV files...');

  const hittersRaw = fs.readFileSync(hittersPath, 'utf-8');
  const pitchersRaw = fs.readFileSync(pitchersPath, 'utf-8');

  const hittersData = parseCsv(hittersRaw);
  const pitchersData = parseCsv(pitchersRaw);

  console.log(`Found ${hittersData.length} hitters, ${pitchersData.length} pitchers`);

  // Convert hitters
  const hitters = hittersData.map((row, i) => convertHitter(row, i));
  const hitterNames = new Set(hitters.map(h => h.name));

  // Convert pitchers (skip duplicates from hitters file)
  let pitcherIndex = 0;
  const pitchers = [];
  for (const row of pitchersData) {
    const pitcher = convertPitcher(row, pitcherIndex, hitterNames);
    if (pitcher) {
      pitchers.push(pitcher);
      pitcherIndex++;
    }
  }

  // Combine and sort by a composite ranking
  // Interleave hitters and pitchers roughly by their file order
  const combined = [...hitters, ...pitchers];

  // Reassign overall ranks based on combined order
  combined.forEach((player, i) => {
    player.overallRank = i + 1;
  });

  console.log(`Writing ${combined.length} players to ${outputPath}`);
  fs.writeFileSync(outputPath, JSON.stringify(combined, null, 2));

  console.log('Done!');
}

main();
