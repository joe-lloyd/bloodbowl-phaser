import { collection, getDocs, query, where } from "firebase/firestore";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  as,
  closeEmulatorApps,
  dbFor,
  denied,
  EMULATOR,
  loadRules,
  uniqueUid,
} from "./emulator";

vi.mock("../../src/firebase/config", async () => {
  const { current } = await import("./emulator");
  return { getDb: () => current.db, isFirebaseConfigured: () => true };
});

import {
  createLobby,
  heartbeat,
  joinLobby,
  type LobbyDoc,
  setLobbyListed,
  subscribeOpenLobbies,
} from "../../src/firebase/lobby";
import { openGames } from "../../src/social/openGames";
import { createHumanTeam, createOrcTeam } from "../fixtures/teams";

function openLobbiesSeenBy(uid: string): Promise<LobbyDoc[]> {
  return as(
    uid,
    () =>
      new Promise((resolve) => {
        const stop = subscribeOpenLobbies((lobbies) => {
          stop();
          resolve(lobbies);
        });
      })
  );
}

const fixture = {
  context: {
    competitionType: "league" as const,
    competitionId: "league-open-test",
    fixtureId: "round-1-match-1",
  },
  homeTeam: createOrcTeam(),
  awayTeam: createHumanTeam(),
};

describe.skipIf(!EMULATOR)("open lobbies", () => {
  beforeAll(loadRules);
  afterAll(closeEmulatorApps);

  it("are listed by their host and joined by a stranger", async () => {
    const host = uniqueUid("host");
    const stranger = uniqueUid("stranger");
    const { code } = await as(host, () => createLobby(host, "Host"));
    await as(host, () => setLobbyListed(code, true));
    await as(host, () => heartbeat(code, host));

    const seen = await openLobbiesSeenBy(stranger);
    expect(
      openGames({ lobbies: seen, now: Date.now(), me: stranger }).map(
        (game) => game.code
      )
    ).toContain(code);

    await as(stranger, () => joinLobby(code, stranger, "Stranger"));
    expect(
      (await openLobbiesSeenBy(uniqueUid("late"))).map((lobby) => lobby.code)
    ).not.toContain(code);
  });

  it("stay private until the host lists them", async () => {
    const host = uniqueUid("host");
    const { code } = await as(host, () => createLobby(host, "Host"));

    expect(
      (await openLobbiesSeenBy(uniqueUid("stranger"))).map(
        (lobby) => lobby.code
      )
    ).not.toContain(code);
    await denied(getDocs(collection(dbFor(uniqueUid("stranger")), "games")));
    await denied(
      getDocs(
        query(
          collection(dbFor(uniqueUid("stranger")), "games"),
          where("status", "==", "lobby")
        )
      )
    );
  });

  it("are listed only by the host, and never for a competition fixture", async () => {
    const host = uniqueUid("host");
    const guest = uniqueUid("guest");
    const { code } = await as(host, () => createLobby(host, "Host"));
    await as(guest, () => joinLobby(code, guest, "Guest"));
    await denied(as(guest, () => setLobbyListed(code, true)));

    const fixtureHost = uniqueUid("organizer");
    const fixtureLobby = await as(fixtureHost, () =>
      createLobby(fixtureHost, "Organizer", fixture)
    );
    await denied(as(fixtureHost, () => setLobbyListed(fixtureLobby.code, true)));
  });
});
