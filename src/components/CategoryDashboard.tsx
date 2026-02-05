"use client";

import { CategoryDef } from "@/lib/types";
import { formatStat } from "@/lib/stats";

function ZBar({ z }: { z: number }) {
  const clamped = Math.max(-3, Math.min(3, z));
  const pct = ((clamped + 3) / 6) * 100;
  const isPos = clamped >= 0;
  const fillFrom = isPos ? 50 : pct;
  const fillTo = isPos ? pct : 50;

  return (
    <div className="relative h-3 w-full rounded-full bg-zinc-200">
      <div className="absolute inset-y-0 left-1/2 w-px bg-zinc-500/70" />
      <div
        className={[
          "absolute inset-y-0 rounded-full",
          isPos ? "bg-emerald-600" : "bg-rose-600",
        ].join(" ")}
        style={{ left: `${fillFrom}%`, right: `${100 - fillTo}%` }}
      />
    </div>
  );
}

export function CategoryDashboard({
  categories,
  values,
  zScores,
  weights,
  totalZ,
  weightedZ,
}: {
  categories: CategoryDef[];
  values: Record<string, number>;
  zScores: Record<string, number>;
  weights: Record<string, number>;
  totalZ: number;
  weightedZ: number;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-4 py-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="text-base font-semibold text-zinc-900">Category Dashboard</div>
          <div className="text-sm text-zinc-700">
            Total Z: <span className="font-semibold text-zinc-900">{totalZ.toFixed(2)}</span>{" "}
            <span className="text-zinc-400">•</span> Weighted:{" "}
            <span className="font-semibold text-zinc-900">{weightedZ.toFixed(2)}</span>
          </div>
        </div>
        <div className="mt-1 text-xs text-zinc-600">
          Z-score compares your totals to a simulated league distribution (higher is better; ERA/WHIP inverted).
        </div>
      </div>

      <div className="grid gap-2 p-4">
        {categories.map((c) => {
          const val = values[c.key] ?? 0;
          const z = zScores[c.key] ?? 0;
          const w = weights[c.key] ?? 1;
          return (
            <div key={c.key} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-zinc-900">{c.label}</div>
                  <div className="text-xs text-zinc-600">
                    {c.key}: <span className="font-semibold text-zinc-900">{formatStat(c.key, val)}</span>{" "}
                    <span className="text-zinc-400">•</span> z{" "}
                    <span className="font-semibold text-zinc-900">{z.toFixed(2)}</span>
                    {w !== 1 ? (
                      <>
                        {" "}
                        <span className="text-zinc-400">•</span> weight{" "}
                        <span className="font-semibold text-zinc-900">{w.toFixed(2)}</span>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="w-40 shrink-0">
                  <ZBar z={z} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

