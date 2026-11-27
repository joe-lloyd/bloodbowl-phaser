import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { SkillType } from "../../src/types/Skills";
import { GameEventNames } from "../../src/types/events";

const downedNeighbour: Scenario = {
  id: "block-downed",
  name: "block-downed",
  description: "A Prone opponent stands next to the blocker",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 10, y: 5 },
      { playerIndex: 1, x: 3, y: 8 },
    ],
    team2Placements: [
      { playerIndex: 0, x: 11, y: 5, status: PlayerStatus.PRONE },
    ],
    ballPosition: { x: 1, y: 1 },
    activeTeam: "team1",
    turn: 1,
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
  },
};

describe("a Block against a downed opponent", () => {
  it("is refused by the service and leaves the declaration free to become a Foul", async () => {
    const game = new HeadlessGame({ scenario: downedNeighbour, seed: 1 });
    const blockerId = fixtureValue(game.ctx.teams[0].players[0]).id;
    const victimId = fixtureValue(game.ctx.teams[1].players[0]).id;

    await game.execute({
      type: "declare-action",
      playerId: blockerId,
      action: "block",
    });

    await game.ctx.gameService.rollBlockDice({
      attackerId: blockerId,
      defenderId: victimId,
      numDice: 1,
      isAttackerChoice: true,
    });
    expect(game.snapshot().activePlayer?.committed).toBeFalsy();

    const foul = await game.execute({
      type: "declare-action",
      playerId: blockerId,
      action: "foul",
    });
    expect(foul.ok).toBe(true);
    expect(foul.snapshot.activePlayer).toMatchObject({
      id: blockerId,
      action: "foul",
    });
  });
});

describe("a Foul whose declaration a failed negatrait ended", () => {
  it("is not performed", async () => {
    const scenario: Scenario = {
      ...downedNeighbour,
      id: "foul-after-bone-head",
      setup: {
        ...downedNeighbour.setup,
        team1Placements: [
          { playerIndex: 0, x: 10, y: 5, skills: [SkillType.BONE_HEAD] },
          { playerIndex: 1, x: 3, y: 8 },
        ],
      },
    };
    for (let seed = 1; seed <= 300; seed++) {
      const game = new HeadlessGame({ scenario, seed });
      const foulerId = fixtureValue(game.ctx.teams[0].players[0]).id;
      const declared = await game.execute({
        type: "declare-action",
        playerId: foulerId,
        action: "foul",
      });
      if (declared.pendingDecision || declared.snapshot.activePlayer) continue;
      const fouled = await game.execute({
        type: "foul",
        playerId: foulerId,
        x: 11,
        y: 5,
      });
      expect(
        fouled.events.some((e) => e.name === GameEventNames.DiceRoll)
      ).toBe(false);
      expect(
        fixtureValue(fixtureValue(fouled.snapshot.teams[1]).players[0]).status
      ).toBe(PlayerStatus.PRONE);
      return;
    }
    throw new Error("no seed failed the Bone Head roll");
  });
});

describe("a Foul on a downed opponent out of reach", () => {
  it("is refused until the fouler stands next to them", async () => {
    const scenario: Scenario = {
      ...downedNeighbour,
      id: "foul-out-of-reach",
      setup: {
        ...downedNeighbour.setup,
        team2Placements: [
          { playerIndex: 0, x: 14, y: 5, status: PlayerStatus.PRONE },
        ],
      },
    };
    const game = new HeadlessGame({ scenario, seed: 1 });
    const foulerId = fixtureValue(game.ctx.teams[0].players[0]).id;
    await game.execute({
      type: "declare-action",
      playerId: foulerId,
      action: "foul",
    });
    const fouled = await game.execute({
      type: "foul",
      playerId: foulerId,
      x: 14,
      y: 5,
    });
    expect(fouled.events.some((e) => e.name === GameEventNames.DiceRoll)).toBe(
      false
    );
    expect(fouled.snapshot.turn.hasFouled).toBe(false);
  });
});
