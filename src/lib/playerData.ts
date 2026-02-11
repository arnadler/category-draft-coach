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

function estimateRiskFromProjection(player: Player): number {
  const adp = player.ADP ?? 260;

  if (player.hitterOrPitcher === "hitter") {
    const ab = player.AB ?? 0;
    const playingTimeRisk = 1 - Math.min(1, ab / 620);
    const speedVariance = (player.SB ?? 0) >= 30 ? 0.06 : 0;
    const lateRoundRisk = Math.max(0, (adp - 120) / 320);
    return Math.max(0.08, Math.min(0.95, 0.14 + playingTimeRisk * 0.58 + speedVariance + lateRoundRisk * 0.2));
  }

  const ip = player.IP ?? 0;
  const playingTimeRisk = 1 - Math.min(1, ip / 180);
  const isRelieverOnly = player.positions.includes("RP") && !player.positions.includes("SP");
  const roleVolatility = isRelieverOnly ? 0.08 : 0;
  const lateRoundRisk = Math.max(0, (adp - 140) / 320);
  return Math.max(0.12, Math.min(0.95, 0.22 + playingTimeRisk * 0.62 + roleVolatility + lateRoundRisk * 0.18));
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
    if (p.IP != null && p.ER != null && p.ERA == null && p.IP > 0) {
      p.ERA = (p.ER * 9) / p.IP;
    }

    // Some projection files provide WHIP but not HA/BBA.
    // Backfill components so team WHIP aggregation is accurate.
    if (p.IP != null && p.IP > 0 && p.WHIP != null) {
      const baserunnersAllowed = p.WHIP * p.IP;
      if (p.HA == null && p.BBA == null) {
        // Use a stable league-average BB share when split components are missing.
        const bbShare = 0.32;
        p.BBA = Math.max(0, Math.round(baserunnersAllowed * bbShare));
        p.HA = Math.max(0, Math.round(baserunnersAllowed - p.BBA));
      } else if (p.HA == null && p.BBA != null) {
        p.HA = Math.max(0, Math.round(baserunnersAllowed - p.BBA));
      } else if (p.BBA == null && p.HA != null) {
        p.BBA = Math.max(0, Math.round(baserunnersAllowed - p.HA));
      }
    }
    if (p.WHIP == null && p.IP != null && p.IP > 0 && (p.HA != null || p.BBA != null)) {
      p.WHIP = ((p.HA ?? 0) + (p.BBA ?? 0)) / p.IP;
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

  if (p.risk == null) {
    p.risk = estimateRiskFromProjection(p);
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
