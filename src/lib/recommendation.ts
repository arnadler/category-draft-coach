/**
 * Recommendation engine: z-score based marginal value analysis.
 *
 * For each available player, we:
 * 1. Simulate adding them to the roster
 * 2. Compute z-scores for each active category
 * 3. Weight categories where we're below a competitive threshold
 * 4. Apply roster constraints, ADP awareness, and risk adjustments
 * 5. Produce a ranked list with explainability
 */

import { CategoryDef, LeagueSettings, Player, Recommendation, RosterSlot } from "./types";
import {
  computeZScore,
  computeRosterTotalsFromSlots,
  getCategoryValue,
  getCategoryValueForZ,
} from "./stats";
import { DEFAULT_STDEVS, DEFAULT_TARGETS } from "./defaults";
import { LeagueCategoryDistributions } from "./simulation";
import { assignPlayersToSlots, expandRosterSlots, getOpenSlots } from "./roster";

// ── Position scarcity bonus ───────────────────────────────────────
// Positions with fewer available quality players get a draft bonus.

const POSITION_SCARCITY_BONUS: Record<string, number> = {
  C: 0.15,   // Catchers are scarce
  SS: 0.08,
  "2B": 0.05,
  "3B": 0.03,
  "1B": 0.0,
  OF: 0.0,
  SP: 0.03,  // Slight ace premium (correlation discount handles the rest)
  RP: 0.06,  // Elite closers/holders are scarce; only contribute to NSVH
  DH: -0.05, // DH-only is a slight negative
};

const RATE_HIGHER_CATS = new Set(["AVG", "OBP", "SLG", "KBB"]);
const RATE_LOWER_CATS = new Set(["ERA", "WHIP"]);

// ── Correlation discount groups ─────────────────────────────────────
// Categories within the same group are highly correlated (e.g. a pitcher
// with great ERA almost always has great WHIP and K/BB). If we treat them
// independently, an ace SP gets 3× z-score credit for what is essentially
// one skill — being a good pitcher. We discount the *marginal z-gain*
// within each correlated group so that the total contribution is capped.
//
// The discount factor is the fraction applied to the 2nd, 3rd, … category
// gains within a correlated group (the biggest gain is kept at full weight).
const CORRELATION_GROUPS: { keys: Set<string>; discount: number }[] = [
  // Pitcher ratio stats: ERA, WHIP, KBB are ~0.75+ correlated
  { keys: new Set(["ERA", "WHIP", "KBB"]), discount: 0.40 },
  // Hitter rate stats: AVG, OBP, SLG are ~0.60+ correlated
  { keys: new Set(["AVG", "OBP", "SLG"]), discount: 0.50 },
];

function scaleFallbackMean(catKey: string, base: number, numTeams: number): number {
  const teamScale = 12 / Math.max(2, numTeams);

  if (RATE_HIGHER_CATS.has(catKey)) {
    return base * (1 + (teamScale - 1) * 0.12);
  }
  if (RATE_LOWER_CATS.has(catKey)) {
    return base * (1 - (teamScale - 1) * 0.18);
  }
  return base * Math.pow(teamScale, 0.78);
}

