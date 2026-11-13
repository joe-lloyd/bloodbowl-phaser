/**
 * Expensive Mistakes (openspec/specs/league-treasury): the last money step
 * after a league fixture. Every roll comes from fixed dice.
 */
import { describe, expect, it, vi } from "vitest";
import {
  ExpensiveMistake,
  expensiveMistakeFor,
  queueExpensiveMistakes,
  resolveExpensiveMistakes,
  rollExpensiveMistakes,
} from "../../../src/game/rules/expensiveMistakes";
import { Team } from "../../../src/types/Team";
import { TeamBuilder } from "../../utils/test-builders";

/** Dice that come up in the given order; any extra roll fails the test. */
function fixedDice(...rolls: number[]) {
  const queue = [...rolls];
  return {
    rollDie: vi.fn((sides: number) => {
      const roll = queue.shift();
      if (roll === undefined) throw new Error("No fixed roll left.");
      if (roll < 1 || roll > sides) throw new Error(`Bad d${sides}: ${roll}`);
      return roll;
    }),
  };
}

function leagueTeam(treasury: number): Team {
  const team = new TeamBuilder()
    .withId("mistakes")
    .withPlayers(7)
    .withTreasury(treasury)
    .build();
  team.advancementMode = "sevens-skill-selection";
  return team;
}

describe("each outcome, on fixed dice", () => {
  it("Crisis Averted loses nothing: 150,000 on a 4 stays 150,000", () => {
    const result = rollExpensiveMistakes(150_000, fixedDice(4));
    expect(result).toEqual({
      treasuryBefore: 150_000,
      treasuryAfter: 150_000,
      roll: 4,
      outcome: "crisis-averted",
      extraDice: [],
    });
  });

  it("Minor Incident loses D3 x 10,000: 150,000 on a 1 with a D3 of 2 leaves 130,000", () => {
    // The D3 is a D6 halved, rounding up: a 3 is a 2
    const result = rollExpensiveMistakes(150_000, fixedDice(1, 3));
    expect(result.outcome).toBe("minor-incident");
    expect(result.extraDice).toEqual([2]);
    expect(result.treasuryAfter).toBe(130_000);
  });

  it("Minor Incident at exactly 100,000 with a D3 of 3 leaves 70,000", () => {
    const result = rollExpensiveMistakes(100_000, fixedDice(1, 6));
    expect(result.outcome).toBe("minor-incident");
    expect(result.treasuryAfter).toBe(70_000);
  });

  it("Major Incident loses half: 350,000 on a 1 leaves 175,000", () => {
    const result = rollExpensiveMistakes(350_000, fixedDice(1));
    expect(result.outcome).toBe("major-incident");
    expect(result.treasuryAfter).toBe(175_000);
  });

  it("Major Incident rounds the half lost down to 5,000: 305,000 on a 1 leaves 155,000", () => {
    // Half is 152,500; the 150,000 lost is that rounded down to 5,000
    const result = rollExpensiveMistakes(305_000, fixedDice(1));
    expect(result.outcome).toBe("major-incident");
    expect(result.treasuryAfter).toBe(155_000);
  });

  it("Catastrophe keeps only 2D6 x 10,000: 520,000 on a 1 with 3 and 4 leaves 70,000", () => {
    const result = rollExpensiveMistakes(520_000, fixedDice(1, 3, 4));
    expect(result.outcome).toBe("catastrophe");
    expect(result.extraDice).toEqual([3, 4]);
    expect(result.treasuryAfter).toBe(70_000);
  });

  it("a Treasury under 100,000 rolls nothing: 95,000 stays 95,000", () => {
    const dice = fixedDice();
    const result = rollExpensiveMistakes(95_000, dice);
    expect(dice.rollDie).not.toHaveBeenCalled();
    expect(result).toEqual({
      treasuryBefore: 95_000,
      treasuryAfter: 95_000,
      roll: null,
      outcome: null,
      extraDice: [],
    });
  });
});

