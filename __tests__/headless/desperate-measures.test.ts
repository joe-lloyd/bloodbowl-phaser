import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { Inducement } from "../../src/types/Inducements";
import { DesperateMeasure } from "../../src/game/inducements/desperateMeasures";
import { teamRerollsLeft } from "../../src/game/teamRerolls";
import { forceDice } from "../utils/test-helpers";
import { bought, commit, settle } from "../utils/inducement-helpers";

/**
 * Sevens Desperate Measures (L5, rules L21 to L28): each one bought rolls a
 * D8, duplicates re-rolled, and each result is used once per game at its
 * trigger point. Every die is forced.
 */

const play = {
  activeTeam: "team1" as const,
  phase: GamePhase.PLAY,
  subPhase: SubPhase.TURN_RECEIVING,
};

/** Hold one measure for a team: its D8 result is forced. */
async function hold(
  game: HeadlessGame,
  teamId: string,
  roll: number
): Promise<void> {
  forceDice(game.ctx.rng, [roll]);
  await commit(game, [bought(teamId, Inducement.DESPERATE_MEASURES, 1)]);
}

function measuresOf(game: HeadlessGame, teamId: string) {
  return game.ctx.gameService.getState().matchInducements?.measures[teamId];
}

describe("rolling Desperate Measures", () => {
  it("re-rolls a duplicate and records Magic Scroll without an effect", async () => {
    const game = new HeadlessGame({ seed: 1, startingPhase: GamePhase.SETUP });
    const team1 = game.ctx.team1;
    // 8 = Magic Scroll; 8 again is re-rolled into 6 = Sports Espionage.
    forceDice(game.ctx.rng, [8, 8, 6]);
    await commit(game, [bought(team1.id, Inducement.DESPERATE_MEASURES, 2)]);

    expect(measuresOf(game, team1.id)).toEqual([
      { measure: DesperateMeasure.MAGIC_SCROLL, used: false },
      { measure: DesperateMeasure.SPORTS_ESPIONAGE, used: false },
    ]);
    expect(game.pendingDecision()).toBeNull();
  });
});

describe("Hangover", () => {
  it("keeps the chosen opposition player out of the first drive", async () => {
    const game = new HeadlessGame({ seed: 1, startingPhase: GamePhase.SETUP });
    const team1 = game.ctx.team1;
    const team2 = game.ctx.team2;
    await hold(game, team1.id, 3);

    expect(game.pendingDecision()).toMatchObject({
      type: "inducement-choice",
      kind: "hangover",
      chooserTeamId: team1.id,
      optional: true,
    });
    const hungOver = team2.players[0];
    await game.execute({ type: "choose-inducement", playerId: hungOver.id });
    expect(measuresOf(game, team1.id)).toEqual([
      { measure: DesperateMeasure.HANGOVER, used: true },
    ]);

    await game.execute({ type: "start-setup", kickingTeamId: team2.id });
    const refused = await game.execute({
      type: "place-player",
      playerId: hungOver.id,
      x: 15,
      y: 5,
    });
    expect(refused.ok).toBe(false);
    const placed = await game.execute({
      type: "place-player",
      playerId: team2.players[1].id,
      x: 15,
      y: 5,
    });
    expect(placed.ok).toBe(true);
  });

  it("can be declined", async () => {
    const game = new HeadlessGame({ seed: 1, startingPhase: GamePhase.SETUP });
    await hold(game, game.ctx.team1.id, 3);
    const declined = await game.execute({ type: "choose-inducement" });
    expect(declined.ok).toBe(true);
    expect(game.pendingDecision()).toBeNull();
    expect(measuresOf(game, game.ctx.team1.id)).toEqual([
      { measure: DesperateMeasure.HANGOVER, used: false },
    ]);
  });
});

const lineUp: Scenario = {
  id: "measures-line-up",
  name: "Line-up",
  description: "two team 1 players on the pitch, one opponent far away",
  setup: {
    ...play,
    team1Placements: [
      { playerIndex: 0, x: 5, y: 5 },
      { playerIndex: 1, x: 5, y: 7 },
    ],
    team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
    ballPosition: { x: 1, y: 1 },
  },
};

