import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { SkillType, SkillCategory } from "../../src/types/Skills";
import { Scenario } from "../../src/types/Scenario";

/**
 * Starter reroll skills (Dodge, Sure Hands, Catch, Pass): each declares its
 * roll kind to the reroll machinery, so a failure offers a SKILL source
 * even with an empty team reroll bank. Tackle denies the Dodge skill offer.
 */

const give = (player: { skills: unknown[] }, type: SkillType) =>
  player.skills.push({ type, category: SkillCategory.GENERAL, description: "" });

const scenario: Scenario = {
  id: "skill-rerolls",
  name: "Skill rerolls",
  description: "pickup, dodge, and pass situations in one layout",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 4, y: 5 }, // mover (pickup / pass once holding)
      { playerIndex: 1, x: 16, y: 4 }, // dodger, marked by team2's player
      { playerIndex: 2, x: 7, y: 5 }, // catcher for pass tests
    ],
    team2Placements: [{ playerIndex: 0, x: 16, y: 5 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 5, y: 5 },
  },
};

type Pending = { type: string; sources?: string[]; skill?: string; rollKind?: string };

describe("Sure Hands (5.4) — pickup reroll offer", () => {
  it("offers the skill source on a failed pickup with no team rerolls", async () => {
    for (let seed = 1; seed <= 100; seed++) {
      const game = new HeadlessGame({ scenario, seed });
      const mover = game.ctx.team1.players[0];
      give(mover, SkillType.SURE_HANDS);

      await game.execute({
        type: "declare-action",
        playerId: mover.id,
        action: "move",
      });
      const moved = await game.execute({
        type: "move",
        playerId: mover.id,
        path: [{ x: 5, y: 5 }],
      });
      const pending = moved.pendingDecision as Pending | null;
      if (!pending) continue; // pickup succeeded — next seed

      expect(pending.type).toBe("reroll");
      expect(pending.rollKind).toBe("pickup");
      expect(pending.sources).toEqual(["skill"]);
      expect(pending.skill).toBe(SkillType.SURE_HANDS);

      // Accepting without naming a source defaults to the skill
      const accepted = await game.execute({ type: "use-reroll", accept: true });
      const used = accepted.events.find(
        (e) => e.name === GameEventNames.RerollUsed
      );
      expect(used).toBeDefined();
      expect((used!.data as { source: string }).source).toBe("skill");
      expect(
        accepted.events.some((e) => e.name === GameEventNames.SkillTriggered)
      ).toBe(true);
      return;
    }
    throw new Error("no failing pickup found in seed range");
  });
});

describe("Dodge (5.3) — dodge reroll offer, denied by Tackle", () => {
  async function failDodge(seed: number, markerSkill?: SkillType) {
    const game = new HeadlessGame({ scenario, seed });
    const dodger = game.ctx.team1.players[1];
    give(dodger, SkillType.DODGE);
    if (markerSkill) give(game.ctx.team2.players[0], markerSkill);

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
    return { game, moved };
  }

  it("a failed dodge offers the Dodge skill reroll", async () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { moved } = await failDodge(seed);
      const pending = moved.pendingDecision as Pending | null;
      if (!pending) continue; // dodge succeeded

      expect(pending.type).toBe("reroll");
      expect(pending.rollKind).toBe("dodge");
      expect(pending.sources).toEqual(["skill"]);
      expect(pending.skill).toBe(SkillType.DODGE);
      return;
    }
    throw new Error("no failing dodge found in seed range");
  });

  it("Tackle on the marker denies the Dodge skill reroll", async () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { moved } = await failDodge(seed, SkillType.TACKLE);
      // With the only source denied, a failed dodge resolves directly
      expect(moved.pendingDecision).toBeNull();
      const fell = moved.events.some(
        (e) => e.name === GameEventNames.PlayerKnockedDown
      );
      if (!fell) continue; // dodge succeeded
      expect(
        moved.events.some(
          (e) =>
            e.name === GameEventNames.SkillTriggered &&
            (e.data as { skill: string }).skill === SkillType.TACKLE
        )
      ).toBe(true);
      return;
    }
    throw new Error("no failing dodge found in seed range");
  });
});

describe("Pass (5.6) and Catch (5.5) — reroll offers on the pass chain", () => {
  async function startPass(seed: number) {
    const game = new HeadlessGame({ scenario, seed });
    const passer = game.ctx.team1.players[0];
    const catcher = game.ctx.team1.players[2];
    give(passer, SkillType.PASS);
    give(catcher, SkillType.CATCH);

    // Walk onto the ball; skip seeds where the pickup fails
    await game.execute({
      type: "declare-action",
      playerId: passer.id,
      action: "move",
    });
    const moved = await game.execute({
      type: "move",
      playerId: passer.id,
      path: [{ x: 5, y: 5 }],
    });
    if (moved.pendingDecision || moved.snapshot.activeTeamId !== "team1") {
      return null;
    }
    await game.execute({ type: "end-activation", playerId: passer.id });

    await game.execute({
      type: "declare-action",
      playerId: passer.id,
      action: "pass",
    });
    const passed = await game.execute({
      type: "pass",
      playerId: passer.id,
      x: 7,
      y: 5,
    });
    return { game, passed };
  }

  it("a failed pass offers the Pass skill reroll; a dropped catch offers Catch", async () => {
    let sawPassOffer = false;
    let sawCatchOffer = false;

    for (let seed = 1; seed <= 300 && !(sawPassOffer && sawCatchOffer); seed++) {
      const started = await startPass(seed);
      if (!started) continue;
      const { game, passed } = started;

      let pending = passed.pendingDecision as Pending | null;
      if (pending?.type === "reroll" && pending.rollKind === "pass") {
        sawPassOffer = true;
        expect(pending.sources).toEqual(["skill"]);
        expect(pending.skill).toBe(SkillType.PASS);
        // Decline; the pass resolves (maybe into a catch offer)
        const declined = await game.execute({
          type: "use-reroll",
          accept: false,
        });
        pending = declined.pendingDecision as Pending | null;
      }
      if (pending?.type === "reroll" && pending.rollKind === "catch") {
        sawCatchOffer = true;
        expect(pending.sources).toEqual(["skill"]);
        expect(pending.skill).toBe(SkillType.CATCH);
        await game.execute({ type: "use-reroll", accept: true });
      }
    }

    expect(sawPassOffer).toBe(true);
    expect(sawCatchOffer).toBe(true);
  });
});
