import { describe, expect, it } from "vitest";
import { getRosterByRosterName } from "../../../src/data/RosterTemplates";
import {
  applyAdvancement,
  eligibleSkills,
  rollPendingRandomPrimary,
} from "../../../src/game/progression/progression";
import { createPlayer, Player } from "../../../src/types/Player";
import { SkillCategory, SkillType } from "../../../src/types/Skills";
import { RosterName } from "../../../src/types/Team";

/** A fresh Goblin player of `position` with SPP to spend. */
function goblin(position: string): Player {
  const roster = getRosterByRosterName(RosterName.GOBLIN);
  const template = roster.playerTemplates.find(
    (t) => t.positionName === position
  );
  if (!template) throw new Error(`The Goblin roster has no ${position}`);
  const player = createPlayer(template, "goblins", 1);
  player.spp = 20;
  return player;
}

/** Dice that give exactly `values`, in order. */
function scriptedDice(...values: number[]) {
  let next = 0;
  return {
    rollDie: () => {
      if (next >= values.length) throw new Error("The scripted dice ran out");
      return values[next++];
    },
  };
}

const owned = (player: Player) => player.skills.map((skill) => skill.type);

/**
 * Rulebook, Saboteur: "A player without the Secret Weapon Trait cannot have
 * this Skill." FAQ (May 2026): a Ball & Chain player may have it "so long as
 * they also have the Secret Weapon Trait".
 */
describe("Saboteur needs the Secret Weapon Trait", () => {
  it("is not offered to a Goblin Lineman, who lacks Secret Weapon", () => {
    const lineman = goblin("Goblin Lineman");
    const devious = eligibleSkills(lineman, [SkillCategory.DEVIOUS]);

    expect(devious).not.toContain(SkillType.SABOTEUR);
    expect(devious).toContain(SkillType.SNEAKY_GIT);
    expect(() =>
      applyAdvancement(lineman, {
        kind: "chosen-primary",
        skill: SkillType.SABOTEUR,
      })
    ).toThrow("Skill is not a legal primary choice");
    expect(owned(lineman)).not.toContain(SkillType.SABOTEUR);
  });

  it("re-rolls a random Saboteur for a player without Secret Weapon", () => {
    const lineman = goblin("Goblin Lineman");
    // Devious 4,3 Saboteur -> 4,5 Sneaky Git; 1,1 Dirty Player.
    const roll = rollPendingRandomPrimary(
      lineman,
      SkillCategory.DEVIOUS,
      scriptedDice(4, 3, 4, 5, 1, 1)
    );

    expect(roll).toEqual({
      kind: "random-primary",
      category: SkillCategory.DEVIOUS,
      candidates: [
        { skill: SkillType.SNEAKY_GIT, firstD6: 4, secondD6: 5 },
        { skill: SkillType.DIRTY_PLAYER, firstD6: 1, secondD6: 1 },
      ],
    });
  });

  it("lets a Fanatic, with Ball & Chain and Secret Weapon, take Saboteur", () => {
    const fanatic = goblin("Fanatic");
    expect(owned(fanatic)).toEqual(
      expect.arrayContaining([SkillType.BALL_AND_CHAIN, SkillType.SECRET_WEAPON])
    );
    expect(eligibleSkills(fanatic, [SkillCategory.DEVIOUS])).toContain(
      SkillType.SABOTEUR
    );

    const roll = rollPendingRandomPrimary(
      fanatic,
      SkillCategory.DEVIOUS,
      scriptedDice(4, 3, 1, 1)
    );
    expect(roll).toMatchObject({
      candidates: [
        { skill: SkillType.SABOTEUR, firstD6: 4, secondD6: 3 },
        { skill: SkillType.DIRTY_PLAYER, firstD6: 1, secondD6: 1 },
      ],
    });

    applyAdvancement(fanatic, {
      kind: "random-primary",
      skill: SkillType.SABOTEUR,
    });
    expect(owned(fanatic)).toContain(SkillType.SABOTEUR);
  });
});
