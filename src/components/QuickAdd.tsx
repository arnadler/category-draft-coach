"use client";

import Fuse from "fuse.js";
import { useMemo, useState } from "react";
import { extractNameFromDraftRoomText, normalizePlayerName } from "@/lib/names";
import { Player } from "@/lib/types";

type SearchPlayer = Player & { _searchName: string };

export function QuickAdd({
  availablePlayers,
  onDraftMe,
}: {
  availablePlayers: Player[];
  onDraftMe: (playerId: string) => void;
}) {
  const [raw, setRaw] = useState("");
  const [suggestions, setSuggestions] = useState<SearchPlayer[]>([]);
  const [message, setMessage] = useState<string>("");

  const indexed = useMemo<SearchPlayer[]>(
    () =>
      availablePlayers.map((p) => ({
        ...p,
        _searchName: normalizePlayerName(p.name),
      })),
    [availablePlayers]
  );

  const fuse = useMemo(() => {
    return new Fuse(indexed, {
      keys: ["_searchName"],
      threshold: 0.35,
      ignoreLocation: true,
      minMatchCharLength: 2,
    });
  }, [indexed]);

  const runMatch = () => {
    setMessage("");
    const extracted = extractNameFromDraftRoomText(raw);
    const q = normalizePlayerName(extracted);
    if (!q) {
      setSuggestions([]);
      setMessage("Paste a player name first.");
      return;
    }
    const results = fuse.search(q).slice(0, 6);
    const items = results.map((r) => r.item);
    if (items.length === 0) {
      setSuggestions([]);
      setMessage("No match found in your current player pool.");
      return;
    }

    // Auto-pick if it's a clear winner (Fuse score: lower is better)
    const best = results[0];
    const second = results[1];
    const bestScore = best?.score ?? 1;
    const secondScore = second?.score ?? 1;
    if (best && bestScore < 0.12 && secondScore - bestScore > 0.06) {
      onDraftMe(best.item.playerId);
      setRaw("");
      setSuggestions([]);
      setMessage(`Added: ${best.item.name}`);
      return;
    }

    setSuggestions(items);
    setMessage("Select the right match:");
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3">
      <div className="text-sm font-semibold text-zinc-900">Quick Add (paste from CBS)</div>
      <div className="mt-2 flex gap-2">
        <input
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") runMatch();
          }}
          placeholder='e.g. "Ronald Acuna Jr., OF, ATL"'
          className="h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-base"
        />
        <button
          type="button"
          onClick={runMatch}
          className="h-11 shrink-0 rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800"
        >
          Add
        </button>
      </div>

      {message ? <div className="mt-2 text-sm text-zinc-700">{message}</div> : null}

      {suggestions.length > 0 ? (
        <div className="mt-2 grid gap-2">
          {suggestions.map((p) => (
            <div
              key={p.playerId}
              className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-zinc-900">{p.name}</div>
                <div className="text-xs text-zinc-600">
                  {p.team} • {p.positions.join("/")} • {p.hitterOrPitcher === "hitter" ? "Hitter" : "Pitcher"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onDraftMe(p.playerId);
                  setRaw("");
                  setSuggestions([]);
                  setMessage(`Added: ${p.name}`);
                }}
                className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
              >
                Draft
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