describe("the Expensive Mistakes table", () => {
  const A: ExpensiveMistake = "crisis-averted";
  const MI: ExpensiveMistake = "minor-incident";
  const MA: ExpensiveMistake = "major-incident";
  const C: ExpensiveMistake = "catastrophe";
  // Each column for a D6 of 1 to 6, as the rulebook prints it
  const columns: [number, ExpensiveMistake[]][] = [
    [100_000, [MI, A, A, A, A, A]],
    [195_000, [MI, A, A, A, A, A]],
    [200_000, [MI, MI, A, A, A, A]],
    [295_000, [MI, MI, A, A, A, A]],
    [300_000, [MA, MI, MI, A, A, A]],
    [395_000, [MA, MI, MI, A, A, A]],
    [400_000, [MA, MA, MI, MI, A, A]],
    [495_000, [MA, MA, MI, MI, A, A]],
    [500_000, [C, MA, MA, MI, MI, A]],
    [595_000, [C, MA, MA, MI, MI, A]],
    [600_000, [C, C, MA, MA, MI, MI]],
    [1_250_000, [C, C, MA, MA, MI, MI]],
  ];

  it.each(columns)("a Treasury of %i reads its column", (treasury, column) => {
    expect(
      [1, 2, 3, 4, 5, 6].map((d6) => expensiveMistakeFor(treasury, d6))
    ).toEqual(column);
  });

  it("has no result under 100,000", () => {
    expect(expensiveMistakeFor(95_000, 1)).toBeNull();
  });
});

describe("the post-game step", () => {
  it("is queued once for a Treasury of 100,000 or more, never below", () => {
    const rich = leagueTeam(100_000);
    queueExpensiveMistakes(rich, "league:f1");
    queueExpensiveMistakes(rich, "league:f1");
    expect(rich.pendingDevelopment).toEqual([
      expect.objectContaining({
        id: "expensive-mistakes-league:f1",
        kind: "expensive-mistakes",
        fixtureKey: "league:f1",
      }),
    ]);

    const poor = leagueTeam(95_000);
    queueExpensiveMistakes(poor, "league:f1");
    expect(poor.pendingDevelopment ?? []).toEqual([]);
  });

  it("waits for the team's other post-game choices, then rolls and clears", () => {
    const team = leagueTeam(350_000);
    queueExpensiveMistakes(team, "league:f1");
    const entry = team.pendingDevelopment![0] as Extract<
      NonNullable<Team["pendingDevelopment"]>[number],
      { kind: "expensive-mistakes" }
    >;
    team.pendingDevelopment!.unshift({
      id: "journeyman-m-1",
      kind: "journeyman-offer",
      playerId: team.players[0].id,
      matchId: "m",
      createdAt: 1,
    });
    const dice = fixedDice(1);
    expect(() => resolveExpensiveMistakes(team, entry, dice)).toThrow(
      /other post-game choices/
    );
    expect(dice.rollDie).not.toHaveBeenCalled();
    expect(team.treasury).toBe(350_000);

    team.pendingDevelopment!.shift();
    const result = resolveExpensiveMistakes(team, entry, dice);
    expect(result.outcome).toBe("major-incident");
    expect(team.treasury).toBe(175_000);
    expect(team.pendingDevelopment).toEqual([]);
    expect(() => resolveExpensiveMistakes(team, entry, fixedDice(1))).toThrow(
      /already been rolled/
    );
  });

  it("rolls nothing when the coach spent the Treasury under 100,000 first", () => {
    const team = leagueTeam(150_000);
    queueExpensiveMistakes(team, "league:f1");
    const entry = team.pendingDevelopment![0] as Extract<
      NonNullable<Team["pendingDevelopment"]>[number],
      { kind: "expensive-mistakes" }
    >;
    team.treasury = 50_000; // a re-roll bought in the Team Builder
    const dice = fixedDice();
    expect(resolveExpensiveMistakes(team, entry, dice).roll).toBeNull();
    expect(team.treasury).toBe(50_000);
    expect(team.pendingDevelopment).toEqual([]);
  });
});
