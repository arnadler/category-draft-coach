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
    // Estimate SLG from components if we have them
    if (p.SLG == null && p.AB != null && p.H != null && p.HR != null) {
      const doubles = p["2B"] ?? 0;
      const triples = p["3B"] ?? 0;
      const singles = p.H - doubles - triples - p.HR;
      p.SLG = (singles + 2 * doubles + 3 * triples + 4 * p.HR) / Math.max(1, p.AB);
    }
  } else {
    if (p.IP != null && p.ERA != null && p.ER == null) {
      p.ER = Math.round((p.ERA * p.IP) / 9);
    }
    // Estimate QS for starters if not provided
    if (p.QS == null && p.IP != null && p.IP > 0) {
      const isSP = (p.positions ?? []).includes("SP");
      if (isSP) {
        const estGS = Math.round(p.IP / 5.8);
        const era = p.ERA ?? (p.ER != null && p.IP > 0 ? (p.ER * 9) / p.IP : 4.0);
        const avgIPperGS = p.IP / Math.max(1, estGS);
        // Higher IP/start and lower ERA = more QS
        const pQS = Math.max(0, Math.min(0.95, 0.55 + (avgIPperGS - 5.5) * 0.15 - (era - 3.5) * 0.1));
        p.QS = Math.round(estGS * pQS);
      } else {
        p.QS = 0;
      }
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

