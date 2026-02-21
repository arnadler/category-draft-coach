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

type CategorySignalWeights = {
  hitterPower: number;
  hitterSpeed: number;
  hitterRate: number;
  hitterPlayingTime: number;
  pitcherStrikeout: number;
  pitcherRatio: number;
  pitcherSaves: number;
  pitcherVolume: number;
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

function dedupePlayersById(players: Player[]): Player[] {
  const seen = new Set<string>();
  const deduped: Player[] = [];
  for (const player of players) {
    if (!player || seen.has(player.playerId)) continue;
    seen.add(player.playerId);
    deduped.push(player);
  }
  return deduped;
}

function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j] as T;
    arr[j] = tmp as T;
  }
}

function assignPlayerToTeam(
  player: Player,
  team: number,
  profile: TeamDraftProfile,
  teams: Player[][],
  teamH: number[],
  teamP: number[],
  teamSP: number[],
  teamRP: number[],
  playerFeatures: Map<string, PlayerDraftFeatures>,
  spTarget: number,
  rpTarget: number
) {
  teams[team]?.push(player);
  if (player.hitterOrPitcher === "hitter") {
    teamH[team] = (teamH[team] ?? 0) + 1;
    return;
  }

  teamP[team] = (teamP[team] ?? 0) + 1;
  const role = playerFeatures.get(player.playerId)?.role ?? pitcherRole(player);
  if (role === "sp") {
    teamSP[team] = (teamSP[team] ?? 0) + 1;
    return;
  }
  if (role === "rp") {
    teamRP[team] = (teamRP[team] ?? 0) + 1;
    return;
  }

  const spDef = spTarget - (teamSP[team] ?? 0);
  const rpDef = rpTarget - (teamRP[team] ?? 0);
  if (spDef > rpDef) teamSP[team] = (teamSP[team] ?? 0) + 1;
  else if (rpDef > spDef) teamRP[team] = (teamRP[team] ?? 0) + 1;
  else if (profile.starterBias >= profile.savesBias) teamSP[team] = (teamSP[team] ?? 0) + 1;
  else teamRP[team] = (teamRP[team] ?? 0) + 1;
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

function buildCategorySignalWeights(
  activeCategories: Array<{ key: string }>
): CategorySignalWeights {
  const enabled = new Set(activeCategories.map((c) => c.key));
  const normalize = (value: number, baseline: number, min: number = 0.18, max: number = 1.9) =>
    clamp(value / Math.max(1e-6, baseline), min, max);

  const hitterPowerRaw =
    (enabled.has("HR") ? 1.0 : 0) +
    (enabled.has("RBI") ? 0.9 : 0) +
    (enabled.has("SLG") ? 0.65 : 0) +
    (enabled.has("R") ? 0.25 : 0);
  const hitterSpeedRaw =
    (enabled.has("SB") ? 1.0 : 0) +
    (enabled.has("NSB") ? 1.0 : 0) +
    (enabled.has("R") ? 0.25 : 0);
  const hitterRateRaw =
    (enabled.has("AVG") ? 1.0 : 0) +
    (enabled.has("OBP") ? 1.0 : 0) +
    (enabled.has("SLG") ? 0.45 : 0);
  const hitterPlayingRaw =
    (enabled.has("R") ? 0.9 : 0) +
    (enabled.has("RBI") ? 0.5 : 0) +
    (enabled.has("HR") ? 0.3 : 0) +
    (enabled.has("SB") || enabled.has("NSB") ? 0.2 : 0);

  const pitcherStrikeoutRaw =
    (enabled.has("K") ? 1.0 : 0) +
    (enabled.has("QS") ? 0.45 : 0) +
    (enabled.has("W") ? 0.35 : 0) +
    (enabled.has("KBB") ? 0.3 : 0);
  const pitcherRatioRaw =
    (enabled.has("ERA") ? 1.0 : 0) +
    (enabled.has("WHIP") ? 1.0 : 0) +
    (enabled.has("KBB") ? 0.65 : 0);
  const pitcherSavesRaw =
    (enabled.has("SV") ? 1.0 : 0) +
    (enabled.has("HLD") ? 0.8 : 0) +
    (enabled.has("NSVH") ? 1.0 : 0);
  const pitcherVolumeRaw =
    (enabled.has("QS") ? 1.0 : 0) +
    (enabled.has("W") ? 0.7 : 0) +
    (enabled.has("K") ? 0.35 : 0) +
    (enabled.has("ERA") ? 0.25 : 0) +
    (enabled.has("WHIP") ? 0.25 : 0);

  return {
    hitterPower: normalize(hitterPowerRaw, 2.8),
    hitterSpeed: normalize(hitterSpeedRaw, 1.25),
    hitterRate: normalize(hitterRateRaw, 1.45),
    hitterPlayingTime: normalize(hitterPlayingRaw, 1.9),
    pitcherStrikeout: normalize(pitcherStrikeoutRaw, 1.75),
    pitcherRatio: normalize(pitcherRatioRaw, 2.65),
    pitcherSaves: normalize(pitcherSavesRaw, 1.0),
    pitcherVolume: normalize(pitcherVolumeRaw, 1.85),
  };
}

function scoreCandidate(
  features: PlayerDraftFeatures,
  profile: TeamDraftProfile,
  needs: TeamDraftNeeds,
  categorySignals: CategorySignalWeights,
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
    score +=
      features.hitterPower *
      (0.75 + profile.powerBias * 0.24) *
      categorySignals.hitterPower;
    score +=
      features.hitterSpeed *
      (0.72 + profile.speedBias * 0.26) *
      categorySignals.hitterSpeed;
    score +=
      features.hitterRate *
      (0.55 + profile.ratioBias * 0.14) *
      categorySignals.hitterRate;
    score += features.hitterPlayingTime * 0.3 * categorySignals.hitterPlayingTime;
  } else {
    score += needs.pitcherUrgency * 1.2;
    if (needs.blockPitcher) score -= 2.4;
    score +=
      features.pitcherStrikeout *
      (0.78 + profile.starterBias * 0.2) *
      categorySignals.pitcherStrikeout;
    score +=
      features.pitcherRatio *
      (0.64 + profile.ratioBias * 0.24) *
      categorySignals.pitcherRatio;
    score +=
      features.pitcherSaves *
      (0.52 + profile.savesBias * 0.3) *
      categorySignals.pitcherSaves;
    score += features.pitcherVolume * 0.36 * categorySignals.pitcherVolume;

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
  opts?: { iterations?: number; seed?: number; randomness?: number; lockedPlayers?: Player[] }
): LeagueCategoryDistributions {
  const iterations = opts?.iterations ?? 160;
  const seed = opts?.seed ?? 1337;
  const randomness = opts?.randomness ?? 8; // lower rank-noise; strategy drives more picks

  const activeCategories = settings.categories.filter((c) => c.enabled);
  const { hitterTarget, pitcherTarget, spTarget, rpTarget, rosterSize } =
    classifyTeamTargets(settings);
  const baselinePitcherShare = pitcherTarget / Math.max(1, rosterSize);
  const categorySignals = buildCategorySignalWeights(activeCategories);

  const rng = mulberry32(seed);
  const playerFeatures = buildPlayerFeatures(allPlayers);
  const lockedPlayers = dedupePlayersById(opts?.lockedPlayers ?? []);
  const lockedIds = new Set(lockedPlayers.map((p) => p.playerId));

  const valuesByCat: Record<string, number[]> = {};
  for (const c of activeCategories) valuesByCat[c.key] = [];

  const baseRank = (p: Player) => p.overallRank ?? p.ADP ?? 999999;

  for (let iter = 0; iter < iterations; iter++) {
    const draftOrder = allPlayers
      .filter((p) => !lockedIds.has(p.playerId))
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
    if (lockedPlayers.length > 0) {
      const shuffledLocked = [...lockedPlayers];
      shuffleInPlace(shuffledLocked, rng);

      let nextTeam = Math.floor(rng() * settings.numTeams);
      for (const locked of shuffledLocked) {
        let assigned = false;
        for (let attempts = 0; attempts < settings.numTeams; attempts++) {
          const team = (nextTeam + attempts) % settings.numTeams;
          if ((teams[team]?.length ?? 0) >= rosterSize) continue;
          assignPlayerToTeam(
            locked,
            team,
            teamProfiles[team]!,
            teams,
            teamH,
            teamP,
            teamSP,
            teamRP,
            playerFeatures,
            spTarget,
            rpTarget
          );
          nextTeam = (team + 1) % settings.numTeams;
          assigned = true;
          break;
        }
        if (!assigned) break;
      }
    }

    for (let pick = 0; pick < totalPicks; pick++) {
      const team = snakeTeamIndex(pick, settings.numTeams);
      if ((teams[team]?.length ?? 0) >= rosterSize) continue;
      if (remaining.length === 0) break;
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
        const candidateScore = scoreCandidate(
          features,
          profile,
          needs,
          categorySignals,
          pick,
          totalPicks,
          rng
        );
        if (candidateScore > bestScore) {
          bestScore = candidateScore;
          chosenIdx = i;
        }
      }

      const chosen = remaining.splice(chosenIdx, 1)[0];
      if (!chosen) continue;

      assignPlayerToTeam(
        chosen,
        team,
        profile,
        teams,
        teamH,
        teamP,
        teamSP,
        teamRP,
        playerFeatures,
        spTarget,
        rpTarget
      );
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

  // ── Rate-stat standard deviation calibration ────────────────────
  // The simulation can produce tighter rate-stat spreads than real roto
  // leagues because simulated teams draft from similar heuristics. We blend
  // the simulated std with empirical priors and apply a team-size factor so
  // 8-team and 16-team leagues don't inherit identical rate spreads.
  const RATE_STD_FLOORS: Record<string, number> = {
    ERA: 0.30,    // Real leagues: 0.30–0.55
    WHIP: 0.045,  // Real leagues: 0.04–0.08
    KBB: 0.38,    // Real leagues: 0.35–0.65
    AVG: 0.008,   // Real leagues: 0.007–0.012
    OBP: 0.008,   // Real leagues: 0.007–0.012
    SLG: 0.018,   // Real leagues: 0.015–0.030
  };

  // Empirical targets anchor the expected spread; simulation still contributes
  // via soft-floor blending so category variance can move with pool dynamics.
  const RATE_STD_TARGETS: Record<string, number> = {
    ERA: 0.38,
    WHIP: 0.055,
    KBB: 0.48,
    AVG: 0.010,
    OBP: 0.010,
    SLG: 0.024,
  };

  const teamSizeRateFactor = clamp(1 + ((settings.numTeams - 12) / 12) * 0.3, 0.85, 1.2);

  for (const c of activeCategories) {
    const vals = valuesByCat[c.key] ?? [];
    samples = Math.max(samples, vals.length);
    const mean = vals.reduce((s, v) => s + v, 0) / Math.max(1, vals.length);
    const variance =
      vals.length > 1
        ? vals.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (vals.length - 1)
        : 0;
    let std = Math.sqrt(variance) || 1;

    // Apply team-size-aware floor/target and keep some simulated signal.
    const floor = RATE_STD_FLOORS[c.key];
    const target = RATE_STD_TARGETS[c.key];
    if (floor != null && target != null) {
      const scaledFloor = floor * teamSizeRateFactor;
      const scaledTarget = target * teamSizeRateFactor;
      const softFloored =
        std < scaledFloor ? scaledFloor - (scaledFloor - std) * 0.2 : std;
      // Keep empirical anchoring strong while preserving simulated movement.
      std = softFloored * 0.45 + scaledTarget * 0.55;
    }

    categories[c.key] = { mean, std };
  }

  return { samples, categories };
}