describe("You Dope!", () => {
  it("raises the chosen player's ST before the kick, and a 1 or 2 at the end of the drive knocks them out with no recovery", async () => {
    const game = new HeadlessGame({ scenario: lineUp, seed: 1 });
    const team1 = game.ctx.team1;
    const doped = team1.players[0];
    const st = doped.stats.ST;
    await hold(game, team1.id, 1);
    expect(game.pendingDecision()).toBeNull();

    game.ctx.gameService.startKickoff();
    await settle();
    expect(game.pendingDecision()).toMatchObject({
      kind: "you-dope",
      chooserTeamId: team1.id,
      stats: ["ST", "AG"],
      optional: true,
    });
    const noStat = await game.execute({
      type: "choose-inducement",
      playerId: doped.id,
    });
    expect(noStat.ok).toBe(false);
    await game.execute({
      type: "choose-inducement",
      playerId: doped.id,
      stat: "ST",
    });
    expect(doped.stats.ST).toBe(st + 1);

    // End of drive: You Dope! rolls 2, so Knocked-out. Were KO recovery
    // rolled for them, the 6 would bring them back.
    forceDice(game.ctx.rng, [2, 6, 6]);
    game.ctx.gameService.endDrive("touchdown", game.ctx.team2.id);
    await settle();
    expect(doped.status).toBe(PlayerStatus.KO);
  });
});

const foulers: Scenario = {
  id: "grudge-match",
  name: "Two fouls",
  description: "two team 1 players beside two Prone opponents",
  setup: {
    ...play,
    team1Placements: [
      { playerIndex: 0, x: 10, y: 3 },
      { playerIndex: 1, x: 10, y: 7 },
    ],
    team2Placements: [
      { playerIndex: 0, x: 11, y: 3, status: PlayerStatus.PRONE },
      { playerIndex: 1, x: 11, y: 7, status: PlayerStatus.PRONE },
    ],
    ballPosition: { x: 1, y: 1 },
  },
};

async function foul(
  game: HeadlessGame,
  playerId: string,
  x: number,
  y: number
) {
  const declared = await game.execute({
    type: "declare-action",
    playerId,
    action: "foul",
  });
  if (!declared.ok) return declared;
  return game.execute({ type: "foul", playerId, x, y });
}

describe("Grudge Match", () => {
  it("allows a second Foul this turn, and a double does not Send-off its fouler", async () => {
    const game = new HeadlessGame({ scenario: foulers, seed: 1 });
    const [first, second] = game.ctx.team1.players;
    await hold(game, game.ctx.team1.id, 4);

    // The first Foul: armour 2+3 holds. Grudge Match is offered and kept.
    forceDice(game.ctx.rng, [2, 3]);
    const offered = await foul(game, first.id, 11, 3);
    expect(offered.pendingDecision).toMatchObject({
      type: "reaction",
      skill: DesperateMeasure.GRUDGE_MATCH,
    });
    await game.execute({ type: "use-reaction", accept: false });

    // The second Foul rolls a double 4: spotted, but not Sent-off.
    forceDice(game.ctx.rng, [4, 4]);
    const second2 = await foul(game, second.id, 11, 7);
    expect(second2.ok).toBe(true);
    expect(second.status).toBe(PlayerStatus.ACTIVE);
    expect(second.gridPosition).toEqual({ x: 10, y: 7 });
    expect(measuresOf(game, game.ctx.team1.id)).toEqual([
      { measure: DesperateMeasure.GRUDGE_MATCH, used: true },
    ]);
  });

  it("without it, a second Foul cannot be declared", async () => {
    const game = new HeadlessGame({ scenario: foulers, seed: 1 });
    const [first, second] = game.ctx.team1.players;
    forceDice(game.ctx.rng, [2, 3]);
    await foul(game, first.id, 11, 3);
    const refused = await foul(game, second.id, 11, 7);
    expect(refused.ok).toBe(false);
  });
});

const runner: Scenario = {
  id: "measures-runner",
  name: "Runner",
  description: "a team 1 runner with an opponent three squares ahead",
  setup: {
    ...play,
    team1Placements: [
      { playerIndex: 0, x: 2, y: 5 },
      { playerIndex: 1, x: 2, y: 8 },
    ],
    team2Placements: [{ playerIndex: 0, x: 6, y: 5 }],
    ballPosition: { x: 1, y: 1 },
  },
};

describe("Discarded Banana Skin", () => {
  it("Places Prone an opponent stepping into a Tackle Zone and ends the activation without a Turnover", async () => {
    const game = new HeadlessGame({ scenario: runner, seed: 1 });
    const mover = game.ctx.team1.players[0];
    await hold(game, game.ctx.team2.id, 7);

    await game.execute({
      type: "declare-action",
      playerId: mover.id,
      action: "move",
    });
    const moved = await game.execute({
      type: "move",
      playerId: mover.id,
      path: [
        { x: 3, y: 5 },
        { x: 4, y: 5 },
        { x: 5, y: 4 },
      ],
    });
    expect(moved.pendingDecision).toMatchObject({
      type: "reaction",
      chooserTeamId: game.ctx.team2.id,
      skill: DesperateMeasure.DISCARDED_BANANA_SKIN,
    });
    await game.execute({ type: "use-reaction", accept: true });

    expect(mover.gridPosition).toEqual({ x: 5, y: 4 });
    expect(mover.status).toBe(PlayerStatus.PRONE);
    expect(game.ctx.gameService.hasPlayerActed(mover.id)).toBe(true);
    expect(game.ctx.gameService.getState().activeTeamId).toBe(
      game.ctx.team1.id
    );
  });
});

