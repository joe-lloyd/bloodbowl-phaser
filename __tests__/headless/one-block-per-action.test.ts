import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";

/**
 * A Blitz includes one Block, and a Block Action is one Block. A Both Down
 * where the attacker has Block leaves nobody to follow up, so the block
 * never completed: the Blitz's block was not marked spent and a Block
 * Action stayed open, and either could block again. Found by the
 * simulation harness (seed 79, where it also looped forever).
 */
const scenario: Scenario = {
  id: "one-block-per-action",
  name: "One block per action",
  description: "both players have Block and the defender picks Both Down",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 5, y: 5, skills: [SkillType.BLOCK], stats: { ST: 3 } },
      { playerIndex: 1, x: 1, y: 9 }, // keeps team1's turn going
    ],
    team2Placements: [
      { playerIndex: 0, x: 6, y: 5, skills: [SkillType.BLOCK], stats: { ST: 3 } },
      { playerIndex: 1, x: 5, y: 4, stats: { ST: 3 } },
    ],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 1, y: 1 },
  },
};

/** Seed 9 rolls Both Down as the first die; committed, never searched. */
const BOTH_DOWN_SEED = 9;

async function blockIntoBothDown(action: "blitz" | "block") {
  const game = new HeadlessGame({ scenario, seed: BOTH_DOWN_SEED });
  const attacker = game.snapshot().teams[0].players[0];
  const [first, second] = game.snapshot().teams[1].players;

  await game.execute({ type: "declare-action", playerId: attacker.id, action });
  const rolled = await game.execute({
    type: "block",
    attackerId: attacker.id,
    defenderId: first.id,
  });
  // The assisted defender rolls two dice and picks. The seed must still put
  // Both Down first, or this test proves nothing.
  const dice = rolled.pendingDecision;
  expect(dice?.type === "block-dice" && dice.chooserTeamId).toBe("team2");
  expect(dice?.type === "block-dice" && dice.options[0].type).toBe(
    "both-down"
  );
  const resolved = await game.execute({ type: "choose-block-result", index: 0 });

  const again = await game.execute({
    type: "block",
    attackerId: attacker.id,
    defenderId: second.id,
  });
  return { attacker, resolved, again };
}

describe("one block per action", () => {
  it("a Blitz that rolled Both Down cannot block again, but may keep moving", async () => {
    const { attacker, resolved, again } = await blockIntoBothDown("blitz");

    expect(resolved.snapshot.activePlayer?.id).toBe(attacker.id);
    expect(again.ok).toBe(false);
    expect(again.reason).toContain("blitz-block-already-used");
  });

  it("a Block Action that rolled Both Down ends the activation", async () => {
    const { attacker, resolved, again } = await blockIntoBothDown("block");

    expect(resolved.snapshot.activeTeamId).toBe("team1");
    expect(resolved.snapshot.activePlayer).toBeNull();
    expect(resolved.snapshot.turn.activatedPlayerIds).toContain(attacker.id);
    expect(again.ok).toBe(false);
  });
});
