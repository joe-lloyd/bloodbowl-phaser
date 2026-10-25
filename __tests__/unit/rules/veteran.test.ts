import { describe, expect, it } from "vitest";
import { RosterName, createTeam } from "../../../src/types/Team";
import { createPlayer, PlayerTemplate } from "../../../src/types/Player";
import { validateRosterLegality } from "../../../src/game/rules/rosterLegality";
import { chooseVeteran } from "../../../src/game/rules/veteran";
import { stampFirstCompletedMatch } from "../../../src/game/rules/teamLifecycle";
import { getRosterByRosterName } from "../../../src/data/RosterTemplates";
import {
  dehydrateTeam,
  readStoredTeam,
} from "../../../src/data/persistence/teamPersistence";

/** Sevens D8: one Lineman is the Veteran, at MA -1. */
const humanRoster = getRosterByRosterName(RosterName.HUMAN);
const lineman = humanRoster.playerTemplates.find(
  (t) => t.positionName === "Human Lineman"
)!;
const blitzer = humanRoster.playerTemplates.find(
  (t) => t.positionName === "Human Blitzer"
)!;

function draftOf(templates: PlayerTemplate[]) {
  const team = createTeam("Test", RosterName.HUMAN, { primary: 0, secondary: 0 }, 0);
  templates.forEach((template, index) =>
    team.players.push(createPlayer(template, team.id, index + 1))
  );
  return team;
}

const legalSquad = () =>
  draftOf([blitzer, blitzer, lineman, lineman, lineman, lineman, lineman]);

describe("choosing the Veteran (D8)", () => {
  it("marks a Lineman as the Veteran with MA one lower", () => {
    const team = legalSquad();
    const linemanId = team.players[2].id;

    expect(chooseVeteran(team, linemanId)).toEqual({ allowed: true });

    expect(team.players[2].veteran).toBe(true);
    expect(lineman.stats.MA).toBe(6);
    expect(team.players[2].stats.MA).toBe(5);
  });

  it("moving the Veteran restores the old one's MA", () => {
    const team = legalSquad();
    chooseVeteran(team, team.players[2].id);
    chooseVeteran(team, team.players[3].id);

    expect(team.players.filter((p) => p.veteran).map((p) => p.number)).toEqual([
      4,
    ]);
    expect(team.players[2].stats.MA).toBe(6);
    expect(team.players[3].stats.MA).toBe(5);
  });

  it("refuses a player without the Lineman keyword", () => {
    const team = legalSquad();
    const decision = chooseVeteran(team, team.players[0].id);

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/Lineman/);
    expect(team.players[0].veteran).toBeUndefined();
    expect(team.players[0].stats.MA).toBe(blitzer.stats.MA);
  });

  it("refuses a new Veteran once the team is active", () => {
    const team = legalSquad();
    chooseVeteran(team, team.players[2].id);
    stampFirstCompletedMatch(team, 1);

    expect(chooseVeteran(team, team.players[3].id).allowed).toBe(false);
    expect(team.players[2].veteran).toBe(true);
  });
});

describe("draft legality with a Veteran (D8)", () => {
  it("a draft with Linemen and no Veteran is not legal", () => {
    const violations = validateRosterLegality(legalSquad(), humanRoster);
    expect(violations.map((v) => v.rule)).toEqual(["veteran"]);
  });

  it("a draft with one Veteran is legal", () => {
    const team = legalSquad();
    chooseVeteran(team, team.players[4].id);
    expect(validateRosterLegality(team, humanRoster)).toEqual([]);
  });

  it("an active team that lost its Veteran stays legal", () => {
    const team = legalSquad();
    stampFirstCompletedMatch(team, 1);
    expect(validateRosterLegality(team, humanRoster)).toEqual([]);
  });
});

describe("Veteran persistence (D8)", () => {
  it("survives a save and load with MA still one lower", () => {
    const team = legalSquad();
    chooseVeteran(team, team.players[2].id);

    const { team: loaded } = readStoredTeam(
      JSON.parse(JSON.stringify(dehydrateTeam(team)))
    );

    expect(loaded.players[2].veteran).toBe(true);
    expect(loaded.players[2].stats.MA).toBe(5);
    expect(loaded.players[3].veteran).toBeUndefined();
    expect(loaded.players[3].stats.MA).toBe(6);
  });
});
