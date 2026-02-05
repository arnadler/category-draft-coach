import { RosterConfig } from "./types";

export type RosterCounts = {
  C: number;
  "1B": number;
  "2B": number;
  "3B": number;
  SS: number;
  OF: number;
  UTIL: number;
  SP: number;
  RP: number;
  P: number;
  BN: number;
};

export const DEFAULT_ROSTER_COUNTS: RosterCounts = {
  C: 1,
  "1B": 1,
  "2B": 1,
  "3B": 1,
  SS: 1,
  OF: 3,
  UTIL: 1,
  SP: 5,
  RP: 2,
  P: 1,
  BN: 3,
};

export function getRosterCounts(config: RosterConfig): RosterCounts {
  const counts: RosterCounts = { ...DEFAULT_ROSTER_COUNTS };
  for (const k of Object.keys(counts) as Array<keyof RosterCounts>) counts[k] = 0;

  for (const s of config.slots) {
    const label = s.label.toUpperCase();
    if (label.startsWith("BN")) counts.BN += 1;
    else if (label.startsWith("OF")) counts.OF += 1;
    else if (label.startsWith("SP")) counts.SP += 1;
    else if (label.startsWith("RP")) counts.RP += 1;
    else if (label === "C") counts.C += 1;
    else if (label === "1B") counts["1B"] += 1;
    else if (label === "2B") counts["2B"] += 1;
    else if (label === "3B") counts["3B"] += 1;
    else if (label === "SS") counts.SS += 1;
    else if (label === "UTIL") counts.UTIL += 1;
    else if (label === "P") counts.P += 1;
  }

  return counts;
}

function expandLabeled(base: string, count: number): string[] {
  if (count <= 0) return [];
  if (count === 1) return [base];
  return Array.from({ length: count }, (_, i) => `${base}${i + 1}`);
}

export function buildRosterConfigFromCounts(counts: RosterCounts): RosterConfig {
  const slots: RosterConfig["slots"] = [];

  const push = (label: string, eligiblePositions: string[]) => slots.push({ label, eligiblePositions });

  // Hitters
  for (const label of expandLabeled("C", counts.C)) push(label, ["C"]);
  for (const label of expandLabeled("1B", counts["1B"])) push(label, ["1B"]);
  for (const label of expandLabeled("2B", counts["2B"])) push(label, ["2B"]);
  for (const label of expandLabeled("3B", counts["3B"])) push(label, ["3B"]);
  for (const label of expandLabeled("SS", counts.SS)) push(label, ["SS"]);
  for (const label of expandLabeled("OF", counts.OF)) push(label, ["OF"]);
  for (const label of expandLabeled("UTIL", counts.UTIL)) push(label, ["C", "1B", "2B", "3B", "SS", "OF", "DH"]);

  // Pitchers
  for (const label of expandLabeled("SP", counts.SP)) push(label, ["SP"]);
  for (const label of expandLabeled("RP", counts.RP)) push(label, ["RP"]);
  for (const label of expandLabeled("P", counts.P)) push(label, ["SP", "RP"]);

  // Bench
  for (const label of expandLabeled("BN", counts.BN))
    push(label, ["C", "1B", "2B", "3B", "SS", "OF", "DH", "SP", "RP"]);

  return { slots };
}

