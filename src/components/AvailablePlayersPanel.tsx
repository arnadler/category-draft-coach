"use client";

import Fuse from "fuse.js";
import { useMemo, useState } from "react";
import { normalizePlayerName } from "@/lib/names";
import { Player } from "@/lib/types";

type SearchPlayer = Player & { _searchName: string };

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-zinc-800 ring-1 ring-zinc-200">
      <span className="text-zinc-500">{label}</span>
      <span>{value}</span>
    </span>
  );
}

export function AvailablePlayersPanel({
  players,
  onDraftMe,
  onDraftOther,
}: {
  players: Player[];
  onDraftMe: (playerId: string) => void;
  onDraftOther: (playerId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "hitter" | "pitcher">("all");
  const [posFilter, setPosFilter] = useState<string>("ALL");
  const [teamFilter, setTeamFilter] = useState<string>("ALL");

  const indexed = useMemo<SearchPlayer[]>(
    () =>
      players
        .slice()
        .sort((a, b) => (a.overallRank ?? 999999) - (b.overallRank ?? 999999))
        .map((p) => ({
          ...p,
          _searchName: normalizePlayerName(p.name),
        })),
    [players]
  );

  const teams = useMemo(() => {
    const set = new Set(indexed.map((p) => p.team).filter(Boolean));
    return Array.from(set).sort();
  }, [indexed]);

  const fuse = useMemo(() => {
    return new Fuse(indexed, {
      keys: ["_searchName", "team", "positions"],
      threshold: 0.35,
      ignoreLocation: true,
    });
  }, [indexed]);

  const filtered = useMemo(() => {
    const q = normalizePlayerName(query);
    const base = q ? fuse.search(q).map((r) => r.item) : indexed;
    return base.filter((p) => {
      if (typeFilter !== "all" && p.hitterOrPitcher !== typeFilter) return false;
      if (posFilter !== "ALL" && !p.positions.includes(posFilter)) return false;
      if (teamFilter !== "ALL" && p.team !== teamFilter) return false;
      return true;
    });
  }, [fuse, indexed, posFilter, query, teamFilter, typeFilter]);

  const posOptions = ["ALL", "C", "1B", "2B", "3B", "SS", "OF", "SP", "RP"];

  return (
    <div className="flex h-full flex-col rounded-2xl border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 p-4">
        <div className="text-base font-semibold text-zinc-900">Available Players</div>
        <div className="mt-3 grid gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search player…"
            className="h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-base"
          />
          <div className="grid grid-cols-3 gap-2">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as "all" | "hitter" | "pitcher")}
              className="h-11 rounded-lg border border-zinc-300 bg-white px-2 text-base"
            >
              <option value="all">All</option>
              <option value="hitter">Hitters</option>
              <option value="pitcher">Pitchers</option>
            </select>
            <select
              value={posFilter}
              onChange={(e) => setPosFilter(e.target.value)}
              className="h-11 rounded-lg border border-zinc-300 bg-white px-2 text-base"
            >
              {posOptions.map((p) => (
                <option key={p} value={p}>
                  {p === "ALL" ? "All Pos" : p}
                </option>
              ))}
            </select>
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="h-11 rounded-lg border border-zinc-300 bg-white px-2 text-base"
            >
              <option value="ALL">All Teams</option>
              {teams.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="text-sm text-zinc-600">
            Showing <span className="font-semibold text-zinc-900">{filtered.length}</span> players
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="grid gap-2">
          {filtered.slice(0, 180).map((p) => {
            const isH = p.hitterOrPitcher === "hitter";
            return (
              <div
                key={p.playerId}
                className="rounded-xl border border-zinc-200 bg-zinc-50 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold text-zinc-900">
                      {p.overallRank ? (
                        <span className="mr-2 inline-flex items-center rounded-md bg-zinc-900 px-2 py-0.5 text-xs font-bold text-white">
                          #{p.overallRank}
                        </span>
                      ) : null}
                      {p.name}
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-600">
                      {p.team} • {p.positions.join("/")} • {isH ? "Hitter" : "Pitcher"}{" "}
                      {p.ADP ? <span>• ADP {Math.round(p.ADP)}</span> : null}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {isH ? (
                        <>
                          <StatPill label="R" value={String(Math.round(p.R ?? 0))} />
                          <StatPill label="HR" value={String(Math.round(p.HR ?? 0))} />
                          <StatPill label="RBI" value={String(Math.round(p.RBI ?? 0))} />
                          <StatPill label="SB" value={String(Math.round(p.SB ?? 0))} />
                        </>
                      ) : (
                        <>
                          <StatPill label="W" value={String(Math.round(p.W ?? 0))} />
                          <StatPill label="SV" value={String(Math.round(p.SV ?? 0))} />
                          <StatPill label="K" value={String(Math.round(p.K ?? 0))} />
                          <StatPill
                            label="ERA"
                            value={p.IP && p.ER ? ((p.ER * 9) / p.IP).toFixed(2) : (p.ERA ?? 0).toFixed(2)}
                          />
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => onDraftMe(p.playerId)}
                      className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
                    >
                      Draft (Me)
                    </button>
                    <button
                      type="button"
                      onClick={() => onDraftOther(p.playerId)}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                    >
                      Taken
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length > 180 ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-700">
              Too many to show at once. Narrow your search/filter.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

