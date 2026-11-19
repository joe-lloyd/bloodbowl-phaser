import { describe, expect, it } from "vitest";
import { roundFixtures, roundPlan } from "../../src/competition/roundPlan";
import { type CompetitionFixture } from "../../src/competition/types";

function fixture(
  round: number,
  order: number,
  status: CompetitionFixture["status"] = "ready"
): CompetitionFixture {
  return {
    id: `round-${String(round)}-match-${String(order)}`,
    round,
    order,
    homeEntrantId: "a",
    awayEntrantId: "b",
    status,
    ...(status === "complete"
      ? { result: { homeScore: 1, awayScore: 0 } }
      : {}),
  };
}

describe("roundPlan", () => {
  it("puts round one first when nothing has been played", () => {
    const fixtures = [1, 2, 3].flatMap((round) => [
      fixture(round, 1),
      fixture(round, 2),
    ]);
    expect(roundPlan(fixtures)).toEqual({
      next: 1,
      upcoming: [2, 3],
      completed: [],
    });
  });

  it("keeps a partly played round next until its last game is in", () => {
    const fixtures = [
      fixture(1, 1, "complete"),
      fixture(1, 2),
      fixture(2, 1),
      fixture(2, 2),
    ];
    expect(roundPlan(fixtures)).toEqual({
      next: 1,
      upcoming: [2],
      completed: [],
    });
  });

  it("promotes the following round once a round is complete", () => {
    const fixtures = [
      fixture(1, 1, "complete"),
      fixture(1, 2, "complete"),
      fixture(2, 1),
      fixture(2, 2),
      fixture(3, 1),
    ];
    expect(roundPlan(fixtures)).toEqual({
      next: 2,
      upcoming: [3],
      completed: [1],
    });
  });

  it("names no next round once the league is finished", () => {
    const fixtures = [3, 1, 2].map((round) => fixture(round, 1, "complete"));
    expect(roundPlan(fixtures)).toEqual({ upcoming: [], completed: [1, 2, 3] });
  });

  it("files a later round closed by walkovers under history, in round order", () => {
    const fixtures = [
      fixture(1, 1, "complete"),
      fixture(2, 1),
      fixture(3, 1, "complete"),
      fixture(4, 1),
    ];
    expect(roundPlan(fixtures)).toEqual({
      next: 2,
      upcoming: [4],
      completed: [1, 3],
    });
  });

  it("orders scheduled rounds by number whatever order the fixtures are in", () => {
    const fixtures = [fixture(3, 1), fixture(1, 1), fixture(2, 1)];
    expect(roundPlan(fixtures)).toEqual({
      next: 1,
      upcoming: [2, 3],
      completed: [],
    });
  });

  it("lists a round's games in schedule order", () => {
    const fixtures = [fixture(1, 2), fixture(2, 1), fixture(1, 1)];
    expect(roundFixtures(fixtures, 1).map((game) => game.id)).toEqual([
      "round-1-match-2",
      "round-1-match-1",
    ]);
  });
});
