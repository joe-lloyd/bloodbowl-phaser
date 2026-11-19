import { fixtureValue } from "../../../src/testing/fixtureValue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setDoc } from "firebase/firestore";
import { CloudTeamRepository } from "../../../src/firebase/cloudTeamRepository";
import { TeamBuilder } from "../../utils/test-builders";

vi.mock("firebase/firestore", async () => ({
  ...(await vi.importActual<typeof import("firebase/firestore")>(
    "firebase/firestore"
  )),
  doc: vi.fn(() => ({})),
  collection: vi.fn(() => ({})),
  setDoc: vi.fn(),
}));
vi.mock("../../../src/firebase/config", () => ({
  isFirebaseConfigured: () => false,
  getDb: vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

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
    const repository = new CloudTeamRepository("coach", []);
    await expect(repository.saveTeams([team])).rejects.toThrow("Cloud offline");
    expect(fixtureValue(repository.loadTeams()[0]).treasury).toBe(140_000);
  });
});
