import { describe, expect, it } from "vitest";
import { PlayerStatus } from "../../src/types/Player";
import { PITCH_LAYOUTS } from "../../src/game/variants/pitchLayouts";
import type { HeadlessGame } from "../../src/headless/HeadlessGame";
import type { MoveStep } from "../../src/headless/protocol";
import { fixtureValue } from "../../src/testing/fixtureValue";
import {
  MARKET,
  PUSH,
  SEWER,
  blockAndPush,
  forceDice,
  pitchGame,
} from "../utils/pitchGame";

function blocks(venue: "gutter-street" | "gutter-sewer") {
  const squares = PITCH_LAYOUTS[venue].obstacles;
  const columns = [...new Set(squares.map((s) => s.x))].sort((a, b) => a - b);
  const rows = [...new Set(squares.map((s) => s.y))].sort((a, b) => a - b);
  return { columns, rows };
}

describe("GB-P3 the printed Gutter Bowl board", () => {
  it.each(["gutter-street", "gutter-sewer"] as const)(
    "puts the %s blocks two squares in from each wall",
    (venue) => {
      expect(blocks(venue)).toEqual({
        columns: [4, 5, 6, 7, 8, 9, 16, 17, 18, 19, 20, 21],
        rows: [2, 3, 4, 5, 9, 10, 11, 12],
      });
    }
  );

  it("draws the same four barricades on both sides of the board", () => {
    const lines = [
      { afterColumn: 11, rows: { min: 0, max: 2 } },
      { afterColumn: 10, rows: { min: 6, max: 8 } },
      { afterColumn: 14, rows: { min: 6, max: 8 } },
      { afterColumn: 13, rows: { min: 12, max: 14 } },
    ];
    expect(PITCH_LAYOUTS["gutter-street"].barricades).toEqual(lines);
    expect(PITCH_LAYOUTS["gutter-sewer"].barricades).toEqual(lines);
  });
});

async function blockDice(
  attackerAt: { x: number; y: number },
  defenderAt: { x: number; y: number }
) {
  const { game } = pitchGame({
    format: SEWER,
    team1: [{ playerIndex: 0, ...attackerAt }],
    team2: [{ playerIndex: 0, ...defenderAt }],
  });
  const attacker = fixtureValue(game.ctx.teams[0].players[0]);
  const defender = fixtureValue(game.ctx.teams[1].players[0]);
  attacker.stats.ST = 3;
  defender.stats.ST = 3;
  await game.execute({
    type: "declare-action",
    playerId: attacker.id,
    action: "block",
  });
  const rolled = await game.execute({
    type: "block",
    attackerId: attacker.id,
    defenderId: defender.id,
  });
  const pending = rolled.pendingDecision;
  return pending?.type === "block-dice"
    ? { dice: pending.options.length, chooser: pending.chooserTeamId }
    : null;
}

describe("GB barricades: blocking over a barricade", () => {
  it("gives the target +1 ST when the barricade is between the players", async () => {
    expect(await blockDice({ x: 10, y: 7 }, { x: 11, y: 7 })).toEqual({
      dice: 2,
      chooser: "team2",
    });
  });

  it("gives nothing when the block goes past the end of the barricade", async () => {
    expect(await blockDice({ x: 10, y: 8 }, { x: 11, y: 9 })).toEqual({
      dice: 1,
      chooser: "team1",
    });
  });
});

describe("GB barricades: pushed into a barricade", () => {
  it("rolls for the barricade like a wall and falls over on 4+", async () => {
    const { game, rolls } = pitchGame({
      format: MARKET,
      team1: [{ playerIndex: 0, x: 12, y: 7 }],
      team2: [{ playerIndex: 0, x: 11, y: 7 }],
    });
    fixtureValue(game.ctx.teams[0].players[0]).stats.ST = 3;
    fixtureValue(game.ctx.teams[1].players[0]).stats.ST = 3;
    forceDice(game.ctx.rng, [PUSH, 4, 1, 1]);
    const { offered, defender } = await blockAndPush(game, { x: 10, y: 7 });

    expect(JSON.stringify(offered)).toContain('{"x":10,"y":7}');
    expect(rolls).toContain("Pushed into the Barricade 4");
    expect(defender.status).toBe(PlayerStatus.PRONE);
    expect(defender.gridPosition).toEqual({ x: 11, y: 7 });
  });
});

