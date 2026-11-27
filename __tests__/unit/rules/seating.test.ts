import { describe, expect, it } from "vitest";
import {
  everyone,
  type FourSeating,
  opponentsOf,
  pairTeams,
  playOrderAfter,
  rivalsOf,
  seatOf,
  seatTeams,
  teammatesOf,
  teamOfPlayer,
} from "../../../src/game/seating";
import { PITCH_LAYOUTS } from "../../../src/game/variants/pitchLayouts";
import { playerWith, teamWith } from "../controllers/controllerFixtures";

const stadium = PITCH_LAYOUTS.stadium;

function team(id: string) {
  return teamWith({
    id,
    name: id,
    players: [
      playerWith({ id: `${id}-a`, teamId: id, gridPosition: { x: 1, y: 1 } }),
      playerWith({ id: `${id}-b`, teamId: id, gridPosition: { x: 2, y: 2 } }),
      playerWith({ id: `${id}-c`, teamId: id }),
    ],
  });
}

const ids = (teams: readonly { id: string }[]) => teams.map((t) => t.id);

function fourSeats(): FourSeating {
  const [home, away] = stadium.frames;
  return {
    kind: "four",
    seats: [
      { index: 0, team: team("north"), frame: home },
      { index: 1, team: team("east"), frame: away },
      { index: 2, team: team("south"), frame: home },
      { index: 3, team: team("west"), frame: away },
    ],
  };
}

describe("seatTeams", () => {
  it("seats two teams on a two-frame pitch, each on its own frame", () => {
    const seating = seatTeams([team("home"), team("away")], stadium);

    expect(seating.kind).toBe("pair");
    expect(seatOf(seating, "home").frame).toBe(stadium.frames[0]);
    expect(seatOf(seating, "away").frame).toBe(stadium.frames[1]);
    expect(ids(pairTeams(seating))).toEqual(["home", "away"]);
  });

  it("refuses a team count that does not match the pitch's frames", () => {
    expect(() => seatTeams([team("home")], stadium)).toThrow(
      "The Sevens stadium seats 2 teams, not 1."
    );
    expect(() =>
      seatTeams([team("a"), team("b"), team("c"), team("d")], stadium)
    ).toThrow("The Sevens stadium seats 2 teams, not 4.");
  });

  it("refuses the same team in two seats", () => {
    expect(() => seatTeams([team("home"), team("home")], stadium)).toThrow(
      "Every seat needs its own team, but the ids were home, home."
    );
  });
});

describe("playOrderAfter", () => {
  const pair = seatTeams([team("home"), team("away")], stadium);

  it("gives a pair the other team, then the current one", () => {
    expect(ids(playOrderAfter(pair, "home", 1))).toEqual(["away", "home"]);
    expect(ids(playOrderAfter(pair, "away", 1))).toEqual(["home", "away"]);
  });

  it("goes clockwise from the current seat with rotation 1", () => {
    expect(ids(playOrderAfter(fourSeats(), "east", 1))).toEqual([
      "south",
      "west",
      "north",
      "east",
    ]);
  });

  it("goes counter-clockwise from the current seat with rotation -1", () => {
    expect(ids(playOrderAfter(fourSeats(), "east", -1))).toEqual([
      "north",
      "west",
      "south",
      "east",
    ]);
  });
});

describe("players by seat", () => {
  const pair = seatTeams([team("home"), team("away")], stadium);

  it("lists everyone in seat order, home players first", () => {
    expect(ids(everyone(pair))).toEqual([
      "home-a",
      "home-b",
      "home-c",
      "away-a",
      "away-b",
      "away-c",
    ]);
  });

  it("names every other seat as a rival, clockwise", () => {
    expect(ids(rivalsOf(fourSeats(), "south").map((s) => s.team))).toEqual([
      "west",
      "north",
      "east",
    ]);
    expect(ids(opponentsOf(pair, "away"))).toEqual([
      "home-a",
      "home-b",
      "home-c",
    ]);
  });

  it("finds a player's team and their teammates on the pitch", () => {
    expect(teamOfPlayer(pair, "away-b")?.id).toBe("away");
    expect(teamOfPlayer(pair, "nobody")).toBeUndefined();
    expect(ids(teammatesOf(pair, "home-a"))).toEqual(["home-b"]);
    expect(teammatesOf(pair, "nobody")).toEqual([]);
  });

  it("refuses a team that has no seat", () => {
    expect(() => seatOf(pair, "visitors")).toThrow(
      "No team visitors sits at this match."
    );
  });

  it("has no home and away with four seats", () => {
    expect(() => pairTeams(fourSeats())).toThrow(
      "Only a two-team match has a home and an away team."
    );
  });
});
