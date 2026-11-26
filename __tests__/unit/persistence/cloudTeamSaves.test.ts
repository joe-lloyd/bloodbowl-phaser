import { fixtureValue } from "../../../src/testing/fixtureValue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runTransaction, setDoc } from "firebase/firestore";
import { CloudTeamRepository } from "../../../src/firebase/cloudTeamRepository";
import { TeamBuilder } from "../../utils/test-builders";

vi.mock("firebase/firestore", async () => ({
  ...(await vi.importActual<typeof import("firebase/firestore")>(
    "firebase/firestore"
  )),
  doc: vi.fn(() => ({})),
  collection: vi.fn(() => ({})),
  setDoc: vi.fn(),
  runTransaction: vi.fn(),
}));
vi.mock("../../../src/firebase/config", () => ({
  isFirebaseConfigured: () => false,
  getDb: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("cloud team save acknowledgement", () => {
  it("keeps the save pending after updating the cache until Firestore accepts it", async () => {
    let acknowledge!: () => void;
    const written = new Promise<void>((resolve) => {
      acknowledge = resolve;
    });
    vi.mocked(setDoc).mockReturnValueOnce(written);
    const team = new TeamBuilder()
      .withId("saved-team")
      .withTreasury(30_000)
      .build();
    team.firstMatchPlayedAt = 1;
    const repository = new CloudTeamRepository("coach", []);
    let acknowledged = false;
    const saved = repository.saveTeams([team]).then(() => {
      acknowledged = true;
    });
    await Promise.resolve();
    expect(fixtureValue(repository.loadTeams()[0]).treasury).toBe(30_000);
    expect(acknowledged).toBe(false);
    acknowledge();
    await saved;
    expect(acknowledged).toBe(true);
    expect(setDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "saved-team", treasury: 30_000 })
    );
  });

  it("reports a rejected Firestore write to its caller", async () => {
    vi.mocked(setDoc).mockRejectedValueOnce(new Error("Cloud offline"));
    const team = new TeamBuilder()
      .withId("saved-team")
      .withTreasury(140_000)
      .build();
    team.firstMatchPlayedAt = 1;
    const repository = new CloudTeamRepository("coach", []);
    await expect(repository.saveTeams([team])).rejects.toThrow("Cloud offline");
    expect(fixtureValue(repository.loadTeams()[0]).treasury).toBe(140_000);
  });

  it("goes back to the accepted team when Firestore refuses a change", async () => {
    const accepted = new TeamBuilder().withTreasury(140_000).build();
    accepted.firstMatchPlayedAt = 1;
    vi.mocked(setDoc).mockRejectedValueOnce(new Error("Cloud offline"));
    const repository = new CloudTeamRepository("coach", [accepted]);
    await expect(
      repository.saveTeams([{ ...accepted, treasury: 20_000 }])
    ).rejects.toThrow("Cloud offline");
    expect(repository.loadTeams()).toEqual([accepted]);
  });
});

function activeTeam(id: string, treasury: number) {
  const team = new TeamBuilder().withId(id).withTreasury(treasury).build();
  team.firstMatchPlayedAt = 1;
  return team;
}

describe("cloud team writes", () => {
  it("writes only the team that changed when the library is saved", async () => {
    const library = [
      activeTeam("first", 10_000),
      activeTeam("second", 20_000),
      activeTeam("third", 30_000),
    ];
    const repository = new CloudTeamRepository("coach", library);
    const edited = structuredClone(library);
    edited[1] = { ...activeTeam("second", 20_000), treasury: 5_000 };

    await repository.saveTeams(edited);

    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(setDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "second", treasury: 5_000 })
    );
  });

  it("writes nothing when no team changed", async () => {
    const library = [activeTeam("first", 10_000), activeTeam("second", 20_000)];
    const repository = new CloudTeamRepository("coach", library);

    await repository.saveTeams(structuredClone(library));

    expect(setDoc).not.toHaveBeenCalled();
  });

  it("writes a team again after its last write was refused", async () => {
    const repository = new CloudTeamRepository("coach", [
      activeTeam("first", 10_000),
    ]);
    const changed = [activeTeam("first", 2_000)];
    vi.mocked(setDoc).mockRejectedValueOnce(new Error("Cloud offline"));
    await expect(repository.saveTeams(changed)).rejects.toThrow(
      "Cloud offline"
    );

    await repository.saveTeams(structuredClone(changed));

    expect(setDoc).toHaveBeenCalledTimes(2);
  });

  it("writes the latest save when an earlier write finishes after a newer one was queued", async () => {
    const repository = new CloudTeamRepository("coach", [
      activeTeam("first", 10_000),
    ]);
    let finishFirst!: () => void;
    vi.mocked(setDoc).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishFirst = resolve;
      })
    );
    const saveB = repository.saveTeams([activeTeam("first", 20_000)]);
    const saveC = repository.saveTeams([activeTeam("first", 30_000)]);
    finishFirst();
    await saveB;
    const saveBAgain = repository.saveTeams([activeTeam("first", 20_000)]);
    await Promise.all([saveC, saveBAgain]);

    expect(vi.mocked(setDoc).mock.lastCall?.[1]).toEqual(
      expect.objectContaining({ treasury: 20_000 })
    );
  });

  it("writes a deleted team again when it is saved back unchanged", async () => {
    vi.mocked(runTransaction).mockResolvedValueOnce(undefined);
    const team = activeTeam("first", 10_000);
    const repository = new CloudTeamRepository("coach", [team]);
    await repository.deleteTeam("first");

    await repository.saveTeams([structuredClone(team)]);

    expect(setDoc).toHaveBeenCalledTimes(1);
  });
});
