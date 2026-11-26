import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";
import type { CommandResponse } from "../../src/headless/protocol";

function scenario(where: "thrower" | "thrown"): Scenario {
  return {
    id: "swoop",
    name: "Swoop",
    description: "a thrower launches a team-mate four squares east",
    setup: {
      team1Placements: [
        {
          playerIndex: 0,
          x: 4,
          y: 5,
          skills: [
            SkillType.THROW_TEAM_MATE,
            ...(where === "thrower" ? [SkillType.SWOOP] : []),
          ],
        },
        {
          playerIndex: 1,
          x: 5,
          y: 5,
          skills: [
            SkillType.RIGHT_STUFF,
            ...(where === "thrown" ? [SkillType.SWOOP] : []),
          ],
        },
        { playerIndex: 2, x: 1, y: 1 },
      ],
      team2Placements: [{ playerIndex: 0, x: 16, y: 9 }],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 15, y: 2 },
    },
  };
}

const SUPERB_SEED = 2;

const LANDING_REROLL_SEED = 3;

async function throwMate(
  where: "thrower" | "thrown",
  seed: number,
  swoopFacing?: "north" | "east" | "south" | "west"
) {
  const game = new HeadlessGame({ scenario: scenario(where), seed });
  const throwerId = fixtureValue(game.ctx.team1.players[0]).id;
  const teammateId = fixtureValue(game.ctx.team1.players[1]).id;
  await game.execute({
    type: "declare-action",
    playerId: throwerId,
    action: "throwTeamMate",
  });
  let response: CommandResponse = await game.execute({
    type: "throw-teammate",
    throwerId,
    teammateId,
    x: 8,
    y: 5,
    ...(swoopFacing && { swoopFacing }),
  });
  const events = [...response.events];
  while (response.pendingDecision?.type === "reroll") {
    response = await game.execute({ type: "use-reroll", accept: false });
    events.push(...response.events);
  }
  const dice = events
    .filter((e) => e.name === "diceRoll")
    .map(
      (e) => z.object({ description: z.string() }).parse(e.data).description
    );
  const rerolls = events
    .filter((e) => e.name === "rerollUsed")
    .map((e) => e.data);
  return {
    response,
    dice,
    rerolls,
    mate: fixtureValue(response.snapshot.teams[0]).players[1],
  };
}

describe("Swoop", () => {
  it("lets the thrown player travel by the Throw-in Template instead of Scattering", async () => {
    const { dice, mate } = await throwMate("thrown", SUPERB_SEED, "east");

    expect(dice).toEqual([
      "Throw Team-mate (Human Lineman #1): 5, needs 5+",

      "Swoop Direction: 2",
      "Swoop Distance: 2",
      "Landing (Human Lineman #2): 4, needs 3+",
    ]);
    expect(fixtureValue(mate).position).toEqual({ x: 10, y: 3 });
  });

  it("re-rolls a failed landing after travelling by the template", async () => {
    const { dice, mate } = await throwMate(
      "thrown",
      LANDING_REROLL_SEED,
      "east"
    );

    expect(dice).toEqual([
      "Throw Team-mate (Human Lineman #1): 5, needs 5+",
      "Swoop Direction: 1",
      "Swoop Distance: 3",
      "Landing (Human Lineman #2): 1, needs 3+",
      "Landing (Human Lineman #2): 5, needs 3+",
    ]);
    expect(fixtureValue(mate).position).toEqual({ x: 11, y: 2 });
    expect(fixtureValue(mate).status).toBe("Active");
  });

  it("reports the landing re-roll with both rolls", async () => {
    const { rerolls } = await throwMate("thrown", LANDING_REROLL_SEED, "east");

    expect(rerolls).toEqual([
      {
        playerId: "team1-player-2",
        source: "skill",
        skill: SkillType.SWOOP,
        rollKind: "landing",
        before: 1,
        after: 5,
      },
    ]);
  });

  it("is not used unless the coach picks a facing", async () => {
    const { dice } = await throwMate("thrown", SUPERB_SEED);

    expect(dice.slice(0, 3)).toEqual([
      "Throw Team-mate (Human Lineman #1): 5, needs 5+",
      "Team-mate Scatter: 3, 3, 5",
      "Landing (Human Lineman #2): 6, needs 3+",
    ]);
  });

  it("does nothing on the thrower", async () => {
    const { dice } = await throwMate("thrower", SUPERB_SEED);

    expect(dice.slice(0, 3)).toEqual([
      "Throw Team-mate (Human Lineman #1): 5, needs 5+",
      "Team-mate Scatter: 3, 3, 5",
      "Landing (Human Lineman #2): 6, needs 3+",
    ]);
  });

  it("refuses a facing for a thrown player without Swoop", async () => {
    const { response } = await throwMate("thrower", SUPERB_SEED, "east");

    expect(response.ok).toBe(false);
    expect(response.reason).toBe(
      "command-failed: The thrown player does not have Swoop"
    );
  });
});
