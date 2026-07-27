import { describe, expect, it } from "vitest";
import {
  LegacyEntrant,
  LegacySharedTeamRecord,
  repointCompetitionEntrants,
  repointEntrant,
} from "../../src/competition/migrateSharedEntrants";
import { LeagueDoc } from "../../src/competition/types";

function legacyEntrant(overrides: Partial<LegacyEntrant> = {}): LegacyEntrant {
  return {
    id: "entrant-1",
    teamId: "local-team-1",
    name: "Da Boyz",
    rosterName: "Orc",
    seed: 1,
    team: { id: "local-team-1", name: "Da Boyz", players: [] } as never,
    ...overrides,
  };
}

const sharedRecord: LegacySharedTeamRecord = {
  id: "coach-1_orcs",
  ownerUid: "coach-1",
  ownerName: "Morg",
  teamId: "orcs",
};

describe("migrateSharedEntrants", () => {
  it("passes an already-direct entrant through unchanged and verified", () => {
    const entrant = legacyEntrant({ ownerUid: "coach-2" });
    const result = repointEntrant(entrant, [sharedRecord]);
    expect(result.verified).toBe(true);
    expect(result.entrant).toEqual(entrant);
    expect(result.entrant).not.toHaveProperty("source");
    expect(result.entrant).not.toHaveProperty("sharedTeamId");
  });

  it("repoints a shared entrant onto the owner/team it referenced", () => {
    const entrant = legacyEntrant({
      source: "shared",
      sharedTeamId: "coach-1_orcs",
      teamId: "orcs-snapshot-id",
    });
    const result = repointEntrant(entrant, [sharedRecord]);
    expect(result.verified).toBe(true);
    expect(result.entrant.ownerUid).toBe("coach-1");
    expect(result.entrant.teamId).toBe("orcs");
    expect(result.entrant.coachName).toBe("Morg");
    expect(result.entrant).not.toHaveProperty("source");
    expect(result.entrant).not.toHaveProperty("sharedTeamId");
  });

  it("keeps cached display fields and flags unresolved when the shared record is gone", () => {
    const entrant = legacyEntrant({
      name: "Da Boyz (historical)",
      source: "shared",
      sharedTeamId: "coach-9_missing",
    });
    const result = repointEntrant(entrant, [sharedRecord]);
    expect(result.verified).toBe(false);
    expect(result.entrant.name).toBe("Da Boyz (historical)");
    expect(result.entrant.teamId).toBe(entrant.teamId);
  });

  it("repoints every entrant on a competition and reports unresolved ids", () => {
    const doc: LeagueDoc = {
      id: "league-1",
      type: "league",
      name: "Test League",
      organizerUid: "coach-1",
      participantUids: ["coach-1"],
      status: "active",
      entrants: [
        legacyEntrant({
          id: "e1",
          source: "shared",
          sharedTeamId: "coach-1_orcs",
        }),
        legacyEntrant({ id: "e2", source: "shared", sharedTeamId: "gone" }),
        legacyEntrant({ id: "e3", ownerUid: "coach-1" }),
      ],
      fixtures: [],
      standings: [],
      points: { win: 3, draw: 1, loss: 0 },
      createdAt: 0,
      updatedAt: 0,
    };

    const { doc: migrated, unresolved } = repointCompetitionEntrants(doc, [
      sharedRecord,
    ]);
    expect(unresolved).toEqual(["e2"]);
    expect(migrated.entrants.find((e) => e.id === "e1")?.ownerUid).toBe(
      "coach-1"
    );
    expect(migrated.entrants.every((e) => !("source" in e))).toBe(true);
  });
});
