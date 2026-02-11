import { LeagueSettings, Player } from "./types";
import { assignPlayersToSlots, expandRosterSlots } from "./roster";
import { computeRosterTotalsFromSlots, getCategoryValue } from "./stats";

export type CategoryDistribution = {
  mean: number;
  std: number;
};

export type LeagueCategoryDistributions = {
  samples: number;
  categories: Record<string, CategoryDistribution>;
};

type TeamDraftProfile = {
  pitcherShareTarget: number;
  speedBias: number;
  powerBias: number;
  ratioBias: number;
  savesBias: number;
  starterBias: number;
  adpDiscipline: number;
  riskAppetite: number;
};

type PlayerDraftFeatures = {
  baseRank: number;
  adp: number;
  risk: number;
  isPitcher: boolean;
  role: "sp" | "rp" | "hybrid" | "hitter";
  hitterPower: number;
  hitterSpeed: number;
  hitterRate: number;
  hitterPlayingTime: number;
  pitcherStrikeout: number;
  pitcherSaves: number;
  pitcherRatio: number;
  pitcherVolume: number;
};

type TeamDraftNeeds = {
  hitterUrgency: number;
  pitcherUrgency: number;
  spUrgency: number;
  rpUrgency: number;
  blockHitter: boolean;
  blockPitcher: boolean;
};

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randn(rng: () => number): number {
  // Box–Muller
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function snakeTeamIndex(pickIndex: number, numTeams: number): number {
  const round = Math.floor(pickIndex / numTeams);
  const pos = pickIndex % numTeams;
  const forward = round % 2 === 0;
  return forward ? pos : numTeams - 1 - pos;
}

function classifyTeamTargets(settings: LeagueSettings) {
  const slots = settings.rosterConfig.slots;
  let hitterStart = 0;
  let pitcherStart = 0;
  let bench = 0;
  let spStart = 0;
  let rpStart = 0;
  let pFlexStart = 0;

  for (const s of slots) {
    const label = s.label.toUpperCase();
    if (label.startsWith("BN")) {
      bench += 1;
      continue;
    }
    const elig = s.eligiblePositions.map((p) => p.toUpperCase());
    const isPitcherSlot =
      label === "P" || elig.includes("SP") || elig.includes("RP") || elig.includes("P");
    if (isPitcherSlot) {
      pitcherStart += 1;
      if (label === "P" || (elig.includes("SP") && elig.includes("RP"))) pFlexStart += 1;
      else if (elig.includes("SP")) spStart += 1;
      else if (elig.includes("RP")) rpStart += 1;
    } else {
      hitterStart += 1;
    }
  }

  const totalStart = hitterStart + pitcherStart;
  const benchH = totalStart > 0 ? Math.round((bench * hitterStart) / totalStart) : 0;
  const benchP = bench - benchH;
  const pitcherTarget = pitcherStart + benchP;

  // Split pitcher targets between SP and RP so draft simulation has role balance.
  const spShareBase =
    pitcherStart > 0 ? (spStart + pFlexStart * 0.65) / pitcherStart : 0.65;
  const spTarget = Math.round(pitcherTarget * clamp(spShareBase, 0.45, 0.85));
  const rpTarget = Math.max(0, pitcherTarget - spTarget);

  return {
    hitterTarget: hitterStart + benchH,
    pitcherTarget,
    spTarget,
    rpTarget,
    rosterSize: slots.length,
  };
}

function pitcherRole(player: Player): "sp" | "rp" | "hybrid" {
  const positions = (player.positions ?? []).map((p) => p.toUpperCase());
  const hasSP = positions.includes("SP");
  const hasRP = positions.includes("RP");
  if (hasSP && hasRP) return "hybrid";
  if (hasSP) return "sp";
  if (hasRP) return "rp";
  return "sp";
}

function buildTeamProfiles(
  numTeams: number,
  baselinePitcherShare: number,
  rng: () => number
): TeamDraftProfile[] {
  const depthFactor = clamp01((numTeams - 10) / 8);
  const out: TeamDraftProfile[] = [];

  for (let i = 0; i < numTeams; i++) {
    out.push({
      pitcherShareTarget: clamp(
        baselinePitcherShare + randn(rng) * (0.055 + depthFactor * 0.04),
        0.3,
        0.56
      ),
      speedBias: clamp(randn(rng) * (0.38 + depthFactor * 0.12), -0.95, 0.95),
      powerBias: clamp(randn(rng) * (0.35 + depthFactor * 0.1), -0.95, 0.95),
      ratioBias: clamp(randn(rng) * 0.32, -0.8, 0.8),
      savesBias: clamp(randn(rng) * (0.46 + depthFactor * 0.1), -1, 1),
      starterBias: clamp(randn(rng) * 0.42, -1, 1),
      adpDiscipline: clamp(1 + randn(rng) * (0.15 + depthFactor * 0.06), 0.7, 1.4),
      riskAppetite: clamp(0.46 + randn(rng) * 0.16 + depthFactor * 0.08, 0.05, 0.95),
    });
  }

  return out;
}

function buildPlayerFeatures(allPlayers: Player[]): Map<string, PlayerDraftFeatures> {
  const map = new Map<string, PlayerDraftFeatures>();

  for (const p of allPlayers) {
    const baseRank = p.overallRank ?? p.ADP ?? 999999;
    const adp = p.ADP ?? baseRank;
    const risk = clamp01(p.risk ?? 0.35);
    const isPitcher = p.hitterOrPitcher === "pitcher";
    const role: PlayerDraftFeatures["role"] = isPitcher ? pitcherRole(p) : "hitter";

    const nsb = (p.SB ?? 0) - (p.CS ?? 0);
    const hitterPower = clamp01(((p.HR ?? 0) / 42) * 0.65 + ((p.RBI ?? 0) / 120) * 0.35);
    const hitterSpeed = clamp01(((p.SB ?? 0) / 40) * 0.75 + (nsb / 30) * 0.25);
    const hitterRate = p.OBP != null
      ? clamp01((p.OBP - 0.285) / 0.095)
      : p.AVG != null
        ? clamp01((p.AVG - 0.225) / 0.08)
        : p.SLG != null
          ? clamp01((p.SLG - 0.34) / 0.24)
          : 0.5;
    const hitterPlayingTime = clamp01((p.AB ?? 420) / 650);

    const pitcherStrikeout = clamp01(((p.K ?? 0) / 220) * 0.7 + ((p.QS ?? 0) / 24) * 0.3);
    const pitcherSaves = clamp01(((p.SV ?? 0) + (p.HLD ?? 0)) / 42);
    const eraScore = p.ERA != null ? clamp01((4.9 - p.ERA) / 2.4) : 0.5;
    const whipScore = p.WHIP != null ? clamp01((1.48 - p.WHIP) / 0.44) : 0.5;
    const pitcherRatio = clamp01(eraScore * 0.55 + whipScore * 0.45);
    const pitcherVolume = clamp01((p.IP ?? 120) / 190);

    map.set(p.playerId, {
      baseRank,
      adp,
      risk,
      isPitcher,
      role,
      hitterPower,
      hitterSpeed,
      hitterRate,
      hitterPlayingTime,
      pitcherStrikeout,
      pitcherSaves,
      pitcherRatio,
      pitcherVolume,
    });
  }

  return map;
}

function scoreCandidate(
  features: PlayerDraftFeatures,
  profile: TeamDraftProfile,
  needs: TeamDraftNeeds,
  currentPick: number,
  totalPicks: number,
  rng: () => number
): number {
  const draftPct = clamp01(currentPick / Math.max(1, totalPicks - 1));
  const rankEdge = 1 / (1 + features.baseRank / 40);
  let score = rankEdge * 3.2;

  const riskTarget = clamp(
    0.14 + draftPct * 0.5 + (profile.riskAppetite - 0.5) * 0.3,
    0.05,
    0.9
  );
  score += 0.32 - Math.abs(features.risk - riskTarget) * 0.58;

  const adpGap = (features.adp - (currentPick + 1)) / 70;
  if (adpGap > 0) {
    score -= adpGap * 0.4 * profile.adpDiscipline;
  } else {
    score += Math.min(0.2, -adpGap * 0.08);
  }

  if (!features.isPitcher) {
    score += needs.hitterUrgency * 1.2;
    if (needs.blockHitter) score -= 2.4;
    score += features.hitterPower * (0.75 + profile.powerBias * 0.24);
    score += features.hitterSpeed * (0.72 + profile.speedBias * 0.26);
    score += features.hitterRate * (0.55 + profile.ratioBias * 0.14);
    score += features.hitterPlayingTime * 0.3;
  } else {
    score += needs.pitcherUrgency * 1.2;
    if (needs.blockPitcher) score -= 2.4;
    score += features.pitcherStrikeout * (0.78 + profile.starterBias * 0.2);
    score += features.pitcherRatio * (0.64 + profile.ratioBias * 0.24);
    score += features.pitcherSaves * (0.52 + profile.savesBias * 0.3);
    score += features.pitcherVolume * 0.36;

    if (features.role === "sp") {
      score += needs.spUrgency * 0.75;
      score += profile.starterBias * 0.24;
    } else if (features.role === "rp") {
      score += needs.rpUrgency * 0.75;
      score += profile.savesBias * 0.24;
    } else {
      score += Math.max(needs.spUrgency, needs.rpUrgency) * 0.46;
      score += profile.starterBias * 0.08 + profile.savesBias * 0.08;
    }
  }

  // Small residual noise avoids deterministic ties but keeps strategy dominant.
  score += randn(rng) * 0.05;
  return score;
}

/**
 * Estimate league mean/std for each enabled category by simulating a plausible draft end state.
 *
 * This does NOT attempt to perfectly model human drafting. It aims for stable,
 * reasonable distributions so z-scores behave sensibly and recommendations are consistent.
 */
export function simulateLeagueDistributions(
  allPlayers: Player[],
  settings: LeagueSettings,
  opts?: { iterations?: number; seed?: number; randomness?: number }
): LeagueCategoryDistributions {
  const iterations = opts?.iterations ?? 160;
  const seed = opts?.seed ?? 1337;
  const randomness = opts?.randomness ?? 8; // lower rank-noise; strategy drives more picks

  const activeCategories = settings.categories.filter((c) => c.enabled);
  const { hitterTarget, pitcherTarget, spTarget, rpTarget, rosterSize } =
    classifyTeamTargets(settings);
  const baselinePitcherShare = pitcherTarget / Math.max(1, rosterSize);

  const rng = mulberry32(seed);
  const playerFeatures = buildPlayerFeatures(allPlayers);

  const valuesByCat: Record<string, number[]> = {};
  for (const c of activeCategories) valuesByCat[c.key] = [];

  const baseRank = (p: Player) => p.overallRank ?? p.ADP ?? 999999;

  for (let iter = 0; iter < iterations; iter++) {
    const draftOrder = allPlayers
      .map((p) => ({ p, score: baseRank(p) + randn(rng) * randomness }))
      .sort((a, b) => a.score - b.score)
      .map((x) => x.p);

    const remaining: Player[] = [...draftOrder];
    const teamProfiles = buildTeamProfiles(settings.numTeams, baselinePitcherShare, rng);

    const teams: Player[][] = Array.from({ length: settings.numTeams }, () => []);
    const teamH = Array.from({ length: settings.numTeams }, () => 0);
    const teamP = Array.from({ length: settings.numTeams }, () => 0);
    const teamSP = Array.from({ length: settings.numTeams }, () => 0);
    const teamRP = Array.from({ length: settings.numTeams }, () => 0);

    const totalPicks = settings.numTeams * rosterSize;

    for (let pick = 0; pick < totalPicks; pick++) {
      const team = snakeTeamIndex(pick, settings.numTeams);
      const profile = teamProfiles[team]!;
      const round = Math.floor(pick / settings.numTeams);
      const windowSize = Math.min(
        remaining.length,
        Math.max(24, 32 + Math.round(settings.numTeams * 1.2) + Math.floor(round * 1.4))
      );

      const picksSoFar = teamH[team] + teamP[team];
      const pitcherShare = teamP[team] / Math.max(1, picksSoFar);
      const shareGap = profile.pitcherShareTarget - pitcherShare;
      const hitterNeedRaw = (hitterTarget - teamH[team]) / Math.max(1, hitterTarget);
      const pitcherNeedRaw = (pitcherTarget - teamP[team]) / Math.max(1, pitcherTarget);
      const spNeedRaw = (spTarget - teamSP[team]) / Math.max(1, spTarget);
      const rpNeedRaw = (rpTarget - teamRP[team]) / Math.max(1, rpTarget);
      const needs: TeamDraftNeeds = {
        hitterUrgency: hitterNeedRaw + Math.max(0, -shareGap) * 0.35,
        pitcherUrgency: pitcherNeedRaw + Math.max(0, shareGap) * 0.35,
        spUrgency: spNeedRaw,
        rpUrgency: rpNeedRaw,
        blockHitter: teamH[team] >= hitterTarget && teamP[team] < pitcherTarget,
        blockPitcher: teamP[team] >= pitcherTarget && teamH[team] < hitterTarget,
      };

      let chosenIdx = 0;
      let bestScore = -Infinity;
      for (let i = 0; i < windowSize; i++) {
        const candidate = remaining[i];
        if (!candidate) continue;
        const features = playerFeatures.get(candidate.playerId);
        if (!features) continue;
        const candidateScore = scoreCandidate(features, profile, needs, pick, totalPicks, rng);
        if (candidateScore > bestScore) {
          bestScore = candidateScore;
          chosenIdx = i;
        }
      }

      const chosen = remaining.splice(chosenIdx, 1)[0];
      if (!chosen) continue;

      teams[team].push(chosen);
      if (chosen.hitterOrPitcher === "hitter") {
        teamH[team] += 1;
      } else {
        teamP[team] += 1;
        const role = playerFeatures.get(chosen.playerId)?.role ?? pitcherRole(chosen);
        if (role === "sp") {
          teamSP[team] += 1;
        } else if (role === "rp") {
          teamRP[team] += 1;
        } else {
          const spDef = spTarget - teamSP[team];
          const rpDef = rpTarget - teamRP[team];
          if (spDef > rpDef) teamSP[team] += 1;
          else if (rpDef > spDef) teamRP[team] += 1;
          else if (profile.starterBias >= profile.savesBias) teamSP[team] += 1;
          else teamRP[team] += 1;
        }
      }
    }

    for (let t = 0; t < settings.numTeams; t++) {
      const emptySlots = expandRosterSlots(settings.rosterConfig);
      const assigned = assignPlayersToSlots(teams[t] ?? [], emptySlots);
      const totals = computeRosterTotalsFromSlots(assigned, settings.benchMultiplier);
      for (const c of activeCategories) {
        valuesByCat[c.key]?.push(getCategoryValue(totals, c.key));
      }
    }
  }

  const categories: Record<string, CategoryDistribution> = {};
  let samples = 0;

  for (const c of activeCategories) {
    const vals = valuesByCat[c.key] ?? [];
    samples = Math.max(samples, vals.length);
    const mean = vals.reduce((s, v) => s + v, 0) / Math.max(1, vals.length);
    const variance =
      vals.length > 1
        ? vals.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (vals.length - 1)
        : 0;
    const std = Math.sqrt(variance) || 1;
    categories[c.key] = { mean, std };
  }

  return { samples, categories };
}
