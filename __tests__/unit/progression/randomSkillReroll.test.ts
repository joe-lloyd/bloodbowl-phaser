import { describe, expect, it } from "vitest";
import {
  dehydrateTeam,
  hydrateStoredTeam,
} from "../../../src/data/persistence/teamPersistence";
import { getRosterByRosterName } from "../../../src/data/RosterTemplates";
import {
  eligibleSkills,
  rollPendingRandomPrimary,
  SKILL_ROLL_TABLE,
} from "../../../src/game/progression/progression";
import { createPlayer, Player } from "../../../src/types/Player";
import { getSkill, SkillCategory, SkillType } from "../../../src/types/Skills";
import {
  calculateTeamValue,
  createTeam,
  RosterName,
  Team,
} from "../../../src/types/Team";

/** Teach `skill` as an earlier advancement, as the app records it, so it
 *  survives a save and reload. */
function learn(player: Player, skill: SkillType): void {
  if (player.skills.some((owned) => owned.type === skill)) return;
  player.skills.push(getSkill(skill));
  player.advancements = [
    ...(player.advancements ?? []),
    {
      id: `adv-${(player.advancements?.length ?? 0) + 1}`,
      type: "primary-skill",
      name: skill,
      sppCost: 0,
      valueIncrease: 0,
    },
  ];
}

/** Human Blitzer (General and Strength Primary) who also learned `extra`. */
function blitzerWith(...extra: SkillType[]): { team: Team; player: Player } {
  const roster = getRosterByRosterName(RosterName.HUMAN);
  const team = createTeam(
    "Re-roll Test",
    RosterName.HUMAN,
    { primary: 0, secondary: 0 },
    roster.rerollCost
  );
  team.players = roster.playerTemplates.map((template, index) =>
    createPlayer(template, team.id, index + 1)
  );
  const player = team.players.find(
    (p) =>
      p.primary?.includes(SkillCategory.GENERAL) &&
      p.primary.includes(SkillCategory.STRENGTH)
  );
  if (!player) throw new Error("The Human roster has no Blitzer");
  for (const skill of extra) learn(player, skill);
  player.spp = 20;
  team.teamValue = calculateTeamValue(team);
  return { team, player };
}

/** Dice that give exactly `values`, in order, and record what was rolled. */
function scriptedDice(...values: number[]) {
  const rolled: number[] = [];
  return {
    rolled,
    rollDie: () => {
      if (rolled.length >= values.length) {
        throw new Error("The scripted dice ran out");
      }
      rolled.push(values[rolled.length]);
      return rolled[rolled.length - 1];
    },
  };
}

const owned = (player: Player) => player.skills.map((skill) => skill.type);

/**
 * Rulebook: a random skill is rolled again "if the player already has that
 * Skill or if they roll a Skill they cannot have". The repeat happens
 * before the roll is saved, so a saved or shown candidate is always one
 * the player can take.
 */
