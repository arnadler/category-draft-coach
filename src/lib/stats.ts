/**
 * Statistical calculations for roster projections.
 *
 * Handles both counting stats (sum) and rate stats (weighted average
 * using proper denominators like AB, IP).
 */

import { Player, CategoryDef } from "./types";

// ── Aggregate roster stats ────────────────────────────────────────

export interface RosterTotals {
  // Hitter counting
  R: number;
  HR: number;
  RBI: number;
  SB: number;
  // Hitter denominators (for rate stats)
  AB: number;
  H: number;
  BB: number;
  HBP: number;
  SF: number;
  // Hitter rate stats (computed)
  AVG: number;
  OBP: number;
  // Pitcher counting
  W: number;
  SV: number;
  K: number;
  QS: number;
  HLD: number;
  // Pitcher denominators
  IP: number;
  ER: number;
  HA: number;
  BBA: number;
  // Pitcher rate stats (computed)
  ERA: number;
  WHIP: number;
}

/**
 * Compute aggregate totals from a list of players.
 * Rate stats are computed correctly from component stats.
 */
export function computeRosterTotals(players: Player[]): RosterTotals {
  const hitters = players.filter((p) => p.hitterOrPitcher === "hitter");
  const pitchers = players.filter((p) => p.hitterOrPitcher === "pitcher");

  // Sum hitter counting stats
  const AB = hitters.reduce((s, p) => s + (p.AB ?? 0), 0);
  const H = hitters.reduce((s, p) => s + (p.H ?? 0), 0);
  const R = hitters.reduce((s, p) => s + (p.R ?? 0), 0);
  const HR = hitters.reduce((s, p) => s + (p.HR ?? 0), 0);
  const RBI = hitters.reduce((s, p) => s + (p.RBI ?? 0), 0);
  const SB = hitters.reduce((s, p) => s + (p.SB ?? 0), 0);
  const BB = hitters.reduce((s, p) => s + (p.BB ?? 0), 0);
  const HBP = hitters.reduce((s, p) => s + (p.HBP ?? 0), 0);
  const SF = hitters.reduce((s, p) => s + (p.SF ?? 0), 0);

  // Compute rate stats from components (not averaging averages)
  const AVG = AB > 0 ? H / AB : 0;
  // OBP = (H + BB + HBP) / (AB + BB + HBP + SF)
  const obpDenom = AB + BB + HBP + SF;
  const OBP = obpDenom > 0 ? (H + BB + HBP) / obpDenom : 0;

  // Sum pitcher counting stats
  const IP = pitchers.reduce((s, p) => s + (p.IP ?? 0), 0);
  const ER = pitchers.reduce((s, p) => s + (p.ER ?? 0), 0);
  const HA = pitchers.reduce((s, p) => s + (p.HA ?? 0), 0);
  const BBA = pitchers.reduce((s, p) => s + (p.BBA ?? 0), 0);
  const W = pitchers.reduce((s, p) => s + (p.W ?? 0), 0);
  const SV = pitchers.reduce((s, p) => s + (p.SV ?? 0), 0);
  const K = pitchers.reduce((s, p) => s + (p.K ?? 0), 0);
  const QS = pitchers.reduce((s, p) => s + (p.QS ?? 0), 0);
  const HLD = pitchers.reduce((s, p) => s + (p.HLD ?? 0), 0);

  // ERA = (ER * 9) / IP
  const ERA = IP > 0 ? (ER * 9) / IP : 0;
  // WHIP = (BB + H) / IP  (pitcher BB and H)
  const WHIP = IP > 0 ? (BBA + HA) / IP : 0;

  return {
    R, HR, RBI, SB, AB, H, BB, HBP, SF, AVG, OBP,
    W, SV, K, QS, HLD, IP, ER, HA, BBA, ERA, WHIP,
  };
}

/**
 * Compute totals from an already-assigned roster (slots).
 * Bench slots are counted at a discounted multiplier (settings.benchMultiplier).
 */
