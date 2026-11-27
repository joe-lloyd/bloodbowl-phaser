import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { type Scenario } from "../../src/types/Scenario";
import { SkillType } from "../../src/types/Skills";

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
    const attacker = fixtureValue(game.snapshot().teams[0]).players[0];
    const defender = fixtureValue(game.snapshot().teams[1]).players[0];

    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(attacker).id,
      action: "blitz",
    });
    await game.execute({
      type: "move",
      playerId: fixtureValue(attacker).id,
      path: [{ x: 11, y: 7 }],
    });
    const blocked = await game.execute({
      type: "block",
      attackerId: fixtureValue(attacker).id,
      defenderId: fixtureValue(defender).id,
    });

    expect(
      blocked.events.some(
        (e) =>
          e.name === GameEventNames.SkillTriggered &&
          z.object({ skill: z.string() }).parse(e.data).skill ===
            SkillType.HORNS
      )
    ).toBe(true);

    const rolled = blocked.events.find(
      (e) => e.name === GameEventNames.BlockDiceRolled
    );
    expect(rolled).toBeDefined();
    expect(
      z.object({ numDice: z.number() }).parse(fixtureValue(rolled).data).numDice
    ).toBe(2);
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

    let offered = false;
    for (let seed = 1; seed <= 100 && !offered; seed++) {
      const game = new HeadlessGame({ scenario, seed });

      game.ctx.teams[0].rerolls = 0;
      const dodger = fixtureValue(game.snapshot().teams[0]).players[0];
      await game.execute({
        type: "declare-action",
        playerId: fixtureValue(dodger).id,
        action: "move",
      });
      const moved = await game.execute({
        type: "move",
        playerId: fixtureValue(dodger).id,
        path: [{ x: 15, y: 3 }],
      });
      const pending = moved.pendingDecision;
      if (pending?.type !== "reroll" || pending.rollKind !== "dodge") continue;

      offered = true;

      expect(pending.sources).toContain("skill");
      expect(pending.skill).toBe(SkillType.DODGE);

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

  it("force-ending a turn mid-activation clears the stale declaration so the next team can act", async () => {
    const scenario: Scenario = {
      id: "force-end-turn-clears-declaration",
      name: "Force end turn clears stale declaration",
      description: "",
      setup: {
        team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
        team2Placements: [{ playerIndex: 0, x: 15, y: 5 }],
        activeTeam: "team1",
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        ballPosition: { x: 1, y: 1 },
      },
    };

    const game = new HeadlessGame({ scenario, seed: 3 });
    const attacker = fixtureValue(game.snapshot().teams[0]).players[0];
    const nextMover = fixtureValue(game.snapshot().teams[1]).players[0];

    const declared = await game.execute({
      type: "declare-action",
      playerId: fixtureValue(attacker).id,
      action: "blitz",
    });
    expect(declared.ok).toBe(true);
    const moved = await game.execute({
      type: "move",
      playerId: fixtureValue(attacker).id,
      path: [{ x: 11, y: 5 }],
    });
    expect(moved.ok).toBe(true);

    const ended = await game.execute({ type: "end-turn" });
    expect(ended.ok).toBe(true);
    expect(ended.snapshot.activeTeamId).toBe(game.ctx.teams[1].id);

    const nextDeclared = await game.execute({
      type: "declare-action",
      playerId: fixtureValue(nextMover).id,
      action: "move",
    });
    expect(nextDeclared.ok).toBe(true);
  });
});
