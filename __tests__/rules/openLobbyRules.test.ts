import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  ADMIN,
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
  commitSeed,
  createLobby,
  fetchLobby,
  getActiveMatchCode,
  heartbeat,
  joinLobby,
  leaveGuestSeat,
  type LobbyDoc,
  revealSeed,
  setLobbyListed,
  subscribeOpenLobbies,
} from "../../src/firebase/lobby";
import { openGames } from "../../src/social/openGames";
import { DEFAULT_SETTINGS } from "../../src/firebase/lobby";
import { createHumanTeam, createOrcTeam } from "../fixtures/teams";
import { fixtureValue } from "../../src/testing/fixtureValue";

const GONE = 15 * 60_000;

function openGameAppears(uid: string, code: string): Promise<boolean> {
  return as(
    uid,
    () =>
      new Promise((resolve) => {
        const timeout = setTimeout(() => {
          stop();
          resolve(false);
        }, 30_000);
        const stop = subscribeOpenLobbies((lobbies) => {
          const games = openGames({ lobbies, now: Date.now(), me: uid });
          if (games.every((game) => game.code !== code)) return;
          clearTimeout(timeout);
          stop();
          resolve(true);
        });
      })
  );
}

async function listedLobby({
  code,
  host,
  lastSeen,
}: {
  code: string;
  host: string;
  lastSeen: number;
}): Promise<void> {
  const ref = doc(dbFor(host), "games", code);
  await setDoc(ref, {
    code,
    hostUid: host,
    guestUid: null,
    status: "lobby",
    settings: DEFAULT_SETTINGS,
    players: { [host]: { uid: host, displayName: "Host", team: null, ready: false } },
    createdAt: null,
    listed: false,
  });
  await updateDoc(ref, { listed: true, [`players.${host}.lastSeen`]: lastSeen });
}

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
    const lobby = await as(host, () => createLobby(host, "Host"));
    const { code } = lobby;
    await as(host, () => setLobbyListed(lobby, true));
    await as(host, () => heartbeat(code, host));

    const seen = await openLobbiesSeenBy(stranger);
    expect(
      openGames({ lobbies: seen, now: Date.now(), me: stranger }).map(
        (game) => game.code
      )
    ).toContain(code);

    await as(stranger, () => joinLobby(code, stranger, "Stranger"));
    const lateLobbies = await openLobbiesSeenBy(uniqueUid("late"));
    expect(lateLobbies.map((lobby) => lobby.code)).not.toContain(code);
  });

  it("stay private until the host lists them", async () => {
    const host = uniqueUid("host");
    const { code } = await as(host, () => createLobby(host, "Host"));

    const strangerLobbies = await openLobbiesSeenBy(uniqueUid("stranger"));
    expect(strangerLobbies.map((lobby) => lobby.code)).not.toContain(code);
    await denied(getDocs(collection(dbFor(uniqueUid("stranger")), "games")));
    await denied(
      getDocs(
        query(
          collection(dbFor(uniqueUid("stranger")), "games"),
          where("status", "==", "lobby")
        )
      )
    );
    await denied(
      getDocs(
        query(
          collection(dbFor(uniqueUid("stranger")), "games"),
          where("listed", "==", true),
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
    await denied(updateDoc(doc(dbFor(guest), "games", code), { listed: true }));
    await denied(
      updateDoc(doc(dbFor(uniqueUid("stranger")), "games", code), { listed: true })
    );

    const born = uniqueUid("host");
    await denied(
      setDoc(doc(dbFor(born), "games", `B${String(Date.now()).slice(-5)}`), {
        code: "LISTED",
        hostUid: born,
        guestUid: null,
        status: "lobby",
        settings: DEFAULT_SETTINGS,
        players: { [born]: { uid: born, displayName: "Host", team: null, ready: false } },
        createdAt: null,
        listed: true,
      })
    );

    const fixtureHost = uniqueUid("organizer");
    const fixtureLobby = await as(fixtureHost, () =>
      createLobby(fixtureHost, "Organizer", fixture)
    );
    await denied(as(fixtureHost, () => setLobbyListed(fixtureLobby, true)));
  });

  it("can be taken off the list by anyone once the host has been gone five minutes", async () => {
    const host = uniqueUid("host");
    const stranger = uniqueUid("stranger");
    const code = `L${String(Date.now()).slice(-5)}`;
    await listedLobby({ code, host, lastSeen: Date.now() });
    const ref = doc(dbFor(stranger), "games", code);
    await denied(updateDoc(ref, { listed: false }));

    await updateDoc(doc(dbFor(host), "games", code), {
      [`players.${host}.lastSeen`]: Date.now() - GONE,
    });
    await denied(updateDoc(ref, { listed: false, status: "abandoned" }));
    await denied(updateDoc(ref, { listed: true }));
    await updateDoc(ref, { listed: false });
    const listedGame = await getDoc(doc(dbFor(ADMIN), "games", code));
    expect(listedGame.get("listed")).toBe(false);

    const started = `S${String(Date.now()).slice(-5)}`;
    await listedLobby({ code: started, host, lastSeen: Date.now() - GONE });
    await updateDoc(doc(dbFor(ADMIN), "games", started), { status: "active" });
    await denied(updateDoc(doc(dbFor(stranger), "games", started), { listed: false }));
  });

  it("are not hidden behind thirty lobbies whose hosts left", async () => {
    const run = String(Date.now()).slice(-4);
    const stale = Array.from({ length: 30 }, (_, index) => `0${run}${String(index).padStart(2, "0")}`
    );
    await Promise.all(
      stale.map((code) =>
        listedLobby({ code, host: uniqueUid("gone"), lastSeen: Date.now() - GONE })
      )
    );
    const live = `Z${run}01`;
    await listedLobby({ code: live, host: uniqueUid("here"), lastSeen: Date.now() });

    expect(await openGameAppears(uniqueUid("stranger"), live)).toBe(true);
    const first = await getDoc(doc(dbFor(ADMIN), "games", fixtureValue(stale[0])));
    expect(first.get("listed")).toBe(false);
  });

  it("let a guest give up their own seat while the lobby waits, and nothing else", async () => {
    const host = uniqueUid("host");
    const guest = uniqueUid("guest");
    const stranger = uniqueUid("stranger");
    const { code } = await as(host, () => createLobby(host, "Host"));
    await as(guest, () => joinLobby(code, guest, "Guest"));
    const ref = (uid: string) => doc(dbFor(uid), "games", code);

    await denied(updateDoc(ref(stranger), { guestUid: null, [`players.${guest}`]: deleteField() }));
    await denied(
      updateDoc(ref(guest), { guestUid: null, [`players.${guest}`]: deleteField(), listed: true })
    );
    await as(guest, () => leaveGuestSeat(code, guest));
    const left = await as(host, () => fetchLobby(code));
    expect([left?.guestUid, Object.keys(left?.players ?? {})]).toEqual([null, [host]]);
    expect(await as(guest, () => getActiveMatchCode(guest))).toBeNull();

    await as(guest, () => joinLobby(code, guest, "Guest"));
    await updateDoc(doc(dbFor(ADMIN), "games", code), { status: "active" });
    expect(await as(guest, () => leaveGuestSeat(code, guest))).toBe("active");
    const hostLobby = await as(host, () => fetchLobby(code));
    expect(hostLobby?.guestUid).toBe(guest);
    await denied(updateDoc(ref(guest), { guestUid: null, [`players.${guest}`]: deleteField() }));
  });

  it("clear both seeds when a guest leaves, so the host commits a fresh secret", async () => {
    const host = uniqueUid("host");
    const guest = uniqueUid("guest");
    const { code } = await as(host, () => createLobby(host, "Host"));
    await as(guest, () => joinLobby(code, guest, "Guest"));
    await as(host, () => commitSeed(code, host));
    await as(guest, () => commitSeed(code, guest));
    await as(host, () => revealSeed(code, host));
    const firstLobby = await as(host, () => fetchLobby(code));
    const first = firstLobby?.seedCommits?.[host];

    await denied(
      updateDoc(doc(dbFor(guest), "games", code), { guestUid: null, [`players.${guest}`]: deleteField() })
    );
    await as(guest, () => leaveGuestSeat(code, guest));
    const left = await as(host, () => fetchLobby(code));
    expect([left?.seedCommits ?? {}, left?.seedReveals ?? {}]).toEqual([{}, {}]);

    await as(host, () => commitSeed(code, host));
    const secondLobby = await as(host, () => fetchLobby(code));
    const second = secondLobby?.seedCommits?.[host];
    expect(second).toBeDefined();
    expect(second).not.toBe(first);
  });
});
