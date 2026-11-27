import { fixtureValue } from "../../../src/testing/fixtureValue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FirebaseError } from "firebase/app";
import { getDocsFromServer, runTransaction } from "firebase/firestore";
import { CloudTeamRepository } from "../../../src/firebase/cloudTeamRepository";
import { cloudDocument, libraryFromMirror } from "../../../src/firebase/teamLibrarySync";
import { readTeamMirror } from "../../../src/boundary/teamMirror";
import { getComputerTeamTemplates, createComputerTeamFromTemplate } from "../../../src/competition/computerTeamTemplates";
import { type Team } from "../../../src/types/Team";
import { TeamBuilder } from "../../utils/test-builders";
import { cloudDocuments, cloudWrites, network, resetTeamCloud } from "../../utils/fakeTeamCloud";

vi.mock("firebase/firestore", async () => {
  const fake = await import("../../utils/fakeTeamCloud");
  return fake.firestoreFake;
});
vi.mock("../../../src/firebase/config", () => ({
  isFirebaseConfigured: () => true,
  getDb: vi.fn(),
}));

const UID = "coach";
const path = (id: string) => `users/${UID}/teams/${id}`;

function activeTeam(id: string, treasury: number): Team {
  const team = new TeamBuilder().withId(id).withName(id).withTreasury(treasury).build();
  team.firstMatchPlayedAt = 1;
  return team;
}

function primed(teams: Team[]): CloudTeamRepository {
  for (const team of teams) cloudDocuments.set(path(team.id), cloudDocument(team));
  return new CloudTeamRepository(UID, structuredClone(teams));
}

function storedTreasury(id: string): unknown {
  const stored = cloudDocuments.get(path(id));
  return typeof stored === "object" && stored !== null && "treasury" in stored ? stored.treasury : undefined;
}

function mirror() {
  return fixtureValue(readTeamMirror(UID));
}

beforeEach(() => {
  resetTeamCloud();
  localStorage.clear();
  vi.clearAllMocks();
});

describe("cloud team writes", () => {
  it("writes only the team that changed when the library is saved", async () => {
    const library = [activeTeam("first", 10_000), activeTeam("second", 20_000), activeTeam("third", 30_000)];
    const repository = primed(library);
    const edited = structuredClone(library);
    edited[1] = { ...activeTeam("second", 20_000), treasury: 5000 };

    await repository.saveTeams(edited);

    expect(cloudWrites).toEqual([path("second")]);
    expect(storedTreasury("second")).toBe(5000);
  });

  it("writes nothing when no team changed", async () => {
    const library = [activeTeam("first", 10_000), activeTeam("second", 20_000)];
    const repository = primed(library);

    await repository.saveTeams(structuredClone(library));

    expect(cloudWrites).toEqual([]);
  });

  it("uploads saves in order, so the latest one lands last", async () => {
    const repository = primed([activeTeam("first", 10_000)]);
    const saves = [20_000, 30_000, 40_000].map((treasury) => repository.saveTeams([activeTeam("first", treasury)]));
    await Promise.all(saves);

    expect(storedTreasury("first")).toBe(40_000);
    expect(mirror().pending).toEqual([]);
  });

  it("writes a deleted team again when it is saved back unchanged", async () => {
    const team = activeTeam("first", 10_000);
    const repository = primed([team]);
    await repository.deleteTeam("first");
    expect(cloudDocuments.has(path("first"))).toBe(false);

    await repository.saveTeams([structuredClone(team)]);

    expect(storedTreasury("first")).toBe(10_000);
  });

  it("goes back to the accepted team when Firestore refuses a change", async () => {
    const accepted = activeTeam("first", 140_000);
    const repository = primed([accepted]);
    vi.mocked(runTransaction).mockRejectedValueOnce(new FirebaseError("permission-denied", "Refused"));

    await expect(repository.saveTeams([{ ...accepted, treasury: 20_000 }])).rejects.toThrow("Refused");

    expect(fixtureValue(repository.loadTeams()[0]).treasury).toBe(140_000);
    expect(mirror().pending).toEqual([]);
  });

  it("saves and uploads a new team of every roster without reporting a change on another device", async () => {
    const teams = getComputerTeamTemplates().map((template) => createComputerTeamFromTemplate(template.id, { advancementMode: "advanced-league" }));
    const repository = new CloudTeamRepository(UID, []);
    await repository.saveTeams(teams);
    await repository.saveTeams(teams.map((team) => ({ ...team, treasury: team.treasury + 10_000 })));
    await repository.resync();

    expect(mirror().conflicts).toEqual({});
    expect(mirror().pending).toEqual([]);
    expect(cloudWrites).toHaveLength(teams.length * 2);
  });
});