describe("random skill rolls repeat until the player can take the skill", () => {
  it("rolls again when the first roll lands on a skill the player already has", () => {
    const { player } = blitzerWith(SkillType.BLOCK, SkillType.DAUNTLESS);
    expect(owned(player)).toEqual(
      expect.arrayContaining([SkillType.BLOCK, SkillType.DAUNTLESS])
    );
    // General 1,1 Block (owned) -> 4,1 Steady Footing;
    // 1,2 Dauntless (owned) -> 1,3 Fend.
    const dice = scriptedDice(1, 1, 4, 1, 1, 2, 1, 3);

    const roll = rollPendingRandomPrimary(player, SkillCategory.GENERAL, dice);

    expect(dice.rolled).toEqual([1, 1, 4, 1, 1, 2, 1, 3]);
    expect(roll).toEqual({
      kind: "random-primary",
      category: SkillCategory.GENERAL,
      candidates: [
        { skill: SkillType.STEADY_FOOTING, firstD6: 4, secondD6: 1 },
        { skill: SkillType.FEND, firstD6: 1, secondD6: 3 },
      ],
    });
    expect(player.pendingAdvancementRoll).toEqual(roll);
  });

  it("rolls again when the roll lands on a skill the player cannot have", () => {
    const { player } = blitzerWith(SkillType.FRENZY);
    // Strength 1,5 Grab and 4,3 Multiple Block both clash with Frenzy.
    const dice = scriptedDice(1, 5, 2, 1, 4, 3, 2, 6);

    const roll = rollPendingRandomPrimary(player, SkillCategory.STRENGTH, dice);

    expect(dice.rolled).toEqual([1, 5, 2, 1, 4, 3, 2, 6]);
    expect(roll).toMatchObject({
      candidates: [
        { skill: SkillType.ARM_BAR, firstD6: 2, secondD6: 1 },
        { skill: SkillType.GUARD, firstD6: 2, secondD6: 6 },
      ],
    });
  });

  it("keeps rolling through a long run of skills the player already has", () => {
    const { player } = blitzerWith(SkillType.BLOCK);
    const repeats = Array.from({ length: 150 }, () => [1, 1]).flat();
    const dice = scriptedDice(...repeats, 4, 1, 4, 3);

    const roll = rollPendingRandomPrimary(player, SkillCategory.GENERAL, dice);

    expect(roll).toMatchObject({
      candidates: [
        { skill: SkillType.STEADY_FOOTING },
        { skill: SkillType.SURE_HANDS },
      ],
    });
  });

  it("rolls no dice and saves nothing when no skill in the table can be taken", () => {
    // SPP advancement cannot get a player this far (six advancements make a
    // Legend), so the skills are given directly: this checks the guard.
    const { player } = blitzerWith();
    for (const skill of SKILL_ROLL_TABLE[SkillCategory.GENERAL]) {
      if (!owned(player).includes(skill)) player.skills.push(getSkill(skill));
    }
    const dice = scriptedDice(4, 1);

    expect(() =>
      rollPendingRandomPrimary(player, SkillCategory.GENERAL, dice)
    ).toThrow("No General skill is left that this player can take");
    expect(dice.rolled).toEqual([]);
    expect(player.pendingAdvancementRoll).toBeUndefined();
  });

  it("saves the re-rolled skills, and a reload shows the same ones", () => {
    const { team, player } = blitzerWith(SkillType.BLOCK, SkillType.DAUNTLESS);
    const roll = rollPendingRandomPrimary(
      player,
      SkillCategory.GENERAL,
      scriptedDice(1, 1, 4, 1, 1, 2, 1, 3)
    );

    const { team: reloaded } = hydrateStoredTeam(
      JSON.parse(JSON.stringify(dehydrateTeam(team)))
    );
    const again = reloaded.players.find((p) => p.id === player.id)!;
    expect(owned(again)).toEqual(
      expect.arrayContaining([SkillType.BLOCK, SkillType.DAUNTLESS])
    );
    expect(again.pendingAdvancementRoll).toEqual(roll);
    if (again.pendingAdvancementRoll?.kind !== "random-primary") {
      throw new Error("The saved roll was lost");
    }
    for (const candidate of again.pendingAdvancementRoll.candidates) {
      expect(owned(again)).not.toContain(candidate.skill);
    }
  });

  it("never lists an owned or clashing skill to choose directly", () => {
    const { player } = blitzerWith(
      SkillType.BLOCK,
      SkillType.DAUNTLESS,
      SkillType.FRENZY
    );
    const general = eligibleSkills(player, [SkillCategory.GENERAL]);
    const strength = eligibleSkills(player, [SkillCategory.STRENGTH]);

    for (const skill of owned(player)) {
      expect(general).not.toContain(skill);
      expect(strength).not.toContain(skill);
    }
    expect(strength).not.toContain(SkillType.GRAB);
    expect(strength).not.toContain(SkillType.MULTIPLE_BLOCK);
    expect(general).toContain(SkillType.FEND);
  });
});
