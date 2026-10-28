/**
 * The seed both coaches make: each publishes a hash of a secret, then the
 * secret. Both derive the same seed, and a secret that does not match its
 * hash is refused.
 */
import { describe, it, expect } from "vitest";
import { webcrypto } from "node:crypto";
import {
  LobbyDoc,
  DEFAULT_SETTINGS,
  seedFor,
  seedReady,
} from "../../../src/firebase/lobby";

const sha256 = async (text: string) =>
  [
    ...new Uint8Array(
      await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
    ),
  ]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

async function lobbyWith(
  hostSecret: string,
  guestSecret: string,
  revealGuest = guestSecret
) {
  return {
    code: "SEED01",
    hostUid: "host",
    guestUid: "guest",
    status: "lobby",
    settings: { ...DEFAULT_SETTINGS },
    players: {},
    createdAt: null,
    seedCommits: {
      host: await sha256(hostSecret),
      guest: await sha256(guestSecret),
    },
    seedReveals: { host: hostSecret, guest: revealGuest },
  } as LobbyDoc;
}

describe("joint seed", () => {
  it("both coaches derive the same seed from both secrets", async () => {
    const lobby = await lobbyWith("aaaa", "bbbb");
    expect(seedReady(lobby)).toBe(true);
    const seed = await seedFor(lobby);
    expect(seed).toBe(await seedFor(structuredClone(lobby)));
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    // Either secret changes the seed
    expect(await seedFor(await lobbyWith("aaaa", "cccc"))).not.toBe(seed);
  });

  it("refuses a secret that does not match its commitment", async () => {
    const lobby = await lobbyWith("aaaa", "bbbb", "swapped-after-seeing-yours");
    await expect(seedFor(lobby)).rejects.toThrow(/does not match/);
  });

  it("is not ready until both coaches have revealed", async () => {
    const lobby = await lobbyWith("aaaa", "bbbb");
    delete lobby.seedReveals!.guest;
    expect(seedReady(lobby)).toBe(false);
  });
});
