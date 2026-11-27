import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";
import { PlayerCondition, PlayerStatus } from "../../src/types/Player";

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
      scenario: proneWith(skill, `stand-${skill}-${String(seed)}`),
      seed,
    });
    const playerId = fixtureValue(game.ctx.teams[0].players[0]).id;
    const response = await game.execute({ type: "stand-up", playerId });
    const player = fixtureValue(response.snapshot.teams[0]).players[0];
    const distracted = fixtureValue(player).conditions.some(
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
      expect(fixtureValue(fixtureValue(found).player).status).toBe(
        PlayerStatus.PRONE
      );
      expect(fixtureValue(found).response.snapshot.activePlayer).toBeNull();
    }
  );

  it("a passed roll stands the player up as a declared Move", async () => {
    for (let seed = 1; seed <= 50; seed++) {
      const game = new HeadlessGame({
        scenario: proneWith(SkillType.BONE_HEAD, `stand-pass-${String(seed)}`),
        seed,
      });
      const playerId = fixtureValue(game.ctx.teams[0].players[0]).id;
      const response = await game.execute({ type: "stand-up", playerId });
      if (
        fixtureValue(fixtureValue(response.snapshot.teams[0]).players[0])
          .status !== PlayerStatus.ACTIVE
      )
        continue;
      expect(response.snapshot.activePlayer).toMatchObject({
        id: playerId,
        action: "move",
      });
      return;
    }
    throw new Error("no seed passed the Bone Head roll");
  });

  it("a failed Bloodlust roll waits for the coach, then stands the player up", async () => {
    for (let seed = 1; seed <= 300; seed++) {
      const game = new HeadlessGame({
        scenario: proneWith(
          SkillType.BLOODLUST,
          `stand-bloodlust-${String(seed)}`
        ),
        seed,
      });
      const playerId = fixtureValue(game.ctx.teams[0].players[0]).id;
      const response = await game.execute({ type: "stand-up", playerId });
      if (response.pendingDecision?.type !== "reaction") continue;
      expect(response.pendingDecision).toMatchObject({
        skill: SkillType.BLOODLUST,
      });

      expect(
        fixtureValue(fixtureValue(response.snapshot.teams[0]).players[0]).status
      ).toBe(PlayerStatus.PRONE);
      const answered = await game.execute({
        type: "use-reaction",
        accept: true,
      });
      expect(
        fixtureValue(fixtureValue(answered.snapshot.teams[0]).players[0]).status
      ).toBe(PlayerStatus.ACTIVE);
      expect(answered.snapshot.activePlayer).toMatchObject({
        id: playerId,
        action: "move",
        bloodlustUnsated: true,
      });
      return;
    }
    throw new Error("no seed failed the Bloodlust roll");
  });

  it("a lash-out that downs the ball carrier is a Turnover: the player stays Prone", async () => {
    for (let seed = 1; seed <= 300; seed++) {
      const game = new HeadlessGame({
        scenario: {
          id: `stand-savage-${String(seed)}`,
          name: "stand-savage",
          description: "stand-savage",
          setup: {
            team1Placements: [
              {
                playerIndex: 0,
                x: 10,
                y: 5,
                skills: [SkillType.ANIMAL_SAVAGERY],
                status: PlayerStatus.PRONE,
              },

              { playerIndex: 1, x: 11, y: 5, hasBall: true },
            ],
            team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
            activeTeam: "team1",
            turn: 1,
            phase: GamePhase.PLAY,
            subPhase: SubPhase.TURN_RECEIVING,
          },
        },
        seed,
      });
      const playerId = fixtureValue(game.ctx.teams[0].players[0]).id;
      const response = await game.execute({ type: "stand-up", playerId });
      if (response.pendingDecision) continue;
      const carrier = fixtureValue(response.snapshot.teams[0]).players[1];
      if (fixtureValue(carrier).status === PlayerStatus.ACTIVE) continue;
      expect(
        fixtureValue(fixtureValue(response.snapshot.teams[0]).players[0]).status
      ).toBe(PlayerStatus.PRONE);
      return;
    }
    throw new Error("no seed made the lash-out hit the carrier");
  });
});
