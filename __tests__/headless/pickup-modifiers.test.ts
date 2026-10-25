import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import type { CommandResponse } from "../../src/headless/protocol";

/**
 * The pick-up Agility Test has no base modifier in 2025: "Apply a -1
 * modifier to this roll for each opposition player that is Marking the
 * player attempting to pick up the ball." (rulebook, Picking up the ball).
 * The engine used to add a +1 on top, an older edition's rule.
 */
function scenario(markers: { x: number; y: number }[]): Scenario {
  return {
    id: "pickup-modifiers",
    name: "Pick-up modifiers",
    description: "a lineman steps onto the ball, marked or not",
    setup: {
      team1Placements: [{ playerIndex: 0, x: 4, y: 5 }],
      team2Placements: [
        { playerIndex: 0, x: 20, y: 9 },
        ...markers.map((pos, i) => ({ playerIndex: i + 1, ...pos })),
      ],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 5, y: 5 },
    },
  };
}

/** total - value on the pick-up roll: the net modifier applied */
function pickupModifier(response: CommandResponse): number | undefined {
  const roll = response.events.find(
    (e) =>
      e.name === GameEventNames.DiceRoll &&
      (e.data as { rollType: string }).rollType.startsWith("Pickup")
  );
  if (!roll) return undefined;
  const data = roll.data as { value: number; total: number };
  return data.total - data.value;
}

async function stepOntoBall(markers: { x: number; y: number }[]) {
  const game = new HeadlessGame({ scenario: scenario(markers), seed: 1 });
  const mover = game.snapshot().teams[0].players[0];
  await game.execute({
    type: "declare-action",
    playerId: mover.id,
    action: "move",
  });
  return game.execute({
    type: "move",
    playerId: mover.id,
    path: [{ x: 5, y: 5 }],
  });
}

describe("pick-up modifiers", () => {
  it("applies no modifier to an unmarked pick-up", async () => {
    expect(pickupModifier(await stepOntoBall([]))).toBe(0);
  });

  it("applies -1 per opponent marking the player", async () => {
    // (6,5) and (6,6) mark the ball square (5,5) but not the start (4,5).
    const response = await stepOntoBall([
      { x: 6, y: 5 },
      { x: 6, y: 6 },
    ]);
    expect(pickupModifier(response)).toBe(-2);
  });
});
