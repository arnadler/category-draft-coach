export const STORAGE_KEYS = {
  leagueSettings: "cdc.leagueSettings.v1",
  draftState: "cdc.draftState.v1",
  customPlayers: "cdc.customPlayers.v1",
  customPlayersMeta: "cdc.customPlayersMeta.v1",
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

export function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

