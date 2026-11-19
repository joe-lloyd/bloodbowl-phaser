import type { TurnData } from "@/types/GameState";

export function freshTurn(
  teamId = "",
  turnNumber = 0,
  isHalf2 = false
): TurnData {
  return {
    teamId,
    turnNumber,
    isHalf2,
    activatedPlayerIds: new Set(),
    hasBlitzed: false,
    hasPassed: false,
    hasHandedOff: false,
    hasFouled: false,
    hasThrownTeamMate: false,
    hasKickedTeamMate: false,
    hasThrownBomb: false,
    movementUsed: new Map(),
  };
}
