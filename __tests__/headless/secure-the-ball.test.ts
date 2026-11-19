import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario, type PlayerPlacement } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus, TraitKeyWord } from "../../src/types/Player";
import { SkillType } from "../../src/types/Skills";
import type { Weather } from "../../src/game/rules/weather";

function scenario(opts: {
  securer?: Partial<PlayerPlacement>;
  opponent?: Partial<PlayerPlacement>;
  weather?: Weather;
}): Scenario {
  return {
    id: "secure-the-ball",
    name: "Secure the Ball",
    description: "a lineman walks to the loose ball two squares east",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 5, y: 5, ...opts.securer },
        { playerIndex: 1, x: 1, y: 9 },
      ],
      team2Placements: [{ playerIndex: 0, x: 18, y: 1, ...opts.opponent }],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 7, y: 5 },
      ...(opts.weather === undefined ? {} : { weather: opts.weather }),
    },
  };
}

function diceOf(events: { name: string; data?: unknown }[]): string[] {
  return events
    .filter((e) => e.name === "diceRoll")
    .map(
      (e) => z.object({ description: z.string() }).parse(e.data).description
    );
}

async function secure(game: HeadlessGame, path: { x: number; y: number }[]) {
  const id = fixtureValue(game.ctx.team1.players[0]).id;
  const declared = await game.execute({
    type: "declare-action",
    playerId: id,
    action: "secureBall",
  });
  expect(declared.ok).toBe(true);
  return game.execute({ type: "move", playerId: id, path });
}

describe("a Secure the Ball pick-up", () => {
  it("rolls a D6 for 2+ instead of an Agility Test and ends the activation", async () => {
    const game = new HeadlessGame({ scenario: scenario({}), seed: 1 });
    const response = await secure(game, [
      { x: 6, y: 5 },
      { x: 7, y: 5 },
      { x: 8, y: 5 },
    ]);

    expect(diceOf(response.events)).toEqual([
      "Secure the Ball (Human Lineman #1): 4, needs 2+",
    ]);
    const securer = game.ctx.team1.players[0];
    expect(fixtureValue(securer).gridPosition).toEqual({ x: 7, y: 5 });
    expect(game.ctx.gameService.getState().ballPosition).toEqual({
      x: 7,
      y: 5,
    });
    expect(
      game.ctx.gameService
        .getState()
        .turn.activatedPlayerIds.has(fixtureValue(securer).id)
    ).toBe(true);
    expect(response.snapshot.activeTeamId).toBe(game.ctx.team1.id);
  });

  it("turns over on a 1, and Sure Hands offers no re-roll", async () => {
    const game = new HeadlessGame({
      scenario: scenario({ securer: { skills: [SkillType.SURE_HANDS] } }),
      seed: 7,
    });
    game.ctx.team1.rerolls = 1;
    const failed = await secure(game, [
      { x: 6, y: 5 },
      { x: 7, y: 5 },
    ]);

    expect(diceOf(failed.events)).toEqual([
      "Secure the Ball (Human Lineman #1): 1, needs 2+",
    ]);

    expect(failed.pendingDecision).toMatchObject({
      type: "reroll",
      rollKind: "pickup",
      sources: ["team"],
    });

    const declined = await game.execute({ type: "use-reroll", accept: false });
    expect(diceOf(declined.events)).toEqual(["Bounce Direction: 1"]);
    expect(declined.snapshot.activeTeamId).toBe(game.ctx.team2.id);
  });
});

