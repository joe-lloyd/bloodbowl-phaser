import { fixtureValue } from "../../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import {
  applyRedraft,
  computerRedraftChoice,
  currentLineUp,
  redraftBudget,
  redraftCost,
  rehirePrice,
  restAndRelaxation,
  rookiePrice,
  squadMinimum,
} from "../../../src/game/rules/redraft";
import { TeamFactory } from "../../../src/game/TeamFactory";
import { stabilizeIds } from "../../../src/headless/createHeadlessGame";
import { InjuryType, type PlayerAdvancement } from "../../../src/types/Player";
import { RosterName, type Team, playerValue } from "../../../src/types/Team";
import { SkillType, getSkill } from "../../../src/types/Skills";

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
    fixtureValue(team.players[0]).injuries.push(InjuryType.MISS_NEXT_GAME);

    restAndRelaxation(team, dice());
    expect(fixtureValue(team.players[0]).injuries).toEqual([]);
  });

  it("R1: a gained Hatred is lost on a 4+ and kept on a 3", () => {
    const team = leagueTeam();
    const [calm, angry] = team.players;
    for (const player of [calm, angry]) {
      fixtureValue(player).advancements = [skill(SkillType.HATRED)];
      fixtureValue(player).skills.push(getSkill(SkillType.HATRED, "Elf"));
    }

    restAndRelaxation(team, dice(4, 3));
    expect(fixtureValue(calm).advancements).toEqual([]);
    expect(fixtureValue(calm).skills.some((s) => s.type === SkillType.HATRED)).toBe(false);
    expect(fixtureValue(angry).advancements).toEqual([skill(SkillType.HATRED)]);
    expect(fixtureValue(angry).skills.some((s) => s.type === SkillType.HATRED)).toBe(true);
  });

  it("the budget is 600,000 plus the treasury plus 10,000 a win", () => {
    expect(redraftBudget(45_000, 4)).toBe(685_000);
  });

  it("a club's budget is capped at 800,000", () => {
    expect(redraftBudget(250_000, 6)).toBe(800_000);
  });

  it("buys a player back at their value plus 20,000 for each season played", () => {
    const player = fixtureValue(leagueTeam().players[0]);
    player.seasons = 2;
    expect(rehirePrice(player)).toBe(playerValue(player) + 40_000);
  });
});

function clubTeam(): Team {
  const team = leagueTeam();
  team.advancementMode = "advanced-league";
  team.rerolls = 2;
  team.cheerleaders = 1;
  for (const player of team.players) player.seasons = 1;
  return team;
}

describe("applying a redraft", () => {
  it("keeps the chosen players and staff and banks what is left", () => {
    const team = clubTeam();
    const [first, second] = team.players;
    const choice = {
      ...currentLineUp(team),
      keep: [fixtureValue(first).id, fixtureValue(second).id],
      rerolls: 1,
      cheerleaders: 0,
    };
    const cost = redraftCost(team, choice);

    expect(applyRedraft(team, choice, 800_000)).toBeUndefined();
    expect(team.players.map((player) => player.id)).toEqual(choice.keep);
    expect(team.rerolls).toBe(1);
    expect(team.cheerleaders).toBe(0);
    expect(team.treasury).toBe(800_000 - cost);
  });

  it("refuses a redraft over budget and changes nothing", () => {
    const team = clubTeam();
    const players = team.players.length;
    const refusal = applyRedraft(team, currentLineUp(team), 100_000);

    expect(refusal).toMatch(/^The redraft costs \d+k, more than the budget of 100k\.$/);
    expect(team.players).toHaveLength(players);
    expect(team.rerolls).toBe(2);
  });

  it("lets the computer keep its skilled players first and one re-roll", () => {
    const team = clubTeam();
    const star = fixtureValue(team.players.at(-1));
    star.advancements = [skill(SkillType.BLOCK), skill(SkillType.DODGE)];
    const budget =
      rehirePrice(star) + 100_000 + (squadMinimum(team) - 1) * rookiePrice(team);

    const choice = computerRedraftChoice(team, budget);
    expect(choice.keep[0]).toBe(star.id);
    expect(choice.rerolls).toBe(1);
    expect(redraftCost(team, choice)).toBeLessThanOrEqual(budget);
  });

  it("leaves the computer enough gold to make a squad up to seven with rookies", () => {
    const team = clubTeam();
    for (const player of team.players) player.advancements = [skill(SkillType.BLOCK)];
    const budget = 500_000;

    const choice = computerRedraftChoice(team, budget);
    const missing = Math.max(0, squadMinimum(team) - choice.keep.length);
    expect(budget - redraftCost(team, choice)).toBeGreaterThanOrEqual(missing * rookiePrice(team));
  });
});
