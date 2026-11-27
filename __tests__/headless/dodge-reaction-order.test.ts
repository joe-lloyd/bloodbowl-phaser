import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { SkillType } from "../../src/types/Skills";
import { forceDice } from "../utils/test-helpers";

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
  game.ctx.teams[0].rerolls = 0;
  const dodger = game.ctx.teams[0].players[0];
  const [shadower, diver] = game.ctx.teams[1].players;
  await game.execute({
    type: "declare-action",
    playerId: fixtureValue(dodger).id,
    action: "move",
  });
  forceDice(game.ctx.rng, dice);
  const moved = await game.execute({
    type: "move",
    playerId: fixtureValue(dodger).id,
    path: [{ x: 4, y: 5 }],
  });
  return { game, dodger, shadower, diver, moved };
}

describe("Dodge reactions resolve in the FAQ order", () => {
  it("asks the diver first, and a dive leaves nothing to Shadow", async () => {
    const { game, dodger, shadower, diver, moved } = await dodgeAway([3, 1, 1]);
    expect(moved.pendingDecision).toMatchObject({
      type: "reaction",
      skill: SkillType.DIVING_TACKLE,
      playerId: fixtureValue(diver).id,
    });
    const dived = await game.execute({ type: "use-reaction", accept: true });

    expect(dived.pendingDecision).toBeNull();
    expect(fixtureValue(dodger).gridPosition).toEqual({ x: 4, y: 5 });
    expect(fixtureValue(dodger).status).toBe(PlayerStatus.PRONE);
    expect(fixtureValue(diver).gridPosition).toEqual({ x: 5, y: 5 });
    expect(fixtureValue(diver).status).toBe(PlayerStatus.PRONE);
    expect(fixtureValue(shadower).gridPosition).toEqual({ x: 6, y: 4 });
  });

  it("offers Shadowing once the diver declines and the dodge stands", async () => {
    const { game, dodger, shadower, diver } = await dodgeAway([3, 4]);
    await game.execute({ type: "use-reaction", accept: false });
    expect(game.pendingDecision()).toMatchObject({
      type: "reaction",
      skill: SkillType.SHADOWING,
      playerId: fixtureValue(shadower).id,
    });
    await game.execute({ type: "use-reaction", accept: true });

    expect(fixtureValue(dodger).gridPosition).toEqual({ x: 4, y: 5 });
    expect(fixtureValue(dodger).status).toBe(PlayerStatus.ACTIVE);
    expect(fixtureValue(shadower).gridPosition).toEqual({ x: 5, y: 5 });
    expect(fixtureValue(diver).gridPosition).toEqual({ x: 6, y: 5 });
  });

  it("never Shadows a failed dodge", async () => {
    const { dodger, shadower, moved } = await dodgeAway([1, 1, 1]);

    expect(moved.pendingDecision).toBeNull();
    expect(fixtureValue(dodger).gridPosition).toEqual({ x: 4, y: 5 });
    expect(fixtureValue(dodger).status).toBe(PlayerStatus.PRONE);
    expect(fixtureValue(shadower).gridPosition).toEqual({ x: 6, y: 4 });
  });
});
