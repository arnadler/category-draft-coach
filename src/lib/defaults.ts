/**
 * Default league settings, roster configuration, and category targets.
 * These represent a standard 12-team 5x5/6x6 rotisserie league.
 */

import { CategoryDef, LeagueSettings, RosterConfig } from "./types";

// ── Default Categories ────────────────────────────────────────────

export const DEFAULT_HITTER_CATEGORIES: CategoryDef[] = [
  { key: "R", label: "Runs", direction: "higher", enabled: true, type: "hitter" },
  { key: "HR", label: "Home Runs", direction: "higher", enabled: true, type: "hitter" },
  { key: "RBI", label: "RBI", direction: "higher", enabled: true, type: "hitter" },
  { key: "NSB", label: "Net Steals", direction: "higher", enabled: true, type: "hitter" },
  { key: "AVG", label: "Batting Avg", direction: "higher", enabled: true, type: "hitter" },
  { key: "SLG", label: "Slugging Pct", direction: "higher", enabled: true, type: "hitter" },
  { key: "OBP", label: "On-Base Pct", direction: "higher", enabled: false, type: "hitter" },
  { key: "SB", label: "Stolen Bases", direction: "higher", enabled: false, type: "hitter" },
];

export const DEFAULT_PITCHER_CATEGORIES: CategoryDef[] = [
  { key: "K", label: "Strikeouts", direction: "higher", enabled: true, type: "pitcher" },
  { key: "QS", label: "Quality Starts", direction: "higher", enabled: true, type: "pitcher" },
  { key: "ERA", label: "ERA", direction: "lower", enabled: true, type: "pitcher" },
  { key: "WHIP", label: "WHIP", direction: "lower", enabled: true, type: "pitcher" },
  { key: "KBB", label: "K/BB", direction: "higher", enabled: true, type: "pitcher" },
  { key: "NSVH", label: "SV+H-BSV", direction: "higher", enabled: true, type: "pitcher" },
  { key: "W", label: "Wins", direction: "higher", enabled: false, type: "pitcher" },
  { key: "SV", label: "Saves", direction: "higher", enabled: false, type: "pitcher" },
  { key: "HLD", label: "Holds", direction: "higher", enabled: false, type: "pitcher" },
];

// ── Default Roster ────────────────────────────────────────────────

export const DEFAULT_ROSTER_CONFIG: RosterConfig = {
  slots: [
    { label: "C", eligiblePositions: ["C"] },
    { label: "1B", eligiblePositions: ["1B"] },
    { label: "2B", eligiblePositions: ["2B"] },
    { label: "3B", eligiblePositions: ["3B"] },
    { label: "SS", eligiblePositions: ["SS"] },
    { label: "OF1", eligiblePositions: ["OF"] },
    { label: "OF2", eligiblePositions: ["OF"] },
    { label: "OF3", eligiblePositions: ["OF"] },
    { label: "UTIL", eligiblePositions: ["C", "1B", "2B", "3B", "SS", "OF", "DH"] },
    { label: "SP1", eligiblePositions: ["SP"] },
    { label: "SP2", eligiblePositions: ["SP"] },
    { label: "SP3", eligiblePositions: ["SP"] },
    { label: "SP4", eligiblePositions: ["SP"] },
    { label: "RP1", eligiblePositions: ["RP"] },
    { label: "RP2", eligiblePositions: ["RP"] },
    { label: "P", eligiblePositions: ["SP", "RP"] },
    { label: "BN1", eligiblePositions: ["C", "1B", "2B", "3B", "SS", "OF", "DH", "SP", "RP"] },
    { label: "BN2", eligiblePositions: ["C", "1B", "2B", "3B", "SS", "OF", "DH", "SP", "RP"] },
    { label: "BN3", eligiblePositions: ["C", "1B", "2B", "3B", "SS", "OF", "DH", "SP", "RP"] },
    { label: "BN4", eligiblePositions: ["C", "1B", "2B", "3B", "SS", "OF", "DH", "SP", "RP"] },
    { label: "BN5", eligiblePositions: ["C", "1B", "2B", "3B", "SS", "OF", "DH", "SP", "RP"] },
    { label: "BN6", eligiblePositions: ["C", "1B", "2B", "3B", "SS", "OF", "DH", "SP", "RP"] },
    { label: "BN7", eligiblePositions: ["C", "1B", "2B", "3B", "SS", "OF", "DH", "SP", "RP"] },
    { label: "BN8", eligiblePositions: ["C", "1B", "2B", "3B", "SS", "OF", "DH", "SP", "RP"] },
    { label: "BN9", eligiblePositions: ["C", "1B", "2B", "3B", "SS", "OF", "DH", "SP", "RP"] },
    { label: "BN10", eligiblePositions: ["C", "1B", "2B", "3B", "SS", "OF", "DH", "SP", "RP"] },
    { label: "BN11", eligiblePositions: ["C", "1B", "2B", "3B", "SS", "OF", "DH", "SP", "RP"] },
    { label: "BN12", eligiblePositions: ["C", "1B", "2B", "3B", "SS", "OF", "DH", "SP", "RP"] },
  ],
};

// ── Target Totals ─────────────────────────────────────────────────
// These are reasonable "aim for" totals for a competitive roster in
// a 12-team league. They serve as the mean in z-score calculations.
// Users can adjust these in the settings modal.

export const DEFAULT_TARGETS: Record<string, number> = {
  R: 800,
  HR: 200,
  RBI: 780,
  SB: 110,
  NSB: 80,
  AVG: 0.262,
  SLG: 0.440,
  OBP: 0.335,
  W: 65,
  SV: 70,
  K: 1100,
  ERA: 3.80,
  WHIP: 1.20,
  QS: 70,
  KBB: 3.20,
  NSVH: 55,
  HLD: 55,
};

// ── Standard Deviations (estimated across 12 teams) ───────────────
// Used in z-score calculations. These approximate the spread
// of full-season totals across teams.

export const DEFAULT_STDEVS: Record<string, number> = {
  R: 60,
  HR: 28,
  RBI: 55,
  SB: 28,
  NSB: 25,
  AVG: 0.010,
  SLG: 0.025,
  OBP: 0.010,
  W: 10,
  SV: 18,
  K: 110,
  ERA: 0.35,
  WHIP: 0.05,
  QS: 10,
  KBB: 0.50,
  NSVH: 18,
  HLD: 14,
};

// ── Full Default Settings ─────────────────────────────────────────

export const DEFAULT_LEAGUE_SETTINGS: LeagueSettings = {
  numTeams: 11,
  categories: [...DEFAULT_HITTER_CATEGORIES, ...DEFAULT_PITCHER_CATEGORIES],
  rosterConfig: DEFAULT_ROSTER_CONFIG,
  targets: { ...DEFAULT_TARGETS },
  useOBP: false,
  benchMultiplier: 0.2,
  competitiveThresholdZ: 0,
};
