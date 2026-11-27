import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { RosterName, type Team } from "../../src/types/Team";

vi.mock("firebase/firestore", async () => {
  const fake = await import("../utils/fakeTeamCloud");
  return fake.firestoreFake;
});

vi.mock("../../src/firebase/config", () => ({
  getDb: vi.fn(() => ({})),
  isFirebaseConfigured: vi.fn(() => true),
}));

import { FirebaseError } from "firebase/app";
import { runTransaction } from "firebase/firestore";
import { cloudDocuments, cloudWrites, network, resetTeamCloud } from "./../utils/fakeTeamCloud";
import { cloudDocument } from "../../src/firebase/teamLibrarySync";
import { readTeamMirror } from "../../src/boundary/teamMirror";
import {
  saveTeams,
  loadTeams,
  setTeamRepository,
  deleteTeam,
} from "../../src/game/managers/TeamManager";
import { createComputerTeam } from "../fixtures/computerTeam";
import {
  CloudTeamRepository,
  migrateLocalTeams,
} from "../../src/firebase/cloudTeamRepository";

function primed(teams: Team[]): CloudTeamRepository {
  for (const team of teams) cloudDocuments.set(`users/user-a/teams/${team.id}`, cloudDocument(team));
  return new CloudTeamRepository("user-a", structuredClone(teams));
}

function makeTeam(id: string, name = id): Team {
  const team = createComputerTeam({ rosterName: RosterName.ORC, name, primaryColour: 0x224488, advancementMode: "advanced-league" });
  return { ...team, id };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  localStorage.clear();
  setTeamRepository(null);
  vi.clearAllMocks();
  resetTeamCloud();
});

describe("signed-out persistence", () => {
  it("reports a failed deletion and keeps the local team", () => {
    const team = createComputerTeam({ rosterName: RosterName.ORC, name: "Local team", primaryColour: 0x224488, advancementMode: "advanced-league" });
    saveTeams([team]);
    const write = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementationOnce(() => {
        throw new Error("Storage is unavailable");
      });
    try {
      expect(() => deleteTeam(team.id)).toThrow("Storage is unavailable");
      expect(loadTeams().map((saved) => saved.id)).toEqual([team.id]);
    } finally {
      write.mockRestore();
    }
  });

  it("saves and loads through localStorage", () => {
    saveTeams([makeTeam("t1", "Locals")]);

    const stored = JSON.parse(fixtureValue(localStorage.getItem("bloodbowl_teams")));
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe("Locals");
    expect(fixtureValue(loadTeams()[0]).id).toBe("t1");
    expect(cloudWrites).toEqual([]);
  });
});

describe("signed-in cloud repository", () => {
  it("refuses deletion when another repository entered the computer team", async () => {
    const team = createComputerTeam({ rosterName: RosterName.ORC, name: "Nuln Hammers", primaryColour: 0x224488, advancementMode: "advanced-league" });
    const staleTab = primed([structuredClone(team)]);
    const otherTab = primed([structuredClone(team)]);
    otherTab.saveTeams([{ ...team, activeCompetitionId: "league-1" }]);
    await flush();
    setTeamRepository(staleTab);
    expect(fixtureValue(loadTeams()[0]).activeCompetitionId).toBeUndefined();

    await expect(
      Promise.resolve().then(() => deleteTeam(team.id))
    ).rejects.toThrow("still playing in a competition");

    expect(cloudDocuments.get(`users/user-a/teams/${team.id}`)).toMatchObject({
      id: team.id,
      activeCompetitionId: "league-1",
    });
    expect(loadTeams().map((saved) => saved.id)).toEqual([team.id]);
  });

  it("deletes a free team without overwriting another tab's changes to other teams", async () => {
    const team = createComputerTeam({ rosterName: RosterName.ORC, name: "Free team", primaryColour: 0x224488, advancementMode: "advanced-league" });
    const keep = createComputerTeam({ rosterName: RosterName.HUMAN, name: "Keep me", primaryColour: 0x224488, advancementMode: "advanced-league" });
    const staleTab = primed([team, keep]);
    const otherTab = primed([
      structuredClone(team),
      structuredClone(keep),
    ]);
    otherTab.saveTeams([team, { ...keep, activeCompetitionId: "league-2" }]);
    await flush();
    setTeamRepository(staleTab);

    await deleteTeam(team.id);

    expect(cloudDocuments.has(`users/user-a/teams/${team.id}`)).toBe(false);
    expect(cloudDocuments.get(`users/user-a/teams/${keep.id}`)).toMatchObject({
      activeCompetitionId: "league-2",
    });
    expect(loadTeams().map((saved) => saved.id)).toEqual([keep.id]);
  });
  it("reads from the primed cache and writes through to own library only", async () => {
    setTeamRepository(primed([makeTeam("cloud1")]));

    expect(loadTeams().map((t) => t.id)).toEqual(["cloud1"]);

    const changed = { ...makeTeam("cloud1"), treasury: 1 };
    saveTeams([changed, makeTeam("cloud2")]);
    await flush();

    expect(loadTeams().map((t) => t.id)).toEqual(["cloud1", "cloud2"]);

    expect([...cloudDocuments.keys()]).toEqual([
      "users/user-a/teams/cloud1",
      "users/user-a/teams/cloud2",
    ]);

    expect(localStorage.getItem("bloodbowl_teams")).toBeNull();
  });

  it("deletes removed teams from the cloud", async () => {
    setTeamRepository(
      primed([makeTeam("keep"), makeTeam("drop")])
    );

    const drop = { ...makeTeam("drop"), treasury: 1 };
    saveTeams([{ ...makeTeam("keep"), treasury: 1 }, drop]);
    await flush();

    saveTeams([{ ...makeTeam("keep"), treasury: 1 }]);
    await flush();

    expect([...cloudDocuments.keys()]).toEqual(["users/user-a/teams/keep"]);
  });
});

