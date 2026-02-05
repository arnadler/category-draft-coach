"use client";

/**
 * Recommendations panel: Right side of the draft board.
 * Shows top 5 recommended players with z-score analysis and explanations.
 * Includes risk/variance slider.
 */

import { Recommendation, LeagueSettings } from "@/lib/types";
import { formatStat } from "@/lib/stats";

interface RecommendationsProps {
  recommendations: Recommendation[];
  settings: LeagueSettings;
  riskTolerance: number;
  onRiskChange: (value: number) => void;
  onDraftMe: (playerId: string) => void;
}

function ImpactBadge({
  label,
  tone,
}: {
  label: string;
  tone: "good" | "bad" | "neutral";
}) {
  const cls =
    tone === "good"
      ? "bg-green-100 text-green-700"
      : tone === "bad"
        ? "bg-red-100 text-red-700"
        : "bg-zinc-100 text-zinc-700";
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono font-semibold mr-1 mb-1 ${cls}`}
    >
      {label}
    </span>
  );
}

export function Recommendations({
  recommendations,
  settings,
  riskTolerance,
  onRiskChange,
  onDraftMe,
}: RecommendationsProps) {
  const activeCategories = settings.categories.filter((c) => c.enabled);

  const riskLabel =
    riskTolerance < 0.3
      ? "Conservative"
      : riskTolerance > 0.7
        ? "Aggressive"
        : "Balanced";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-zinc-200 bg-zinc-50">
        <h2 className="text-lg font-bold text-zinc-800 mb-2">
          Recommended Picks
        </h2>

        <div className="mb-1">
          <div className="flex justify-between text-xs text-zinc-500 mb-1">
            <span>Safe picks</span>
            <span className="font-bold text-zinc-700">{riskLabel}</span>
            <span>High upside</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={riskTolerance}
            onChange={(e) => onRiskChange(parseFloat(e.target.value))}
            className="w-full h-2 accent-blue-600"
          />
        </div>
      </div>

      {/* Recommendations list */}
      <div className="flex-1 overflow-y-auto">
        {recommendations.length === 0 ? (
          <div className="p-6 text-center text-zinc-400">
            <p className="text-lg mb-2">No recommendations yet</p>
            <p className="text-sm">
              Start drafting players to see recommendations based on category balance.
            </p>
          </div>
        ) : (
          recommendations.slice(0, 5).map((rec, idx) => (
            <div
              key={rec.player.playerId}
              className="p-3 border-b border-zinc-200 hover:bg-zinc-50 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-start gap-2">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center
                      text-sm font-bold text-white flex-shrink-0
                      ${idx === 0 ? "bg-green-600" : idx === 1 ? "bg-blue-600" : "bg-zinc-400"}`}
                  >
                    {idx + 1}
                  </div>
                  <div>
                    <div className="font-bold text-zinc-800">{rec.player.name}</div>
                    <div className="text-xs text-zinc-500">
                      {rec.player.team} — {rec.player.positions.join("/")}
                      {rec.player.ADP ? ` — ADP ${rec.player.ADP}` : ""}
                      {typeof rec.player.risk === "number"
                        ? ` — Risk ${Math.round(rec.player.risk * 100)}%`
                        : ""}
                    </div>
                    <div className="text-xs text-zinc-400 mt-0.5">{rec.positionNote}</div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div
                    className={`text-sm font-bold px-2 py-0.5 rounded
                      ${rec.totalZGain > 0.5
                        ? "bg-green-100 text-green-700"
                        : rec.totalZGain > 0.2
                          ? "bg-blue-100 text-blue-700"
                          : "bg-zinc-100 text-zinc-600"
                      }`}
                  >
                    +{rec.totalZGain.toFixed(2)} Z
                  </div>
                  <button
                    onClick={() => onDraftMe(rec.player.playerId)}
                    className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg
                               hover:bg-green-700 font-semibold"
                  >
                    Draft
                  </button>
                </div>
              </div>

              <p className="text-xs text-zinc-600 mb-2 leading-relaxed">{rec.explanation}</p>

              <div className="flex flex-wrap">
                {activeCategories.map((cat) => {
                  const zImp = rec.categoryImpact[cat.key];
                  const raw = rec.rawImpact[cat.key];
                  if (!zImp || !raw) return null;
                  if (Math.abs(zImp.delta) < 0.01) return null;

                  const tone: "good" | "bad" | "neutral" =
                    zImp.delta > 0.01 ? "good" : zImp.delta < -0.01 ? "bad" : "neutral";

                  const isRate = ["AVG", "OBP", "ERA", "WHIP"].includes(cat.key);
                  const showValueInsteadOfDelta = isRate && raw.before === 0;

                  const label = showValueInsteadOfDelta
                    ? `${cat.key} ${formatStat(cat.key, raw.after)}`
                    : `${cat.key} ${raw.delta > 0 ? "+" : ""}${formatStat(cat.key, raw.delta)}`;

                  return <ImpactBadge key={cat.key} label={label} tone={tone} />;
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
