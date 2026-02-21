"use client";

/**
 * DraftBoard: Main layout component that ties everything together.
 * Three-column layout on desktop, tabbed interface on mobile.
 * Plus QuickAdd at the top and settings modal.
 */

import { useEffect, useRef, useState } from "react";
import { useDraftState } from "@/hooks/useDraftState";
import { QuickAdd } from "./QuickAdd";
import { PlayerPool } from "./PlayerPool";
import { MyRoster } from "./MyRoster";
import { Recommendations } from "./Recommendations";
import { SettingsModal } from "./SettingsModal";

type MobileTab = "players" | "roster" | "picks";

export function DraftBoard() {
  const {
    isLoaded,
    settings,
    draftState,
    availablePlayers,
    offBoardPlayers,
    rosterSlots,
    rosterTotals,
    recommendations,
    datasetMeta,
    leagueDists,
    extensionSync,
    handleDraftMe,
    handleDraftOther,
    handleUndoLast,
    handleUndoOther,
    handleSetRisk,
    handleImportPlayers,
    handleResetDataset,
    handleResetDraft,
    handleRestoreBackup,
    handleUpdateSettings,
  } = useDraftState();

  const [showSettings, setShowSettings] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("picks");
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isLoaded) return;
    setLastSaved(new Date());
  }, [draftState, settings, isLoaded]);

  const handleExportDraft = () => {
    const data = { version: 1, exportedAt: Date.now(), settings, draftState };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `draft-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target?.result as string);
        handleRestoreBackup(data);
      } catch {
        alert("Could not read backup file. Make sure it's a valid draft backup JSON.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const syncLabel = !extensionSync.extensionDetected
    ? "Install CBS Sync extension"
    : !extensionSync.extensionEnabled
      ? "CBS sync paused"
      : extensionSync.cbsConnected
        ? "CBS sync live"
        : "Waiting for CBS draft room";

  const syncPillClass = !extensionSync.extensionDetected
    ? "bg-zinc-100 text-zinc-700 border-zinc-200"
    : !extensionSync.extensionEnabled
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : extensionSync.cbsConnected
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : "bg-blue-50 text-blue-700 border-blue-200";

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-50">
        <div className="text-center">
          <p className="text-xl text-zinc-600">Loading Draft Coach...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-zinc-100">
      {/* Top bar */}
      <header className="bg-white border-b border-zinc-200 shadow-sm px-3 py-2 md:px-4 md:py-3">
        <div className="flex items-center justify-between mb-2 md:mb-3">
          <div>
            <h1 className="text-lg md:text-2xl font-bold text-zinc-800">
              Category Draft Coach
            </h1>
            <p className="text-xs md:text-sm text-zinc-500 hidden sm:block">
              Maximize your roto points with z-score analysis
            </p>
          </div>
          <div className="flex items-center gap-2 md:gap-3 flex-wrap justify-end">
            {lastSaved && (
              <span className="hidden sm:inline text-xs text-green-600 font-medium">
                ✓ Saved {lastSaved.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <div className="text-xs md:text-sm text-zinc-500">
              <span className="font-bold text-blue-600">
                {draftState.myPicks.length}
              </span>{" "}
              <span className="hidden sm:inline">picks</span>
              <span className="sm:hidden">P</span> |{" "}
              <span className="font-bold text-orange-500">
                {draftState.otherPicks.length}
              </span>{" "}
              <span className="hidden sm:inline">off board</span>
              <span className="sm:hidden">O</span> |{" "}
              <span className="font-bold text-zinc-700">
                {availablePlayers.length}
              </span>{" "}
              <span className="hidden sm:inline">available</span>
              <span className="sm:hidden">A</span>
            </div>
            <button
              onClick={handleExportDraft}
              title="Save a backup file you can restore later"
              className="px-2 py-1.5 md:px-3 md:py-2 bg-emerald-100 text-emerald-700 rounded-lg
                         hover:bg-emerald-200 font-semibold text-xs md:text-sm"
            >
              <span className="hidden sm:inline">Backup</span>
              <span className="sm:hidden">💾</span>
            </button>
            <button
              onClick={() => importInputRef.current?.click()}
              title="Restore from a previously saved backup file"
              className="px-2 py-1.5 md:px-3 md:py-2 bg-zinc-100 text-zinc-600 rounded-lg
                         hover:bg-zinc-200 font-semibold text-xs md:text-sm"
            >
              <span className="hidden sm:inline">Restore</span>
              <span className="sm:hidden">📂</span>
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleImportBackup}
            />
            {showResetConfirm ? (
              <div className="flex items-center gap-1">
                <span className="text-xs text-zinc-600 hidden sm:inline">Clear all picks?</span>
                <button
                  onClick={() => { handleResetDraft(); setShowResetConfirm(false); }}
                  className="px-2 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold text-xs"
                >
                  Yes
                </button>
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="px-2 py-1.5 bg-zinc-200 text-zinc-700 rounded-lg hover:bg-zinc-300 font-semibold text-xs"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowResetConfirm(true)}
                title="Clear all draft picks and start over"
                className="px-2 py-1.5 md:px-3 md:py-2 bg-red-100 text-red-600 rounded-lg
                           hover:bg-red-200 font-semibold text-xs md:text-sm"
              >
                <span className="hidden sm:inline">Reset</span>
                <span className="sm:hidden">🗑️</span>
              </button>
            )}
            <button
              onClick={() => setShowSettings(true)}
              className="px-2 py-1.5 md:px-4 md:py-2 bg-zinc-200 text-zinc-700 rounded-lg
                         hover:bg-zinc-300 font-semibold text-xs md:text-sm"
            >
              <span className="hidden sm:inline">Settings</span>
              <span className="sm:hidden">⚙️</span>
            </button>
          </div>
        </div>

        {/* Quick Add */}
        <QuickAdd
          availablePlayers={availablePlayers}
          onDraftMe={handleDraftMe}
        />

        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs md:text-sm">
          <div className={`rounded-full border px-3 py-1 font-semibold ${syncPillClass}`}>
            {syncLabel}
          </div>
          {extensionSync.syncedOtherPickCount > 0 ? (
            <div className="text-zinc-600">
              Auto-removed <span className="font-semibold text-zinc-800">{extensionSync.syncedOtherPickCount}</span>{" "}
              off-board picks
            </div>
          ) : null}
          {extensionSync.lastPickName ? (
            <div className="text-zinc-600">
              Last sync: <span className="font-semibold text-zinc-800">{extensionSync.lastPickName}</span>
            </div>
          ) : null}
          {extensionSync.lastUnmatchedName ? (
            <div className="text-amber-700">
              Needs review: <span className="font-semibold">{extensionSync.lastUnmatchedName}</span>
            </div>
          ) : null}
        </div>

        {/* Mobile Tab Bar */}
        <div className="flex md:hidden mt-2 border-t border-zinc-200 pt-2 gap-1">
          <button
            onClick={() => setMobileTab("players")}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
              mobileTab === "players"
                ? "bg-blue-600 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            }`}
          >
            Players
          </button>
          <button
            onClick={() => setMobileTab("roster")}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
              mobileTab === "roster"
                ? "bg-blue-600 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            }`}
          >
            My Roster
          </button>
          <button
            onClick={() => setMobileTab("picks")}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
              mobileTab === "picks"
                ? "bg-blue-600 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            }`}
          >
            Top Picks
          </button>
        </div>
      </header>

      {/* Three-column layout (desktop) / Single panel (mobile) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Available Players */}
        <div
          className={`${
            mobileTab === "players" ? "flex" : "hidden"
          } md:flex w-full md:w-80 flex-shrink-0 bg-white md:border-r border-zinc-200 flex-col`}
        >
          <PlayerPool
            players={availablePlayers}
            onDraftMe={handleDraftMe}
            onDraftOther={handleDraftOther}
          />
        </div>

        {/* Center: My Roster + Categories */}
        <div
          className={`${
            mobileTab === "roster" ? "flex" : "hidden"
          } md:flex flex-1 bg-white md:border-r border-zinc-200 flex-col overflow-hidden`}
        >
          <MyRoster
            rosterSlots={rosterSlots}
            rosterTotals={rosterTotals}
            myPicks={draftState.myPicks}
            offBoardPlayers={offBoardPlayers}
            settings={settings}
            leagueDists={leagueDists}
            onUndo={handleUndoLast}
            onUndoOther={handleUndoOther}
          />
        </div>

        {/* Right: Recommendations */}
        <div
          className={`${
            mobileTab === "picks" ? "flex" : "hidden"
          } md:flex w-full md:w-96 flex-shrink-0 bg-white flex-col`}
        >
          <Recommendations
            recommendations={recommendations}
            settings={settings}
            riskTolerance={draftState.riskTolerance}
            onRiskChange={handleSetRisk}
            onDraftMe={handleDraftMe}
          />
        </div>
      </div>

      {/* Settings Modal */}
      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onChangeSettings={handleUpdateSettings}
        datasetMeta={datasetMeta}
        onImportPlayers={(players, meta, _warnings) => {
          handleImportPlayers(players, meta);
        }}
        onResetDataset={handleResetDataset}
      />
    </div>
  );
}
