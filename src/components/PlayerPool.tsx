"use client";

/**
 * PlayerPool: Left panel showing available players.
 * Searchable and filterable by position, hitter/pitcher.
 * Big, clear buttons — designed for non-technical users.
 */

import { useState, useMemo } from "react";
import { Player } from "@/lib/types";

interface PlayerPoolProps {
  players: Player[];
  onDraftMe: (playerId: string) => void;
  onDraftOther: (playerId: string) => void;
}

const POSITION_FILTERS = ["All", "C", "1B", "2B", "3B", "SS", "OF", "SP", "RP"];
const TYPE_FILTERS = ["All", "Hitters", "Pitchers"];

export function PlayerPool({ players, onDraftMe, onDraftOther }: PlayerPoolProps) {
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [confirmPlayer, setConfirmPlayer] = useState<Player | null>(null);

  const filtered = useMemo(() => {
    let list = players;

    if (typeFilter === "Hitters") {
      list = list.filter((p) => p.hitterOrPitcher === "hitter");
    } else if (typeFilter === "Pitchers") {
      list = list.filter((p) => p.hitterOrPitcher === "pitcher");
    }

    if (posFilter !== "All") {
      list = list.filter((p) => p.positions.includes(posFilter));
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.team.toLowerCase().includes(q)
      );
    }

    list = [...list].sort((a, b) => (a.ADP ?? 999) - (b.ADP ?? 999));
    return list;
  }, [players, search, posFilter, typeFilter]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-zinc-200 bg-zinc-50">
        <h2 className="text-lg font-bold text-zinc-800 mb-2">
          Available Players
          <span className="text-sm font-normal text-zinc-500 ml-2">
            ({filtered.length})
          </span>
        </h2>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or team..."
          className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm
                     focus:border-blue-500 focus:outline-none bg-white mb-2"
        />

        <div className="flex gap-1 mb-2">
          {TYPE_FILTERS.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 text-xs rounded-full font-semibold transition-colors
                ${typeFilter === t
                  ? "bg-zinc-900 text-white"
                  : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300"
                }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex gap-1 flex-wrap">
          {POSITION_FILTERS.map((p) => (
            <button
              key={p}
              onClick={() => setPosFilter(p)}
              className={`px-2 py-1 text-xs rounded font-semibold transition-colors
                ${posFilter === p
                  ? "bg-green-700 text-white"
                  : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300"
                }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Confirm dialog */}
      {confirmPlayer && (
        <div className="p-3 bg-amber-50 border-b border-amber-200">
          <p className="text-sm font-bold text-zinc-800 mb-2">
            Draft {confirmPlayer.name}?
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                onDraftMe(confirmPlayer.playerId);
                setConfirmPlayer(null);
              }}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg
                         hover:bg-blue-700 font-semibold"
            >
              My Pick
            </button>
            <button
              onClick={() => {
                onDraftOther(confirmPlayer.playerId);
                setConfirmPlayer(null);
              }}
              className="px-4 py-2 bg-orange-500 text-white text-sm rounded-lg
                         hover:bg-orange-600 font-semibold"
            >
              Other Team
            </button>
            <button
              onClick={() => setConfirmPlayer(null)}
              className="px-4 py-2 bg-zinc-200 text-zinc-700 text-sm rounded-lg
                         hover:bg-zinc-300 font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Player list */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-zinc-100 z-10">
            <tr>
              <th className="text-left px-3 py-2 text-zinc-600 font-semibold">Player</th>
              <th className="text-center px-2 py-2 text-zinc-600 font-semibold">Pos</th>
              <th className="text-center px-2 py-2 text-zinc-600 font-semibold">ADP</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 100).map((player) => (
              <tr
                key={player.playerId}
                className="border-b border-zinc-100 hover:bg-blue-50 transition-colors cursor-pointer"
                onClick={() => setConfirmPlayer(player)}
              >
                <td className="px-3 py-2">
                  <div className="font-semibold text-zinc-800">{player.name}</div>
                  <div className="text-xs text-zinc-400">{player.team}</div>
                </td>
                <td className="text-center px-2 py-2 text-xs text-zinc-600">
                  {player.positions.join("/")}
                </td>
                <td className="text-center px-2 py-2 text-xs text-zinc-500">
                  {player.ADP ?? "-"}
                </td>
                <td className="px-2 py-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmPlayer(player);
                    }}
                    className="px-3 py-1.5 bg-blue-500 text-white text-xs rounded-lg
                               hover:bg-blue-600 font-semibold"
                  >
                    Draft
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 100 && (
          <p className="text-center text-xs text-zinc-400 py-3">
            Showing first 100 of {filtered.length} — use search to narrow down
          </p>
        )}
      </div>
    </div>
  );
}
