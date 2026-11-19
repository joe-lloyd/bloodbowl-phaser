import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";
import type { CommandResponse } from "../../src/headless/protocol";

function scenario(opts: {
  throwerSkills?: SkillType[];
  markers?: { x: number; y: number }[];
  mateHasBall?: boolean;
}): Scenario {
  return {
    id: "ttm-landing",
    name: "Throw Team-mate landing",
    description: "an ogre-style thrower launches a team-mate four squares",
    setup: {
      team1Placements: [
        {
          playerIndex: 0,
          x: 4,
          y: 5,
          skills: [SkillType.THROW_TEAM_MATE, ...(opts.throwerSkills ?? [])],
        },
        { playerIndex: 1, x: 5, y: 5, skills: [SkillType.RIGHT_STUFF] },

        { playerIndex: 2, x: 1, y: 1 },
      ],
      team2Placements: [
        { playerIndex: 0, x: 16, y: 9 },
        ...(opts.markers ?? []).map((m, i) => ({ playerIndex: i + 1, ...m })),
      ],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: opts.mateHasBall ? { x: 5, y: 5 } : { x: 15, y: 2 },
    },
  };
}

const SUPERB_FIVE_SEED = 2;

const NATURAL_SIX_SEED = 4;

const SUBPAR_SEED = 1;

const LANDING_FAILS_SEED = 5;

async function throwMate(seed: number, opts: Parameters<typeof scenario>[0]) {
  const game = new HeadlessGame({ scenario: scenario(opts), seed });
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
  const mate = fixtureValue(response.snapshot.teams[0]).players[1];
  return { response, dice, mate };
}

describe("Throw Team-mate landing", () => {
  it("Bullseye lands any Superb Throw on target, not only a natural 6", async () => {
    const { dice, mate } = await throwMate(SUPERB_FIVE_SEED, {
      throwerSkills: [SkillType.BULLSEYE],
    });

    expect(dice[0]).toBe("Throw Team-mate (Human Lineman #1): 5, needs 5+");
    expect(dice[1]).toMatch(/^Landing /);
    expect(fixtureValue(mate).position).toEqual({ x: 8, y: 5 });
  });

  it("takes -1 for each opponent Marking the landing square", async () => {
    const { dice } = await throwMate(NATURAL_SIX_SEED, {
      throwerSkills: [SkillType.BULLSEYE],
      markers: [
        { x: 8, y: 4 },
        { x: 8, y: 6 },
      ],
    });

    expect(dice[0]).toBe("Throw Team-mate (Human Lineman #1): 6, needs 5+");
    expect(dice[1]).toBe("Landing (Human Lineman #2): 2, needs 5+");
  });

  it("takes -1 after a Subpar Throw", async () => {
    const { dice } = await throwMate(SUBPAR_SEED, {});

    expect(dice.slice(0, 3)).toEqual([
      "Throw Team-mate (Human Lineman #1): 4, needs 5+",
      "Team-mate Scatter: 1, 5, 8",
      "Landing (Human Lineman #2): 6, needs 4+",
    ]);
  });

  it("is no Turnover when a thrown player without the ball fails to land", async () => {
    const { response, dice, mate } = await throwMate(LANDING_FAILS_SEED, {});

    expect(dice[2]).toBe("Landing (Human Lineman #2): 1, needs 3+");
    expect(fixtureValue(mate).status).not.toBe("Active");
    expect(response.snapshot.activeTeamId).toBe("team1");
  });

  it("is a Turnover when the thrown player was holding the ball", async () => {
    const { response, dice } = await throwMate(LANDING_FAILS_SEED, {
      mateHasBall: true,
    });

    expect(dice[2]).toBe("Landing (Human Lineman #2): 1, needs 3+");
    expect(response.snapshot.activeTeamId).toBe("team2");
  });
});
