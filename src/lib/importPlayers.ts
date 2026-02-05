import { Player } from "./types";

export type PlayerFieldKey =
  | "playerId"
  | "name"
  | "team"
  | "positions"
  | "hitterOrPitcher"
  | "ADP"
  | "overallRank"
  | "risk"
  | "R"
  | "HR"
  | "RBI"
  | "SB"
  | "AB"
  | "H"
  | "BB"
  | "HBP"
  | "SF"
  | "AVG"
  | "OBP"
  | "W"
  | "SV"
  | "K"
  | "IP"
  | "ER"
  | "HA"
  | "BBA"
  | "ERA"
  | "WHIP"
  | "QS"
  | "HLD";

export type CsvColumnMap = Partial<Record<PlayerFieldKey, string>>;

const SYNONYMS: Partial<Record<PlayerFieldKey, string[]>> = {
  playerId: ["playerid", "id", "mlbid"],
  name: ["name", "player", "playername", "player name"],
  team: ["team", "tm"],
  positions: ["pos", "position", "positions", "elig", "eligibility"],
  hitterOrPitcher: ["type", "h/p", "hp", "hitterorpitcher", "player type"],
  overallRank: ["overallrank", "overall rank", "rank", "ovr", "overall", "value", "valuerank"],
  ADP: ["adp", "avgpick", "average draft position", "avg draft position"],
  risk: ["risk", "injury", "variance"],

  R: ["r", "runs"],
  HR: ["hr", "home runs", "homeruns", "home_runs"],
  RBI: ["rbi"],
  SB: ["sb", "steals", "stolen bases", "stolen_bases"],
  AB: ["ab", "at bats", "atbats"],
  H: ["h", "hits"],
  BB: ["bb", "walks"],
  HBP: ["hbp"],
  SF: ["sf", "sac flies", "sacrifice flies"],
  AVG: ["avg", "ba", "batting avg", "batting average"],
  OBP: ["obp"],

  W: ["w", "wins"],
  SV: ["sv", "saves"],
  K: ["k", "so", "strikeouts", "strike outs"],
  IP: ["ip", "innings", "innings pitched", "innings_pitched"],
  ER: ["er", "earned runs", "earned_runs"],
  HA: ["ha", "h allowed", "hits allowed", "hits_allowed"],
  BBA: ["bba", "bb allowed", "walks allowed", "walks_allowed"],
  ERA: ["era"],
  WHIP: ["whip"],
  QS: ["qs", "quality starts", "quality_starts"],
  HLD: ["hld", "holds"],
};

function normHeader(h: string): string {
  return h
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]+/g, "");
}

export function autoDetectColumnMap(headers: string[]): CsvColumnMap {
  const byNorm: Record<string, string> = {};
  for (const h of headers) {
    const n = normHeader(h);
    if (!byNorm[n]) byNorm[n] = h;
  }

  const map: CsvColumnMap = {};
  for (const [key, syns] of Object.entries(SYNONYMS) as Array<[PlayerFieldKey, string[]]>) {
    for (const s of syns) {
      const n = normHeader(s);
      if (byNorm[n]) {
        map[key] = byNorm[n];
        break;
      }
    }
  }

  return map;
}

function toNumber(value: string | undefined): number | undefined {
  if (value == null) return undefined;
  const v = value.trim();
  if (!v) return undefined;
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function parsePositions(value: string | undefined): string[] {
  if (!value) return [];
  const cleaned = value
    .replace(/\(/g, " ")
    .replace(/\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const parts = cleaned.split(/[,/| ]+/g).map((p) => p.trim().toUpperCase());
  const allowed = new Set(["C", "1B", "2B", "3B", "SS", "OF", "DH", "SP", "RP", "P"]);
  const positions: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    if (allowed.has(part)) positions.push(part === "P" ? "SP" : part);
  }
  return Array.from(new Set(positions));
}

function inferType(positions: string[], explicit: string | undefined): "hitter" | "pitcher" {
  const e = explicit?.toLowerCase().trim();
  if (e === "hitter" || e === "bat" || e === "batter") return "hitter";
  if (e === "pitcher" || e === "pit" || e === "p") return "pitcher";
  if (positions.includes("SP") || positions.includes("RP")) return "pitcher";
  return "hitter";
}

export function importPlayersFromRows(
  rows: Record<string, string>[],
  columnMap: CsvColumnMap
): { players: Player[]; warnings: string[] } {
  const warnings: string[] = [];
  const players: Player[] = [];

  const usedIds = new Set<string>();

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx] ?? {};
    const name = (columnMap.name ? row[columnMap.name] : undefined)?.trim();
    if (!name) continue;

    const positions = parsePositions(columnMap.positions ? row[columnMap.positions] : undefined);
    const hitterOrPitcher = inferType(
      positions,
      columnMap.hitterOrPitcher ? row[columnMap.hitterOrPitcher] : undefined
    );

    const playerIdRaw = (columnMap.playerId ? row[columnMap.playerId] : undefined)?.trim();
    const baseId = playerIdRaw && playerIdRaw.length > 0 ? playerIdRaw : `row_${idx + 1}`;
    let playerId = baseId;
    let dupe = 1;
    while (usedIds.has(playerId)) {
      dupe += 1;
      playerId = `${baseId}_${dupe}`;
    }
    usedIds.add(playerId);

    const team = (columnMap.team ? row[columnMap.team] : undefined)?.trim() ?? "";

    // Basic numeric fields
    const overallRank = toNumber(columnMap.overallRank ? row[columnMap.overallRank] : undefined);
    const ADP = toNumber(columnMap.ADP ? row[columnMap.ADP] : undefined);
    const risk = toNumber(columnMap.risk ? row[columnMap.risk] : undefined);

    const player: Player = {
      playerId,
      name,
      team,
      positions: positions.length ? positions : hitterOrPitcher === "pitcher" ? ["SP"] : ["OF"],
      hitterOrPitcher,
      overallRank,
      ADP,
      risk: risk != null ? Math.max(0, Math.min(1, risk)) : undefined,
    };

    const numericFields: PlayerFieldKey[] = [
      "R",
      "HR",
      "RBI",
      "SB",
      "AB",
      "H",
      "BB",
      "HBP",
      "SF",
      "AVG",
      "OBP",
      "W",
      "SV",
      "K",
      "IP",
      "ER",
      "HA",
      "BBA",
      "ERA",
      "WHIP",
      "QS",
      "HLD",
    ];

    for (const key of numericFields) {
      const header = columnMap[key];
      if (!header) continue;
      const val = toNumber(row[header]);
      if (val == null) continue;
      (player as unknown as Record<string, unknown>)[key] = val;
    }

    // Common fallback: pitcher files use "H" and "BB" for allowed stats.
    if (player.hitterOrPitcher === "pitcher") {
      if (player.HA == null && player.H != null) player.HA = player.H;
      if (player.BBA == null && player.BB != null) player.BBA = player.BB;
    }

    // If AVG/OBP missing but components exist, we compute later; OK.
    players.push(player);
  }

  if (!columnMap.name) warnings.push("Missing required mapping: player name column.");
  if (!columnMap.positions) warnings.push("Positions not mapped; inferred defaults will be used.");

  return { players, warnings };
}

