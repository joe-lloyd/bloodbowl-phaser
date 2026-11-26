import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { RosterName } from "../../src/types/Team";
import { forceDice } from "../utils/test-helpers";
import type { Scenario, PlayerPlacement } from "../../src/types/Scenario";
import { checkInvariants } from "../../src/simulation/invariants";

function scenario(options: {
  carrier?: boolean;
  troll?: boolean;
  edge?: boolean;
  throwerHasBall?: boolean;
  looseBall?: { x: number; y: number };
  opponents?: PlayerPlacement[];
}): Scenario {
  const y = options.edge ? 0 : 5;
  return {
    id: "ttm-fumble-does-not-stack",
    name: "A fumbled team-mate bounces and attempts to land",
    description:
      "A fumble must never leave two players in the thrower's square",
    setup: {
      team1Roster: options.troll ? RosterName.GOBLIN : RosterName.OGRE,
      team1Placements: [
        {
          playerIndex: 0,
          x: 4,
          y,
          ...(options.throwerHasBall && { hasBall: true }),
        },
        {
          playerIndex: options.troll ? 1 : 3,
          x: 5,
          y,
          ...(options.carrier && { hasBall: true }),
        },
        { playerIndex: options.troll ? 2 : 1, x: 1, y: 9 },
      ],
      team2Placements: options.opponents ?? [{ playerIndex: 0, x: 16, y: 9 }],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ...(!options.carrier &&
        !options.throwerHasBall &&
        !options.opponents?.some((p) => p.hasBall) && { ballPosition: options.looseBall ?? { x: 15, y: 2 } }),
    },
  };
}

async function fumble(
  values: number[],
  options: Parameters<typeof scenario>[0] = {}
) {
  const game = new HeadlessGame({ scenario: scenario(options), seed: 1 });
  const thrower = game.ctx.team1.players[0];
  const mate = game.ctx.team1.players[options.troll ? 1 : 3];

  forceDice(game.ctx.rng, [2, ...values]);
  const declared = await game.execute({
    type: "declare-action",
    playerId: fixtureValue(thrower).id,
    action: "throwTeamMate",
  });
  expect(declared.ok).toBe(true);
  const before = game.snapshot();
  const response = await game.execute({
    type: "throw-teammate",
    throwerId: fixtureValue(thrower).id,
    teammateId: fixtureValue(mate).id,
    x: 8,
    y: options.edge ? 0 : 5,
  });
  expect(response.ok).toBe(true);
  const positions = [...game.ctx.team1.players, ...game.ctx.team2.players]
    .filter((p) => p.gridPosition)
    .map(
      (p) =>
        `${String(fixtureValue(p.gridPosition).x)},${String(fixtureValue(p.gridPosition).y)}`
    );
  expect(new Set(positions).size).toBe(positions.length);
  expect(
    checkInvariants(
      before,
      response.snapshot,
      response.pendingDecision !== null
    )
  ).toEqual([]);
  return { game, response, thrower, mate };
}

