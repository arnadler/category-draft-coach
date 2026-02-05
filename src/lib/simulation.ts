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

  for (const s of slots) {
    const label = s.label.toUpperCase();
    if (label.startsWith("BN")) {
      bench += 1;
      continue;
    }
    const elig = s.eligiblePositions.map((p) => p.toUpperCase());
    const isPitcherSlot =
      label === "P" || elig.includes("SP") || elig.includes("RP") || elig.includes("P");
    if (isPitcherSlot) pitcherStart += 1;
    else hitterStart += 1;
  }

  const totalStart = hitterStart + pitcherStart;
  const benchH = totalStart > 0 ? Math.round((bench * hitterStart) / totalStart) : 0;
  const benchP = bench - benchH;

  return {
    hitterTarget: hitterStart + benchH,
    pitcherTarget: pitcherStart + benchP,
    rosterSize: slots.length,
  };
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
  const randomness = opts?.randomness ?? 14; // higher = more draft variance

  const activeCategories = settings.categories.filter((c) => c.enabled);
  const { hitterTarget, pitcherTarget, rosterSize } = classifyTeamTargets(settings);

  const rng = mulberry32(seed);

  const valuesByCat: Record<string, number[]> = {};
  for (const c of activeCategories) valuesByCat[c.key] = [];

  const baseRank = (p: Player) => p.overallRank ?? p.ADP ?? 999999;

  for (let iter = 0; iter < iterations; iter++) {
    const draftOrder = allPlayers
      .map((p) => ({ p, score: baseRank(p) + randn(rng) * randomness }))
      .sort((a, b) => a.score - b.score)
      .map((x) => x.p);

    const remaining: Player[] = [...draftOrder];

    const teams: Player[][] = Array.from({ length: settings.numTeams }, () => []);
    const teamH = Array.from({ length: settings.numTeams }, () => 0);
    const teamP = Array.from({ length: settings.numTeams }, () => 0);

    const totalPicks = settings.numTeams * rosterSize;

    for (let pick = 0; pick < totalPicks; pick++) {
      const team = snakeTeamIndex(pick, settings.numTeams);
      const needH = teamH[team] < hitterTarget;
      const needP = teamP[team] < pitcherTarget;

      let desiredType: "hitter" | "pitcher" | "either" = "either";
      if (needH && !needP) desiredType = "hitter";
      else if (needP && !needH) desiredType = "pitcher";
      else if (needH && needP) {
        const hDef = (hitterTarget - teamH[team]) / Math.max(1, hitterTarget);
        const pDef = (pitcherTarget - teamP[team]) / Math.max(1, pitcherTarget);
        desiredType = pDef > hDef ? "pitcher" : "hitter";
      }

      let chosenIdx = -1;
      if (desiredType === "either") {
        chosenIdx = 0;
      } else {
        for (let i = 0; i < remaining.length; i++) {
          if (remaining[i]?.hitterOrPitcher === desiredType) {
            chosenIdx = i;
            break;
          }
        }
        if (chosenIdx === -1) chosenIdx = 0;
      }

      const chosen = remaining.splice(chosenIdx, 1)[0];
      if (!chosen) continue;

      teams[team].push(chosen);
      if (chosen.hitterOrPitcher === "hitter") teamH[team] += 1;
      else teamP[team] += 1;
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

