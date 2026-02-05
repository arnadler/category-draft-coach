import { Player, RosterConfig, RosterSlot } from "./types";

export const DEFAULT_BENCH_MULTIPLIER = 0.2;

export function expandRosterSlots(config: RosterConfig): RosterSlot[] {
  return config.slots.map((slot, idx) => ({
    id: `${slot.label}_${idx + 1}`,
    label: slot.label,
    eligiblePositions: slot.eligiblePositions,
    player: null,
  }));
}

function isBenchSlot(slot: RosterSlot): boolean {
  return slot.label.toUpperCase().startsWith("BN");
}

function isUtilSlot(slot: RosterSlot): boolean {
  return slot.label.toUpperCase() === "UTIL";
}

function isPitcherFlex(slot: RosterSlot): boolean {
  return slot.label.toUpperCase() === "P";
}

function eligibleForSlot(player: Player, slot: RosterSlot): boolean {
  const playerPositions = player.positions.map((p) => p.toUpperCase());
  const slotPositions = slot.eligiblePositions.map((p) => p.toUpperCase());

  // UTIL: any hitter. (We still honor eligiblePositions list, but default includes all hitters.)
  if (isUtilSlot(slot)) {
    return player.hitterOrPitcher === "hitter";
  }

  // P: any pitcher.
  if (isPitcherFlex(slot)) {
    return player.hitterOrPitcher === "pitcher";
  }

  return playerPositions.some((p) => slotPositions.includes(p));
}

function slotPriority(slot: RosterSlot): number {
  // Lower = better (prefer starting, specific slots).
  if (isBenchSlot(slot)) return 3;
  if (isUtilSlot(slot) || isPitcherFlex(slot)) return 2;
  return 1;
}

/**
 * Assign players to roster slots in a simple, stable way.
 *
 * - Always fills non-bench slots first.
 * - For conflicts, higher-value players (lower overallRank) start.
 * - This is intentionally conservative/boomer-friendly: no complex drag/drop.
 */
export function assignPlayersToSlots(
  draftedPlayers: Player[],
  emptySlots: RosterSlot[]
): RosterSlot[] {
  const slots: RosterSlot[] = emptySlots.map((s) => ({ ...s, player: null as Player | null }));

  const players = [...draftedPlayers].sort((a, b) => {
    const ar = a.overallRank ?? 999999;
    const br = b.overallRank ?? 999999;
    if (ar !== br) return ar - br;
    return (a.ADP ?? 999999) - (b.ADP ?? 999999);
  });

  for (const player of players) {
    const eligibleIndexes = slots
      .map((slot, idx) => ({ slot, idx }))
      .filter(({ slot }) => slot.player === null && eligibleForSlot(player, slot))
      .sort((a, b) => {
        const pa = slotPriority(a.slot) - slotPriority(b.slot);
        if (pa !== 0) return pa;
        // Prefer more specific slots (fewer eligible positions)
        const la = a.slot.eligiblePositions.length;
        const lb = b.slot.eligiblePositions.length;
        return la - lb;
      });

    if (eligibleIndexes.length === 0) continue;
    const target = eligibleIndexes[0];
    slots[target.idx] = { ...slots[target.idx], player };
  }

  return slots;
}

export function getOpenSlots(slots: RosterSlot[]): RosterSlot[] {
  return slots.filter((s) => s.player === null);
}

export function countOpenBench(slots: RosterSlot[]): number {
  return slots.filter((s) => isBenchSlot(s) && s.player === null).length;
}

export function countOpenStarting(slots: RosterSlot[]): number {
  return slots.filter((s) => !isBenchSlot(s) && s.player === null).length;
}

export function getBenchMultiplierForSlot(slot: RosterSlot, benchMultiplier: number): number {
  return isBenchSlot(slot) ? benchMultiplier : 1;
}