function scaleFallbackStd(catKey: string, base: number, numTeams: number): number {
  const teamScale = 12 / Math.max(2, numTeams);
  if (RATE_HIGHER_CATS.has(catKey) || RATE_LOWER_CATS.has(catKey)) {
    return base * (1 + Math.abs(teamScale - 1) * 0.08);
  }
  return base * Math.pow(teamScale, 0.55);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function applyRiskForScoring(player: Player, riskTolerance: number): Player {
  const r = clamp01(player.risk ?? 0.3);
  const t = clamp01(riskTolerance);

  // Conservative: haircut playing time; Aggressive: small ceiling bump.
  const floorScale = 1 - r * 0.28;
  const ceilScale = 1 + r * 0.10;
  const scale = floorScale + (ceilScale - floorScale) * t;

  if (Math.abs(scale - 1) < 1e-6) return player;

  const p: Player = { ...player };

  const scaleField = (key: keyof Player) => {
    const v = p[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      (p as unknown as Record<string, number>)[key] = v * scale;
    }
  };

  if (p.hitterOrPitcher === "hitter") {
    for (const k of ["AB", "H", "R", "HR", "RBI", "SB", "CS", "BB", "HBP", "SF", "2B", "3B"] as const) scaleField(k);
  } else {
    for (const k of ["IP", "ER", "HA", "BBA", "W", "SV", "K", "QS", "HLD", "BSV"] as const) scaleField(k);
  }

  return p;
}

/**
 * Check if a player can fill any open roster slot.
 */
function canFillSlot(player: Player, openSlots: RosterSlot[]): boolean {
  return openSlots.some((slot) =>
    slot.player === null &&
    player.positions.some((pos) => slot.eligiblePositions.includes(pos))
  );
}

/**
 * Compute how scarce a player's position is based on remaining open slots.
 */
function positionScarcityScore(player: Player, openSlots: RosterSlot[]): number {
  // Count how many unfilled slots this player can fill
  const fillableSlots = openSlots.filter(
    (slot) =>
      slot.player === null &&
      player.positions.some((pos) => slot.eligiblePositions.includes(pos))
  );

  // Count how many unfilled slots remain for this position type overall
  const positionSlots = openSlots.filter(
    (slot) =>
      slot.player === null &&
      !slot.label.startsWith("BN") &&
      !slot.label.startsWith("UTIL") &&
      player.positions.some((pos) => slot.eligiblePositions.includes(pos))
  );

  // Higher bonus for scarce positions
  let bonus = 0;
  for (const pos of player.positions) {
    bonus = Math.max(bonus, POSITION_SCARCITY_BONUS[pos] ?? 0);
  }

  // Extra bonus if this is the last slot for this position
  if (positionSlots.length === 1) {
    bonus += 0.1;
  }

  // Penalty if player can ONLY fill bench slots
  if (fillableSlots.length > 0 && fillableSlots.every((s) => s.label.startsWith("BN"))) {
    bonus -= 0.1;
  }

  return bonus;
}

function computeCategoryWeights(
  currentZ: Record<string, number>,
  categories: CategoryDef[],
  threshold: number
): Record<string, number> {
  const weights: Record<string, number> = {};
  const deficitAlpha = 0.55;
  const aheadDampen = 0.25;

  for (const c of categories) {
    const z = currentZ[c.key] ?? 0;
    const deficit = threshold - z;
    const boost = deficit > 0 ? 1 + deficitAlpha * Math.min(deficit, 2.5) : 1;
    const dampen = z > threshold + 1.5 ? 1 - aheadDampen : 1;
    weights[c.key] = Math.max(0.4, Math.min(2.8, boost * dampen));
  }

  return weights;
}

/**
 * Main recommendation function.
 *
 * Returns the top N players sorted by marginal z-score gain.
 */
export function getRecommendations(
  availablePlayers: Player[],
  myDraftedPlayers: Player[],
  settings: LeagueSettings,
  leagueDists: LeagueCategoryDistributions | null,
  riskTolerance: number, // 0 = conservative, 1 = aggressive
  currentOverallPick?: number,
  topN: number = 5
): Recommendation[] {
  const activeCategories = settings.categories.filter((c) => c.enabled);
  const targetsFallback = settings.targets;
  const stdevsFallback = DEFAULT_STDEVS;
  const getMoments = (catKey: string): { mean: number; std: number } => {
    const sim = leagueDists?.categories?.[catKey];
    if (sim) return { mean: sim.mean, std: sim.std };

    const baseMean = targetsFallback[catKey] ?? DEFAULT_TARGETS[catKey] ?? 0;
    const baseStd = stdevsFallback[catKey] ?? 1;
    return {
      mean: scaleFallbackMean(catKey, baseMean, settings.numTeams),
      std: Math.max(1e-6, scaleFallbackStd(catKey, baseStd, settings.numTeams)),
    };
  };

  const emptySlots = expandRosterSlots(settings.rosterConfig);
  const currentAssigned = assignPlayersToSlots(myDraftedPlayers, emptySlots);
  const openSlots = getOpenSlots(currentAssigned);
  const currentTotals = computeRosterTotalsFromSlots(currentAssigned, settings.benchMultiplier);

  // Current z-scores
  const currentZScores: Record<string, number> = {};
  for (const cat of activeCategories) {
    const { mean, std } = getMoments(cat.key);
    const valForZ = getCategoryValueForZ(currentTotals, cat.key, mean);
    currentZScores[cat.key] = computeZScore(valForZ, mean, std, cat.direction);
  }

  const catWeights = computeCategoryWeights(
    currentZScores,
    activeCategories,
    settings.competitiveThresholdZ
  );

  // Score each available player
  const scored: Recommendation[] = [];

  for (const player of availablePlayers) {
    // Basic roster constraint: if we have open slots, only consider players who can fit.
    // (If roster is full, recommendations stop being useful anyway.)
    if (openSlots.length > 0 && !canFillSlot(player, openSlots)) continue;

    const scoringPlayer = applyRiskForScoring(player, riskTolerance);
    const nextPlayers = [...myDraftedPlayers, scoringPlayer];
    const nextAssigned = assignPlayersToSlots(nextPlayers, emptySlots);
    const isAssigned = nextAssigned.some((s) => s.player?.playerId === scoringPlayer.playerId);
    if (!isAssigned) continue;

    const newTotals = computeRosterTotalsFromSlots(nextAssigned, settings.benchMultiplier);

    // Compute new z-scores and marginal gains
    const categoryImpact: Record<string, { before: number; after: number; delta: number }> = {};
    const rawImpact: Record<string, { before: number; after: number; delta: number }> = {};
    let totalWeightedZGain = 0;

    for (const cat of activeCategories) {
      const { mean, std } = getMoments(cat.key);
      const valForZ = getCategoryValueForZ(newTotals, cat.key, mean);
      const newZ = computeZScore(valForZ, mean, std, cat.direction);
      const oldZ = currentZScores[cat.key];
      const delta = newZ - oldZ;

      categoryImpact[cat.key] = { before: oldZ, after: newZ, delta };
      const beforeRaw = getCategoryValue(currentTotals, cat.key);
      const afterRaw = getCategoryValue(newTotals, cat.key);
      rawImpact[cat.key] = { before: beforeRaw, after: afterRaw, delta: afterRaw - beforeRaw };
    }

    // ── Apply correlation-aware weighting ──────────────────────────
    // Within each correlated group, sort deltas descending. The largest
    // gain keeps its full category weight; subsequent gains in the same
    // group are discounted. This prevents ace SPs from getting 3× credit
    // for ERA+WHIP+KBB (all driven by the same underlying skill).
    const discountApplied = new Set<string>();
    for (const group of CORRELATION_GROUPS) {
      const groupCats = activeCategories.filter((c) => group.keys.has(c.key));
      if (groupCats.length <= 1) continue;

      // Sort by weighted delta descending so we keep the largest at full value
      const sorted = groupCats
        .map((c) => ({
          key: c.key,
          weightedDelta: (categoryImpact[c.key]?.delta ?? 0) * (catWeights[c.key] ?? 1),
        }))
        .sort((a, b) => b.weightedDelta - a.weightedDelta);

      // First category in group: full weight. Subsequent: discounted.
      for (let i = 0; i < sorted.length; i++) {
        const { key, weightedDelta } = sorted[i];
        if (i === 0) {
          totalWeightedZGain += weightedDelta;
        } else {
          totalWeightedZGain += weightedDelta * group.discount;
        }
        discountApplied.add(key);
      }
    }

    // Add non-grouped categories at full weight
    for (const cat of activeCategories) {
      if (discountApplied.has(cat.key)) continue;
      const delta = categoryImpact[cat.key]?.delta ?? 0;
      const weight = catWeights[cat.key] ?? 1;
      totalWeightedZGain += delta * weight;
    }

    // Position scarcity bonus
    const scarcityBonus = positionScarcityScore(player, openSlots);
    totalWeightedZGain += scarcityBonus;

    // Early draft bonus: reward players who contribute to multiple categories
    // This helps well-rounded elite players rank higher when roster is empty
    const rosterFillPct = myDraftedPlayers.length / emptySlots.length;
    if (rosterFillPct < 0.3) {
      const categoriesHelped = Object.values(categoryImpact).filter(
        (imp) => imp.delta > 0.02
      ).length;
      const multiCatBonus = (categoriesHelped / activeCategories.length) * 0.3 * (1 - rosterFillPct);
      totalWeightedZGain += multiCatBonus;
    }

    // Risk preference adjustment (separate from projection scaling above)
    const playerRisk = clamp01(player.risk ?? 0.3);
    const conservativePenalty = playerRisk * (1 - riskTolerance) * 0.55;
    const upsideBonus = playerRisk * riskTolerance * 0.12;
    totalWeightedZGain += upsideBonus - conservativePenalty;

    // ADP awareness: mild consensus-value signal, penalty for reaching
    if (player.ADP) {
      // Mild ADP bonus: consensus value signal (not position-biased)
      // Reduced from 0.5 to 0.25 to prevent ADP from dominating z-score analysis
      const adpBonus = Math.max(0, (150 - player.ADP) / 150) * 0.25;
      totalWeightedZGain += adpBonus;

      // Reaching penalty: slight penalty for picking someone well before their ADP
      if (currentOverallPick) {
        const adpDiff = player.ADP - currentOverallPick; // positive = expected later (reach)
        if (adpDiff > 20) {
          totalWeightedZGain -= Math.min(0.25, ((adpDiff - 20) / 80) * 0.2);
        }
      }
    }

    // Generate explanation
    const explanation = generateExplanation(
      player,
      categoryImpact,
      activeCategories,
      currentZScores,
      settings.competitiveThresholdZ
    );

    const positionNote = generatePositionNote(player, openSlots);

    scored.push({
      player,
      totalZGain: totalWeightedZGain,
      categoryImpact,
      rawImpact,
      explanation,
      positionNote,
    });
  }

  // Sort by total marginal z-score gain (descending)
  scored.sort((a, b) => b.totalZGain - a.totalZGain);

  return scored.slice(0, topN);
}

/**
 * Generate a human-readable explanation for why this player is recommended.
 */
function generateExplanation(
  player: Player,
  impact: Record<string, { before: number; after: number; delta: number }>,
  categories: CategoryDef[],
  currentZScores: Record<string, number>,
  thresholdZ: number
): string {
  // Find categories where this pick helps the most
  const improvements = categories
    .filter((c) => impact[c.key] && impact[c.key].delta > 0.01)
    .sort((a, b) => (impact[b.key]?.delta ?? 0) - (impact[a.key]?.delta ?? 0));

  // Find categories where user is behind
  const behindCats = categories
    .filter((c) => (currentZScores[c.key] ?? 0) < thresholdZ)
    .map((c) => c.label);

  // Find categories where user is ahead
  const aheadCats = categories
    .filter((c) => (currentZScores[c.key] ?? 0) > thresholdZ + 0.9)
    .map((c) => c.label);

  const parts: string[] = [];

  if (improvements.length > 0) {
    const topImps = improvements.slice(0, 3).map((c) => c.label);
    parts.push(`Boosts ${topImps.join(", ")}`);
  }

  if (behindCats.length > 0 && improvements.some((c) => (currentZScores[c.key] ?? 0) < thresholdZ)) {
    const helpsBehind = improvements
      .filter((c) => (currentZScores[c.key] ?? 0) < thresholdZ)
      .map((c) => c.label);
    if (helpsBehind.length > 0) {
      parts.push(`where you need it most (${helpsBehind.join(", ")})`);
    }
  }

  if (aheadCats.length > 0) {
    const cats = aheadCats.slice(0, 2);
    parts.push(`You can wait on ${cats.join(", ")} — already competitive there`);
  }

  return parts.join(". ") + ".";
}

/**
 * Generate position note for a recommendation.
 */
function generatePositionNote(player: Player, openSlots: RosterSlot[]): string {
  const fillable = openSlots
    .filter(
      (slot) =>
        slot.player === null &&
        player.positions.some((pos) => slot.eligiblePositions.includes(pos))
    )
    .map((s) => s.label);

  const nonBench = fillable.filter((l) => !l.startsWith("BN"));
  if (nonBench.length > 0) {
    return `Fills ${nonBench[0]} slot`;
  }
  if (fillable.length > 0) {
    return "Bench spot";
  }
  return "No open slot";
}
