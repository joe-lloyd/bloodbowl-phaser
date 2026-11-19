import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import type { CommandResponse } from "../../src/headless/protocol";

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

function pickupModifier(response: CommandResponse): number | undefined {
  const roll = response.events.find(
    (e) =>
      e.name === GameEventNames.DiceRoll &&
      z
        .object({ rollType: z.string() })
        .parse(e.data)
        .rollType.startsWith("Pickup")
  );
  if (!roll) return undefined;
  const data = z
    .object({ value: z.number(), total: z.number() })
    .parse(roll.data);
  return data.total - data.value;
}

async function stepOntoBall(markers: { x: number; y: number }[]) {
  const game = new HeadlessGame({ scenario: scenario(markers), seed: 1 });
  const mover = fixtureValue(game.snapshot().teams[0]).players[0];
  await game.execute({
    type: "declare-action",
    playerId: fixtureValue(mover).id,
    action: "move",
  });
  return game.execute({
    type: "move",
    playerId: fixtureValue(mover).id,
    path: [{ x: 5, y: 5 }],
  });
}

describe("pick-up modifiers", () => {
  it("applies no modifier to an unmarked pick-up", async () => {
    expect(pickupModifier(await stepOntoBall([]))).toBe(0);
  });

  it("applies -1 per opponent marking the player", async () => {
    const response = await stepOntoBall([
      { x: 6, y: 5 },
      { x: 6, y: 6 },
    ]);
    expect(pickupModifier(response)).toBe(-2);
  });
});
