/**
 * A failed Bone Head roll offers a team re-roll named for the roll, not
 * "the activation roll".
 */
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";

const scenario: Scenario = {
  id: "bone-head-reroll-name",
  name: "Bone Head re-roll name",
  description: "a Bone Head player declares a move",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 10, y: 5, skills: [SkillType.BONE_HEAD] },
      { playerIndex: 1, x: 3, y: 8 },
    ],
    team2Placements: [{ playerIndex: 0, x: 16, y: 9 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
  },
};

/** "Bone Head (Human Lineman #1): 1 +0 = 1 (Target: 2+)". Committed. */
const BONE_HEAD_FAILS_SEED = 7;

describe("re-roll for an activation roll", () => {
  it("names the Bone Head roll", async () => {
    const game = new HeadlessGame({ scenario, seed: BONE_HEAD_FAILS_SEED });
    game.ctx.team1.rerolls = 1;
    const response = await game.execute({
      type: "declare-action",
      playerId: game.ctx.team1.players[0].id,
      action: "move",
    });
    expect(response.pendingDecision).toMatchObject({
      type: "reroll",
      rollKind: "activation",
      rollName: "Bone Head",
    });
  });
});
