import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";

/**
 * Frenzy (2025 rulebook p.130) forces the follow-up, but only once the push
 * has settled: a carrier knocked down by the Block drops the ball, which
 * Bounces (p.44) before the blocker moves. The simulation harness caught the
 * follow-up overtaking the Bounce, which turned this pickup into a catch.
 * Seeds are committed, never searched (docs/E2E_TESTING.md).
 */
const scenario: Scenario = {
  id: "frenzy-pow-ball-carrier",
  name: "Frenzy knocks down the ball carrier",
  description: "",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 10, y: 5, skills: [SkillType.FRENZY] },
      // A spare player keeps team1's turn open after the activation.
      { playerIndex: 1, x: 2, y: 12 },
    ],
    team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 11, y: 5 },
  },
};

/** A Defender Stumbles; the dropped ball Bounces back into (11,5). */
const SEED = 30;

describe("Frenzy knocking down the ball carrier", () => {
  it("lets the dropped ball Bounce before the follow-up", async () => {
    const game = new HeadlessGame({ scenario, seed: SEED });
    const attacker = game.ctx.team1.players[0];
    const defender = game.ctx.team2.players[0];

    await game.execute({
      type: "declare-action",
      playerId: attacker.id,
      action: "block",
    });
    await game.execute({
      type: "block",
      attackerId: attacker.id,
      defenderId: defender.id,
    });
    await game.execute({ type: "choose-block-result", index: 0 });
    const push = await game.execute({
      type: "choose-push-direction",
      x: 12,
      y: 5,
    });

    expect(
      push.events
        .filter((e) => e.name === "diceRoll")
        .map((e) => (e.data as { description: string }).description)
    ).toEqual([
      "Armour Roll (Human Lineman #1): 6 + 3 = 9",
      "Injury Roll (Human Lineman #1): 2 + 1 = 3",
      "Bounce Direction: 4",
      // The ball lay in the vacated square when the blocker followed up.
      "Pickup (Human Lineman #1): 6, needs 3+",
    ]);
    expect(attacker.gridPosition).toEqual({ x: 11, y: 5 });
    expect(game.snapshot().ballPosition).toEqual({ x: 11, y: 5 });
  });
});
