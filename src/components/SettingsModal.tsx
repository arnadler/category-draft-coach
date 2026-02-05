"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { parseCsv } from "@/lib/csv";
import { autoDetectColumnMap, CsvColumnMap, importPlayersFromRows } from "@/lib/importPlayers";
import { normalizePlayer } from "@/lib/playerData";
import { buildRosterConfigFromCounts, getRosterCounts, RosterCounts } from "@/lib/rosterConfig";
import { CategoryDef, LeagueSettings, Player } from "@/lib/types";

type DatasetMeta = {
  source: "bundled" | "imported";
  name: string;
  importedAt?: number;
  rowCount: number;
};

function toggleCategory(categories: CategoryDef[], key: string, enabled: boolean): CategoryDef[] {
  return categories.map((c) => (c.key === key ? { ...c, enabled } : c));
}

function setRateMode(settings: LeagueSettings, mode: "AVG" | "OBP") {
  let cats = settings.categories;
  if (mode === "AVG") {
    cats = toggleCategory(cats, "AVG", true);
    cats = toggleCategory(cats, "OBP", false);
  } else {
    cats = toggleCategory(cats, "AVG", false);
    cats = toggleCategory(cats, "OBP", true);
  }
  return { ...settings, useOBP: mode === "OBP", categories: cats };
}

function prettyTime(ts?: number) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "";
  }
}

