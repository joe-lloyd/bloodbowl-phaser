import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { Scenario } from "../../src/types/Scenario";
import { SkillType } from "../../src/types/Skills";

/**
 * Engine-level regressions for the reported gameplay bugs whose fix lives (or
 * whose correctness must stay locked) in the shared engine:
 *
 * - Horns adds +1 Strength on a Blitz block, and the block dice are recomputed
 *   from the boosted strength (a ST-3 blitzer vs ST 3 goes from 1 die to 2).
 * - A failed Dodge offers a reroll whose sources include the Dodge skill, so
 *   the reroll dialog can render an accept ("USE DODGE RE-ROLL") control — not
 *   only a decline.
 */

describe("reported gameplay bugs (engine regressions)", () => {
  it("Horns applies +1 Strength on a Blitz block and the dice reflect it", async () => {
    const scenario: Scenario = {
      id: "horns-blitz",
      name: "Horns blitz",
      description: "",
      setup: {
        team1Placements: [
          { playerIndex: 0, x: 10, y: 7, skills: [SkillType.HORNS] },
        ],
        team2Placements: [{ playerIndex: 0, x: 12, y: 7 }],
        activeTeam: "team1",
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        ballPosition: { x: 1, y: 1 },
      },
    };

    const game = new HeadlessGame({ scenario, seed: 7 });
    const attacker = game.snapshot().teams[0].players[0];
    const defender = game.snapshot().teams[1].players[0];

    await game.execute({
      type: "declare-action",
      playerId: attacker.id,
      action: "blitz",
    });
    await game.execute({
      type: "move",
      playerId: attacker.id,
      path: [{ x: 11, y: 7 }],
    });
    const blocked = await game.execute({
      type: "block",
      attackerId: attacker.id,
      defenderId: defender.id,
    });

    // Horns announced its bonus...
    expect(
      blocked.events.some(
        (e) =>
          e.name === GameEventNames.SkillTriggered &&
          (e.data as { skill: string }).skill === SkillType.HORNS
      )
    ).toBe(true);

    // ...and the +1 ST recomputed the block to 2 dice (ST 4 vs ST 3).
    const rolled = blocked.events.find(
      (e) => e.name === GameEventNames.BlockDiceRolled
    );
    expect(rolled).toBeDefined();
    expect((rolled!.data as { numDice: number }).numDice).toBe(2);
    expect(blocked.pendingDecision?.type).toBe("block-dice");
    if (blocked.pendingDecision?.type === "block-dice") {
      expect(blocked.pendingDecision.options).toHaveLength(2);
    }
  });

  it("a failed Dodge offers a reroll whose sources include the Dodge skill (accept, not decline-only)", async () => {
    const scenario: Scenario = {
      id: "dodge-accept",
      name: "Dodge reroll accept",
      description: "",
      setup: {
        team1Placements: [
          { playerIndex: 0, x: 16, y: 4, skills: [SkillType.DODGE] },
        ],
        team2Placements: [{ playerIndex: 0, x: 16, y: 5 }],
        activeTeam: "team1",
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        ballPosition: { x: 1, y: 1 },
      },
    };

    // Find a seed whose dodge fails and pauses on a reroll offer.
    let offered = false;
    for (let seed = 1; seed <= 100 && !offered; seed++) {
      const game = new HeadlessGame({ scenario, seed });
      // No team rerolls: the ONLY source that can appear is the Dodge skill.
      game.ctx.team1.rerolls = 0;
      const dodger = game.snapshot().teams[0].players[0];
      await game.execute({
        type: "declare-action",
        playerId: dodger.id,
        action: "move",
      });
      const moved = await game.execute({
        type: "move",
        playerId: dodger.id,
        path: [{ x: 15, y: 3 }],
      });
      const pending = moved.pendingDecision;
      if (pending?.type !== "reroll" || pending.rollKind !== "dodge") continue;

      offered = true;
      // The accept control is source-driven: "skill" must be offered, tagged
      // as the Dodge skill, so the dialog renders "USE DODGE RE-ROLL".
      expect(pending.sources).toContain("skill");
      expect(pending.skill).toBe(String(SkillType.DODGE));

      // Accepting performs the reroll through the seeded dice path.
      const accepted = await game.execute({
        type: "use-reroll",
        accept: true,
        source: "skill",
      });
      expect(accepted.ok).toBe(true);
      expect(accepted.pendingDecision).toBeNull();
      expect(
        accepted.events.some((e) => e.name === GameEventNames.RerollUsed)
      ).toBe(true);
    }
    expect(offered).toBe(true);
  });
});
