import bundledPlayers from "@/data/players.json";
import { Player } from "./types";

export type PlayerDatasetMeta = {
  source: "bundled" | "imported";
  name: string;
  importedAt?: number;
  rowCount: number;
};

function normalizePositions(positions: unknown): string[] {
  if (!Array.isArray(positions)) return [];
  const allowed = new Set(["C", "1B", "2B", "3B", "SS", "OF", "DH", "SP", "RP"]);
  const out: string[] = [];
  for (const p of positions) {
    const s = String(p).trim().toUpperCase();
    if (s === "P") continue;
    if (allowed.has(s)) out.push(s);
  }
  return Array.from(new Set(out));
}

function clamp01(value: unknown): number | undefined {
  if (value == null) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(1, n));
}

export function normalizePlayer(raw: Player): Player {
  const positions = normalizePositions(raw.positions);
  const hitterOrPitcher =
    raw.hitterOrPitcher ??
    (positions.includes("SP") || positions.includes("RP") ? "pitcher" : "hitter");

  const p: Player = {
    ...raw,
    name: String(raw.name ?? "").trim(),
    team: String(raw.team ?? "").trim().toUpperCase(),
    positions: positions.length ? positions : hitterOrPitcher === "pitcher" ? ["SP"] : ["OF"],
    hitterOrPitcher,
    risk: clamp01(raw.risk),
  };

  // Fill common missing components (useful when importing CSVs)
  if (p.hitterOrPitcher === "hitter") {
    if (p.AB != null && p.AVG != null && p.H == null) {
      p.H = Math.round(p.AB * p.AVG);
    }
  } else {
    if (p.IP != null && p.ERA != null && p.ER == null) {
      p.ER = Math.round((p.ERA * p.IP) / 9);
    }
  }

  return p;
}

export function getBundledPlayers(): Player[] {
  return (bundledPlayers as Player[]).map(normalizePlayer);
}

export function getBundledMeta(): PlayerDatasetMeta {
  return {
    source: "bundled",
    name: "FantasyPros 2026 Projections",
    rowCount: (bundledPlayers as Player[]).length,
  };
}