async function startedElsewhere() {
  const draft = makeTeam("club");
  const stale = primed([structuredClone(draft)]);
  const other = new CloudTeamRepository("user-a", [structuredClone(draft)]);
  await other.saveTeams([
    { ...structuredClone(draft), firstMatchPlayedAt: 1, wins: 1 },
  ]);
  return { draft, stale };
}
const stored = () => cloudDocuments.get("users/user-a/teams/club");

describe("a stale draft in the cloud library", () => {
  it("asks before replacing a team that played its first match on another device", async () => {
    const { draft, stale } = await startedElsewhere();
    setTeamRepository(stale);

    await saveTeams([{ ...structuredClone(draft), name: "Renamed" }]);

    expect(stored()).toMatchObject({ name: draft.name, firstMatchPlayedAt: 1, wins: 1 });
    expect(Object.keys(fixtureValue(readTeamMirror("user-a")).conflicts)).toEqual(["club"]);
  });

  it("keeps the re-rolls and fans of the played team when the coach keeps the draft", async () => {
    const { draft, stale } = await startedElsewhere();
    setTeamRepository(stale);
    await saveTeams([
      {
        ...structuredClone(draft),
        name: "Renamed",
        rerolls: draft.rerolls + 1,
        dedicatedFans: draft.dedicatedFans + 1,
      },
    ]);

    await stale.keepLocal("club");

    expect(stored()).toMatchObject({
      name: "Renamed",
      firstMatchPlayedAt: 1,
      rerolls: draft.rerolls,
      dedicatedFans: draft.dedicatedFans,
    });
    expect(loadTeams()[0]).toMatchObject({
      firstMatchPlayedAt: 1,
      rerolls: draft.rerolls,
    });
  });

  it("never lands after a later save of the same team", async () => {
    const draft = makeTeam("club");
    const repository = primed([structuredClone(draft)]);
    const first = repository.saveTeams([{ ...structuredClone(draft), name: "Draft" }]);
    const second = repository.saveTeams([
      { ...structuredClone(draft), firstMatchPlayedAt: 2, wins: 1 },
    ]);
    await Promise.all([first, second]);
    expect(stored()).toMatchObject({ firstMatchPlayedAt: 2, wins: 1 });
  });

  it("keeps an offline save waiting and still applies the lock when it uploads", async () => {
    const draft = makeTeam("club");
    const repository = primed([structuredClone(draft)]);
    network.up = false;
    await repository.saveTeams([{ ...structuredClone(draft), rerolls: draft.rerolls + 1 }]);
    expect(stored()).toMatchObject({ rerolls: draft.rerolls });
    vi.mocked(runTransaction).mockRejectedValueOnce(new FirebaseError("unavailable", "offline"));
    network.up = true;

    await repository.resync();
    expect(fixtureValue(readTeamMirror("user-a")).pending).toEqual(["club"]);
    await repository.resync();

    expect(stored()).toMatchObject({ rerolls: draft.rerolls + 1 });
    expect(fixtureValue(readTeamMirror("user-a")).pending).toEqual([]);
  });

  it("finishes a batch before the next save when one team is refused", async () => {
    const draft = makeTeam("club");
    const repository = primed([]);
    vi.mocked(runTransaction).mockRejectedValueOnce(new Error("refused"));
    const first = repository.saveTeams([
      { ...makeTeam("started"), firstMatchPlayedAt: 1 },
      { ...draft, name: "Old" },
    ]);
    const second = repository.saveTeams([{ ...draft, name: "New" }]);
    await expect(first).rejects.toThrow("refused");
    await second;
    expect(stored()).toMatchObject({ name: "New" });
  });
});

describe("local→cloud migration", () => {
  it("uploads local teams once, deduplicated against cloud ids", async () => {
    localStorage.setItem(
      "bloodbowl_teams",
      JSON.stringify([makeTeam("local1"), makeTeam("shared")])
    );

    const uploaded = await migrateLocalTeams(
      "user-a",
      [makeTeam("shared")],
      () => true
    );

    expect(uploaded.map((t) => t.id)).toEqual(["local1"]);
    expect([...cloudDocuments.keys()]).toEqual([
      "users/user-a/teams/local1",
    ]);

    cloudDocuments.clear();
    const again = await migrateLocalTeams("user-a", [], () => true);
    expect(again).toEqual([]);
    expect(cloudDocuments.size).toBe(0);
  });

  it("declining uploads nothing and leaves local teams intact", async () => {
    localStorage.setItem(
      "bloodbowl_teams",
      JSON.stringify([makeTeam("local1")])
    );

    const uploaded = await migrateLocalTeams("user-b", [], () => false);

    expect(uploaded).toEqual([]);
    expect(cloudWrites).toEqual([]);
    expect(JSON.parse(fixtureValue(localStorage.getItem("bloodbowl_teams")))).toHaveLength(
      1
    );
  });
});