describe("a Secure the Ball pick-up in Pouring Rain", () => {
  it("takes the pick-up modifier, so a 2 fails", async () => {
    const game = new HeadlessGame({
      scenario: scenario({ weather: "Pouring Rain" }),
      seed: 9,
    });
    game.ctx.team1.rerolls = 0;
    const failed = await secure(game, [
      { x: 6, y: 5 },
      { x: 7, y: 5 },
    ]);

    expect(diceOf(failed.events)).toEqual([
      "Secure the Ball (Human Lineman #1): 2, needs 3+",
      "Bounce Direction: 7",
    ]);
    expect(failed.snapshot.activeTeamId).toBe(game.ctx.team2.id);
  });

  it("lets Big Hand ignore the rain, so a 2 succeeds", async () => {
    const game = new HeadlessGame({
      scenario: scenario({
        weather: "Pouring Rain",
        securer: { skills: [SkillType.BIG_HAND] },
      }),
      seed: 9,
    });
    const secured = await secure(game, [
      { x: 6, y: 5 },
      { x: 7, y: 5 },
    ]);

    expect(diceOf(secured.events)).toEqual([
      "Secure the Ball (Human Lineman #1): 2, needs 2+",
    ]);
    expect(game.ctx.gameService.getState().ballPosition).toEqual({
      x: 7,
      y: 5,
    });
  });

  it("gives Extra Arms no bonus, so a 2 still fails", async () => {
    const game = new HeadlessGame({
      scenario: scenario({
        weather: "Pouring Rain",
        securer: { skills: [SkillType.EXTRA_ARMS] },
      }),
      seed: 9,
    });
    game.ctx.team1.rerolls = 0;
    const failed = await secure(game, [
      { x: 6, y: 5 },
      { x: 7, y: 5 },
    ]);

    expect(diceOf(failed.events)[0]).toBe(
      "Secure the Ball (Human Lineman #1): 2, needs 3+"
    );
    expect(failed.snapshot.activeTeamId).toBe(game.ctx.team2.id);
  });
});

describe("a Big Hand pick-up in Pouring Rain", () => {
  it("ignores the rain's -1 on the Agility Test", async () => {
    const game = new HeadlessGame({
      scenario: scenario({
        weather: "Pouring Rain",
        securer: { skills: [SkillType.BIG_HAND] },
      }),
      seed: 1,
    });
    const id = fixtureValue(game.ctx.team1.players[0]).id;
    await game.execute({
      type: "declare-action",
      playerId: id,
      action: "move",
    });
    const moved = await game.execute({
      type: "move",
      playerId: id,
      path: [
        { x: 6, y: 5 },
        { x: 7, y: 5 },
      ],
    });

    expect(diceOf(moved.events)[0]).toMatch(/^Pickup .*needs 3\+$/);
  });
});

describe("declaring Secure the Ball", () => {
  it("is refused with a Standing opponent within 2 squares of the ball", async () => {
    const game = new HeadlessGame({
      scenario: scenario({ opponent: { x: 9, y: 6 } }),
      seed: 1,
    });
    const declared = await game.execute({
      type: "declare-action",
      playerId: fixtureValue(game.ctx.team1.players[0]).id,
      action: "secureBall",
    });

    expect(declared.ok).toBe(false);
  });

  it("is allowed when that opponent is Prone", async () => {
    const game = new HeadlessGame({
      scenario: scenario({
        opponent: { x: 9, y: 6, status: PlayerStatus.PRONE },
      }),
      seed: 1,
    });
    const declared = await game.execute({
      type: "declare-action",
      playerId: fixtureValue(game.ctx.team1.players[0]).id,
      action: "secureBall",
    });

    expect(declared.ok).toBe(true);
  });

  it("is refused to a Big Guy", async () => {
    const game = new HeadlessGame({ scenario: scenario({}), seed: 1 });

    const securer = game.ctx.team1.players[0];
    fixtureValue(securer).keywords = [
      ...fixtureValue(securer).keywords,
      TraitKeyWord.BIG_GUY,
    ];
    const declared = await game.execute({
      type: "declare-action",
      playerId: fixtureValue(game.ctx.team1.players[0]).id,
      action: "secureBall",
    });

    expect(declared.ok).toBe(false);
  });

  it("is listed as a legal action", async () => {
    const game = new HeadlessGame({ scenario: scenario({}), seed: 1 });
    const legal = await game.execute({ type: "legal-actions" });
    const securer = legal.legalActions?.players.find(
      (p) => p.playerId === fixtureValue(game.ctx.team1.players[0]).id
    );

    expect(securer?.actions).toContain("secureBall");
  });
});

describe("a Secure the Ball move that ends off the ball", () => {
  it("is a Turnover", async () => {
    const game = new HeadlessGame({ scenario: scenario({}), seed: 1 });
    await secure(game, [{ x: 6, y: 5 }]);
    const ended = await game.execute({
      type: "end-activation",
      playerId: fixtureValue(game.ctx.team1.players[0]).id,
    });

    expect(ended.snapshot.activeTeamId).toBe(game.ctx.team2.id);
  });
});
