import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { SkillType } from "../../src/types/Skills";
import { forceDice } from "../utils/test-helpers";

/**
 * FAQ (May 2026), p2, Dodging out of a Tackle Zone: Tentacles, move, the
 * Dodge roll and its re-rolls, then Diving Tackle, and only "If the Dodge is
 * successful, a Shadowing roll can be made" into a square no diver took.
 * The shadower here comes first in board order, ahead of the diver.
 */
const scenario: Scenario = {
  id: "dodge-reaction-order",
  name: "Dodge reaction order",
  description: "a lineman dodges away from a shadower and a diver",
  setup: {
    team1Placements: [{ playerIndex: 0, x: 5, y: 5 }],
    team2Placements: [
      { playerIndex: 0, x: 6, y: 4, skills: [SkillType.SHADOWING] },
      { playerIndex: 1, x: 6, y: 5, skills: [SkillType.DIVING_TACKLE] },
    ],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 1, y: 1 },
  },
};

async function dodgeAway(dice: number[]) {
  const game = new HeadlessGame({ scenario, seed: 1 });
  game.ctx.team1.rerolls = 0;
  const dodger = game.ctx.team1.players[0];
  const [shadower, diver] = game.ctx.team2.players;
  await game.execute({
    type: "declare-action",
    playerId: dodger.id,
    action: "move",
  });
  forceDice(game.ctx.rng, dice);
  const moved = await game.execute({
    type: "move",
    playerId: dodger.id,
    path: [{ x: 4, y: 5 }],
  });
  return { game, dodger, shadower, diver, moved };
}

describe("Dodge reactions resolve in the FAQ order", () => {
  it("asks the diver first, and a dive leaves nothing to Shadow", async () => {
    // Dodge 3 passes (needs 3+) until the dive's -2; armour holds
    const { game, dodger, shadower, diver, moved } = await dodgeAway([
      3, 1, 1,
    ]);
    expect(moved.pendingDecision).toMatchObject({
      type: "reaction",
      skill: SkillType.DIVING_TACKLE,
      playerId: diver.id,
    });
    const dived = await game.execute({ type: "use-reaction", accept: true });

    expect(dived.pendingDecision).toBeNull();
    expect(dodger.gridPosition).toEqual({ x: 4, y: 5 });
    expect(dodger.status).toBe(PlayerStatus.PRONE);
    expect(diver.gridPosition).toEqual({ x: 5, y: 5 });
    expect(diver.status).toBe(PlayerStatus.PRONE);
    expect(shadower.gridPosition).toEqual({ x: 6, y: 4 });
  });

  it("offers Shadowing once the diver declines and the dodge stands", async () => {
    const { game, dodger, shadower, diver } = await dodgeAway([3, 4]);
    await game.execute({ type: "use-reaction", accept: false });
    expect(game.pendingDecision()).toMatchObject({
      type: "reaction",
      skill: SkillType.SHADOWING,
      playerId: shadower.id,
    });
    await game.execute({ type: "use-reaction", accept: true });

    expect(dodger.gridPosition).toEqual({ x: 4, y: 5 });
    expect(dodger.status).toBe(PlayerStatus.ACTIVE);
    expect(shadower.gridPosition).toEqual({ x: 5, y: 5 });
    expect(diver.gridPosition).toEqual({ x: 6, y: 5 });
  });

  it("never Shadows a failed dodge", async () => {
    // Dodge 1 fails outright; armour holds
    const { dodger, shadower, moved } = await dodgeAway([1, 1, 1]);

    expect(moved.pendingDecision).toBeNull();
    expect(dodger.gridPosition).toEqual({ x: 4, y: 5 });
    expect(dodger.status).toBe(PlayerStatus.PRONE);
    expect(shadower.gridPosition).toEqual({ x: 6, y: 4 });
  });
});
