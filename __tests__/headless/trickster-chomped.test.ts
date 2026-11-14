import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { Scenario } from "../../src/types/Scenario";
import { PlayerCondition, addCondition } from "../../src/types/Player";
import { SkillType } from "../../src/types/Skills";

/**
 * FAQ (May 2026), p3: a Chomped player may use Trickster; "The Trickster
 * player is removed from the pitch and placed elsewhere. This will remove
 * the Chomped condition." Trickster lands next to the blocker, so when the
 * chomper is the blocker the victim is still marked by it afterwards.
 */
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
    const chomper = game.ctx.team1.players[0];
    const victim = game.ctx.team2.players[0];
    addCondition(victim, PlayerCondition.CHOMPED, chomper.id);

    await game.execute({
      type: "declare-action",
      playerId: chomper.id,
      action: "block",
    });
    const blocked = await game.execute({
      type: "block",
      attackerId: chomper.id,
      defenderId: victim.id,
    });
    expect(blocked.pendingDecision).toMatchObject({
      type: "reaction",
      skill: SkillType.TRICKSTER,
    });
    const slipped = await game.execute({ type: "use-reaction", accept: true });

    expect(victim.gridPosition).toEqual({ x: 9, y: 4 });
    expect(
      slipped.snapshot.teams[1].players[0].conditions
    ).toEqual([]);
  });
});
