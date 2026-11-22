import { describe, expect, it } from "vitest";
import { RosterName, type Team, createTeam } from "../../../src/types/Team";
import { getRosterByRosterName } from "../../../src/data/RosterTemplates";
import { hirePlayer, purchase } from "../../../src/game/rules/teamPricing";
import { legalGameTypes, validateRosterLegality } from "../../../src/game/rules/rosterLegality";
import { chooseFirstLinemanAsVeteran } from "../../../src/game/rules/veteran";
import {
  chooseGutterSitsOut,
  friendlyRefusal,
  hireGutterSpecialist,
  latchGutterUnlock,
  prepareClubSquad,
  restoreClubHome,
} from "../../../src/game/rules/club";
import { createMatchState } from "../../../src/services/gameService/matchStart";
import { getTeamById, saveTeam } from "../../../src/game/managers/TeamManager";
import { matchFormatFor } from "../../../src/game/variants/activeMatch";

const darkElf = getRosterByRosterName(RosterName.DARK_ELF);

function template(positionName: string) {
  const found = darkElf.playerTemplates.find(
    (candidate) => candidate.positionName === positionName
  );
  if (!found) throw new Error(`${positionName} is not a Dark Elf position.`);
  return found;
}

function hire(team: Team, positions: Record<string, number>): void {
  for (const [positionName, count] of Object.entries(positions)) {
    for (let i = 0; i < count; i++) {
      const hired = hirePlayer(team, template(positionName));
      if (hired.amount == null) throw new Error(hired.reason);
    }
  }
}

function club(budget = 600_000, linemen = 3): Team {
  const team = createTeam(
    "Naggaroth Nightmares",
    RosterName.DARK_ELF,
    { primary: 0, secondary: 0 },
    darkElf.rerollCost,
    budget,
    "advanced-league"
  );
  team.club = {};
  team.startingTreasury = 600_000;
  hire(team, {
    "Dark Elf Blitzer": 1,
    "Witch Elf": 1,
    "Dark Elf Runner": 1,
    Assassin: 1,
    "Dark Elf Lineman": linemen,
  });
  chooseFirstLinemanAsVeteran(team);
  return team;
}

describe("a club's Core Sevens team", () => {
  it("plays Sevens, Street Bowl and Beach Bowl, and waits for Gutter Bowl", () => {
    const team = club();
    expect(team.treasury).toBe(20_000);
    expect(legalGameTypes(team, darkElf)).toEqual(["sevens", "street-bowl", "beach-bowl"]);
    expect(validateRosterLegality(team, darkElf, "gutter-bowl").map((v) => v.detail)).toEqual([
      "Gutter Bowl opens when team value plus treasury reaches 750k (now 600k).",
    ]);
  });

  it("keeps an Apothecary at home for Street Bowl instead of refusing the club", () => {
    const team = club(700_000);
    purchase(team, { type: "apothecary" });
    expect(team.apothecary).toBe(true);
    expect(legalGameTypes(team, darkElf)).toContain("street-bowl");

    prepareClubSquad(team, "street-bowl");
    expect(team.apothecary).toBe(false);
  });

  it("drafts with exactly 600k", () => {
    const team = club();
    team.startingTreasury = 900_000;
    expect(validateRosterLegality(team, darkElf).map((v) => v.detail)).toContain(
      "A club drafts with 600,000, not 900,000."
    );
  });

  it("keeps Gutter Bowl open when a poorer copy of the club is saved", async () => {
    localStorage.clear();
    const team = club(750_000);
    await saveTeam(team);
    expect(getTeamById(team.id)?.club).toEqual({ gutterUnlocked: true });
    const poorer = structuredClone(team);
    poorer.club = {};
    poorer.treasury = 0;
    await saveTeam(poorer);
    expect(getTeamById(team.id)?.club).toEqual({ gutterUnlocked: true });
  });

  it("opens Gutter Bowl at 750k of team value plus treasury and keeps it open", () => {
    const team = club();
    team.treasury += 150_000;
    latchGutterUnlock(team);
    expect(team.club).toEqual({ gutterUnlocked: true });

    team.treasury = 0;
    expect(legalGameTypes(team, darkElf)).toEqual([
      "sevens",
      "gutter-bowl",
      "street-bowl",
      "beach-bowl",
    ]);
  });
});

function fixtureLineman(team: Team) {
  const lineman = team.players.find((player) => player.positionName === "Dark Elf Lineman");
  if (!lineman) throw new Error("no Lineman");
  return lineman;
}

