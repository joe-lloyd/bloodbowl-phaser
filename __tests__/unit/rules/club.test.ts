import { describe, expect, it } from "vitest";
import { RosterName, type Team, createTeam } from "../../../src/types/Team";
import { InjuryType } from "../../../src/types/Player";
import { getRosterByRosterName } from "../../../src/data/RosterTemplates";
import { hirePlayer, purchase } from "../../../src/game/rules/teamPricing";
import { legalGameTypes, validateRosterLegality } from "../../../src/game/rules/rosterLegality";
import { chooseFirstLinemanAsVeteran } from "../../../src/game/rules/veteran";
import {
  followSevens,
  friendlyRefusal,
  latchGutterUnlock,
  prepareClubSquad,
  restoreClubHome,
  setSquadMember,
  squadFollowsSevens,
  squadIds,
} from "../../../src/game/rules/club";
import type { GameType } from "../../../src/game/variants/gameTypes";
import { createMatchState } from "../../../src/services/gameService/matchStart";
import { getTeamById, saveTeam } from "../../../src/game/managers/TeamManager";
import { matchFormatFor } from "../../../src/game/variants/activeMatch";
import { recordPendingDevelopment } from "../../../src/game/progression/postMatch";
import {
  type JourneymanOffer,
  hireJourneyman,
  releaseJourneyman,
} from "../../../src/game/rules/journeymen";
import { SkillType } from "../../../src/types/Skills";
import { fixtureValue } from "../../../src/testing/fixtureValue";

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

function hireExtra(team: Team) {
  const hired = hirePlayer(team, template("Dark Elf Blitzer"));
  if (!hired.player) throw new Error(hired.reason);
  return hired.player;
}

describe("a club's extra player and squads", () => {
  it("has a twelfth slot open from the start", () => {
    const team = club(2_000_000, 7);
    expect(team.players).toHaveLength(11);
    expect(hireExtra(team).number).toBe(12);
    expect(hirePlayer(team, template("Dark Elf Lineman"))).toEqual({
      amount: null,
      reason: "A Sevens team may have at most 12 permanently hired players.",
    });
  });

  it("leaves the extra player out of every squad until the coach picks them", () => {
    const team = club(2_000_000, 7);
    const extra = hireExtra(team);
    for (const gameType of ["sevens", "street-bowl", "beach-bowl", "gutter-bowl"] as const) {
      expect(squadIds(team, gameType)).toHaveLength(11);
      expect(squadIds(team, gameType)).not.toContain(extra.id);
    }
    const sevens = structuredClone(team);
    prepareClubSquad(sevens, "sevens");
    expect(sevens.players.map((player) => player.id)).not.toContain(extra.id);
  });

  it("follows the Sevens squad until a game type gets its own", () => {
    const team = club(2_000_000, 7);
    const extra = hireExtra(team);
    const benched = fixtureLineman(team);
    setSquadMember(team, "street-bowl", { playerId: extra.id, plays: true });
    setSquadMember(team, "street-bowl", { playerId: benched.id, plays: false });

    expect(squadFollowsSevens(team, "street-bowl")).toBe(false);
    expect(squadIds(team, "street-bowl")).toContain(extra.id);
    expect(squadIds(team, "street-bowl")).not.toContain(benched.id);
    expect(squadIds(team, "beach-bowl")).toEqual(squadIds(team, "sevens"));

    setSquadMember(team, "sevens", { playerId: benched.id, plays: false });
    expect(squadIds(team, "beach-bowl")).not.toContain(benched.id);

    followSevens(team, "street-bowl");
    expect(squadIds(team, "street-bowl")).toEqual(squadIds(team, "sevens"));
  });

  it("checks each squad against its own game type", () => {
    const team = club(2_000_000, 7);
    latchGutterUnlock(team);
    const extra = hireExtra(team);
    for (const gameType of ["street-bowl", "gutter-bowl"] as const) {
      setSquadMember(team, gameType, { playerId: extra.id, plays: true });
      setSquadMember(team, gameType, { playerId: fixtureLineman(team).id, plays: false });
    }
    const detail = (gameType: GameType) =>
      validateRosterLegality(team, darkElf, gameType).map((violation) => violation.detail);

    expect(detail("street-bowl").join(" ")).toMatch(/positional|Lineman/);
    expect(detail("gutter-bowl")).toEqual([]);
    expect(detail("sevens")).toEqual([]);
  });

  it("gives a replacement the fired player's shirt but none of their squad places", () => {
    const team = club(2_000_000, 7);
    const extra = hireExtra(team);
    setSquadMember(team, "street-bowl", { playerId: extra.id, plays: true });
    const fired = fixtureLineman(team);
    setSquadMember(team, "street-bowl", { playerId: fired.id, plays: true });
    team.players = team.players.filter((player) => player.id !== fired.id);

    const hired = hirePlayer(team, template("Dark Elf Lineman"));
    if (!hired.player) throw new Error(hired.reason);
    expect(hired.player.number).toBe(fired.number);
    expect(hired.player.id).not.toBe(fired.id);
    expect(squadIds(team, "street-bowl")).not.toContain(hired.player.id);
  });
});

