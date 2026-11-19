import type * as RepositoryModule from "../game/persistence/MatchSaveRepository";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MatchSaveRepository } from "../game/persistence/MatchSaveRepository";

const mockGetDoc = vi.fn<unknown[], unknown>();
const mockSetDoc = vi.fn<unknown[], unknown>();
const mockDeleteDoc = vi.fn<unknown[], unknown>();
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => ({})),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
}));

const mockGetIdToken = vi.fn<[], Promise<string>>();
const mockGetFirebaseAuth = vi.fn<unknown[], unknown>();
vi.mock("./config", () => ({
  getDb: vi.fn(() => ({})),
  getFirebaseAuth: (...args: unknown[]) => mockGetFirebaseAuth(...args),
}));

type FakeAuthUser = { uid: string } | null;
let mockAuthListener: ((user: FakeAuthUser) => void) | null = null;
vi.mock("./auth", () => ({
  subscribeToAuth: (listener: (user: FakeAuthUser) => void) => {
    mockAuthListener = listener;
    return () => {
      mockAuthListener = null;
    };
  },
}));

const mockSetMatchSaveRepository = vi.fn<
  [MatchSaveRepository | null],
  undefined
>();
const mockLocalRepo = {
  read: vi.fn<[], ReturnType<MatchSaveRepository["read"]>>(() => null),
  write: vi.fn(),
  clear: vi.fn(),
  describe: vi.fn(() => null),
};
vi.mock("../game/persistence/MatchSaveRepository", async (importOriginal) => {
  const actual = await importOriginal<typeof RepositoryModule>();
  return {
    ...actual,
    getLocalMatchSaveRepository: () => mockLocalRepo,
    setMatchSaveRepository: (...args: [MatchSaveRepository | null]) => {
      mockSetMatchSaveRepository(...args);
    },
  };
});

import { connectMatchSavePersistenceToAuth } from "./cloudMatchSaveRepository";

function permissionError(
  code: "permission-denied" | "unauthenticated" = "permission-denied"
): Error & { code: string } {
  return Object.assign(new Error("Missing or insufficient permissions."), {
    code,
  });
}

function missingSnapshot() {
  return { exists: () => false, data: () => undefined };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("connectMatchSavePersistenceToAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthListener = null;
    mockLocalRepo.read.mockReturnValue(null);
    mockGetIdToken.mockResolvedValue("fresh-token");
    mockGetFirebaseAuth.mockReturnValue({
      currentUser: { getIdToken: mockGetIdToken },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("recovers silently from a single transient permission-denied error", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    mockGetDoc
      .mockRejectedValueOnce(permissionError())
      .mockResolvedValueOnce(missingSnapshot());

    connectMatchSavePersistenceToAuth();
    mockAuthListener?.({ uid: "user-1" });
    await flush();

    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(mockGetDoc).toHaveBeenCalledTimes(2);
    expect(mockGetIdToken).toHaveBeenNthCalledWith(1, false);
    expect(mockGetIdToken).toHaveBeenNthCalledWith(2, true);

    expect(mockSetMatchSaveRepository).toHaveBeenCalledTimes(1);
    const repoArg = mockSetMatchSaveRepository.mock.calls[0]?.[0];
    expect(repoArg).toBeDefined();
    expect(repoArg).not.toBeNull();
    expect(repoArg).not.toBe(mockLocalRepo);
  });

  it("falls back to the local repository after two permission-denied failures", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    mockGetDoc.mockRejectedValue(permissionError("unauthenticated"));

    connectMatchSavePersistenceToAuth();
    mockAuthListener?.({ uid: "user-1" });
    await flush();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(mockSetMatchSaveRepository).toHaveBeenCalledTimes(1);
    expect(mockSetMatchSaveRepository).toHaveBeenCalledWith(mockLocalRepo);
  });

  it("logs and falls back to null for a non-permission error", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    mockGetDoc.mockRejectedValue(new Error("boom"));

    connectMatchSavePersistenceToAuth();
    mockAuthListener?.({ uid: "user-1" });
    await flush();

    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(mockGetDoc).toHaveBeenCalledTimes(1);
    expect(mockSetMatchSaveRepository).toHaveBeenCalledTimes(1);
    expect(mockSetMatchSaveRepository).toHaveBeenCalledWith(null);
  });
});
