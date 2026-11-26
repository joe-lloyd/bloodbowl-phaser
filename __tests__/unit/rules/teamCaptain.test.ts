import { fixtureValue } from "../../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { RosterName, createTeam } from "../../../src/types/Team";
import { InjuryType, createPlayer } from "../../../src/types/Player";
import { SkillType } from "../../../src/types/Skills";
import {
  captainVacancyCandidates,
  chooseTeamCaptain,
} from "../../../src/game/rules/teamCaptain";
import { stampFirstCompletedMatch } from "../../../src/game/rules/teamLifecycle";
import { getRosterByRosterName } from "../../../src/data/RosterTemplates";
import {
  dehydrateTeam,
  readStoredTeam,
} from "../../../src/data/persistence/teamPersistence";

function draft(rosterName: RosterName, positions: string[]) {
  const roster = getRosterByRosterName(rosterName);
  const team = createTeam("Test", rosterName, { primary: 0, secondary: 0 }, 0);
  for (const [index, position] of positions.entries()) {
    const template = fixtureValue(roster.playerTemplates.find(
      (t) => t.positionName === position
    ));
    team.players.push(createPlayer(template, team.id, index + 1));
  }
  return team;
}

const skillsOf = (player: { skills: { type: SkillType }[] }) =>
  player.skills.map((skill) => skill.type);

describe("naming the Team Captain", () => {
  it("gives a Human Blitzer Pro without changing their value", () => {
    const team = draft(RosterName.HUMAN, ["Human Blitzer", "Human Lineman"]);
    const blitzer = team.players[0];

    expect(chooseTeamCaptain(team, fixtureValue(blitzer).id)).toEqual({ allowed: true });

    expect(fixtureValue(blitzer).teamCaptain).toBe(true);
    expect(skillsOf(fixtureValue(blitzer))).toEqual([
      SkillType.BLOCK,
      SkillType.TACKLE,
      SkillType.PRO,
    ]);
    expect(fixtureValue(blitzer).cost).toBe(85_000);
    expect(fixtureValue(team.players[1]).teamCaptain).toBeUndefined();
  });

  it("moves the title and its Pro to the newly named player", () => {
    const team = draft(RosterName.ORC, ["Orc Blitzer", "Orc Lineman"]);
    chooseTeamCaptain(team, fixtureValue(team.players[0]).id);
    chooseTeamCaptain(team, fixtureValue(team.players[1]).id);

    expect(team.players.map((p) => !!p.teamCaptain)).toEqual([false, true]);
    expect(skillsOf(fixtureValue(team.players[0]))).not.toContain(SkillType.PRO);
    expect(skillsOf(fixtureValue(team.players[1]))).toContain(SkillType.PRO);
  });

  it("refuses a Big Guy", () => {
    const team = draft(RosterName.ORC, ["Untrained Troll", "Orc Lineman"]);

    expect(chooseTeamCaptain(team, fixtureValue(team.players[0]).id)).toEqual({
      allowed: false,
      reason: "A Big Guy cannot be the Team Captain.",
    });
    expect(fixtureValue(team.players[0]).teamCaptain).toBeUndefined();
  });

  it("refuses a roster without the rule", () => {
    const team = draft(RosterName.NORSE, ["Norse Raider Lineman"]);

    expect(chooseTeamCaptain(team, fixtureValue(team.players[0]).id).allowed).toBe(false);
  });

  it("refuses once the team has played", () => {
    const team = draft(RosterName.HUMAN, ["Human Blitzer", "Human Lineman"]);
    stampFirstCompletedMatch(team);

    expect(chooseTeamCaptain(team, fixtureValue(team.players[0]).id).allowed).toBe(false);
  });

  it("survives a save, and the loaded Captain still has Pro", () => {
    const team = draft(RosterName.HUMAN, ["Human Thrower", "Human Lineman"]);
    chooseTeamCaptain(team, fixtureValue(team.players[0]).id);

    const stored = dehydrateTeam(team);
    const loaded = readStoredTeam(JSON.parse(JSON.stringify(stored))).team;

    expect(stored.players[0]).toMatchObject({ teamCaptain: true });
    expect(fixtureValue(loaded.players[0]).teamCaptain).toBe(true);
    expect(skillsOf(fixtureValue(loaded.players[0]))).toEqual([
      SkillType.PASS,
      SkillType.SURE_HANDS,
      SkillType.PRO,
    ]);
    expect(skillsOf(fixtureValue(loaded.players[1]))).toEqual([]);
  });
});

