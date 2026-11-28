import { describe, expect, it } from "vitest";
import { TeamFactory } from "../../src/game/TeamFactory";
import { getRosterByRosterName } from "../../src/data/RosterTemplates";
import { createPlayer } from "../../src/types/Player";
import { RosterName, type Team } from "../../src/types/Team";
import { Inducement } from "../../src/types/Inducements";
import { entryProblems } from "../../src/game/deathbowl/entry";
import { validateRosterLegality } from "../../src/game/rules/rosterLegality";

const HUMANS = getRosterByRosterName(RosterName.HUMAN);

function humans(positions: readonly string[]): Team {
  const team = TeamFactory.createTestTeam(RosterName.HUMAN, "Entrants", 0x4169e1);
  team.players = positions.map((positionName, index) => {
    const template = HUMANS.playerTemplates.find(
      (candidate) => candidate.positionName === positionName
    );
    if (!template) throw new Error(`No ${positionName} on the Human roster.`);
    return createPlayer(template, team.id, index + 1);
  });
  return team;
}

const linemen = (count: number) =>
  Array.from({ length: count }, () => "Human Lineman");

const fullSquad = () =>
  humans([
    ...linemen(4),
    "Human Thrower",
    "Human Thrower",
    "Human Catcher",
    "Human Catcher",
    "Human Blitzer",
    "Human Blitzer",
  ]);

describe("Deathbowl team entry", () => {
  it("lets in ten Humans worth 670,000 with six players who are not Linemen (DB-D1, DB-D5)", () => {
    const team = fullSquad();

    expect(entryProblems(team, HUMANS)).toEqual([]);
    expect(
      validateRosterLegality(team, HUMANS).map(({ rule }) => rule)
    ).toContain("lineman-limit");
  });

  it("needs 8 to 11 players (DB-D1)", () => {
    expect(entryProblems(humans(linemen(7)), HUMANS)).toEqual([
      { rule: "DB-D1", message: "7 players; a Deathbowl team needs 8 to 11." },
    ]);
    expect(entryProblems(humans(linemen(12)), HUMANS)).toEqual([
      { rule: "DB-D1", message: "12 players; a Deathbowl team needs 8 to 11." },
    ]);
  });

  it("keeps each position's own limit (DB-D1)", () => {
    const team = humans([
      ...linemen(5),
      "Human Blitzer",
      "Human Blitzer",
      "Human Blitzer",
    ]);

    expect(entryProblems(team, HUMANS)).toEqual([
      { rule: "DB-D1", message: "3 × Human Blitzer (roster max 2)" },
    ]);
  });

  it("prices re-rolls at 100,000 against the 700,000 budget (DB-D1, DB-D2)", () => {
    const team = fullSquad();
    team.rerolls = 1;

    expect(entryProblems(team, HUMANS)).toEqual([
      {
        rule: "DB-D1",
        message:
          "The team is worth 770,000, over the Deathbowl budget of 700,000.",
      },
    ]);
  });

  it("allows an Apothecary and no other Sideline Staff or bought Dedicated Fans (DB-D3)", () => {
    const withApothecary = humans(linemen(8));
    withApothecary.apothecary = true;
    const withStaff = humans(linemen(8));
    withStaff.coaches = 1;
    withStaff.cheerleaders = 2;
    withStaff.dedicatedFans = 2;

    expect(entryProblems(withApothecary, HUMANS)).toEqual([]);
    expect(entryProblems(withStaff, HUMANS)).toEqual([
      {
        rule: "DB-D3",
        message: "Deathbowl teams cannot have Assistant Coaches.",
      },
      { rule: "DB-D3", message: "Deathbowl teams cannot have Cheerleaders." },
      { rule: "DB-D3", message: "Deathbowl teams cannot buy Dedicated Fans." },
    ]);
  });

  it("refuses Star Players and inducements (DB-D4)", () => {
    const team = humans(linemen(8));
    const [first] = team.players;
    if (!first) throw new Error("The team has no players.");
    first.playerKind = "star";
    first.playerName = "Griff";
    team.draftInducements = [{ inducement: Inducement.BRIBE, quantity: 1 }];

    expect(entryProblems(team, HUMANS)).toEqual([
      {
        rule: "DB-D4",
        message: "Griff is a Star Player, and Deathbowl has none.",
      },
      { rule: "DB-D4", message: "Deathbowl has no inducements." },
    ]);
  });

  it("takes a team drafted for any game type that meets DB-D1 and DB-D3 (DB-D5)", () => {
    const street = humans(linemen(9));
    street.gameType = "street-bowl";
    const gutter = humans(linemen(11));
    gutter.gameType = "gutter-bowl";

    expect(entryProblems(street, HUMANS)).toEqual([]);
    expect(entryProblems(gutter, HUMANS)).toEqual([]);
  });
});