function homeExtra(team: Team) {
  const player = hireExtra(team);
  setSquadMember(team, "sevens", { playerId: player.id, plays: false });
  return player;
}

describe("a club in a match", () => {
  it("leaves a player the squad leaves out at home, and brings everyone back afterwards", () => {
    const stored = club(1_000_000);
    purchase(stored, { type: "apothecary" });
    homeExtra(stored);
    const home = structuredClone(stored);
    const away = club();
    away.id = "away";

    createMatchState({ teams: [home, away], format: matchFormatFor("street-bowl") });
    expect(home.players).toHaveLength(7);
    expect(home.apothecary).toBe(false);

    restoreClubHome(home, stored);
    expect(home.players.map((player) => player.id)).toEqual(stored.players.map((player) => player.id));
    expect(home.apothecary).toBe(true);
  });

  it("keeps a player hired while the match was suspended", () => {
    const stored = club(1_000_000);
    const matchCopy = structuredClone(stored);
    homeExtra(stored);

    restoreClubHome(matchCopy, stored);
    expect(matchCopy.club).toEqual(stored.club);
    const sevens = structuredClone(matchCopy);
    prepareClubSquad(sevens, "sevens");
    expect(sevens.players).toHaveLength(7);
  });

  it("leaves out a player the match removed, and brings back only who stayed home", () => {
    const stored = club(1_000_000);
    const extra = homeExtra(stored);
    const matchCopy = structuredClone(stored);
    prepareClubSquad(matchCopy, "sevens");
    const removed = fixtureLineman(matchCopy).id;
    matchCopy.players = matchCopy.players.filter((player) => player.id !== removed);

    restoreClubHome(matchCopy, stored);
    const ids = matchCopy.players.map((player) => player.id);
    expect(ids).not.toContain(removed);
    expect(ids).toContain(extra.id);
    expect(matchCopy.players).toHaveLength(7);
  });

  it("gives a Journeyman who took a home player's number a free one", () => {
    const stored = club(1_000_000);
    const extra = homeExtra(stored);
    const matchCopy = structuredClone(stored);
    prepareClubSquad(matchCopy, "sevens");
    const journeyman = structuredClone(fixtureLineman(matchCopy));
    journeyman.id = "journeyman";
    journeyman.number = extra.number;
    matchCopy.players.push(journeyman);

    restoreClubHome(matchCopy, stored);
    const numbers = matchCopy.players.map((player) => player.number);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(matchCopy.players.find((player) => player.id === extra.id)?.number).toBe(extra.number);
  });

  it("gives a Journeyman an ID that no player at home holds", () => {
    const stored = club(1_000_000);
    const extra = homeExtra(stored);
    extra.id = `${stored.id}-journeyman-${String(extra.number)}`;
    fixtureLineman(stored).injuries = [InjuryType.MISS_NEXT_GAME];
    const home = structuredClone(stored);
    const away = club();
    away.id = "away";

    createMatchState({ teams: [home, away], fixture: { paysWinnings: true } });
    restoreClubHome(home, stored);

    const ids = home.players.map((player) => player.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(home.players.find((player) => player.id === extra.id)?.positionName).toBe("Dark Elf Blitzer");
    expect(home.players.filter((player) => player.playerKind === "journeyman")).toHaveLength(1);
  });

  it("counts a competition game spent at home as the game a player had to miss", () => {
    const missedGame = (competition: boolean) => {
      const stored = club(1_000_000);
      const extra = homeExtra(stored);
      extra.injuries = [InjuryType.MISS_NEXT_GAME];
      const home = structuredClone(stored);
      const away = club();
      away.id = "away";
      createMatchState({ teams: [home, away], fixture: { competition } });
      restoreClubHome(home, stored);
      return home.players.find((player) => player.id === extra.id)?.injuries;
    };

    expect(missedGame(true)).toEqual([]);
    expect(missedGame(false)).toEqual([InjuryType.MISS_NEXT_GAME]);
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

const journeymenOf = (team: Team) =>
  team.players.filter((player) => player.playerKind === "journeyman");
const offersOf = (team: Team) =>
  (team.pendingDevelopment ?? []).filter(
    (entry): entry is JourneymanOffer => entry.kind === "journeyman-offer"
  );

function shortClub(): Team {
  const stored = club();
  const leavers = new Set(["Dark Elf Runner", "Assassin"]);
  stored.players = stored.players.filter((player) => !leavers.has(player.positionName));
  stored.players.splice(stored.players.findIndex((player) => player.positionName === "Dark Elf Lineman" && !player.veteran), 1);
  stored.treasury = 120_000;
  return stored;
}

function playSeasonGame(stored: Team): Team {
  const home = structuredClone(stored);
  const away = club();
  away.id = "away";
  createMatchState({ teams: [home, away], fixture: { paysWinnings: true } });
  return home;
}

describe("a club running short of players", () => {
  it("fills a season game with Loner Journeymen and keeps the one it hires", () => {
    const stored = shortClub();
    expect(stored.players).toHaveLength(4);

    const home = playSeasonGame(stored);
    const journeymen = journeymenOf(home);
    expect(home.players).toHaveLength(7);
    expect(journeymen.map((player) => player.positionName)).toEqual([
      "Dark Elf Lineman",
      "Dark Elf Lineman",
      "Dark Elf Lineman",
    ]);
    for (const player of journeymen)
      expect(
        player.skills.filter((skill) => skill.type === SkillType.LONER).map((skill) => skill.parameter)
      ).toEqual(["5+"]);

    recordPendingDevelopment(home, "season-game", undefined, {
      leagueFixture: true,
      playedIds: new Set(home.players.map((player) => player.id)),
    });
    restoreClubHome(home, stored);
    const [kept, ...rest] = offersOf(home);
    expect(rest).toHaveLength(2);

    expect(hireJourneyman(home, fixtureValue(kept))).toBe(65_000);
    for (const offer of rest) releaseJourneyman(home, offer);
    expect(home.treasury).toBe(55_000);
    expect(journeymenOf(home)).toEqual([]);
    expect(home.players).toHaveLength(5);
    const hired = fixtureValue(home.players.find((player) => player.id === kept?.playerId));
    expect(hired.skills.some((skill) => skill.type === SkillType.LONER)).toBe(false);

    const next = playSeasonGame(home);
    expect(next.players.map((player) => player.id)).toContain(hired.id);
    expect(journeymenOf(next)).toHaveLength(2);
  });
});
