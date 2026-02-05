/**
 * Core data types for Category Draft Coach.
 *
 * To swap in a full projection dataset later, just replace the JSON file
 * in src/data/players.json matching this Player interface shape.
 * The app auto-maps fields on load. For CSV import, the column-mapper
 * in the settings modal handles custom headers.
 */

// ── Player & Projections ──────────────────────────────────────────

export interface Player {
  playerId: string;
  name: string;
  team: string;
  /** e.g. ["C","1B"] or ["SP","RP"] */
  positions: string[];
  hitterOrPitcher: "hitter" | "pitcher";

  // Hitter projections
  AB?: number;
  H?: number;
  R?: number;
  HR?: number;
  RBI?: number;
  SB?: number;
  BB?: number;
  HBP?: number;
  SF?: number;
  // Pre-computed rate stats (used if raw counting stats are missing)
  AVG?: number;
  OBP?: number;

  // Pitcher projections
  W?: number;
  SV?: number;
  K?: number;
  IP?: number;
  ER?: number;
  /** Hits allowed — for pitcher WHIP calc */
  HA?: number;
  /** Walks allowed */
  BBA?: number;
  ERA?: number;
  WHIP?: number;
  QS?: number;
  HLD?: number;

  // Meta
  ADP?: number;
  overallRank?: number;
  /** 0-1 risk factor; 0 = safest. Default 0.3 */
  risk?: number;
}

// ── Roster ─────────────────────────────────────────────────────────

export interface RosterSlot {
  id: string;
  /** Display label like "C", "OF1", "SP1" */
  label: string;
  /** Which positions qualify for this slot. UTIL = any hitter. P = any pitcher. BN = any. */
  eligiblePositions: string[];
  player: Player | null;
}

export interface RosterConfig {
  slots: { label: string; eligiblePositions: string[] }[];
}

// ── Categories ────────────────────────────────────────────────────

export type CategoryDirection = "higher" | "lower";

export interface CategoryDef {
  key: string;
  label: string;
  /** "higher" for counting stats, "lower" for ERA/WHIP */
  direction: CategoryDirection;
  enabled: boolean;
  type: "hitter" | "pitcher";
}

// ── League Settings ───────────────────────────────────────────────

export interface LeagueSettings {
  numTeams: number;
  categories: CategoryDef[];
  rosterConfig: RosterConfig;
  /** Target totals per category for a "winning" roster. Used as z-score anchors. */
  targets: Record<string, number>;
  /** Whether to use OBP instead of AVG */
  useOBP: boolean;
  /** Bench players count at a discounted rate in projections (0-1). */
  benchMultiplier: number;
  /** Weight boost threshold: categories below this z-score get extra emphasis. */
  competitiveThresholdZ: number;
}

// ── Draft State ───────────────────────────────────────────────────

export interface DraftPick {
  playerId: string;
  /** Optional: round number (1-based). */
  round?: number;
  /** Optional: overall draft pick number (1-based). */
  overallPick?: number;
  timestamp: number;
}

export interface DraftState {
  myPicks: DraftPick[];
  /** Other teams' picks (just to remove from pool) */
  otherPicks: string[];
  /** Risk slider: 0 = conservative, 1 = aggressive */
  riskTolerance: number;
}

// ── Recommendation ────────────────────────────────────────────────

export interface Recommendation {
  player: Player;
  /** Total marginal z-score gain */
  totalZGain: number;
  /** Per-category z-score change */
  categoryImpact: Record<string, { before: number; after: number; delta: number }>;
  /** Per-category raw stat change (same category keys as categoryImpact). */
  rawImpact: Record<string, { before: number; after: number; delta: number }>;
  /** Human-readable reason */
  explanation: string;
  /** Position fit note */
  positionNote: string;
}
