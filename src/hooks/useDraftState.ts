"use client";

/**
 * Central state management hook for the draft.
 * Persists to localStorage so refreshing doesn't lose progress.
 *
 * Uses the draft.ts helpers for immutable state updates and
 * the simulation module for z-score league distributions.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { Player, LeagueSettings, Recommendation, RosterSlot, DraftState } from "@/lib/types";
import { DEFAULT_LEAGUE_SETTINGS } from "@/lib/defaults";
import { computeRosterTotalsFromSlots, RosterTotals } from "@/lib/stats";
import { getRecommendations } from "@/lib/recommendation";
import { assignPlayersToSlots, expandRosterSlots, getOpenSlots } from "@/lib/roster";
import {
  createEmptyDraftState,
  draftForMe,
  draftForOther,
  removeLastMyPick,
  undraftOther,
  getDraftedIds,
  buildPlayersById,
  resolveMyRosterPlayers,
} from "@/lib/draft";
import { getBundledPlayers, getBundledMeta, normalizePlayer, PlayerDatasetMeta } from "@/lib/playerData";
import { simulateLeagueDistributions, LeagueCategoryDistributions } from "@/lib/simulation";
import { useLocalStorageState } from "./useLocalStorageState";
import { STORAGE_KEYS } from "@/lib/storage";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function clamp01(v: unknown, fallback: number): number {
  const n = isNumber(v) ? v : fallback;
  return Math.max(0, Math.min(1, n));
}

function migrateLeagueSettings(stored: unknown): LeagueSettings | null {
  if (!isRecord(stored)) return null;
  const s = stored as Record<string, unknown>;

  const numTeams = isNumber(s.numTeams) ? Math.max(2, Math.round(s.numTeams)) : DEFAULT_LEAGUE_SETTINGS.numTeams;
  const useOBP = typeof s.useOBP === "boolean" ? s.useOBP : DEFAULT_LEAGUE_SETTINGS.useOBP;
  const benchMultiplier = isNumber(s.benchMultiplier)
    ? Math.max(0, Math.min(0.9, s.benchMultiplier))
    : DEFAULT_LEAGUE_SETTINGS.benchMultiplier;
  const competitiveThresholdZ = isNumber(s.competitiveThresholdZ)
    ? s.competitiveThresholdZ
    : DEFAULT_LEAGUE_SETTINGS.competitiveThresholdZ;

  // Categories: preserve enabled flags by key; keep default definitions.
  const storedCats = Array.isArray(s.categories) ? (s.categories as unknown[]) : [];
  const enabledByKey = new Map<string, boolean>();
  for (const c of storedCats) {
    if (!isRecord(c)) continue;
    const key = typeof c.key === "string" ? c.key : null;
    const enabled = typeof c.enabled === "boolean" ? c.enabled : null;
    if (key && enabled !== null) enabledByKey.set(key, enabled);
  }

  const categories = DEFAULT_LEAGUE_SETTINGS.categories.map((c) => {
    const enabled = enabledByKey.get(c.key);
    return enabled == null ? c : { ...c, enabled };
  });

  // Targets: merge, keeping numeric values only.
  const targets: Record<string, number> = { ...DEFAULT_LEAGUE_SETTINGS.targets };
  if (isRecord(s.targets)) {
    for (const [k, v] of Object.entries(s.targets)) {
      if (isNumber(v)) targets[k] = v;
    }
  }

  // Roster config: validate basic shape.
  const rosterConfig =
    isRecord(s.rosterConfig) && Array.isArray((s.rosterConfig as any).slots)
      ? {
          slots: ((s.rosterConfig as any).slots as unknown[])
            .filter((slot) => isRecord(slot) && typeof slot.label === "string" && Array.isArray(slot.eligiblePositions))
            .map((slot) => ({
              label: String((slot as any).label),
              eligiblePositions: ((slot as any).eligiblePositions as unknown[]).map((p) => String(p)),
            })),
        }
      : DEFAULT_LEAGUE_SETTINGS.rosterConfig;

  return {
    ...DEFAULT_LEAGUE_SETTINGS,
    numTeams,
    useOBP,
    benchMultiplier,
    competitiveThresholdZ,
    categories,
    targets,
    rosterConfig: rosterConfig.slots.length > 0 ? rosterConfig : DEFAULT_LEAGUE_SETTINGS.rosterConfig,
  };
}

function migrateDraftState(stored: unknown): DraftState | null {
  if (!isRecord(stored)) return null;
  const s = stored as Record<string, unknown>;

  const myPicksRaw = Array.isArray(s.myPicks) ? (s.myPicks as unknown[]) : [];
  const myPicks = myPicksRaw
    .map((p): DraftState["myPicks"][number] | null => {
      if (!isRecord(p)) return null;
      const playerId =
        typeof (p as any).playerId === "string"
          ? String((p as any).playerId)
          : isRecord((p as any).player) && typeof (p as any).player.playerId === "string"
            ? String((p as any).player.playerId)
            : null;
      if (!playerId) return null;

      const timestamp = isNumber((p as any).timestamp) ? (p as any).timestamp : Date.now();
      const round = isNumber((p as any).round) ? (p as any).round : undefined;
      const overallPick = isNumber((p as any).overallPick)
        ? (p as any).overallPick
        : isNumber((p as any).pickNumber)
          ? (p as any).pickNumber
          : undefined;

      return { playerId, timestamp, round, overallPick };
    })
    .filter((p): p is DraftState["myPicks"][number] => Boolean(p));

  const otherRaw = Array.isArray(s.otherPicks) ? (s.otherPicks as unknown[]) : [];
  const otherPicks = otherRaw
    .map((p): string | null => {
      if (typeof p === "string") return p;
      if (isRecord(p) && typeof (p as any).playerId === "string") return String((p as any).playerId);
      if (isRecord(p) && isRecord((p as any).player) && typeof (p as any).player.playerId === "string")
        return String((p as any).player.playerId);
      return null;
    })
    .filter((id): id is string => Boolean(id));

  const riskTolerance = clamp01(s.riskTolerance, 0.5);

  return { ...createEmptyDraftState(), myPicks, otherPicks, riskTolerance };
}

export function useDraftState() {
  // ── Settings ────────────────────────────────────────────────────
  const {
    value: settings,
    setValue: setSettings,
    loaded: settingsLoaded,
  } = useLocalStorageState<LeagueSettings>(
    STORAGE_KEYS.leagueSettings,
    DEFAULT_LEAGUE_SETTINGS,
    migrateLeagueSettings
  );

  // ── Draft state ─────────────────────────────────────────────────
  const {
    value: draftState,
    setValue: setDraftState,
    loaded: draftLoaded,
  } = useLocalStorageState<DraftState>(STORAGE_KEYS.draftState, createEmptyDraftState(), migrateDraftState);

  // ── Player pool ─────────────────────────────────────────────────
  const {
    value: customPlayers,
    setValue: setCustomPlayers,
    loaded: playersLoaded,
  } = useLocalStorageState<Player[] | null>(STORAGE_KEYS.customPlayers, null, (stored) => {
    if (!Array.isArray(stored)) return null;
    return (stored as unknown[])
      .filter((p) => isRecord(p))
      .map((p) => normalizePlayer(p as unknown as Player));
  });

  const {
    value: datasetMeta,
    setValue: setDatasetMeta,
    loaded: metaLoaded,
  } = useLocalStorageState<PlayerDatasetMeta>(STORAGE_KEYS.customPlayersMeta, getBundledMeta());

  const isLoaded = settingsLoaded && draftLoaded && playersLoaded && metaLoaded;

  // All players (custom or bundled)
  const allPlayers = useMemo(() => {
    if (customPlayers && customPlayers.length > 0) return customPlayers;
    return getBundledPlayers();
  }, [customPlayers]);

  const playersById = useMemo(() => buildPlayersById(allPlayers), [allPlayers]);

  // ── Simulation (runs once when settings or pool changes) ────────
  const [leagueDists, setLeagueDists] = useState<LeagueCategoryDistributions | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    // Run simulation in a timeout to not block UI
    const t = setTimeout(() => {
      const dists = simulateLeagueDistributions(allPlayers, settings, {
        iterations: 80,
        seed: 42,
      });
      setLeagueDists(dists);
    }, 50);
    return () => clearTimeout(t);
  }, [allPlayers, settings, isLoaded]);

  // ── Derived state ───────────────────────────────────────────────

  const myRoster = useMemo(
    () => resolveMyRosterPlayers(playersById, draftState),
    [playersById, draftState]
  );

  const rosterSlots: RosterSlot[] = useMemo(() => {
    const empty = expandRosterSlots(settings.rosterConfig);
    return assignPlayersToSlots(myRoster, empty);
  }, [myRoster, settings.rosterConfig]);

  const rosterTotals: RosterTotals = useMemo(
    () => computeRosterTotalsFromSlots(rosterSlots, settings.benchMultiplier),
    [rosterSlots, settings.benchMultiplier]
  );

  const availablePlayers = useMemo(() => {
    const drafted = getDraftedIds(draftState);
    return allPlayers.filter((p) => !drafted.has(p.playerId));
  }, [allPlayers, draftState]);

  // ── Recommendations ─────────────────────────────────────────────
  const recommendations: Recommendation[] = useMemo(() => {
    if (!isLoaded) return [];
    return getRecommendations(
      availablePlayers,
      myRoster,
      settings,
      leagueDists,
      draftState.riskTolerance,
      draftState.myPicks.length + draftState.otherPicks.length + 1,
      10
    );
  }, [availablePlayers, myRoster, settings, leagueDists, draftState, isLoaded]);

  // ── Actions ─────────────────────────────────────────────────────

  const handleDraftMe = useCallback(
    (playerId: string) => {
      setDraftState((prev) => draftForMe(prev, playerId));
    },
    [setDraftState]
  );

  const handleDraftOther = useCallback(
    (playerId: string) => {
      setDraftState((prev) => draftForOther(prev, playerId));
    },
    [setDraftState]
  );

  const handleUndoLast = useCallback(() => {
    setDraftState((prev) => removeLastMyPick(prev));
  }, [setDraftState]);

  const handleUndoOther = useCallback(
    (playerId: string) => {
      setDraftState((prev) => undraftOther(prev, playerId));
    },
    [setDraftState]
  );

  const handleSetRisk = useCallback(
    (risk: number) => {
      setDraftState((prev) => ({ ...prev, riskTolerance: risk }));
    },
    [setDraftState]
  );

  const handleImportPlayers = useCallback(
    (players: Player[], meta: PlayerDatasetMeta) => {
      setCustomPlayers(players);
      setDatasetMeta(meta);
      // Reset draft when importing new players
      setDraftState(createEmptyDraftState());
    },
    [setCustomPlayers, setDatasetMeta, setDraftState]
  );

  const handleResetDataset = useCallback(() => {
    setCustomPlayers(null);
    setDatasetMeta(getBundledMeta());
    setDraftState(createEmptyDraftState());
  }, [setCustomPlayers, setDatasetMeta, setDraftState]);

  const handleResetDraft = useCallback(() => {
    setDraftState(createEmptyDraftState());
  }, [setDraftState]);

  const handleUpdateSettings = useCallback(
    (next: LeagueSettings) => {
      setSettings(next);
    },
    [setSettings]
  );

  return {
    // State
    isLoaded,
    settings,
    draftState,
    allPlayers,
    availablePlayers,
    myRoster,
    rosterSlots,
    rosterTotals,
    recommendations,
    datasetMeta,
    leagueDists,

    // Actions
    handleDraftMe,
    handleDraftOther,
    handleUndoLast,
    handleUndoOther,
    handleSetRisk,
    handleImportPlayers,
    handleResetDataset,
    handleResetDraft,
    handleUpdateSettings,
  };
}
