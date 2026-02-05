import { DraftPick, DraftState, Player } from "./types";

export function createEmptyDraftState(): DraftState {
  return {
    myPicks: [],
    otherPicks: [],
    riskTolerance: 0.5,
  };
}

export function getMyPlayerIds(state: DraftState): string[] {
  return state.myPicks.map((p) => p.playerId);
}

export function getDraftedIds(state: DraftState): Set<string> {
  const ids = new Set<string>();
  for (const p of state.myPicks) ids.add(p.playerId);
  for (const id of state.otherPicks) ids.add(id);
  return ids;
}

export function draftForMe(state: DraftState, playerId: string): DraftState {
  const drafted = getDraftedIds(state);
  if (drafted.has(playerId)) return state;
  const pick: DraftPick = { playerId, timestamp: Date.now() };
  return { ...state, myPicks: [...state.myPicks, pick] };
}

export function draftForOther(state: DraftState, playerId: string): DraftState {
  const drafted = getDraftedIds(state);
  if (drafted.has(playerId)) return state;
  return { ...state, otherPicks: [...state.otherPicks, playerId] };
}

export function removeLastMyPick(state: DraftState): DraftState {
  if (state.myPicks.length === 0) return state;
  return { ...state, myPicks: state.myPicks.slice(0, -1) };
}

export function undraftOther(state: DraftState, playerId: string): DraftState {
  return { ...state, otherPicks: state.otherPicks.filter((id) => id !== playerId) };
}

export function buildPlayersById(players: Player[]): Map<string, Player> {
  const map = new Map<string, Player>();
  for (const p of players) map.set(p.playerId, p);
  return map;
}

export function resolveMyRosterPlayers(playersById: Map<string, Player>, state: DraftState): Player[] {
  const roster: Player[] = [];
  for (const pick of state.myPicks) {
    const player = playersById.get(pick.playerId);
    if (player) roster.push(player);
  }
  return roster;
}

