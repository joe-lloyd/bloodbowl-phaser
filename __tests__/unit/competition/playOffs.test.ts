import { describe, expect, it } from "vitest";
import {
  generatePlayOffs,
  recordTournamentResult,
  THIRD_PLACE_FIXTURE,
} from "../../../src/competition/logic";
import { playOffPlaces } from "../../../src/competition/seasonEnd";
import type {
  CompetitionEntrant,
  TournamentDoc,
} from "../../../src/competition/types";

function entrant(id: string, seed: number): CompetitionEntrant {
  return { id, teamId: `team-${id}`, ownerUid: null, name: id, rosterName: "Human", seed };
}

function playOffs(): TournamentDoc {
  const entrants = ["first", "second", "third", "fourth"].map((id, index) =>
    entrant(id, index + 1)
  );
  return {
    id: "play-offs",
    type: "tournament",
    name: "Play-offs",
    organizerUid: null,
    participantUids: [],
    status: "active",
    format: "single-elimination",
    entrants,
    fixtures: generatePlayOffs(entrants),
    standings: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

function play(
  tournament: TournamentDoc,
  fixtureId: string,
  [homeScore, awayScore]: [number, number]
): TournamentDoc {
  return recordTournamentResult({ tournament, fixtureId, homeScore, awayScore });
}

describe("club league play-offs", () => {
  it("pairs first with fourth and second with third, with the final and third-place game waiting", () => {
    const { fixtures } = playOffs();
    expect(
      fixtures.map((fixture) => [fixture.id, fixture.homeEntrantId, fixture.awayEntrantId, fixture.status])
    ).toEqual([
      ["round-1-match-1", "first", "fourth", "ready"],
      ["round-1-match-2", "second", "third", "ready"],
      ["round-2-match-1", null, null, "scheduled"],
      [THIRD_PLACE_FIXTURE, null, null, "scheduled"],
    ]);
  });

  it("sends each semi-final loser to the third-place game", () => {
    let cup = play(playOffs(), "round-1-match-1", [0, 2]);
    expect(cup.fixtures.find((fixture) => fixture.thirdPlace)).toMatchObject({
      homeEntrantId: "first",
      awayEntrantId: null,
      status: "scheduled",
    });
    cup = play(cup, "round-1-match-2", [3, 1]);
    expect(cup.fixtures.find((fixture) => fixture.thirdPlace)).toMatchObject({
      homeEntrantId: "first",
      awayEntrantId: "third",
      status: "ready",
    });
    expect(cup.fixtures.find((fixture) => fixture.id === "round-2-match-1")).toMatchObject({
      homeEntrantId: "fourth",
      awayEntrantId: "second",
      status: "ready",
    });
  });

  it("crowns the final's winner, not the third-place game's, and places all four", () => {
    let cup = play(playOffs(), "round-1-match-1", [2, 0]);
    cup = play(cup, "round-1-match-2", [1, 0]);
    cup = play(cup, THIRD_PLACE_FIXTURE, [1, 2]);
    expect(cup.status).toBe("active");
    expect(cup.championEntrantId).toBeUndefined();
    cup = play(cup, "round-2-match-1", [0, 1]);

    expect(cup.status).toBe("complete");
    expect(cup.championEntrantId).toBe("second");
    expect([...playOffPlaces(cup)]).toEqual([
      ["team-second", "champion"],
      ["team-first", "runner-up"],
      ["team-third", "third"],
      ["team-fourth", "fourth"],
    ]);
  });
});