export function computeRosterTotalsFromSlots(
  slots: { label: string; player: Player | null }[],
  benchMultiplier: number
): RosterTotals {
  const hitters: Array<{ p: Player; m: number }> = [];
  const pitchers: Array<{ p: Player; m: number }> = [];

  for (const slot of slots) {
    const player = slot.player;
    if (!player) continue;
    const m = slot.label.toUpperCase().startsWith("BN") ? benchMultiplier : 1;
    if (player.hitterOrPitcher === "hitter") hitters.push({ p: player, m });
    else pitchers.push({ p: player, m });
  }

  const AB = hitters.reduce((s, { p, m }) => s + (p.AB ?? 0) * m, 0);
  const H = hitters.reduce((s, { p, m }) => s + (p.H ?? 0) * m, 0);
  const R = hitters.reduce((s, { p, m }) => s + (p.R ?? 0) * m, 0);
  const HR = hitters.reduce((s, { p, m }) => s + (p.HR ?? 0) * m, 0);
  const RBI = hitters.reduce((s, { p, m }) => s + (p.RBI ?? 0) * m, 0);
  const SB = hitters.reduce((s, { p, m }) => s + (p.SB ?? 0) * m, 0);
  const BB = hitters.reduce((s, { p, m }) => s + (p.BB ?? 0) * m, 0);
  const HBP = hitters.reduce((s, { p, m }) => s + (p.HBP ?? 0) * m, 0);
  const SF = hitters.reduce((s, { p, m }) => s + (p.SF ?? 0) * m, 0);

  const AVG = AB > 0 ? H / AB : 0;
  const obpDenom = AB + BB + HBP + SF;
  // If SF/HBP not available in dataset, these default to 0 and we get simplified OBP.
  const OBP = obpDenom > 0 ? (H + BB + HBP) / obpDenom : 0;

  const IP = pitchers.reduce((s, { p, m }) => s + (p.IP ?? 0) * m, 0);
  const ER = pitchers.reduce((s, { p, m }) => s + (p.ER ?? 0) * m, 0);
  const HA = pitchers.reduce((s, { p, m }) => s + (p.HA ?? 0) * m, 0);
  const BBA = pitchers.reduce((s, { p, m }) => s + (p.BBA ?? 0) * m, 0);
  const W = pitchers.reduce((s, { p, m }) => s + (p.W ?? 0) * m, 0);
  const SV = pitchers.reduce((s, { p, m }) => s + (p.SV ?? 0) * m, 0);
  const K = pitchers.reduce((s, { p, m }) => s + (p.K ?? 0) * m, 0);
  const QS = pitchers.reduce((s, { p, m }) => s + (p.QS ?? 0) * m, 0);
  const HLD = pitchers.reduce((s, { p, m }) => s + (p.HLD ?? 0) * m, 0);

  const ERA = IP > 0 ? (ER * 9) / IP : 0;
  const WHIP = IP > 0 ? (BBA + HA) / IP : 0;

  return {
    R,
    HR,
    RBI,
    SB,
    AB,
    H,
    BB,
    HBP,
    SF,
    AVG,
    OBP,
    W,
    SV,
    K,
    QS,
    HLD,
    IP,
    ER,
    HA,
    BBA,
    ERA,
    WHIP,
  };
}

/**
 * Get the value for a specific category from roster totals.
 */
export function getCategoryValue(totals: RosterTotals, catKey: string): number {
  return (totals as unknown as Record<string, number>)[catKey] ?? 0;
}

// ── Z-score helpers for rate stats ────────────────────────────────
// During the draft, your roster may have tiny AB/IP. Raw rate stats (AVG/ERA/etc)
// can swing wildly and also behave badly at 0 AB / 0 IP. We stabilize rate stats
// toward the league mean using a small "prior" denominator so recommendations
// don't become irrational (e.g. no pitchers because ERA starts at 0.00).

const RATE_PRIORS = {
  hitterAB: 1000, // roughly 15–20% of a full roster's AB
  pitcherIP: 200, // roughly 10–15% of a full staff's IP
} as const;

const RATE_FULL_THRESHOLDS = {
  // Above these, treat the roster as "stable enough" to use raw rates.
  hitterAB: 3500,
  pitcherIP: 900,
} as const;

/**
 * Category value used for z-score calculations.
 *
 * For rate stats, returns a stabilized value that shrinks toward `mean` when
 * denominators are small or zero.
 */
