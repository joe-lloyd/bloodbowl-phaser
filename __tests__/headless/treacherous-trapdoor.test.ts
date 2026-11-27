import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { Inducement } from "../../src/types/Inducements";
import { TRAPDOOR_SQUARES } from "../../src/config/GameConfig";
import { forceDice } from "../utils/test-helpers";
import { bought, commit } from "../utils/inducement-helpers";

const nearTrapdoor: Scenario = {
  id: "trapdoor",
  name: "Next to the Trapdoor",
  description:
    "a carrier two squares from team 1's Trapdoor, a blocker beside it",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 3, y: 1 },
      { playerIndex: 1, x: 3, y: 3 },
    ],
    team2Placements: [
      { playerIndex: 0, x: 4, y: 3 },
      { playerIndex: 1, x: 18, y: 8 },
    ],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 3, y: 1 },
  },
};

async function prayForTrapdoor(game: HeadlessGame): Promise<void> {
  forceDice(game.ctx.rng, [1]);
  await commit(game, [
    bought(game.ctx.teams[1].id, Inducement.PRAYERS_TO_NUFFLE, 1),
  ]);
}

async function walkOntoTrapdoor(game: HeadlessGame) {
  const carrier = game.ctx.teams[0].players[0];
  await game.execute({
    type: "declare-action",
    playerId: fixtureValue(carrier).id,
    action: "move",
  });
  const response = await game.execute({
    type: "move",
    playerId: fixtureValue(carrier).id,
    path: [
      { x: 4, y: 1 },
      { x: 5, y: 1 },
      { x: 6, y: 1 },
    ],
  });
  return { carrier, response };
}

describe("Trapdoors", () => {
  it("sit in the inner Wide Zone row of each half", () => {
    expect(TRAPDOOR_SQUARES.squares).toEqual([
      { x: 5, y: 1 },
      { x: 14, y: 9 },
    ]);
  });

  it("are plain squares when nobody prayed for Treacherous Trapdoor", async () => {
    const game = new HeadlessGame({ scenario: nearTrapdoor, seed: 5 });
    forceDice(game.ctx.rng, [1, 1, 1]);
    const { carrier } = await walkOntoTrapdoor(game);
    expect(fixtureValue(carrier).gridPosition).toEqual({ x: 6, y: 1 });
    expect(game.ctx.gameService.getState().balls[0].at).toEqual({
      x: 6,
      y: 1,
    });
  });

  it("let a player through on a 2 or more", async () => {
    const game = new HeadlessGame({ scenario: nearTrapdoor, seed: 5 });
    await prayForTrapdoor(game);
    forceDice(game.ctx.rng, [2]);
    const { carrier } = await walkOntoTrapdoor(game);
    expect(fixtureValue(carrier).gridPosition).toEqual({ x: 6, y: 1 });
  });

  it("swallow a carrier on a 1: crowd injury, the ball bounces from the Trapdoor, Turnover", async () => {
    const game = new HeadlessGame({ scenario: nearTrapdoor, seed: 5 });
    await prayForTrapdoor(game);

    forceDice(game.ctx.rng, [1, 1, 2, 7]);
    const { carrier } = await walkOntoTrapdoor(game);

    expect(fixtureValue(carrier).gridPosition).toBeUndefined();
    expect(fixtureValue(carrier).status).toBe(PlayerStatus.RESERVE);
    expect(game.ctx.gameService.getState().balls[0].at).toEqual({
      x: 5,
      y: 2,
    });
    expect(game.ctx.gameService.getState().activeTeamId).toBe(
      game.ctx.teams[1].id
    );
  });

  it("swallow a player pushed onto one", async () => {
    const game = new HeadlessGame({ scenario: atTheOtherTrapdoor, seed: 5 });
    await prayForTrapdoor(game);
    const attacker = game.ctx.teams[0].players[0];
    const defender = game.ctx.teams[1].players[0];
    await block(game, fixtureValue(attacker).id, fixtureValue(defender).id);

    forceDice(game.ctx.rng, [1, 4, 4]);
    const pushed = await game.execute({
      type: "choose-push-direction",
      x: 14,
      y: 9,
    });
    expect(pushed.ok).toBe(true);
    expect(fixtureValue(defender).gridPosition).toBeUndefined();
    expect(fixtureValue(defender).status).toBe(PlayerStatus.KO);
    expect(pushed.pendingDecision?.type).toBe("follow-up");
  });

  it("swallow a blocker following up onto one, a Turnover", async () => {
    const game = new HeadlessGame({ scenario: onTheOtherTrapdoor, seed: 5 });
    await prayForTrapdoor(game);
    const attacker = game.ctx.teams[0].players[0];
    const defender = game.ctx.teams[1].players[0];
    await block(game, fixtureValue(attacker).id, fixtureValue(defender).id);
    await game.execute({ type: "choose-push-direction", x: 14, y: 8 });

    forceDice(game.ctx.rng, [1, 1, 2]);
    await game.execute({ type: "choose-follow-up", followUp: true });
    expect(fixtureValue(attacker).gridPosition).toBeUndefined();
    expect(fixtureValue(attacker).status).toBe(PlayerStatus.RESERVE);
    expect(game.ctx.gameService.getState().activeTeamId).toBe(
      game.ctx.teams[1].id
    );
  });
});

const atTheOtherTrapdoor: Scenario = {
  id: "trapdoor-push",
  name: "Push onto the Trapdoor",
  description: "a blocker pushes an opponent towards team 2's Trapdoor",
  setup: {
    team1Placements: [{ playerIndex: 0, x: 14, y: 7 }],
    team2Placements: [{ playerIndex: 0, x: 14, y: 8 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 1, y: 5 },
  },
};

const onTheOtherTrapdoor: Scenario = {
  id: "trapdoor-follow-up",
  name: "Follow up onto the Trapdoor",
  description: "an opponent stands on team 2's Trapdoor",
  setup: {
    team1Placements: [{ playerIndex: 0, x: 14, y: 10 }],
    team2Placements: [{ playerIndex: 0, x: 14, y: 9 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 1, y: 5 },
  },
};

async function block(
  game: HeadlessGame,
  attackerId: string,
  defenderId: string
): Promise<void> {
  await game.execute({
    type: "declare-action",
    playerId: attackerId,
    action: "block",
  });
  forceDice(game.ctx.rng, [3]);
  await game.execute({ type: "block", attackerId, defenderId });
  await game.execute({ type: "choose-block-result", index: 0 });
}
