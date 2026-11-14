import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";
import { PlayerCondition, PlayerStatus } from "../../src/types/Player";

/**
 * Standing up in place is a Move Action. A player with a negatrait rolls
 * for it just as they would for any other declared Move.
 */
const proneWith = (skill: SkillType, id: string): Scenario => ({
  id,
  name: id,
  description: id,
  setup: {
    team1Placements: [
      {
        playerIndex: 0,
        x: 10,
        y: 5,
        skills: [skill],
        status: PlayerStatus.PRONE,
      },
      { playerIndex: 1, x: 3, y: 8 },
    ],
    team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
    ballPosition: { x: 1, y: 1 },
    activeTeam: "team1",
    turn: 1,
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
  },
});

async function standUpUntilDistracted(skill: SkillType) {
  for (let seed = 1; seed <= 300; seed++) {
    const game = new HeadlessGame({
      scenario: proneWith(skill, `stand-${skill}-${seed}`),
      seed,
    });
    const playerId = game.ctx.team1.players[0].id;
    const response = await game.execute({ type: "stand-up", playerId });
    const player = response.snapshot.teams[0].players[0];
    const distracted = player.conditions?.some(
      (c) => c.type === PlayerCondition.DISTRACTED
    );
    if (distracted) return { response, player };
  }
  return null;
}

describe("standing up rolls the activation gate", () => {
  it.each([SkillType.BONE_HEAD, SkillType.REALLY_STUPID])(
    "a failed %s roll leaves the player Prone and ends the activation",
    async (skill) => {
      const found = await standUpUntilDistracted(skill);
      expect(found).not.toBeNull();
      expect(found!.player.status).toBe(PlayerStatus.PRONE);
      expect(found!.response.snapshot.activePlayer).toBeNull();
    }
  );

  it("a passed roll stands the player up as a declared Move", async () => {
    for (let seed = 1; seed <= 50; seed++) {
      const game = new HeadlessGame({
        scenario: proneWith(SkillType.BONE_HEAD, `stand-pass-${seed}`),
        seed,
      });
      const playerId = game.ctx.team1.players[0].id;
      const response = await game.execute({ type: "stand-up", playerId });
      if (response.snapshot.teams[0].players[0].status !== PlayerStatus.ACTIVE)
        continue;
      expect(response.snapshot.activePlayer).toMatchObject({
        id: playerId,
        action: "move",
      });
      return;
    }
    throw new Error("no seed passed the Bone Head roll");
  });

  it("a failed Bloodlust roll offers the Move downgrade on a stand-up", async () => {
    for (let seed = 1; seed <= 300; seed++) {
      const game = new HeadlessGame({
        scenario: proneWith(SkillType.BLOODLUST, `stand-bloodlust-${seed}`),
        seed,
      });
      const playerId = game.ctx.team1.players[0].id;
      const response = await game.execute({ type: "stand-up", playerId });
      const pending = response.pendingDecision;
      if (pending?.type === "reroll") continue;
      if (pending?.type === "reaction") {
        expect(pending).toMatchObject({ skill: SkillType.BLOODLUST });
        return;
      }
    }
    throw new Error("no seed failed the Bloodlust roll");
  });
});
