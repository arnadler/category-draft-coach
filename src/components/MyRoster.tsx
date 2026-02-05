"use client";

/**
 * MyRoster: Center panel showing current roster and category dashboard.
 * Displays roster slots with assigned players, aggregate category totals,
 * and z-score indicators showing how competitive you are in each category.
 */

import { RosterSlot, DraftPick, LeagueSettings } from "@/lib/types";
import {
  RosterTotals,
  getCategoryValue,
  getCategoryValueForZ,
  computeZScore,
  formatStat,
} from "@/lib/stats";
import { DEFAULT_STDEVS } from "@/lib/defaults";
import { LeagueCategoryDistributions } from "@/lib/simulation";

interface MyRosterProps {
  rosterSlots: RosterSlot[];
  rosterTotals: RosterTotals;
  myPicks: DraftPick[];
  otherPickCount: number;
  settings: LeagueSettings;
  leagueDists: LeagueCategoryDistributions | null;
  onUndo: () => void;
}

function ZScoreBar({ zscore }: { zscore: number }) {
  const clamped = Math.max(-3, Math.min(3, zscore));
  const pct = ((clamped + 3) / 6) * 100;

  let color = "bg-yellow-400";
  let textColor = "text-yellow-700";
  if (zscore < -1) {
    color = "bg-red-500";
    textColor = "text-red-700";
  } else if (zscore < -0.3) {
    color = "bg-orange-400";
    textColor = "text-orange-700";
  } else if (zscore > 0.5) {
    color = "bg-green-500";
    textColor = "text-green-700";
  } else if (zscore > 0.2) {
    color = "bg-green-400";
    textColor = "text-green-600";
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-4 bg-zinc-200 rounded-full relative overflow-hidden">
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-zinc-400 z-10" />
        <div
          className={`absolute top-0 bottom-0 ${color} transition-all duration-300`}
          style={{
            left: `${Math.min(pct, 50)}%`,
            width: `${Math.abs(pct - 50)}%`,
          }}
        />
        <div
          className={`absolute top-0 bottom-0 w-2 ${color} rounded-full z-20 transition-all duration-300`}
          style={{ left: `${pct}%`, transform: "translateX(-50%)" }}
        />
      </div>
      <div className={`w-12 text-right text-xs font-bold ${textColor}`}>
        {zscore >= 0 ? "+" : ""}
        {zscore.toFixed(1)}
      </div>
    </div>
  );
}