describe("offline saves", () => {
  it("keeps a save on this device while offline and uploads it on the next sync", async () => {
    const repository = primed([activeTeam("first", 10_000)]);
    network.up = false;

    await repository.saveTeams([activeTeam("first", 55_000)]);

    expect(storedTreasury("first")).toBe(10_000);
    expect(mirror().pending).toEqual(["first"]);
    network.up = true;
    await repository.resync();
    expect(storedTreasury("first")).toBe(55_000);
    expect(mirror().pending).toEqual([]);
  });

  it("uploads waiting changes when the list of teams cannot be fetched yet", async () => {
    const repository = primed([activeTeam("first", 10_000)]);
    network.up = false;
    await repository.saveTeams([activeTeam("first", 55_000)]);
    network.up = true;
    vi.mocked(getDocsFromServer).mockRejectedValueOnce(new FirebaseError("unavailable", "Client is offline"));

    await repository.resync();

    expect(storedTreasury("first")).toBe(55_000);
    expect(mirror().pending).toEqual([]);
  });

  it("restores waiting changes after a reload", async () => {
    const repository = primed([activeTeam("first", 10_000)]);
    network.up = false;
    await repository.saveTeams([activeTeam("first", 55_000), activeTeam("new", 1000)]);

    const reloaded = new CloudTeamRepository(UID, [], libraryFromMirror(mirror()));
    expect(reloaded.loadTeams().map(({ id, treasury }) => [id, treasury])).toEqual([
      ["first", 55_000],
      ["new", 1000],
    ]);
    network.up = true;
    await reloaded.resync();
    expect(storedTreasury("first")).toBe(55_000);
    expect(storedTreasury("new")).toBe(1000);
  });

  it("takes changes made on another device when this one changed nothing", async () => {
    const here = primed([activeTeam("first", 10_000)]);
    const elsewhere = new CloudTeamRepository(UID, [activeTeam("first", 10_000)]);
    await elsewhere.saveTeams([activeTeam("first", 77_000), activeTeam("second", 5000)]);

    await here.resync();

    expect(here.loadTeams().map(({ id, treasury }) => [id, treasury])).toEqual([
      ["first", 77_000],
      ["second", 5000],
    ]);
  });
});

async function conflicted() {
  const here = primed([activeTeam("first", 10_000)]);
  network.up = false;
  await here.saveTeams([activeTeam("first", 11_000)]);
  network.up = true;
  const elsewhere = new CloudTeamRepository(UID, [activeTeam("first", 10_000)]);
  await elsewhere.saveTeams([activeTeam("first", 99_000)]);
  await here.resync();
  return here;
}

describe("a team changed on two devices", () => {
  it("uploads neither version until the coach picks one", async () => {
    await conflicted();

    expect(Object.keys(mirror().conflicts)).toEqual(["first"]);
    expect(storedTreasury("first")).toBe(99_000);
  });

  it("uploads this device's version when the coach keeps it", async () => {
    const here = await conflicted();

    await here.keepLocal("first");

    expect(storedTreasury("first")).toBe(11_000);
    expect(mirror().conflicts).toEqual({});
    expect(mirror().pending).toEqual([]);
  });

  it("replaces this device's version when the coach takes the other one", async () => {
    const here = await conflicted();

    here.takeCloud("first");

    expect(fixtureValue(here.loadTeams()[0]).treasury).toBe(99_000);
    expect(mirror().pending).toEqual([]);
    await here.resync();
    expect(cloudWrites.filter((write) => write === path("first"))).toHaveLength(1);
  });

  it("reports a team deleted on another device while this one changed it", async () => {
    const here = primed([activeTeam("first", 10_000)]);
    network.up = false;
    await here.saveTeams([activeTeam("first", 11_000)]);
    network.up = true;
    cloudDocuments.delete(path("first"));

    await here.resync();

    expect(mirror().conflicts).toEqual({ first: null });
  });
});
