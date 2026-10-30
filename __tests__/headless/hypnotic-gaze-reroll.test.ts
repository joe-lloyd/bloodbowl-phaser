import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";
import { PlayerCondition } from "../../src/types/Player";

/**
 * Hypnotic Gaze, 2025 rulebook p.129: "they select a Standing opposition
 * player adjacent to them and roll a D6. On a 1-2, nothing happens and this
 * player's activation immediately ends." The D6 is an ordinary roll, so a
 * Team Re-roll may be spent on it like any other. The gaze rolled straight
 * through without the offer. Seed 8 rolls a 1, then a 4 (committed, never
 * searched).
 */
const GAZE_FAILS_SEED = 8;

const scenario: Scenario = {
  id: "hypnotic-gaze-reroll",
  name: "Hypnotic Gaze fails with Team Re-rolls left",
  description: "a failed gaze offers the team's re-roll",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 10, y: 5, skills: [SkillType.HYPNOTIC_GAZE] },
    ],
    team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 1, y: 1 },
  },
};

const diceOf = (r: { events: { name: string; data: unknown }[] }) =>
  r.events
    .filter((e) => e.name === "diceRoll")
    .map((e) => (e.data as { description: string }).description);

describe("Hypnotic Gaze re-roll", () => {
  it("offers a Team Re-roll on a failed gaze and the re-roll can land it", async () => {
    const game = new HeadlessGame({ scenario, seed: GAZE_FAILS_SEED });
    game.ctx.team1.rerolls = 2;
    const gazer = game.ctx.team1.players[0];
    const target = game.ctx.team2.players[0];
    await game.execute({
      type: "declare-action",
      playerId: gazer.id,
      action: "gaze",
    });
    const gazed = await game.execute({
      type: "special-action",
      action: "gaze",
      attackerId: gazer.id,
      defenderId: target.id,
    });

    expect(diceOf(gazed)).toEqual([
      "Hypnotic Gaze (Human Lineman #1): 1, needs 3+",
    ]);
    expect(gazed.pendingDecision).toMatchObject({
      type: "reroll",
      rollKind: "gaze",
      sources: ["team"],
    });

    const rerolled = await game.execute({
      type: "use-reroll",
      accept: true,
      source: "team",
    });
    expect(diceOf(rerolled)).toEqual([
      "Hypnotic Gaze (Human Lineman #1): 4, needs 3+",
    ]);
    expect(target.conditions?.map((c) => c.type)).toEqual([
      PlayerCondition.DISTRACTED,
    ]);
    expect(game.snapshot().teams[0].rerolls).toBe(1);
  });
});
