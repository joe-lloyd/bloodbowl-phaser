import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";
import { PlayerCondition, PlayerStatus } from "../../src/types/Player";

function scenario(
  skill: SkillType,
  opts: { ball?: { x: number; y: number } }
): Scenario {
  return {
    id: "prone-special-actions",
    name: "A Prone player declares a move-first Special Action",
    description: "a Prone player two squares from an opponent",
    setup: {
      team1Placements: [
        {
          playerIndex: 0,
          x: 10,
          y: 5,
          skills: [skill],
          status: PlayerStatus.PRONE,
        },

        { playerIndex: 1, x: 2, y: 9 },
      ],
      team2Placements: [{ playerIndex: 0, x: 12, y: 5 }],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: opts.ball ?? { x: 1, y: 1 },
    },
  };
}

async function legalFor(game: HeadlessGame) {
  const legal = await game.execute({ type: "legal-actions" });
  return legal.legalActions?.players.find(
    (p) => p.playerId === fixtureValue(game.ctx.teams[0].players[0]).id
  )?.actions;
}

describe("a Prone player with Hypnotic Gaze", () => {
  it("is offered the gaze, stands as part of the move and gazes", async () => {
    const game = new HeadlessGame({
      scenario: scenario(SkillType.HYPNOTIC_GAZE, {}),
      seed: 2,
    });
    const gazerId = fixtureValue(game.ctx.teams[0].players[0]).id;
    const targetId = fixtureValue(game.ctx.teams[1].players[0]).id;
    expect(await legalFor(game)).toContain("gaze");

    const declared = await game.execute({
      type: "declare-action",
      playerId: gazerId,
      action: "gaze",
    });
    expect(declared.ok).toBe(true);
    await game.execute({
      type: "move",
      playerId: gazerId,
      path: [{ x: 11, y: 5 }],
    });
    expect(fixtureValue(game.ctx.teams[0].players[0]).status).toBe(
      PlayerStatus.ACTIVE
    );

    expect(game.ctx.gameService.getMovementUsed(gazerId)).toBe(4);

    const gazed = await game.execute({
      type: "special-action",
      action: "gaze",
      attackerId: gazerId,
      defenderId: targetId,
    });
    expect(gazed.ok).toBe(true);
    expect(
      fixtureValue(game.ctx.teams[1].players[0]).conditions?.map((c) => c.type)
    ).toEqual([PlayerCondition.DISTRACTED]);
  });
});

describe("a Prone player with Punt", () => {
  it("is offered the Punt when the loose ball is reachable", async () => {
    const game = new HeadlessGame({
      scenario: scenario(SkillType.PUNT, { ball: { x: 10, y: 7 } }),
      seed: 2,
    });
    expect(await legalFor(game)).toContain("punt");

    const declared = await game.execute({
      type: "declare-action",
      playerId: fixtureValue(game.ctx.teams[0].players[0]).id,
      action: "punt",
    });
    expect(declared.ok).toBe(true);
  });
});

describe("a Prone player with Stab", () => {
  it("still may not declare the Stab, which has no free Move first", async () => {
    const game = new HeadlessGame({
      scenario: {
        ...scenario(SkillType.STAB, {}),
        setup: {
          ...scenario(SkillType.STAB, {}).setup,
          team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
        },
      },
      seed: 2,
    });
    expect(await legalFor(game)).not.toContain("stab");

    const declared = await game.execute({
      type: "declare-action",
      playerId: fixtureValue(game.ctx.teams[0].players[0]).id,
      action: "stab",
    });
    expect(declared.ok).toBe(false);
  });
});
