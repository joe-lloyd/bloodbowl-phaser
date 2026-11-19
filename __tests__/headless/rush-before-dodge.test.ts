import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";

function scenario(shadowing: boolean): Scenario {
  return {
    id: "rush-before-dodge",
    name: "Rush and Dodge on one step",
    description:
      "an MA 1 lineman walks beside a marker, then rushes away from it",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 5, y: 5, stats: { MA: 1 } },
        { playerIndex: 1, x: 1, y: 9 },
      ],
      team2Placements: [
        {
          playerIndex: 0,
          x: 7,
          y: 5,
          ...(shadowing ? { skills: [SkillType.SHADOWING] } : {}),
        },
        { playerIndex: 1, x: 18, y: 1 },
      ],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 1, y: 1 },
    },
  };
}

async function walkThenRushAway(shadowing: boolean, seed: number) {
  const game = new HeadlessGame({ scenario: scenario(shadowing), seed });
  const mover = fixtureValue(
    fixtureValue(game.snapshot().teams[0]).players[0]
  ).id;
  await game.execute({
    type: "declare-action",
    playerId: mover,
    action: "move",
  });
  let response = await game.execute({
    type: "move",
    playerId: mover,
    path: [
      { x: 6, y: 5 },
      { x: 6, y: 6 },
    ],
  });
  const events = [...response.events];
  if (response.pendingDecision?.type === "reaction") {
    response = await game.execute({ type: "use-reaction", accept: true });
    events.push(...response.events);
  }
  const dice = events
    .filter((e) => e.name === "diceRoll")
    .map(
      (e) => z.object({ description: z.string() }).parse(e.data).description
    );
  return { response, dice };
}

describe("a step that needs a Rush and a Dodge", () => {
  it("rolls the Rush before the Dodge", async () => {
    const { response, dice } = await walkThenRushAway(false, 5);

    expect(dice).toEqual([
      "Rush (Human Lineman #1): 5, needs 2+",
      "Dodge (Human Lineman #1): 5, needs 4+",
    ]);
    expect(
      fixtureValue(fixtureValue(response.snapshot.teams[0]).players[0]).position
    ).toEqual({
      x: 6,
      y: 6,
    });
  });

  it("lets a Shadowing marker follow into the square the mover has left", async () => {
    const { response, dice } = await walkThenRushAway(true, 10);

    expect(dice).toEqual([
      "Rush (Human Lineman #1): 4, needs 2+",
      "Dodge (Human Lineman #1): 6, needs 4+",
      "Shadowing (Human Lineman #1): 5",
    ]);
    expect(
      fixtureValue(fixtureValue(response.snapshot.teams[0]).players[0]).position
    ).toEqual({
      x: 6,
      y: 6,
    });
    expect(
      fixtureValue(fixtureValue(response.snapshot.teams[1]).players[0]).position
    ).toEqual({
      x: 6,
      y: 5,
    });
  });
});
