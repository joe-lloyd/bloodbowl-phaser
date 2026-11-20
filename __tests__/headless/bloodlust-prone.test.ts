import { describe, expect, it } from "vitest";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";
import {
  PlayerCondition,
  PlayerStatus,
  hasCondition,
} from "../../src/types/Player";
import { RosterName } from "../../src/types/Team";
import { forceDice } from "../utils/test-helpers";

const NATURAL_ONE = 1;
const BOTH_DOWN = 2;

function vampireBlock() {
  const game = new HeadlessGame({
    seed: 3,
    scenario: {
      id: "bloodlust-prone",
      name: "A hungry Vampire wrestles itself prone",
      description: "",
      setup: {
        team1Roster: RosterName.VAMPIRE,
        team1Placements: [
          {
            playerIndex: 0,
            x: 10,
            y: 5,
            skills: [
              { type: SkillType.BLOODLUST, parameter: "2+" },
              SkillType.WRESTLE,
            ],
          },
          { playerIndex: 1, x: 10, y: 6 },
        ],
        team2Placements: [
          { playerIndex: 0, x: 11, y: 5, skills: [SkillType.BLOCK] },
        ],
        activeTeam: "team1",
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        ballPosition: { x: 1, y: 1 },
      },
    },
  });
  return {
    game,
    vampire: fixtureValue(game.ctx.team1.players[0]),
    thrall: fixtureValue(game.ctx.team1.players[1]),
    target: fixtureValue(game.ctx.team2.players[0]),
  };
}

describe("a Vampire with unsated Bloodlust that ends its Block prone", () => {
  it("cannot bite the Thrall beside it, so the turn ends and it is Distracted", async () => {
    const { game, vampire, thrall, target } = vampireBlock();
    forceDice(game.ctx.rng, [NATURAL_ONE, BOTH_DOWN, BOTH_DOWN]);

    await game.execute({
      type: "declare-action",
      playerId: vampire.id,
      action: "block",
    });
    expect(game.pendingDecision()).toMatchObject({
      type: "reaction",
      skill: SkillType.BLOODLUST,
    });
    await game.execute({ type: "use-reaction", accept: false });

    const blocked = await game.execute({
      type: "block",
      attackerId: vampire.id,
      defenderId: target.id,
    });
    expect(blocked.pendingDecision).toMatchObject({ type: "block-dice" });
    await game.execute({ type: "choose-block-result", index: 0 });
    expect(game.pendingDecision()).toMatchObject({
      type: "reaction",
      skill: SkillType.WRESTLE,
      opponentId: target.id,
    });
    const wrestled = await game.execute({ type: "use-reaction", accept: true });

    expect(wrestled.pendingDecision?.type).not.toBe("reaction");
    expect(vampire.status).toBe(PlayerStatus.PRONE);
    expect(thrall.status).toBe(PlayerStatus.ACTIVE);
    expect(hasCondition(vampire, PlayerCondition.DISTRACTED)).toBe(true);
    expect(game.snapshot().activeTeamId).toBe(game.ctx.team2.id);
  });
});