async function walk(game: HeadlessGame, path: MoveStep[]) {
  const mover = fixtureValue(game.ctx.teams[0].players[0]);
  await game.execute({
    type: "declare-action",
    playerId: mover.id,
    action: "move",
  });
  let response = await game.execute({
    type: "move",
    playerId: mover.id,
    path,
  });
  while (response.pendingDecision?.type === "reroll")
    response = await game.execute({ type: "use-reroll", accept: false });
  return {
    mover,
    used: game.ctx.gameService.getMovementUsed(mover.id),
  };
}

const recklessRolls = (rolls: string[]) =>
  rolls
    .filter((roll) => roll.startsWith("Reckless Barricade"))
    .map((roll) => roll.split(" ").at(-1));

function runner(at: { x: number; y: number }) {
  const pitch = pitchGame({
    format: SEWER,
    team1: [{ playerIndex: 0, ...at }],
    team2: [{ playerIndex: 0, x: 22, y: 1 }],
  });
  fixtureValue(pitch.game.ctx.teams[0].players[0]).stats.MA = 6;
  return pitch;
}

describe("GB barricades: moving over a barricade", () => {
  it("climbs over Safely for 2 extra squares of Movement and no roll", async () => {
    const { game, rolls } = runner({ x: 10, y: 7 });
    const { mover, used } = await walk(game, [{ x: 11, y: 7 }]);

    expect(used).toBe(3);
    expect(mover.gridPosition).toEqual({ x: 11, y: 7 });
    expect(recklessRolls(rolls)).toEqual([]);
  });

  it("goes over Recklessly for no extra Movement and stays up on 2+", async () => {
    const { game, rolls } = runner({ x: 10, y: 7 });
    forceDice(game.ctx.rng, [2]);
    const { mover, used } = await walk(game, [{ x: 11, y: 7, reckless: true }]);

    expect(used).toBe(1);
    expect(recklessRolls(rolls)).toEqual(["2"]);
    expect(mover.status).toBe(PlayerStatus.ACTIVE);
  });

  it("Falls Over in the square past the barricade on a 1", async () => {
    const { game } = runner({ x: 10, y: 7 });
    forceDice(game.ctx.rng, [1, 1, 1, 1, 1, 1]);
    const { mover } = await walk(game, [{ x: 11, y: 7, reckless: true }]);

    expect(mover.status).not.toBe(PlayerStatus.ACTIVE);
    expect(mover.gridPosition).toEqual({ x: 11, y: 7 });
  });

  it("must go over Recklessly when it has too little Movement left to climb", async () => {
    const { game, rolls } = runner({ x: 6, y: 7 });
    forceDice(game.ctx.rng, [6]);
    const { mover, used } = await walk(game, [
      { x: 7, y: 7 },
      { x: 8, y: 7 },
      { x: 9, y: 7 },
      { x: 10, y: 7 },
      { x: 11, y: 7 },
    ]);

    expect(recklessRolls(rolls)).toEqual(["6"]);
    expect(used).toBe(5);
    expect(mover.gridPosition).toEqual({ x: 11, y: 7 });
  });

  it("walks past the end of a barricade for nothing", async () => {
    const { game, rolls } = runner({ x: 10, y: 8 });
    const { used } = await walk(game, [{ x: 11, y: 9 }]);

    expect(used).toBe(1);
    expect(rolls).toEqual([]);
  });
});

describe("GB barricades: a ball carrier going over Recklessly", () => {
  it("brings the ball over before the D6, so a pending re-roll shows them together", async () => {
    const { game } = pitchGame({
      format: SEWER,
      team1: [{ playerIndex: 0, x: 10, y: 7, hasBall: true }],
      team2: [{ playerIndex: 0, x: 22, y: 1 }],
    });
    const carrier = fixtureValue(game.ctx.teams[0].players[0]);
    game.ctx.teams[0].rerolls = 1;
    forceDice(game.ctx.rng, [1]);
    await game.execute({
      type: "declare-action",
      playerId: carrier.id,
      action: "move",
    });
    const response = await game.execute({
      type: "move",
      playerId: carrier.id,
      path: [{ x: 11, y: 7, reckless: true }],
    });

    expect(response.pendingDecision?.type).toBe("reroll");
    expect([
      carrier.gridPosition,
      game.ctx.gameService.getState().balls[0].at,
    ]).toEqual([
      { x: 11, y: 7 },
      { x: 11, y: 7 },
    ]);
  });
});
