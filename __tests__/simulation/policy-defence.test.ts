import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";
import type { PlayerPlacement } from "../../src/types/Scenario";
import {
  emptyDefence,
  watchDefence,
  type DefenceTally,
} from "../../scripts/coach/policy-lab/defence";

function blockGame(
  attacker: Partial<PlayerPlacement>,
  defender: Partial<PlayerPlacement>
) {
  const game = new HeadlessGame({
    seed: 1,
    scenario: {
      id: "policy-defence",
      name: "Count blocks",
      description: "",
      setup: {
        team1Placements: [
          { playerIndex: 0, x: 10, y: 5, ...attacker },
          { playerIndex: 1, x: 2, y: 9 },
        ],
        team2Placements: [{ playerIndex: 0, x: 11, y: 5, ...defender }],
        activeTeam: "team1",
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        ballPosition: { x: 1, y: 1 },
      },
    },
  });
  const tallies: [DefenceTally, DefenceTally] = [
    emptyDefence(),
    emptyDefence(),
  ];
  const watch = watchDefence(game, tallies);
  const run = async (command: unknown) => {
    watch.before(command);
    return game.execute(command);
  };
  const [attackerId, defenderId] = [
    fixtureValue(game.ctx.teams[0].players[0]).id,
    fixtureValue(game.ctx.teams[1].players[0]).id,
  ];
  return { game, tallies, run, attackerId, defenderId };
}

describe("policy-lab defence", () => {
  it("counts Frenzy's second block on the same target as a second block", async () => {
    const { tallies, run, attackerId, defenderId } = blockGame(
      { skills: [SkillType.FRENZY] },
      { skills: [SkillType.STAND_FIRM] }
    );
    await run({
      type: "declare-action",
      playerId: attackerId,
      action: "block",
    });
    await run({ type: "block", attackerId, defenderId });
    await run({ type: "choose-block-result", index: 0 });
    const second = await run({ type: "use-reaction", accept: true });

    expect(second.pendingDecision).toMatchObject({ type: "block-dice" });
    expect(tallies[0]).toMatchObject({ blocks: 2, dice: { 1: 2 } });
  });

  it("counts a block once when a Team Re-roll rolls its dice again", async () => {
    const { game, tallies, run, attackerId, defenderId } = blockGame({}, {});
    game.ctx.teams[0].rerolls = 3;
    await run({
      type: "declare-action",
      playerId: attackerId,
      action: "block",
    });
    await run({ type: "block", attackerId, defenderId });
    const rerolled = await run({ type: "team-reroll-block", attackerId });

    expect(rerolled.ok).toBe(true);
    expect(tallies[0]).toMatchObject({ blocks: 1, dice: { 1: 1 } });
  });
});
