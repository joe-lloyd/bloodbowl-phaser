import { KickoffEvent } from "../../../game/kickoff/kickoffEvents";
import { kickoffTurnPlay } from "../../../game/kickoff/kickoffTurn";
import type { KickoffEventStepState } from "../../../game/kickoff/KickoffEventManager";

export interface KickoffTodo {
  lines: readonly string[];
  current: number;
}

export function playersLeft(step: KickoffEventStepState): number {
  return step.selectedPlayerIds.length - step.movedPlayerIds.length;
}

function stageIndex(step: KickoffEventStepState): number {
  if (step.stage === "play") return playersLeft(step) > 0 ? 2 : 3;
  return step.selectedPlayerIds.length >= step.selectionLimit ? 1 : 0;
}

export function kickoffTodo(step: KickoffEventStepState): KickoffTodo {
  if (step.event === KickoffEvent.HIGH_KICK)
    return {
      lines: ["Choose a ringed player to stand under the ball"],
      current: 0,
    };
  const limit = step.selectionLimit;
  const oneSquare = kickoffTurnPlay(step.event)?.kind === "one-square";
  return {
    lines: [
      `Choose up to ${String(limit)} ringed ${limit === 1 ? "player" : "players"}`,
      `Press Start ${step.event}`,
      oneSquare
        ? "Click each one, then a green square"
        : "Play each one, in any order",
      `Press End ${step.event} to stop early`,
    ],
    current: stageIndex(step),
  };
}
