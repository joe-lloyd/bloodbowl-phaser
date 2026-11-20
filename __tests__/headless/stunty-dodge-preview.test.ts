import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { planMoveLegs, stepRolls } from "../../src/game/rules/moveLegs";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { RosterName } from "../../src/types/Team";
import { SkillType } from "../../src/types/Skills";
import { GameEventNames } from "../../src/types/events";
import type { Scenario } from "../../src/types/Scenario";
import { forceDice } from "../utils/test-helpers";

function scenario(skills: SkillType[] = []): Scenario {
  return {
    id: "stunty-dodge-preview",
    name: "Goblin rushes through gnome tackle zones",
    description: "Stunty ignores all three marking penalties on the Dodge",
    setup: {
      team1Roster: RosterName.GOBLIN,
      team2Roster: RosterName.GNOME,

      team1Placements: [{ playerIndex: 1, x: 5, y: 5, stats: { MA: 1 } }],
      team2Placements: [
        { playerIndex: 0, x: 7, y: 4, skills },
        { playerIndex: 1, x: 7, y: 6, skills },
        { playerIndex: 2, x: 8, y: 5 },
      ],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 1, y: 1 },
    },
  };
}

describe("Stunty dodge preview and resolution", () => {
  it.each([
    { name: "roster gnomes", skills: [], target: 3 },
    { name: "Tackle", skills: [SkillType.TACKLE], target: 3 },
    {
      name: "two Prehensile Tails",
      skills: [SkillType.PREHENSILE_TAIL],
      target: 4,
    },
  ])("agrees on the target against $name", async ({ skills, target }) => {
    const game = new HeadlessGame({ scenario: scenario(skills), seed: 5 });
    const goblin = game.ctx.team1.players[1];
    const path = [
      { x: 6, y: 5 },
      { x: 7, y: 5 },
    ];
    const legs = planMoveLegs(
      fixtureValue(fixtureValue(goblin).gridPosition),
      path,
      {
        player: fixtureValue(goblin),
        ma: fixtureValue(goblin).stats.MA,
        allowance: fixtureValue(goblin).stats.MA + 2,
        used: 0,
        rushModifier: 0,
        opponents: game.ctx.team2.players,
      }
    );
    const preview = legs.flatMap((leg) =>
      leg.risk ? stepRolls(leg.risk, leg.path[0]) : []
    );
    expect(preview).toEqual([
      { type: "rush", target: 2, square: path[1] },
      { type: "dodge", target, square: path[1] },
    ]);

    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(goblin).id,
      action: "move",
    });
    forceDice(game.ctx.rng, [2, target]);
    const response = await game.execute({
      type: "move",
      playerId: fixtureValue(goblin).id,
      path,
    });
    expect(response.ok).toBe(true);
    expect(
      fixtureValue(fixtureValue(response.snapshot.teams[0]).players[1]).position
    ).toEqual(path[1]);
    const rolls = response.events
      .filter((e) => e.name === GameEventNames.DiceRoll)
      .map((e) => z.object({ description: z.string() }).parse(e.data));
    expect(rolls.map((roll) => roll.description)).toEqual([
      "Rush (Goblin Lineman #2): 2, needs 2+",
      `Dodge (Goblin Lineman #2): ${String(target)}, needs ${String(target)}+`,
    ]);
  });
});
