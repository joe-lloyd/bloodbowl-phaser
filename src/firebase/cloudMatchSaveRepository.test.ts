import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MatchSaveRepository } from "../game/persistence/MatchSaveRepository";

// --- firebase/firestore -----------------------------------------------
const mockGetDoc = vi.fn();
const mockSetDoc = vi.fn();
const mockDeleteDoc = vi.fn();
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => ({})),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
}));

// --- ./config -----------------------------------------------------------
const mockGetIdToken = vi.fn();
const mockGetFirebaseAuth = vi.fn();
vi.mock("./config", () => ({
  getDb: vi.fn(() => ({})),
  getFirebaseAuth: (...args: unknown[]) => mockGetFirebaseAuth(...args),
}));

// --- ./auth ---------------------------------------------------------------
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

// --- ../game/persistence/MatchSaveRepository -------------------------------
const mockSetMatchSaveRepository = vi.fn();
const mockLocalRepo: MatchSaveRepository = {
  read: vi.fn(() => null),
  write: vi.fn(),
  clear: vi.fn(),
  describe: vi.fn(() => null),
};
vi.mock("../game/persistence/MatchSaveRepository", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../game/persistence/MatchSaveRepository")
  >();
  return {
    ...actual,
    getLocalMatchSaveRepository: () => mockLocalRepo,
    setMatchSaveRepository: (...args: [MatchSaveRepository | null]) =>
      mockSetMatchSaveRepository(...args),
  };
});

import { connectMatchSavePersistenceToAuth } from "./cloudMatchSaveRepository";

function permissionError(
  code: "permission-denied" | "unauthenticated" = "permission-denied"
): Error & { code: string } {
  const error = new Error(
    "Missing or insufficient permissions."
  ) as Error & { code: string };
  error.code = code;
  return error;
}

function missingSnapshot() {
  return { exists: () => false, data: () => undefined };
}

/** Flushes the microtask queue so chained `await`s inside the code under
 * test settle before assertions run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("connectMatchSavePersistenceToAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthListener = null;
    (mockLocalRepo.read as ReturnType<typeof vi.fn>).mockReturnValue(null);
    mockGetIdToken.mockResolvedValue("fresh-token");
    mockGetFirebaseAuth.mockReturnValue({
      currentUser: { getIdToken: mockGetIdToken },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("recovers silently from a single transient permission-denied error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
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
    const [repoArg] = mockSetMatchSaveRepository.mock.calls[0];
    expect(repoArg).not.toBeNull();
    expect(repoArg).not.toBe(mockLocalRepo);
  });

  it("falls back to the local repository after two permission-denied failures", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
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
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
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