export function getCategoryValueForZ(
  totals: RosterTotals,
  catKey: string,
  mean: number
): number {
  if (catKey === "AVG") {
    const AB = totals.AB;
    const H = totals.H;
    if (AB <= 0) return mean;
    if (AB >= RATE_FULL_THRESHOLDS.hitterAB) return totals.AVG;
    const priorAB = RATE_PRIORS.hitterAB;
    return (H + mean * priorAB) / (AB + priorAB);
  }

  if (catKey === "OBP") {
    const num = totals.H + totals.BB + totals.HBP;
    const denom = totals.AB + totals.BB + totals.HBP + totals.SF;
    if (denom <= 0) return mean;
    if (denom >= RATE_FULL_THRESHOLDS.hitterAB) return totals.OBP;
    const priorPA = RATE_PRIORS.hitterAB;
    return (num + mean * priorPA) / (denom + priorPA);
  }

  if (catKey === "ERA") {
    const IP = totals.IP;
    const ER = totals.ER;
    if (IP <= 0) return mean;
    if (IP >= RATE_FULL_THRESHOLDS.pitcherIP) return totals.ERA;
    const priorIP = RATE_PRIORS.pitcherIP;
    const priorER = (mean * priorIP) / 9;
    return ((ER + priorER) * 9) / (IP + priorIP);
  }

  if (catKey === "WHIP") {
    const IP = totals.IP;
    const baserunners = totals.BBA + totals.HA;
    if (IP <= 0) return mean;
    if (IP >= RATE_FULL_THRESHOLDS.pitcherIP) return totals.WHIP;
    const priorIP = RATE_PRIORS.pitcherIP;
    return (baserunners + mean * priorIP) / (IP + priorIP);
  }

  return getCategoryValue(totals, catKey);
}

/**
 * Compute z-score for a single category.
 * For "lower is better" (ERA, WHIP), we invert: z = (mean - value) / std
 * For "higher is better", z = (value - mean) / std
 */
export function computeZScore(
  value: number,
  mean: number,
  std: number,
  direction: "higher" | "lower"
): number {
  if (std === 0) return 0;
  if (direction === "lower") {
    return (mean - value) / std;
  }
  return (value - mean) / std;
}

/**
 * Get category value for a single player (useful for showing per-pick impact).
 * For rate stats, returns the component pieces, not the rate itself.
 */
export function getPlayerCategoryContribution(
  player: Player,
  catKey: string,
  currentTotals: RosterTotals
): number {
  // For rate stats, we need to compute the new rate with the player added
  // and return the delta. For counting stats, just return the player's value.
  const countingStats = ["R", "HR", "RBI", "SB", "W", "SV", "K", "QS", "HLD"];
  if (countingStats.includes(catKey)) {
    return (player as unknown as Record<string, unknown>)[catKey] as number ?? 0;
  }
  // For rate stats, compute the new total with the player
  const newPlayers = [player]; // We'll simulate the delta
  const newTotals = addPlayerToTotals(currentTotals, player);
  return getCategoryValue(newTotals, catKey);
}

/**
 * Compute new totals after adding a player, without mutating the original.
 */
export function addPlayerToTotals(current: RosterTotals, player: Player): RosterTotals {
  const t = { ...current };

  if (player.hitterOrPitcher === "hitter") {
    t.AB += player.AB ?? 0;
    t.H += player.H ?? 0;
    t.R += player.R ?? 0;
    t.HR += player.HR ?? 0;
    t.RBI += player.RBI ?? 0;
    t.SB += player.SB ?? 0;
    t.BB += player.BB ?? 0;
    t.HBP += player.HBP ?? 0;
    t.SF += player.SF ?? 0;
    // Recompute rates
    t.AVG = t.AB > 0 ? t.H / t.AB : 0;
    const obpDenom = t.AB + t.BB + t.HBP + t.SF;
    t.OBP = obpDenom > 0 ? (t.H + t.BB + t.HBP) / obpDenom : 0;
  } else {
    t.IP += player.IP ?? 0;
    t.ER += player.ER ?? 0;
    t.HA += player.HA ?? 0;
    t.BBA += player.BBA ?? 0;
    t.W += player.W ?? 0;
    t.SV += player.SV ?? 0;
    t.K += player.K ?? 0;
    t.QS += player.QS ?? 0;
    t.HLD += player.HLD ?? 0;
    // Recompute rates
    t.ERA = t.IP > 0 ? (t.ER * 9) / t.IP : 0;
    t.WHIP = t.IP > 0 ? (t.BBA + t.HA) / t.IP : 0;
  }

  return t;
}

/**
 * Format a stat value for display.
 */
export function formatStat(catKey: string, value: number): string {
  const rateStats = ["AVG", "OBP", "ERA", "WHIP"];
  if (rateStats.includes(catKey)) {
    if (catKey === "AVG" || catKey === "OBP") {
      return value.toFixed(3);
    }
    return value.toFixed(2);
  }
  return Math.round(value).toString();
}