describe("the Gutter Bowl specialist", () => {
  it("wears a number above 11, so the core can still hire its eleventh player", () => {
    const team = club(2_000_000, 6);
    const hire = hireGutterSpecialist(team, template("Dark Elf Blitzer"));
    if (!hire.hired) throw new Error(hire.reason);
    expect(hire.player.number).toBe(12);
    expect(hirePlayer(team, template("Dark Elf Lineman")).amount).toBe(65_000);
  });

  it("counts toward the roster's position limit when the core hires", () => {
    const team = club(2_000_000);
    team.firstMatchPlayedAt = 1;
    hireGutterSpecialist(team, template("Dark Elf Blitzer"));
    expect(hirePlayer(team, template("Dark Elf Blitzer"))).toEqual({
      amount: null,
      reason: "Dark Elf Blitzer: the Dark Elf roster allows 0-2, and this team has 2.",
    });
  });

  it("cannot join before Gutter Bowl opens", () => {
    expect(hireGutterSpecialist(club(), template("Dark Elf Blitzer"))).toEqual({
      hired: false,
      reason: "Gutter Bowl opens when team value plus treasury reaches 750k (now 600k).",
    });
  });

  it("joins as a fifth positional who plays only Gutter Bowl", () => {
    const team = club(750_000);
    const hire = hireGutterSpecialist(team, template("Dark Elf Blitzer"));
    if (!hire.hired) throw new Error(hire.reason);
    expect(team.treasury).toBe(65_000);
    expect(legalGameTypes(team, darkElf)).toEqual([
      "sevens",
      "gutter-bowl",
      "street-bowl",
      "beach-bowl",
    ]);

    const sevens = structuredClone(team);
    prepareClubSquad(sevens, "sevens");
    expect(sevens.players.map((player) => player.id)).not.toContain(hire.player.id);
    expect(sevens.players).toHaveLength(7);

    const gutter = structuredClone(team);
    prepareClubSquad(gutter, "gutter-bowl");
    expect(gutter.players.map((player) => player.id)).toContain(hire.player.id);
    expect(gutter.players).toHaveLength(8);
  });

  it("respects the roster's position limit across the whole club", () => {
    const team = club(900_000);
    hire(team, { "Dark Elf Blitzer": 1 });
    expect(hireGutterSpecialist(team, template("Dark Elf Blitzer"))).toEqual({
      hired: false,
      reason: "Dark Elf Blitzer: the Dark Elf roster allows 0-2, and the club has 2.",
    });
    expect(hireGutterSpecialist(team, template("Dark Elf Lineman"))).toEqual({
      hired: false,
      reason: "The Gutter Bowl specialist is the fifth positional, so it cannot be a Lineman.",
    });
  });

  it("swaps out the last Lineman hired when the core is full, or the one the coach picks", () => {
    const team = club(2_000_000, 7);
    hireGutterSpecialist(team, template("Dark Elf Blitzer"));
    const linemen = team.players.filter((player) => player.positionName === "Dark Elf Lineman");
    const veteran = linemen.find((player) => player.veteran);
    const lastHired = linemen.at(-1);

    const gutter = structuredClone(team);
    prepareClubSquad(gutter, "gutter-bowl");
    expect(gutter.players).toHaveLength(11);
    expect(gutter.players.map((player) => player.id)).not.toContain(lastHired?.id);

    expect(chooseGutterSitsOut(team, veteran?.id ?? "")).toEqual({ allowed: true });
    const withoutVeteran = structuredClone(team);
    prepareClubSquad(withoutVeteran, "gutter-bowl");
    expect(withoutVeteran.players.some((player) => player.veteran)).toBe(false);
    expect(withoutVeteran.players.map((player) => player.id)).toContain(lastHired?.id);
  });
});

describe("a club in a match", () => {
  it("leaves the specialist out of a Sevens match and brings everyone back afterwards", () => {
    const stored = club(1_000_000);
    purchase(stored, { type: "apothecary" });
    hireGutterSpecialist(stored, template("Dark Elf Blitzer"));
    const home = structuredClone(stored);
    const away = club();
    away.id = "away";

    createMatchState({ team1: home, team2: away, format: matchFormatFor("street-bowl") });
    expect(home.players).toHaveLength(7);
    expect(home.apothecary).toBe(false);

    restoreClubHome(home, stored);
    expect(home.players.map((player) => player.id)).toEqual(stored.players.map((player) => player.id));
    expect(home.apothecary).toBe(true);
  });

  it("keeps a specialist hired while the match was suspended", () => {
    const stored = club(1_000_000);
    const matchCopy = structuredClone(stored);
    hireGutterSpecialist(stored, template("Dark Elf Blitzer"));

    restoreClubHome(matchCopy, stored);
    expect(matchCopy.club).toEqual(stored.club);
    const sevens = structuredClone(matchCopy);
    prepareClubSquad(sevens, "sevens");
    expect(sevens.players).toHaveLength(7);
  });

  it("gives a Journeyman who took a home player's number a free one", () => {
    const stored = club(1_000_000);
    const hire = hireGutterSpecialist(stored, template("Dark Elf Blitzer"));
    if (!hire.hired) throw new Error(hire.reason);
    const matchCopy = structuredClone(stored);
    prepareClubSquad(matchCopy, "sevens");
    const journeyman = structuredClone(fixtureLineman(matchCopy));
    journeyman.id = "journeyman";
    journeyman.number = hire.player.number;
    matchCopy.players.push(journeyman);

    restoreClubHome(matchCopy, stored);
    const numbers = matchCopy.players.map((player) => player.number);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(matchCopy.players.find((player) => player.id === hire.player.id)?.number).toBe(12);
  });

  it("plays no friendlies during a tournament but may during a league", () => {
    const team = club();
    team.activeCompetitionId = "league-1-abc";
    expect(friendlyRefusal(team)).toBeUndefined();
    team.activeCompetitionId = "tournament-1-abc";
    expect(friendlyRefusal(team)).toBe(
      "Naggaroth Nightmares is playing a tournament. A club in a tournament plays no other games until the tournament ends."
    );
  });
});