export function MyRoster({
  rosterSlots,
  rosterTotals,
  myPicks,
  otherPickCount,
  settings,
  leagueDists,
  onUndo,
}: MyRosterProps) {
  const activeCategories = settings.categories.filter((c) => c.enabled);
  const hitterCats = activeCategories.filter((c) => c.type === "hitter");
  const pitcherCats = activeCategories.filter((c) => c.type === "pitcher");

  const hitterSlots = rosterSlots.filter(
    (s) =>
      !s.label.toUpperCase().startsWith("SP") &&
      !s.label.toUpperCase().startsWith("RP") &&
      s.label.toUpperCase() !== "P" &&
      !s.label.toUpperCase().startsWith("BN")
  );
  const pitcherSlots = rosterSlots.filter(
    (s) =>
      s.label.toUpperCase().startsWith("SP") ||
      s.label.toUpperCase().startsWith("RP") ||
      s.label.toUpperCase() === "P"
  );
  const benchSlots = rosterSlots.filter((s) => s.label.toUpperCase().startsWith("BN"));

  function getZScore(catKey: string, direction: "higher" | "lower") {
    const mean =
      leagueDists?.categories?.[catKey]?.mean ??
      settings.targets[catKey] ?? 0;
    const std =
      leagueDists?.categories?.[catKey]?.std ??
      DEFAULT_STDEVS[catKey] ?? 1;
    const valueForZ = getCategoryValueForZ(rosterTotals, catKey, mean);
    return computeZScore(valueForZ, mean, std, direction);
  }

  const totalZ = activeCategories.reduce(
    (sum, cat) => sum + getZScore(cat.key, cat.direction),
    0
  );

  function formatStatForDisplay(catKey: string, rawValue: number): string {
    if (catKey === "AVG" && rosterTotals.AB <= 0) return "—";
    if (
      catKey === "OBP" &&
      rosterTotals.AB + rosterTotals.BB + rosterTotals.HBP + rosterTotals.SF <= 0
    )
      return "—";
    if ((catKey === "ERA" || catKey === "WHIP") && rosterTotals.IP <= 0) return "—";
    return formatStat(catKey, rawValue);
  }

  function renderSlot(slot: RosterSlot) {
    return (
      <tr key={slot.id} className={`border-b border-zinc-100 ${slot.player ? "" : "bg-zinc-50"}`}>
        <td className="px-3 py-1.5 text-xs font-bold text-zinc-500 w-12">{slot.label}</td>
        <td className="px-3 py-1.5">
          {slot.player ? (
            <div>
              <span className="font-semibold text-zinc-800 text-sm">{slot.player.name}</span>
              <span className="text-xs text-zinc-400 ml-1">{slot.player.team}</span>
            </div>
          ) : (
            <span className="text-xs text-zinc-400 italic">Empty</span>
          )}
        </td>
      </tr>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-zinc-200 bg-zinc-50 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-zinc-800">My Roster</h2>
          <p className="text-xs text-zinc-500">
            {myPicks.length} pick{myPicks.length !== 1 ? "s" : ""} made
            {otherPickCount > 0 && ` | ${otherPickCount} off board`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`px-3 py-1 rounded-full text-sm font-bold ${
              totalZ >= 0
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            Z-Total: {totalZ >= 0 ? "+" : ""}{totalZ.toFixed(1)}
          </div>
          {myPicks.length > 0 && (
            <button
              onClick={onUndo}
              className="px-3 py-1.5 bg-red-100 text-red-600 text-xs rounded-lg
                         hover:bg-red-200 font-semibold"
            >
              Undo Last
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Category Dashboard */}
        <div className="p-3 border-b border-zinc-200">
          <h3 className="text-sm font-bold text-zinc-700 mb-2">
            Category Dashboard
            <span className="text-xs font-normal text-zinc-400 ml-2">
              center = league average
            </span>
          </h3>

          <div className="mb-3">
            <h4 className="text-xs font-semibold text-blue-600 mb-1 uppercase tracking-wide">
              Hitting
            </h4>
            {hitterCats.map((cat) => {
              const value = getCategoryValue(rosterTotals, cat.key);
              const zscore = getZScore(cat.key, cat.direction);
              return (
                <div key={cat.key} className="mb-1.5">
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="text-zinc-600 font-medium">{cat.label}</span>
                    <span className="font-mono font-semibold text-zinc-700">
                      {formatStatForDisplay(cat.key, value)}
                    </span>
                  </div>
                  <ZScoreBar zscore={zscore} />
                </div>
              );
            })}
          </div>

          <div>
            <h4 className="text-xs font-semibold text-purple-600 mb-1 uppercase tracking-wide">
              Pitching
            </h4>
            {pitcherCats.map((cat) => {
              const value = getCategoryValue(rosterTotals, cat.key);
              const zscore = getZScore(cat.key, cat.direction);
              return (
                <div key={cat.key} className="mb-1.5">
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="text-zinc-600 font-medium">{cat.label}</span>
                    <span className="font-mono font-semibold text-zinc-700">
                      {formatStatForDisplay(cat.key, value)}
                    </span>
                  </div>
                  <ZScoreBar zscore={zscore} />
                </div>
              );
            })}
          </div>
        </div>

        {/* Roster slots */}
        <div className="p-3">
          <h3 className="text-sm font-bold text-zinc-700 mb-2">Roster Slots</h3>
          <table className="w-full mb-3">
            <tbody>{hitterSlots.map(renderSlot)}</tbody>
          </table>
          <table className="w-full mb-3">
            <tbody>{pitcherSlots.map(renderSlot)}</tbody>
          </table>
          {benchSlots.length > 0 && (
            <>
              <h4 className="text-xs font-semibold text-zinc-500 mb-1 uppercase tracking-wide">Bench</h4>
              <table className="w-full">
                <tbody>{benchSlots.map(renderSlot)}</tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