describe("Discarded Banana Skin on a loose ball", () => {
  it("bounces the ball the player slipped beside, with no Turnover", async () => {
    const scenario: Scenario = {
      ...runner,
      setup: { ...runner.setup, ballPosition: { x: 5, y: 4 } },
    };
    const game = new HeadlessGame({ scenario, seed: 1 });
    const mover = game.ctx.team1.players[0];
    await hold(game, game.ctx.team2.id, 7);

    await game.execute({
      type: "declare-action",
      playerId: mover.id,
      action: "move",
    });
    await game.execute({
      type: "move",
      playerId: mover.id,
      path: [
        { x: 3, y: 5 },
        { x: 4, y: 5 },
        { x: 5, y: 4 },
      ],
    });
    // The bounce D8 1 sends the ball up and left, to (4,3).
    forceDice(game.ctx.rng, [1]);
    await game.execute({ type: "use-reaction", accept: true });

    expect(mover.status).toBe(PlayerStatus.PRONE);
    expect(game.ctx.gameService.getState().ballPosition).toEqual({
      x: 4,
      y: 3,
    });
    expect(game.ctx.gameService.getState().activeTeamId).toBe(
      game.ctx.team1.id
    );
  });
});

describe("Sports Espionage", () => {
  it("gives two team re-rolls once a Turnover has resolved", async () => {
    const game = new HeadlessGame({ scenario: runner, seed: 1 });
    const team1 = game.ctx.team1;
    const mover = team1.players[0];
    team1.rerolls = 0;
    await hold(game, team1.id, 6);

    // A Rush of 1 fails: Turnover. Armour 1+1 holds.
    forceDice(game.ctx.rng, [1, 1, 1]);
    await game.execute({
      type: "declare-action",
      playerId: mover.id,
      action: "move",
    });
    const path = Array.from({ length: mover.stats.MA + 1 }, (_, i) => ({
      x: 2 + i,
      y: 4,
    }));
    const moved = await game.execute({
      type: "move",
      playerId: mover.id,
      path,
    });
    expect(moved.pendingDecision).toMatchObject({
      type: "reaction",
      chooserTeamId: team1.id,
      skill: DesperateMeasure.SPORTS_ESPIONAGE,
    });
    await game.execute({ type: "use-reaction", accept: true });

    expect(teamRerollsLeft(game.ctx.gameService.getState(), team1)).toBe(2);
    expect(game.ctx.gameService.getState().activeTeamId).toBe(
      game.ctx.team2.id
    );
  });
});

const passing: Scenario = {
  id: "set-piece",
  name: "Set Piece",
  description: "a short pass between two team 1 players, nobody near",
  setup: {
    ...play,
    team1Placements: [
      { playerIndex: 0, x: 5, y: 5, stats: { PA: 6 } },
      { playerIndex: 1, x: 8, y: 5, stats: { AG: 5 } },
    ],
    team2Placements: [{ playerIndex: 0, x: 18, y: 1 }],
    ballPosition: { x: 5, y: 5 },
  },
};

describe("Set Piece", () => {
  it("makes the Pass Accurate on a 2 and the catch good on a 2", async () => {
    const game = new HeadlessGame({ scenario: passing, seed: 1 });
    const [passer, receiver] = game.ctx.team1.players;
    game.ctx.team1.rerolls = 0;
    await hold(game, game.ctx.team1.id, 5);

    await game.execute({
      type: "declare-action",
      playerId: passer.id,
      action: "pass",
    });
    forceDice(game.ctx.rng, [2, 2]);
    const passed = await game.execute({
      type: "pass",
      playerId: passer.id,
      x: 8,
      y: 5,
    });
    expect(passed.pendingDecision).toMatchObject({
      type: "reaction",
      skill: DesperateMeasure.SET_PIECE,
    });
    await game.execute({ type: "use-reaction", accept: true });

    expect(game.ctx.gameService.getState().ballPosition).toEqual(
      receiver.gridPosition
    );
    expect(game.ctx.gameService.getState().activeTeamId).toBe(
      game.ctx.team1.id
    );
  });
});