describe("fumbled Throw Team-mate", () => {
  it("bounces from the thrower and can land safely at -1 without a turnover", async () => {
    const { game, mate, thrower, response } = await fumble([1, 2, 6]);
    expect(fixtureValue(thrower).gridPosition).toEqual({ x: 4, y: 5 });
    expect(fixtureValue(mate).gridPosition).toEqual({ x: 4, y: 4 });
    expect(fixtureValue(mate).status).toBe(PlayerStatus.ACTIVE);
    expect(response.snapshot.activeTeamId).toBe("team1");
    expect(game.ctx.gameService.hasPlayerActed(fixtureValue(thrower).id)).toBe(
      true
    );
    const rolls = response.events
      .filter((e) => e.name === "diceRoll")
      .map(
        (e) => z.object({ description: z.string() }).parse(e.data).description
      );
    expect(rolls).toEqual([
      "Throw Team-mate (Ogre Blocker #1): 1, needs 6+",
      "Bounce: 2",
      "Landing (Gnoblar Lineman #4): 6, needs 4+",
    ]);
  });

  it.each([false, true])(
    "only turns over on a failed landing when carrying the ball: %s",
    async (carrier) => {
      const { mate, response } = await fumble([1, 2, 1, 1, 1, 2], { carrier });
      expect(fixtureValue(mate).gridPosition).toEqual({ x: 4, y: 4 });
      expect(fixtureValue(mate).status).toBe(PlayerStatus.PRONE);
      expect(response.snapshot.activeTeamId).toBe(carrier ? "team2" : "team1");
    }
  );

  it("keeps the ball with a carrier who lands safely after a fumble", async () => {
    const { mate, game, response } = await fumble([1, 2, 6], { carrier: true });
    expect(fixtureValue(mate).gridPosition).toEqual({ x: 4, y: 4 });
    expect(game.ctx.gameService.getState().ballPosition).toEqual(
      fixtureValue(mate).gridPosition
    );
    expect(response.snapshot.activeTeamId).toBe("team1");
  });

  it.each([
    { roll: 1, armour: [1, 1], status: PlayerStatus.PRONE },
    { roll: 6, armour: [], status: PlayerStatus.ACTIVE },
  ])(
    "bounces a loose ball after a direct landing on $roll without a turnover",
    async ({ roll, armour, status }) => {
      const { game, mate, response } = await fumble(
        [1, 2, roll, ...armour, 5],
        { looseBall: { x: 4, y: 4 } }
      );
      expect(fixtureValue(mate).gridPosition).toEqual({ x: 4, y: 4 });
      expect(fixtureValue(mate).status).toBe(status);
      expect(game.ctx.gameService.getState().ballPosition).toEqual({
        x: 5,
        y: 4,
      });
      expect(response.snapshot.activeTeamId).toBe("team1");
    }
  );

  it("bounces through successive occupied squares, knocking each occupant down", async () => {
    const { mate, game, response } = await fumble(
      [1, 2, 1, 1, 2, 1, 1, 2, 1, 1],
      {
        opponents: [
          { playerIndex: 0, x: 4, y: 4 },
          { playerIndex: 1, x: 4, y: 3 },
        ],
      }
    );
    expect(fixtureValue(mate).gridPosition).toEqual({ x: 4, y: 2 });
    expect(fixtureValue(mate).status).toBe(PlayerStatus.PRONE);
    expect(game.ctx.team2.players.slice(0, 2).map((p) => p.status)).toEqual([
      PlayerStatus.PRONE,
      PlayerStatus.PRONE,
    ]);
    expect(response.snapshot.activeTeamId).toBe("team1");
  });

  it("does not take an opposing carrier's ball along when bouncing off them", async () => {
    const { mate, game } = await fumble([1, 2, 1, 1, 5, 2, 1, 1], {
      opponents: [{ playerIndex: 0, x: 4, y: 4, hasBall: true }],
    });
    expect(fixtureValue(mate).gridPosition).toEqual({ x: 4, y: 3 });
    expect(game.ctx.gameService.getState().ballPosition).toEqual({
      x: 5,
      y: 4,
    });
  });

  it("preserves casualty state when a collision chain revisits a player", async () => {
    const { game, mate, response } = await fumble(
      [1, 2, 1, 1, 2, 1, 1, 7, 6, 6, 6, 6, 5, 1, 1],
      {
        opponents: [
          { playerIndex: 0, x: 4, y: 4 },
          { playerIndex: 1, x: 4, y: 3 },
        ],
      }
    );
    expect(
      response.events
        .filter(
          (e) =>
            e.name === "playerMoved" &&
            z.object({ playerId: z.string() }).parse(e.data).playerId ===
              fixtureValue(mate).id
        )
        .map(
          (e) =>
            z
              .object({ to: z.object({ x: z.number(), y: z.number() }) })
              .parse(e.data).to
        )
    ).toEqual([
      { x: 4, y: 4 },
      { x: 4, y: 3 },
      { x: 4, y: 4 },
      { x: 5, y: 4 },
    ]);
    expect(fixtureValue(game.ctx.team2.players[0]).status).toBe(
      PlayerStatus.DEAD
    );
    expect(
      fixtureValue(game.ctx.team2.players[0]).gridPosition
    ).toBeUndefined();
  });

  it("resolves each casualty before bouncing back to the vacated square", async () => {
    const { game, mate, response } = await fumble(
      [1, 2, 6, 6, 6, 6, 2, 1, 1, 7, 1, 1],
      {
        opponents: [
          { playerIndex: 0, x: 4, y: 4 },
          { playerIndex: 1, x: 4, y: 3 },
        ],
      }
    );
    const victim = game.ctx.team2.players[0];
    expect(fixtureValue(victim).status).toBe(PlayerStatus.DEAD);
    expect(fixtureValue(victim).gridPosition).toBeUndefined();
    expect(fixtureValue(mate).gridPosition).toEqual({ x: 4, y: 4 });
    expect(fixtureValue(mate).status).toBe(PlayerStatus.PRONE);
    const rolls = response.events
      .filter((e) => e.name === "diceRoll")
      .map(
        (e) => z.object({ description: z.string() }).parse(e.data).description
      );
    const armour = rolls.findIndex((r) =>
      r.startsWith(`Armour Roll (${fixtureValue(victim).playerName})`)
    );
    const injury = rolls.findIndex((r) =>
      r.startsWith(`Injury Roll (${fixtureValue(victim).playerName})`)
    );
    expect(armour).toBeGreaterThan(0);
    expect(injury).toBeGreaterThan(armour);
    expect(rolls.indexOf("Bounce: 2", injury)).toBeGreaterThan(injury);
  });

  it("bounces a loose ball when the crashing team-mate falls onto it", async () => {
    const { game, mate, response } = await fumble([1, 2, 1, 1, 2, 1, 1, 1], {
      opponents: [{ playerIndex: 0, x: 4, y: 4 }],
      looseBall: { x: 4, y: 3 },
    });
    expect(fixtureValue(mate).gridPosition).toEqual({ x: 4, y: 3 });
    expect(fixtureValue(mate).status).toBe(PlayerStatus.PRONE);
    expect(game.ctx.gameService.getState().ballPosition).not.toEqual(
      fixtureValue(mate).gridPosition
    );
    expect(response.snapshot.activeTeamId).toBe("team1");
  });

  it("settles a casualty's dropped ball before revisiting their square", async () => {
    const { game, mate } = await fumble(
      [1, 2, 6, 6, 6, 6, 5, 2, 1, 1, 7, 1, 1],
      {
        opponents: [
          { playerIndex: 0, x: 4, y: 4, hasBall: true },
          { playerIndex: 1, x: 4, y: 3 },
        ],
      }
    );
    expect(fixtureValue(game.ctx.team2.players[0]).status).toBe(
      PlayerStatus.DEAD
    );
    expect(fixtureValue(mate).gridPosition).toEqual({ x: 4, y: 4 });
    expect(game.ctx.gameService.getState().ballPosition).toEqual({
      x: 5,
      y: 4,
    });
  });

  it("turns over if the bouncing team-mate knocks the thrower down", async () => {
    const { mate, thrower, response } = await fumble(
      [1, 2, 1, 1, 7, 1, 1, 4, 1, 1],
      {
        opponents: [{ playerIndex: 0, x: 4, y: 4 }],
      }
    );
    expect(fixtureValue(mate).gridPosition).toEqual({ x: 3, y: 5 });
    expect(fixtureValue(thrower).gridPosition).toEqual({ x: 4, y: 5 });
    expect(fixtureValue(thrower).status).toBe(PlayerStatus.PRONE);
    expect(response.snapshot.activeTeamId).toBe("team2");
  });

  it("also bounces clear when a team-mate squirms free from Always Hungry", async () => {
    const { mate, response } = await fumble([1, 2, 2, 6], { troll: true });
    expect(fixtureValue(mate).gridPosition).toEqual({ x: 4, y: 4 });
    expect(fixtureValue(mate).status).toBe(PlayerStatus.ACTIVE);
    expect(response.snapshot.activeTeamId).toBe("team1");
  });

  it("removes a fumbled team-mate who bounces off the pitch without moving the thrower's ball", async () => {
    const { mate, game, response } = await fumble([1, 2, 1, 1], {
      edge: true,
      throwerHasBall: true,
    });
    expect(fixtureValue(mate).gridPosition).toBeUndefined();
    expect(game.ctx.gameService.getState().ballPosition).toEqual({
      x: 4,
      y: 0,
    });
    expect(response.snapshot.activeTeamId).toBe("team2");
  });
});