export function SettingsModal({
  open,
  onClose,
  settings,
  onChangeSettings,
  datasetMeta,
  onImportPlayers,
  onResetDataset,
}: {
  open: boolean;
  onClose: () => void;
  settings: LeagueSettings;
  onChangeSettings: (next: LeagueSettings) => void;
  datasetMeta: DatasetMeta;
  onImportPlayers: (players: Player[], meta: DatasetMeta, warnings: string[]) => void;
  onResetDataset: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"league" | "categories" | "roster" | "targets" | "import">(
    "league"
  );

  const rosterCounts = useMemo(() => getRosterCounts(settings.rosterConfig), [settings.rosterConfig]);

  const updateCounts = (nextCounts: RosterCounts) => {
    onChangeSettings({ ...settings, rosterConfig: buildRosterConfigFromCounts(nextCounts) });
  };

  // CSV import state
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [columnMap, setColumnMap] = useState<CsvColumnMap>({});
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importError, setImportError] = useState<string>("");

  const rateMode: "AVG" | "OBP" = settings.categories.find((c) => c.key === "OBP")?.enabled ? "OBP" : "AVG";

  const tabButton = (key: typeof activeTab, label: string) => (
    <button
      type="button"
      onClick={() => setActiveTab(key)}
      className={[
        "rounded-full px-4 py-2 text-sm font-semibold",
        activeTab === key ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-800 hover:bg-zinc-200",
      ].join(" ")}
    >
      {label}
    </button>
  );

  const onPickFile = async (file: File | null) => {
    setImportError("");
    setImportWarnings([]);
    setCsvHeaders([]);
    setCsvRows([]);
    setColumnMap({});
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      setCsvHeaders(parsed.headers);
      setCsvRows(parsed.rows);
      setColumnMap(autoDetectColumnMap(parsed.headers));
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Could not read that CSV file.");
    }
  };

  const importNow = () => {
    setImportError("");
    setImportWarnings([]);
    try {
      const { players, warnings } = importPlayersFromRows(csvRows, columnMap);
      const normalized = players.map(normalizePlayer);
      const meta: DatasetMeta = {
        source: "imported",
        name: "Imported CSV",
        importedAt: Date.now(),
        rowCount: normalized.length,
      };
      setImportWarnings(warnings);
      onImportPlayers(normalized, meta, warnings);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Import failed.");
    }
  };

  const updateCategory = (key: string, enabled: boolean) => {
    onChangeSettings({ ...settings, categories: toggleCategory(settings.categories, key, enabled) });
  };

  const enabledCats = settings.categories.filter((c) => c.enabled);

  return (
    <Modal open={open} title="League Settings" onClose={onClose}>
      <div className="flex flex-wrap gap-2 pb-4">{tabButton("league", "League")}{tabButton("categories", "Categories")}{tabButton("roster", "Roster")}{tabButton("targets", "Targets")}{tabButton("import", "Import CSV")}</div>

      {activeTab === "league" && (
        <div className="grid gap-5 md:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-sm font-semibold text-zinc-900">Basics</div>
            <div className="mt-3 grid gap-3">
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-zinc-800">Teams</span>
                <input
                  type="number"
                  min={8}
                  max={20}
                  value={settings.numTeams}
                  onChange={(e) =>
                    onChangeSettings({ ...settings, numTeams: Math.max(2, Number(e.target.value || 12)) })
                  }
                  className="h-11 rounded-lg border border-zinc-300 bg-white px-3 text-base"
                />
              </label>

              <label className="grid gap-1 text-sm">
                <span className="font-medium text-zinc-800">Bench usage (projection)</span>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={0.6}
                    step={0.05}
                    value={settings.benchMultiplier}
                    onChange={(e) =>
                      onChangeSettings({ ...settings, benchMultiplier: Number(e.target.value) })
                    }
                    className="w-full"
                  />
                  <span className="w-16 text-right font-mono text-sm text-zinc-700">
                    {Math.round(settings.benchMultiplier * 100)}%
                  </span>
                </div>
                <span className="text-xs text-zinc-600">
                  Bench players count at a discount (helps prevent “bench hoarding” in projections).
                </span>
              </label>

              <label className="grid gap-1 text-sm">
                <span className="font-medium text-zinc-800">Competitive threshold (z-score)</span>
                <input
                  type="number"
                  step={0.1}
                  value={settings.competitiveThresholdZ}
                  onChange={(e) =>
                    onChangeSettings({ ...settings, competitiveThresholdZ: Number(e.target.value) })
                  }
                  className="h-11 rounded-lg border border-zinc-300 bg-white px-3 text-base"
                />
                <span className="text-xs text-zinc-600">
                  Categories below this get extra emphasis in recommendations. Default: 0 (league average).
                </span>
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="text-sm font-semibold text-zinc-900">Player Dataset</div>
            <div className="mt-2 text-sm text-zinc-700">
              <div><span className="font-medium">Source:</span> {datasetMeta.name}</div>
              <div><span className="font-medium">Rows:</span> {datasetMeta.rowCount}</div>
              {datasetMeta.importedAt ? (
                <div><span className="font-medium">Imported:</span> {prettyTime(datasetMeta.importedAt)}</div>
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  onResetDataset();
                  setImportWarnings([]);
                  setImportError("");
                }}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
              >
                Reset to Sample
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("import")}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
              >
                Import CSV…
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "categories" && (
        <div className="grid gap-5 md:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="text-sm font-semibold text-zinc-900">Hitting</div>
            <div className="mt-3 grid gap-2">
              {settings.categories.filter((c) => c.type === "hitter" && !["AVG", "OBP"].includes(c.key)).map((c) => (
                <label key={c.key} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2">
                  <span className="text-base font-medium text-zinc-900">{c.label}</span>
                  <input
                    type="checkbox"
                    checked={c.enabled}
                    onChange={(e) => updateCategory(c.key, e.target.checked)}
                    className="h-5 w-5"
                  />
                </label>
              ))}
            </div>

            <div className="mt-4 rounded-lg bg-zinc-50 p-3">
              <div className="text-sm font-semibold text-zinc-900">Rate stat</div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => onChangeSettings(setRateMode(settings, "AVG"))}
                  className={[
                    "flex-1 rounded-lg px-3 py-2 text-sm font-semibold",
                    rateMode === "AVG" ? "bg-zinc-900 text-white" : "bg-white text-zinc-800 border border-zinc-200 hover:bg-zinc-50",
                  ].join(" ")}
                >
                  AVG
                </button>
                <button
                  type="button"
                  onClick={() => onChangeSettings(setRateMode(settings, "OBP"))}
                  className={[
                    "flex-1 rounded-lg px-3 py-2 text-sm font-semibold",
                    rateMode === "OBP" ? "bg-zinc-900 text-white" : "bg-white text-zinc-800 border border-zinc-200 hover:bg-zinc-50",
                  ].join(" ")}
                >
                  OBP
                </button>
              </div>
              <div className="mt-1 text-xs text-zinc-600">
                Most leagues use one of AVG or OBP.
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="text-sm font-semibold text-zinc-900">Pitching</div>
            <div className="mt-3 grid gap-2">
              {settings.categories.filter((c) => c.type === "pitcher").map((c) => (
                <label key={c.key} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2">
                  <span className="text-base font-medium text-zinc-900">{c.label}</span>
                  <input
                    type="checkbox"
                    checked={c.enabled}
                    onChange={(e) => updateCategory(c.key, e.target.checked)}
                    className="h-5 w-5"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "roster" && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="text-sm font-semibold text-zinc-900">Roster Slots</div>
          <div className="mt-1 text-sm text-zinc-600">
            Use + / − to match your league. (This app auto-assigns your picks into these slots.)
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {(
              [
                ["C", "Catcher"],
                ["1B", "First Base"],
                ["2B", "Second Base"],
                ["3B", "Third Base"],
                ["SS", "Shortstop"],
                ["OF", "Outfield"],
                ["UTIL", "Utility (any hitter)"],
                ["SP", "Starting Pitcher"],
                ["RP", "Relief Pitcher"],
                ["P", "Pitcher (SP/RP)"],
                ["BN", "Bench"],
              ] as Array<[keyof RosterCounts, string]>
            ).map(([key, label]) => {
              const value = rosterCounts[key] ?? 0;
              return (
                <div key={key} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3">
                  <div>
                    <div className="text-base font-semibold text-zinc-900">{key}</div>
                    <div className="text-xs text-zinc-600">{label}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateCounts({ ...rosterCounts, [key]: Math.max(0, value - 1) })}
                      className="h-10 w-10 rounded-lg border border-zinc-300 bg-white text-lg font-bold text-zinc-800 hover:bg-zinc-50"
                      aria-label={`Decrease ${key}`}
                    >
                      −
                    </button>
                    <div className="w-10 text-center text-lg font-semibold text-zinc-900">{value}</div>
                    <button
                      type="button"
                      onClick={() => updateCounts({ ...rosterCounts, [key]: Math.min(20, value + 1) })}
                      className="h-10 w-10 rounded-lg border border-zinc-300 bg-white text-lg font-bold text-zinc-800 hover:bg-zinc-50"
                      aria-label={`Increase ${key}`}
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 text-sm text-zinc-700">
            Total slots:{" "}
            <span className="font-semibold text-zinc-900">{settings.rosterConfig.slots.length}</span>
          </div>
        </div>
      )}

      {activeTab === "targets" && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="text-sm font-semibold text-zinc-900">Targets (Optional)</div>
          <div className="mt-1 text-sm text-zinc-600">
            The app primarily uses simulated z-scores. Targets are a fallback and a useful sanity check.
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {enabledCats.map((c) => (
              <label key={c.key} className="grid gap-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3">
                <span className="text-sm font-semibold text-zinc-900">{c.label}</span>
                <input
                  type="number"
                  step={c.key === "AVG" || c.key === "OBP" || c.key === "ERA" || c.key === "WHIP" ? 0.001 : 1}
                  value={settings.targets[c.key] ?? ""}
                  onChange={(e) =>
                    onChangeSettings({
                      ...settings,
                      targets: { ...settings.targets, [c.key]: Number(e.target.value) },
                    })
                  }
                  className="h-11 rounded-lg border border-zinc-300 bg-white px-3 text-base"
                />
              </label>
            ))}
          </div>
        </div>
      )}

      {activeTab === "import" && (
        <div className="grid gap-5">
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="text-sm font-semibold text-zinc-900">Import Projection CSV</div>
            <div className="mt-1 text-sm text-zinc-600">
              Upload a CSV and map columns. Minimum required: <span className="font-medium">Name</span> and{" "}
              <span className="font-medium">Positions</span>.
            </div>

            <div className="mt-4 grid gap-3">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-zinc-700 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-zinc-800"
              />

              {importError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {importError}
                </div>
              ) : null}

              {csvHeaders.length > 0 ? (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <div className="text-sm font-semibold text-zinc-900">Column Mapping</div>
                  <div className="mt-2 grid gap-3 md:grid-cols-2">
                    {(
                      [
                        ["name", "Name (required)"],
                        ["positions", "Positions (required)"],
                        ["team", "Team"],
                        ["hitterOrPitcher", "Hitter/Pitcher"],
                        ["overallRank", "Overall Rank / Value"],
                        ["ADP", "ADP"],
                        ["risk", "Risk (0-1)"],
                      ] as Array<[keyof CsvColumnMap, string]>
                    ).map(([key, label]) => (
                      <label key={key} className="grid gap-1 text-sm">
                        <span className="font-medium text-zinc-800">{label}</span>
                        <select
                          value={(columnMap[key] as string) ?? ""}
                          onChange={(e) => setColumnMap({ ...columnMap, [key]: e.target.value || undefined })}
                          className="h-11 rounded-lg border border-zinc-300 bg-white px-3 text-base"
                        >
                          <option value="">—</option>
                          {csvHeaders.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>

                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-semibold text-zinc-900">
                      Map stat columns (optional)
                    </summary>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      {(
                        [
                          "R",
                          "HR",
                          "RBI",
                          "SB",
                          "AB",
                          "H",
                          "BB",
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
                        ] as const
                      ).map((key) => (
                        <label key={key} className="grid gap-1 text-sm">
                          <span className="font-medium text-zinc-800">{key}</span>
                          <select
                            value={(columnMap[key] as string) ?? ""}
                            onChange={(e) =>
                              setColumnMap({ ...columnMap, [key]: e.target.value || undefined })
                            }
                            className="h-11 rounded-lg border border-zinc-300 bg-white px-3 text-base"
                          >
                            <option value="">—</option>
                            {csvHeaders.map((h) => (
                              <option key={h} value={h}>
                                {h}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                  </details>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setColumnMap(autoDetectColumnMap(csvHeaders))}
                      className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                    >
                      Auto-map
                    </button>
                    <button
                      type="button"
                      onClick={importNow}
                      className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
                      disabled={!columnMap.name || !columnMap.positions}
                      title={!columnMap.name || !columnMap.positions ? "Map Name and Positions first." : ""}
                    >
                      Import Players
                    </button>
                    <div className="text-sm text-zinc-700">
                      Rows detected: <span className="font-semibold text-zinc-900">{csvRows.length}</span>
                    </div>
                  </div>

                  {importWarnings.length > 0 ? (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      <div className="font-semibold">Notes</div>
                      <ul className="list-disc pl-5">
                        {importWarnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="mt-3 text-xs text-zinc-600">
                    Tip: If your file has separate hitter and pitcher tabs, export each to CSV and import them one at a time.
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

