import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

import { createCompetition } from "../../../src/competition/create";
import { fixtureContext } from "../../../src/competition/fixtureContext";
import { getCompetition } from "../../../src/competition/repository";
import {
  closeWalkovers,
  recordCompetitionFixture,
} from "../../../src/competition/resultRecording";
import { getComputerTeamTemplates } from "../../../src/competition/computerTeamTemplates";
import type { CompetitionDoc } from "../../../src/competition/types";
import { getRosterByRosterName } from "../../../src/data/RosterTemplates";
import { getTeamById, saveTeam } from "../../../src/game/managers/TeamManager";
import { foundClub } from "../../../src/game/rules/club";
import { hirePlayer } from "../../../src/game/rules/teamPricing";
import { chooseFirstLinemanAsVeteran } from "../../../src/game/rules/veteran";
import type { PlayerAdvancement } from "../../../src/types/Player";
import { RosterName, type Team, calculateTeamValue } from "../../../src/types/Team";
import { fixtureValue } from "../../../src/testing/fixtureValue";

const SKILLS = ["Block", "Dauntless", "Fend", "Pro", "Tackle", "Wrestle"];

const skill = (name: string): PlayerAdvancement => ({
  id: `adv-${name}`,
  type: "primary-skill",
  name,
  sppCost: 6,
  valueIncrease: 20_000,
});

async function starClub(): Promise<Team> {
  const club = foundClub("Altdorf Anvils", RosterName.HUMAN);
  const lineman = fixtureValue(
    getRosterByRosterName(RosterName.HUMAN).playerTemplates.find(
      (template) => template.positionName === "Human Lineman"
    )
  );
  for (let index = 0; index < 7; index++) hirePlayer(club, lineman);
  chooseFirstLinemanAsVeteran(club);
  const star = fixtureValue(club.players[1]);
  star.advancements = SKILLS.map((name) => skill(name));
  star.teamValue = 1_200_000;
  club.treasury = 2_000_000;
  await saveTeam(club);
  return club;
}

async function playOut(id: string, clubId: string): Promise<CompetitionDoc> {
  for (let guard = 0; guard < 10; guard++) {
    const tournament = fixtureValue(await getCompetition("tournament", id));
    const [fixture] = tournament.fixtures
      .filter((candidate) => candidate.status === "ready")
      .sort((a, b) => a.round - b.round);
    if (!fixture) return tournament;
    const home = tournament.entrants.find((entrant) => entrant.id === fixture.homeEntrantId);
    const clubAway = home?.teamId !== clubId && fixture.awayEntrantId !== null &&
      tournament.entrants.find((entrant) => entrant.id === fixture.awayEntrantId)?.teamId === clubId;
    await recordCompetitionFixture({
      context: fixtureContext({ competition: tournament, fixtureId: fixture.id, playedVia: "reported" }),
      homeScore: clubAway ? 0 : 2,
      awayScore: clubAway ? 2 : 0,
    });
  }
  throw new Error("The tournament did not finish.");
}

const offersOf = (team: Team) =>
  (team.pendingDevelopment ?? []).filter((entry) => entry.kind === "drafted-player-offer");

describe("a club's tournament against computer teams", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("has no team value cap and ends with one scouting roll for the club", async () => {
    const club = await starClub();
    expect(calculateTeamValue(club)).toBeGreaterThan(1_200_000);
    const templates = getComputerTeamTemplates().slice(0, 3);
    const tournament = await createCompetition({
      type: "tournament",
      format: "single-elimination",
      name: "Altdorf Cup",
      organizerUid: null,
      entrants: [
        { team: club, ownerUid: null },
        ...templates.map((template) => ({ computerTemplateId: template.id })),
      ],
    });

    const finished = await playOut(tournament.id, club.id);
    expect(finished.status).toBe("complete");
    const after = fixtureValue(getTeamById(club.id));
    expect(after.activeCompetitionId).toBeUndefined();
    expect(offersOf(after).map((offer) => offer.matchId)).toEqual([`tournament-${tournament.id}`]);

    await closeWalkovers(finished);
    expect(offersOf(fixtureValue(getTeamById(club.id)))).toHaveLength(1);
  });
});
