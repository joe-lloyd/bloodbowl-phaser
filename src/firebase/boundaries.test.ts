import { describe, expect, it } from "vitest";
import {
  readCompetition,
  readCompetitionStore,
  unreadableCompetitions,
} from "../boundary/competitionRepository";
import { readLobby, readAppliedCommandCount } from "../boundary/firebaseLobby";
import { readCloudTeam } from "../boundary/firebaseTeam";
import { dehydrateTeam } from "../data/persistence/teamPersistence";
import { TeamBuilder } from "../../__tests__/utils/test-builders";

function legacyLeague() {
  return {
    id: "legacy-league",
    type: "league",
    name: "Legacy League",
    organizerUid: null,
    participantUids: [],
    status: "active",
    entrants: [
      {
        id: "entry",
        teamId: "team",
        name: "Team",
        rosterName: "Human",
        seed: 1,
        team: { old: "embedded" },
      },
    ],
    fixtures: [],
    standings: [],
    points: { win: 3, draw: 1, loss: 0 },
    createdAt: 1,
    updatedAt: 2,
  };
}

function lobby() {
  return {
    code: "ABC123",
    hostUid: "coach",
    guestUid: null,
    status: "lobby",
    settings: {
      turnSeconds: 120,
      timeoutBankMs: 300000,
      progressionEnabled: false,
    },
    players: {
      coach: { uid: "coach", displayName: "Coach", team: null, ready: false },
    },
    createdAt: null,
  };
}

describe("Firebase data boundaries", () => {
  it("migrates embedded legacy entrants before validating a competition", () => {
    const parsed = readCompetition(legacyLeague());
    expect(parsed.entrants).toEqual([
      {
        id: "entry",
        teamId: "team",
        name: "Team",
        rosterName: "Human",
        seed: 1,
        ownerUid: null,
      },
    ]);
  });
  it("keeps a valid competition's stored standings and status", () => {
    const parsed = readCompetition({
      ...legacyLeague(),
      status: "complete",
      standings: [],
    });
    expect(parsed.status).toBe("complete");
  });
  it("falls back to derived standings, status and champion when the stored ones are invalid", () => {
    const parsed = readCompetition({
      ...legacyLeague(),
      status: "complete",
      standings: [{ entrantId: "entry", points: 99 }],
      championEntrantId: 7,
    });
    expect(parsed.status).toBe("active");
    expect(parsed.standings).toEqual([]);
    expect("championEntrantId" in parsed).toBe(false);
  });
  it("keeps the other local competitions when one fails validation", () => {
    const store = readCompetitionStore(
      JSON.stringify({
        "league:good": legacyLeague(),
        "league:bad": { ...legacyLeague(), points: { win: "three" } },
      })
    );
    expect(Object.keys(store)).toEqual(["league:good"]);
  });
  it("lists only the local competitions that fail validation, so a write can keep them", () => {
    const unreadable = unreadableCompetitions(
      JSON.stringify({
        "league:good": legacyLeague(),
        "league:bad": { ...legacyLeague(), points: { win: "three" } },
      })
    );
    expect(Object.keys(unreadable)).toEqual(["league:bad"]);
  });
  it("keeps a draft competition a draft", () => {
    expect(readCompetition({ ...legacyLeague(), status: "draft" }).status).toBe("draft");
  });
  it("rejects malformed nested competition points", () => {
    expect(() =>
      readCompetition({
        ...legacyLeague(),
        points: { win: "three", draw: 1, loss: 0 },
      })
    ).toThrow();
  });
  it("validates nested lobby players before subscription callbacks receive them", () => {
    expect(readLobby(lobby()).players["coach"]?.ready).toBe(false);
    expect(() =>
      readLobby({
        ...lobby(),
        players: {
          coach: {
            uid: "coach",
            displayName: "Coach",
            team: null,
            ready: "yes",
          },
        },
      })
    ).toThrow();
  });
  it("reads the applied command count without requiring unrelated lobby fields", () => {
    expect(readAppliedCommandCount({ resume: { applied: 9 } })).toBe(9);
    expect(readAppliedCommandCount(undefined)).toBeUndefined();
    expect(() =>
      readAppliedCommandCount({ resume: { applied: "nine" } })
    ).toThrow();
  });
  it("keeps legacy team defaults while validating hydrated team data", () => {
    const stored = dehydrateTeam(
      new TeamBuilder().withId("legacy-team").build()
    );
    Reflect.deleteProperty(stored, "schemaVersion");
    Reflect.deleteProperty(stored, "coaches");
    Reflect.deleteProperty(stored, "cheerleaders");
    const { team } = readCloudTeam(stored);
    expect({
      id: team.id,
      coaches: team.coaches,
      cheerleaders: team.cheerleaders,
    }).toEqual({ id: "legacy-team", coaches: 0, cheerleaders: 0 });
  });
});
