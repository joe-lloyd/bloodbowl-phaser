import { describe, expect, it } from "vitest";
import { beginRedraft } from "../../../src/game/rules/redraft";
import { TeamFactory } from "../../../src/game/TeamFactory";
import { stabilizeIds } from "../../../src/headless/createHeadlessGame";
import { InjuryType, PlayerAdvancement } from "../../../src/types/Player";
import { RosterName, Team } from "../../../src/types/Team";
import { SkillType, getSkill } from "../../../src/types/Skills";

/**
 * Re-drafting between seasons (docs/SEVENS_RULES.md R1-R3), through the
 * off-season entry point. Dice come from a fixed queue.
 */

function leagueTeam(): Team {
  const team = stabilizeIds(
    TeamFactory.createTestTeam(RosterName.HUMAN, "Reds", 0xcc0000),
    "reds"
  );
  team.advancementMode = "sevens-skill-selection";
  return team;
}

function dice(...values: number[]): () => number {
  return () => {
    const value = values.shift();
    if (value === undefined) throw new Error("rolled more dice than expected");
    return value;
  };
}

const skill = (name: string): PlayerAdvancement => ({
  id: `adv-${name}`,
  type: "primary-skill",
  name,
  sppCost: 0,
  valueIncrease: 10_000,
});

describe("re-drafting between seasons", () => {
  it("R1: players due to miss the next game recover, with no roll", () => {
    const team = leagueTeam();
    team.players[0].injuries.push(InjuryType.MISS_NEXT_GAME);

    beginRedraft(team, 0, dice());
    expect(team.players[0].injuries).toEqual([]);
  });

  it("R1: a gained Hatred is lost on a 4+ and kept on a 3", () => {
    const team = leagueTeam();
    const [calm, angry] = team.players;
    for (const player of [calm, angry]) {
      player.advancements = [skill(SkillType.HATRED)];
      player.skills.push(getSkill(SkillType.HATRED, "Elf"));
    }

    // Hatred rolls for calm then angry. Only angry still has an added skill,
    // so only angry rolls for Emergency Call-ups, and stays on a 6.
    const result = beginRedraft(team, 0, dice(4, 3, 6));
    expect(result.calledUp).toEqual([]);
    expect(calm.advancements).toEqual([]);
    expect(calm.skills.some((s) => s.type === SkillType.HATRED)).toBe(false);
    expect(angry.advancements).toEqual([skill(SkillType.HATRED)]);
    expect(angry.skills.some((s) => s.type === SkillType.HATRED)).toBe(true);
  });

  it("R2: a player with an added skill leaves on a 1 and stays on a 2", () => {
    const team = leagueTeam();
    const [leaver, stayer, unskilled] = team.players;
    leaver.advancements = [skill(SkillType.BLOCK)];
    stayer.advancements = [skill(SkillType.DODGE)];

    const result = beginRedraft(team, 0, dice(1, 2));
    expect(result.calledUp.map((p) => p.id)).toEqual([leaver.id]);
    expect(team.players.map((p) => p.id)).not.toContain(leaver.id);
    expect(team.players.map((p) => p.id)).toContain(stayer.id);
    expect(team.players.map((p) => p.id)).toContain(unskilled.id);
  });

  it("R3: the budget is 600,000 plus Treasury plus 10,000 a win", () => {
    const team = leagueTeam();
    team.treasury = 45_000;
    expect(beginRedraft(team, 4, dice()).budget).toBe(685_000);
  });

  it("R3: the budget is capped at 750,000", () => {
    const team = leagueTeam();
    team.treasury = 120_000;
    expect(beginRedraft(team, 6, dice()).budget).toBe(750_000);
  });
});
