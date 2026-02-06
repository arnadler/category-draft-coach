"use client";

/**
 * DraftBoard: Main layout component that ties everything together.
 * Three-column layout on desktop, tabbed interface on mobile.
 * Plus QuickAdd at the top and settings modal.
 */

import { useState } from "react";
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
  const [mobileTab, setMobileTab] = useState<MobileTab>("picks");

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
          <div className="flex items-center gap-2 md:gap-3">
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
            otherPickCount={draftState.otherPicks.length}
            settings={settings}
            leagueDists={leagueDists}
            onUndo={handleUndoLast}
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
