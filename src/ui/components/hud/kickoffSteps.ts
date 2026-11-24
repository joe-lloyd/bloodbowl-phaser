import {
  KickoffEvent,
  isOneSquareMoveEvent,
  steppingPlayerId,
} from "../../../game/kickoff/kickoffEvents";
import type { KickoffEventStepState } from "../../../game/kickoff/KickoffEventManager";

export interface KickoffTodo {
  lines: readonly string[];
  current: number;
}

function oneSquareTodo(step: KickoffEventStepState): KickoffTodo {
  const picked = steppingPlayerId(step) !== null;
  const full = step.movedPlayerIds.length >= step.selectionLimit;
  const beforePick = full ? 2 : 0;
  return {
    lines: ["Choose a ringed player", "Click a green square", "Press Done"],
    current: picked ? 1 : beforePick,
  };
}

function chargeTodo(step: KickoffEventStepState): KickoffTodo {
  const full = step.selectedPlayerIds.length >= step.selectionLimit;
  const beforeStart = full ? 1 : 0;
  return {
    lines: [
      `Choose up to ${String(step.selectionLimit)} ringed players`,
      `Press ${step.event}`,
      "Play each player's action",
    ],
    current: step.charge ? 2 : beforeStart,
  };
}

export function kickoffTodo(step: KickoffEventStepState): KickoffTodo {
  if (isOneSquareMoveEvent(step.event)) return oneSquareTodo(step);
  if (step.event === KickoffEvent.HIGH_KICK)
    return {
      lines: ["Choose a ringed player to stand under the ball", "Press Confirm"],
      current: step.selectedPlayerIds.length > 0 ? 1 : 0,
    };
  return chargeTodo(step);
}