describe("loading a stored Team Captain", () => {
  function loadFlagged(team: ReturnType<typeof draft>, flagged: number[]) {
    const stored = dehydrateTeam(team);
    for (const index of flagged) (fixtureValue(stored.players[index]).teamCaptain = true);
    return readStoredTeam(JSON.parse(JSON.stringify(stored))).team;
  }

  it("drops the title from a Big Guy, with no Pro", () => {
    const loaded = loadFlagged(
      draft(RosterName.ORC, ["Untrained Troll", "Orc Lineman"]),
      [0]
    );

    expect(fixtureValue(loaded.players[0]).teamCaptain).toBeUndefined();
    expect(skillsOf(fixtureValue(loaded.players[0]))).not.toContain(SkillType.PRO);
  });

  it("drops the title from a Human team's Ogre", () => {
    const loaded = loadFlagged(
      draft(RosterName.HUMAN, ["Ogre", "Human Lineman"]),
      [0]
    );

    expect(fixtureValue(loaded.players[0]).teamCaptain).toBeUndefined();
    expect(skillsOf(fixtureValue(loaded.players[0]))).not.toContain(SkillType.PRO);
  });

  it("drops the title on a roster without the rule", () => {
    const loaded = loadFlagged(
      draft(RosterName.NORSE, ["Norse Raider Lineman"]),
      [0]
    );

    expect(fixtureValue(loaded.players[0]).teamCaptain).toBeUndefined();
    expect(skillsOf(fixtureValue(loaded.players[0]))).not.toContain(SkillType.PRO);
  });

  it("keeps one Captain when two players carry the title", () => {
    const loaded = loadFlagged(
      draft(RosterName.HUMAN, ["Human Blitzer", "Human Lineman"]),
      [0, 1]
    );

    expect(loaded.players.map((p) => !!p.teamCaptain)).toEqual([true, false]);
    expect(skillsOf(fixtureValue(loaded.players[0]))).toContain(SkillType.PRO);
    expect(skillsOf(fixtureValue(loaded.players[1]))).toEqual([]);
  });
});

describe("replacing the Team Captain (errata p.155)", () => {
  function activeLeagueTeam() {
    const team = draft(RosterName.HUMAN, [
      "Human Blitzer",
      "Human Lineman",
      "Ogre",
    ]);
    team.advancementMode = "sevens-skill-selection";
    chooseTeamCaptain(team, fixtureValue(team.players[0]).id);
    stampFirstCompletedMatch(team);
    return team;
  }

  it("offers nobody while the Captain is on the roster", () => {
    expect(captainVacancyCandidates(activeLeagueTeam())).toEqual([]);
  });

  it("offers every player but the Big Guy once a dead Captain leaves", () => {
    const team = activeLeagueTeam();
    fixtureValue(team.players[0]).injuries = [InjuryType.DEAD];
    const loaded = readStoredTeam(dehydrateTeam(team)).team;

    expect(loaded.players.map((p) => p.positionName)).toEqual([
      "Human Lineman",
      "Ogre",
    ]);
    expect(captainVacancyCandidates(loaded).map((p) => p.positionName)).toEqual(
      ["Human Lineman"]
    );
  });

  it("offers nobody to a Matched Play team", () => {
    const team = activeLeagueTeam();
    team.advancementMode = "matched-play";
    team.players.shift();

    expect(captainVacancyCandidates(team)).toEqual([]);
  });
});
