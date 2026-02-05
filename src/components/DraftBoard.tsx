"use client";

/**
 * DraftBoard: Main layout component that ties everything together.
 * Three-column layout: Players | Roster | Recommendations
 * Plus QuickAdd at the top and settings modal.
 */

import { useState } from "react";
import { useDraftState } from "@/hooks/useDraftState";
import { QuickAdd } from "./QuickAdd";
import { PlayerPool } from "./PlayerPool";
import { MyRoster } from "./MyRoster";
import { Recommendations } from "./Recommendations";
import { SettingsModal } from "./SettingsModal";

export function DraftBoard() {
  const {
    isLoaded,
    settings,
    draftState,
    availablePlayers,
    rosterSlots,
    rosterTotals,
    recommendations,
    datasetMeta,
    leagueDists,
    handleDraftMe,
    handleDraftOther,
    handleUndoLast,
    handleSetRisk,
    handleImportPlayers,
    handleResetDataset,
    handleUpdateSettings,
  } = useDraftState();

  const [showSettings, setShowSettings] = useState(false);

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
      <header className="bg-white border-b border-zinc-200 shadow-sm px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-2xl font-bold text-zinc-800">
              Category Draft Coach
            </h1>
            <p className="text-sm text-zinc-500">
              Maximize your roto points with z-score analysis
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-zinc-500">
              <span className="font-bold text-blue-600">
                {draftState.myPicks.length}
              </span>{" "}
              picks |{" "}
              <span className="font-bold text-orange-500">
                {draftState.otherPicks.length}
              </span>{" "}
              off board |{" "}
              <span className="font-bold text-zinc-700">
                {availablePlayers.length}
              </span>{" "}
              available
            </div>
            <button
              onClick={() => setShowSettings(true)}
              className="px-4 py-2 bg-zinc-200 text-zinc-700 rounded-lg
                         hover:bg-zinc-300 font-semibold text-sm"
            >
              Settings
            </button>
          </div>
        </div>

        {/* Quick Add */}
        <QuickAdd
          availablePlayers={availablePlayers}
          onDraftMe={handleDraftMe}
        />
      </header>

      {/* Three-column layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Available Players */}
        <div className="w-80 flex-shrink-0 bg-white border-r border-zinc-200 flex flex-col">
          <PlayerPool
            players={availablePlayers}
            onDraftMe={handleDraftMe}
            onDraftOther={handleDraftOther}
          />
        </div>

        {/* Center: My Roster + Categories */}
        <div className="flex-1 bg-white border-r border-zinc-200 flex flex-col overflow-hidden">
          <MyRoster
            rosterSlots={rosterSlots}
            rosterTotals={rosterTotals}
            myPicks={draftState.myPicks}
            otherPickCount={draftState.otherPicks.length}
            settings={settings}
            leagueDists={leagueDists}
            onUndo={handleUndoLast}
          />
        </div>

        {/* Right: Recommendations */}
        <div className="w-96 flex-shrink-0 bg-white flex flex-col">
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
