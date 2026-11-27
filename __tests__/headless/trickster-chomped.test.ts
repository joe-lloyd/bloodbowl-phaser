import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { type Scenario } from "../../src/types/Scenario";
import { PlayerCondition, addCondition } from "../../src/types/Player";
import { SkillType } from "../../src/types/Skills";

const scenario: Scenario = {
  id: "trickster-chomped",
  name: "Trickster clears Chomped",
  description: "the chomper blocks its Chomped Trickster victim",
  setup: {
    team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
    team2Placements: [
      { playerIndex: 0, x: 11, y: 5, skills: [SkillType.TRICKSTER] },
    ],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 1, y: 1 },
  },
};

describe("Trickster and Chomped", () => {
  it("removes the Chomped condition when the victim slips away", async () => {
    const game = new HeadlessGame({ scenario, seed: 1 });
    const chomper = game.ctx.teams[0].players[0];
    const victim = game.ctx.teams[1].players[0];
    addCondition(
      fixtureValue(victim),
      PlayerCondition.CHOMPED,
      fixtureValue(chomper).id
    );

    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(chomper).id,
      action: "block",
    });
    const blocked = await game.execute({
      type: "block",
      attackerId: fixtureValue(chomper).id,
      defenderId: fixtureValue(victim).id,
    });
    expect(blocked.pendingDecision).toMatchObject({
      type: "reaction",
      skill: SkillType.TRICKSTER,
    });
    const slipped = await game.execute({ type: "use-reaction", accept: true });

    expect(fixtureValue(victim).gridPosition).toEqual({ x: 9, y: 4 });
    expect(
      fixtureValue(fixtureValue(slipped.snapshot.teams[1]).players[0])
        .conditions
    ).toEqual([]);
  });
});
