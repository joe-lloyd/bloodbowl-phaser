import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";
import type { CommandResponse } from "../../src/headless/protocol";

/**
 * A thrown player holding the ball who lands Standing in the End Zone they
 * score in scores a Touchdown, the same as a ball-carrier who moves there.
 * Team 1 scores at x = 19. Seeds are committed, never searched.
 */
function scenario(ball = { x: 16, y: 5 }): Scenario {
  return {
    id: "ttm-touchdown",
    name: "Throw Team-mate touchdown",
    description: "a thrower launches the ball-carrier into the end zone",
    setup: {
      team1Placements: [
        {
          playerIndex: 0,
          x: 15,
          y: 5,
          skills: [SkillType.THROW_TEAM_MATE, SkillType.BULLSEYE],
        },
        { playerIndex: 1, x: 16, y: 5, skills: [SkillType.RIGHT_STUFF] },
        { playerIndex: 2, x: 10, y: 1 },
      ],
      team2Placements: [{ playerIndex: 0, x: 12, y: 9 }],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: ball,
    },
  };
}

/** A Bullseye Superb Throw, then a passed Landing, onto the aim square. */
const LANDS_ON_TARGET_SEED = 1;
/** Aimed at x = 18: lands Standing there. */
const LANDS_SHORT_SEED = 5;
/** Aimed at x = 18: scatters into the end zone and lands Prone. */
const FALLS_IN_END_ZONE_SEED = 12;

async function throwCarrier(
  aimX: number,
  seed = LANDS_ON_TARGET_SEED,
  ball?: { x: number; y: number }
) {
  const game = new HeadlessGame({ scenario: scenario(ball), seed });
  const throwerId = game.ctx.team1.players[0].id;
  const teammateId = game.ctx.team1.players[1].id;
  await game.execute({
    type: "declare-action",
    playerId: throwerId,
    action: "throwTeamMate",
  });
  let response: CommandResponse = await game.execute({
    type: "throw-teammate",
    throwerId,
    teammateId,
    x: aimX,
    y: 5,
  });
  while (response.pendingDecision?.type === "reroll") {
    response = await game.execute({ type: "use-reroll", accept: false });
  }
  return response.snapshot;
}

describe("Throw Team-mate touchdown", () => {
  it("scores when the thrown carrier lands Standing in the end zone", async () => {
    const snapshot = await throwCarrier(19);

    expect(snapshot.score).toEqual({ team1: 1, team2: 0 });
  });

  it("does not score short of the end zone", async () => {
    const snapshot = await throwCarrier(18, LANDS_SHORT_SEED);

    expect(snapshot.teams[0].players[1].status).toBe("Active");
    expect(snapshot.teams[0].players[1].position).toEqual({ x: 18, y: 5 });
    expect(snapshot.score).toEqual({ team1: 0, team2: 0 });
  });

  it("does not score when the carrier lands Prone in the end zone", async () => {
    const snapshot = await throwCarrier(18, FALLS_IN_END_ZONE_SEED);

    expect(snapshot.teams[0].players[1].position).toEqual({ x: 19, y: 5 });
    expect(snapshot.score).toEqual({ team1: 0, team2: 0 });
    expect(snapshot.activeTeamId).toBe("team2");
  });

  it("does not score for a player without the ball who lands on it in the end zone", async () => {
    // Landing is involuntary movement: the loose ball bounces away.
    const snapshot = await throwCarrier(19, LANDS_ON_TARGET_SEED, {
      x: 19,
      y: 5,
    });

    expect(snapshot.score).toEqual({ team1: 0, team2: 0 });
    expect(snapshot.ballPosition).not.toEqual({ x: 19, y: 5 });
  });
});
