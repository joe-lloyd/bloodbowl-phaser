import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario, PlayerPlacement } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus, TraitKeyWord } from "../../src/types/Player";
import { SkillType } from "../../src/types/Skills";

/**
 * Secure the Ball (2025 rulebook, Performing a Secure the Ball Action):
 * "A player may only declare a Secure the Ball Action if the ball is loose
 * on the ground and is not within 2 squares of any Standing opposition
 * players that are not Distracted." The free Move "must finish on a square
 * containing a ball otherwise a Turnover is caused". The pick-up is "a D6
 * and on a 2+ they will automatically pick up the ball and their
 * activation immediately ends. On a 1, the player fails to pick up the
 * ball and a Turnover is caused". Sure Hands does not help (skills.json).
 * The engine ran it as a plain Move with an Agility Test pick-up.
 */
function scenario(opts: {
  securer?: Partial<PlayerPlacement>;
  opponent?: Partial<PlayerPlacement>;
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
    },
  };
}

function diceOf(events: { name: string; data: unknown }[]): string[] {
  return events
    .filter((e) => e.name === "diceRoll")
    .map((e) => (e.data as { description: string }).description);
}

async function secure(game: HeadlessGame, path: { x: number; y: number }[]) {
  const id = game.ctx.team1.players[0].id;
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
      "Secure the Ball (Human Lineman #1): 4 +0 = 4 (Target: 2+)",
    ]);
    const securer = game.ctx.team1.players[0];
    expect(securer.gridPosition).toEqual({ x: 7, y: 5 });
    expect(game.ctx.gameService.getState().ballPosition).toEqual({ x: 7, y: 5 });
    expect(game.ctx.gameService.getState().turn.activatedPlayerIds.has(securer.id)).toBe(true);
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
      "Secure the Ball (Human Lineman #1): 1 +0 = 1 (Target: 2+)",
    ]);
    // Only the team re-roll is offered; Sure Hands is not a source.
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

describe("declaring Secure the Ball", () => {
  it("is refused with a Standing opponent within 2 squares of the ball", async () => {
    const game = new HeadlessGame({
      scenario: scenario({ opponent: { x: 9, y: 6 } }),
      seed: 1,
    });
    const declared = await game.execute({
      type: "declare-action",
      playerId: game.ctx.team1.players[0].id,
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
      playerId: game.ctx.team1.players[0].id,
      action: "secureBall",
    });

    expect(declared.ok).toBe(true);
  });

  it("is refused to a Big Guy", async () => {
    const game = new HeadlessGame({ scenario: scenario({}), seed: 1 });
    // A fresh array: roster players share their template's keywords list.
    const securer = game.ctx.team1.players[0];
    securer.keywords = [...securer.keywords, TraitKeyWord.BIG_GUY];
    const declared = await game.execute({
      type: "declare-action",
      playerId: game.ctx.team1.players[0].id,
      action: "secureBall",
    });

    expect(declared.ok).toBe(false);
  });

  it("is listed as a legal action", async () => {
    const game = new HeadlessGame({ scenario: scenario({}), seed: 1 });
    const legal = await game.execute({ type: "legal-actions" });
    const securer = legal.legalActions?.players.find(
      (p) => p.playerId === game.ctx.team1.players[0].id
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
      playerId: game.ctx.team1.players[0].id,
    });

    expect(ended.snapshot.activeTeamId).toBe(game.ctx.team2.id);
  });
});
