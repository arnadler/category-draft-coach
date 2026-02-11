"use client";

/**
 * Central state management hook for the draft.
 * Persists to localStorage so refreshing doesn't lose progress.
 *
 * Uses the draft.ts helpers for immutable state updates and
 * the simulation module for z-score league distributions.
 */

import Fuse from "fuse.js";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Player, LeagueSettings, Recommendation, RosterSlot, DraftState } from "@/lib/types";
import { DEFAULT_LEAGUE_SETTINGS } from "@/lib/defaults";
import { computeRosterTotalsFromSlots, RosterTotals } from "@/lib/stats";
import { getRecommendations } from "@/lib/recommendation";
import { assignPlayersToSlots, expandRosterSlots } from "@/lib/roster";
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
import { extractNameFromDraftRoomText, normalizePlayerName } from "@/lib/names";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

type ExtensionPickPayload = {
  eventId?: string;
  name?: string;
  normalizedName?: string;
  detectedAt?: number;
};

type ExtensionSyncStatus = {
  extensionDetected: boolean;
  extensionEnabled: boolean;
  cbsConnected: boolean;
  lastCbsHeartbeatAt: number | null;
  lastPickName: string | null;
  lastPickAt: number | null;
  syncedOtherPickCount: number;
  unmatchedPickCount: number;
  lastUnmatchedName: string | null;
};

type SearchPlayerRow = {
  playerId: string;
  name: string;
  _searchName: string;
};

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

  const availableSearchRows = useMemo<SearchPlayerRow[]>(
    () =>
      availablePlayers.map((p) => ({
        playerId: p.playerId,
        name: p.name,
        _searchName: normalizePlayerName(p.name),
      })),
    [availablePlayers]
  );

  const availableSearchFuse = useMemo(
    () =>
      new Fuse(availableSearchRows, {
        keys: ["_searchName"],
        threshold: 0.32,
        ignoreLocation: true,
        minMatchCharLength: 2,
      }),
    [availableSearchRows]
  );

  const [extensionSync, setExtensionSync] = useState<ExtensionSyncStatus>({
    extensionDetected: false,
    extensionEnabled: true,
    cbsConnected: false,
    lastCbsHeartbeatAt: null,
    lastPickName: null,
    lastPickAt: null,
    syncedOtherPickCount: 0,
    unmatchedPickCount: 0,
    lastUnmatchedName: null,
  });

  const seenExtensionEventsRef = useRef<Set<string>>(new Set());

  const matchSyncedPickToPlayerId = useCallback(
    (pickName: string, normalizedFromExtension?: string): string | null => {
      const extracted = extractNameFromDraftRoomText(pickName);
      const query = normalizePlayerName(normalizedFromExtension ?? extracted);
      if (!query) return null;

      const exact = availableSearchRows.find((p) => p._searchName === query);
      if (exact) return exact.playerId;

      const results = availableSearchFuse.search(query).slice(0, 2);
      const best = results[0];
      const second = results[1];
      if (!best) return null;
      const bestScore = best.score ?? 1;
      const secondScore = second?.score ?? 1;
      if (bestScore < 0.16 || (bestScore < 0.24 && secondScore - bestScore > 0.08)) {
        return best.item.playerId;
      }
      return null;
    },
    [availableSearchRows, availableSearchFuse]
  );

  useEffect(() => {
    if (!isLoaded || typeof window === "undefined") return;

    const onWindowMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== window || !isRecord(event.data)) return;
      const payload = event.data;
      if (payload.source !== "cdc-extension" || !isString(payload.type)) return;

      const now = Date.now();

      if (payload.type === "CBS_SYNC_STATUS") {
        const heartbeat = isNumber(payload.lastCbsHeartbeatAt) ? payload.lastCbsHeartbeatAt : null;
        const isConnected = heartbeat != null && now - heartbeat < 30000;
        setExtensionSync((prev) => ({
          ...prev,
          extensionDetected: true,
          extensionEnabled: typeof payload.enabled === "boolean" ? payload.enabled : prev.extensionEnabled,
          cbsConnected: isConnected,
          lastCbsHeartbeatAt: heartbeat ?? prev.lastCbsHeartbeatAt,
        }));
        return;
      }

      if (payload.type !== "CBS_DRAFT_PICKS" || !Array.isArray(payload.picks)) return;

      const matchedIds: string[] = [];
      let lastMatchedName: string | null = null;
      let unmatchedInMessage = 0;
      let lastUnmatchedName: string | null = null;
      const seen = seenExtensionEventsRef.current;

      for (const rawPick of payload.picks as ExtensionPickPayload[]) {
        if (!isRecord(rawPick)) continue;
        const name = isString(rawPick.name) ? rawPick.name.trim() : "";
        if (!name) continue;
        const normalized = isString(rawPick.normalizedName)
          ? normalizePlayerName(rawPick.normalizedName)
          : normalizePlayerName(extractNameFromDraftRoomText(name));
        if (!normalized) continue;
        const detectedAt = isNumber(rawPick.detectedAt) ? rawPick.detectedAt : now;
        const eventId = isString(rawPick.eventId)
          ? rawPick.eventId
          : `${normalized}:${Math.floor(detectedAt / 5000)}`;

        if (seen.has(eventId)) continue;
        seen.add(eventId);
        if (seen.size > 1600) {
          seen.clear();
          seen.add(eventId);
        }

        const playerId = matchSyncedPickToPlayerId(name, normalized);
        if (!playerId) {
          unmatchedInMessage += 1;
          lastUnmatchedName = name;
          continue;
        }
        if (!matchedIds.includes(playerId)) {
          matchedIds.push(playerId);
          lastMatchedName = name;
        }
      }

      if (matchedIds.length > 0) {
        setDraftState((prev) => {
          let next = prev;
          for (const playerId of matchedIds) {
            next = draftForOther(next, playerId);
          }
          return next;
        });
      }

      setExtensionSync((prev) => ({
        ...prev,
        extensionDetected: true,
        cbsConnected: true,
        lastCbsHeartbeatAt: now,
        lastPickName: lastMatchedName ?? prev.lastPickName,
        lastPickAt: matchedIds.length > 0 ? now : prev.lastPickAt,
        syncedOtherPickCount: prev.syncedOtherPickCount + matchedIds.length,
        unmatchedPickCount: prev.unmatchedPickCount + unmatchedInMessage,
        lastUnmatchedName: lastUnmatchedName ?? prev.lastUnmatchedName,
      }));
    };

    window.addEventListener("message", onWindowMessage);
    window.postMessage({ source: "cdc-app", type: "CDC_APP_READY" }, window.location.origin);

    return () => window.removeEventListener("message", onWindowMessage);
  }, [isLoaded, matchSyncedPickToPlayerId, setDraftState]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = window.setInterval(() => {
      setExtensionSync((prev) => {
        if (!prev.cbsConnected || prev.lastCbsHeartbeatAt == null) return prev;
        if (Date.now() - prev.lastCbsHeartbeatAt < 30000) return prev;
        return { ...prev, cbsConnected: false };
      });
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

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
    extensionSync,

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
