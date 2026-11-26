import { fixtureValue } from "../../src/testing/fixtureValue";
import { readFileSync } from "node:fs";
import { deleteApp, type FirebaseApp, initializeApp } from "firebase/app";
import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  Firestore,
  getDoc,
  getDocs,
  getFirestore,
  setDoc,
  terminate,
  updateDoc,
} from "firebase/firestore";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const EMULATOR = process.env["FIRESTORE_EMULATOR_HOST"];
const PROJECT = "demo-bloodbowl-rules";

const current = vi.hoisted((): { db: Firestore | null; uid: string } => ({
  db: null,
  uid: "",
}));
vi.mock("../../src/firebase/config", () => ({
  getDb: () => current.db,
  isFirebaseConfigured: () => true,
}));

vi.mock("../../src/firebase/auth", () => ({
  getCurrentUser: () => ({ uid: current.uid }),
}));

import {
  HOUSE_BOT_EMAIL,
  HOUSE_BOT_UID,
} from "../../src/firebase/houseBotAccount";
import {
  cancelEndMatch,
  commitSeed,
  closeHostedLobby,
  createLobby,
  finishMatch,
  heartbeat,
  joinLobby,
  type LobbyDoc,
  pauseClock,
  persistMatch,
  requestEndMatch,
  resumeClock,
  revealSeed,
  selectTeam,
  setCoinFlipChoice,
  setCoinFlipReady,
  setCoinFlipWinner,
  setReady,
  setTurnDeadline,
  startMatch,
  updateSettings,
  DEFAULT_SETTINGS,
} from "../../src/firebase/lobby";
import {
  closeWalkovers,
  recordCompetitionFixture,
  withdrawFromCompetition,
} from "../../src/competition/resultRecording";
import { getCompetition } from "../../src/competition/repository";
import {
  computeStandings,
  generateRoundRobin,
  generateSingleElimination,
  seedEntrants,
} from "../../src/competition/logic";
import {
  type CompetitionEntrant,
  DEFAULT_LEAGUE_POINTS,
  type LeagueDoc,
  type TournamentDoc,
} from "../../src/competition/types";
import { getTeamById, saveTeam } from "../../src/game/managers/TeamManager";
import { type Team } from "../../src/types/Team";
import { type SevensRuleset } from "../../src/game/rules/sevensRuleset";

const HOST = "host-uid";
const GUEST = "guest-uid";
const STRANGER = "stranger-uid";
const ORGANIZER = "organizer-uid";
const THIRD = "third-uid";
const ADMIN = "owner";

const BOT = HOUSE_BOT_UID;

const SQUATTER = "squatter-uid";

type EditableFixture = { id: string; status: string; result: unknown } & Record<
  string,
  unknown
>;

const apps: FirebaseApp[] = [];
const dbs = new Map<string, Firestore>();

function dbFor(uid: string): Firestore {
  const known = dbs.get(uid);
  if (known) return known;
  const app = initializeApp({ projectId: PROJECT }, uid);
  apps.push(app);
  const db = getFirestore(app);
  const [host, port] = fixtureValue(EMULATOR).split(":", 2);
  connectFirestoreEmulator(
    db,
    fixtureValue(host),
    Number(port),

    {
      mockUserToken:
        uid === ADMIN
          ? ADMIN
          : {
              sub: uid,
              user_id: uid,
              ...((uid === BOT || uid === SQUATTER) && { email: HOUSE_BOT_EMAIL }),
            },
    }
  );
  dbs.set(uid, db);
  return db;
}

function as<T>(uid: string, work: () => Promise<T>): Promise<T> {
  current.db = dbFor(uid);
  current.uid = uid;
  return work();
}

const game = (uid: string, code: string) => doc(dbFor(uid), "games", code);

const denied = (write: Promise<unknown>) =>
  expect(write).rejects.toMatchObject({ code: "permission-denied" });

const stored = async (code: string) => {
  const snapshot = await getDoc(game(ADMIN, code));
  return snapshot.data() as LobbyDoc;
};

const team = (id: string) => ({ id, name: id, players: [] }) as unknown as Team;

async function openLobby(): Promise<string> {
  const lobby = await as(HOST, () => createLobby(HOST, "Host"));
  return lobby.code;
}

async function joinedLobby(): Promise<string> {
  const code = await openLobby();
  await as(GUEST, () => joinLobby(code, GUEST, "Guest"));
  return code;
}

async function seededLobby(): Promise<string> {
  const code = await joinedLobby();
  await as(HOST, () => commitSeed(code, HOST));
  await as(GUEST, () => commitSeed(code, GUEST));
  await as(HOST, () => revealSeed(code, HOST));
  await as(GUEST, () => revealSeed(code, GUEST));
  return code;
}

async function markQuiet(code: string, ms: number): Promise<void> {
  await updateDoc(game(ADMIN, code), {
    [`players.${HOST}.lastSeen`]: Date.now() - ms,
  });
}

async function selectTeamDirectly(code: string): Promise<void> {
  await updateDoc(game(ADMIN, code), {
    [`players.${HOST}.team`]: { id: "host-team" },
    [`players.${GUEST}.team`]: { id: "guest-team" },
  });
}

async function activeMatch(): Promise<string> {
  const code = await seededLobby();
  await as(HOST, () =>
    startMatch({
      code,
      settings: DEFAULT_SETTINGS,
      hostUid: HOST,
      guestUid: GUEST,
    })
  );
  return code;
}

const entrants = (): CompetitionEntrant[] =>
  seedEntrants(
    [GUEST, HOST, THIRD, ORGANIZER].map((uid) => ({
      id: `e-${uid}`,
      teamId: `team-${uid}`,
      ownerUid: uid,
      coachUid: uid,
      name: uid,
      rosterName: "Human",
    }))
  );
const context = (comp: LeagueDoc | TournamentDoc, fixtureId: string) => ({
  competitionType: comp.type,
  competitionId: comp.id,
  fixtureId,
});

const leagueRef = (uid: string, id: string) =>
  doc(dbFor(uid), "leagues", id);

const storedLeague = async (id: string) => {
  const snapshot = await getDoc(leagueRef(ADMIN, id));
  return snapshot.data() as LeagueDoc;
};

const guestsFixture = (comp: LeagueDoc) => {
  const fixture = fixtureValue(
    comp.fixtures.find((f) =>
      [f.homeEntrantId, f.awayEntrantId].includes(`e-${GUEST}`)
    )
  );
  const rival = fixtureValue(
    [fixture.homeEntrantId, fixture.awayEntrantId].find(
      (id) => id !== `e-${GUEST}`
    )
  ).replace("e-", "");
  return { fixture, rival };
};

describe.skipIf(!EMULATOR)("firestore.rules", () => {
  beforeAll(async () => {
    const response = await fetch(
      `http://${String(EMULATOR)}/emulator/v1/projects/${PROJECT}:securityRules`,
      {
        method: "PUT",
        body: JSON.stringify({
          rules: {
            files: [{ content: readFileSync("firestore.rules", "utf8") }],
          },
        }),
      }
    );
    expect(response.ok, await response.text()).toBe(true);
  });

  afterAll(async () => {
    await Promise.all([...dbs.values()].map((db) => terminate(db)));
    await Promise.all(apps.map((app) => deleteApp(app)));
  });

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  describe("the house bot", () => {
    it("closes a lobby it hosts, with a coach still seated", async () => {
      const {code} = await as(BOT, () => createLobby(BOT, "House Bot"));
      await as(GUEST, () => joinLobby(code, GUEST, "Guest"));
      await as(BOT, () => closeHostedLobby(code, BOT));
      const lobbySnapshot = await getDoc(game(ADMIN, code));
      expect(lobbySnapshot.exists()).toBe(false);
    });

    it("keeps its pointer when an invite moved it first", async () => {
      const {code} = await as(BOT, () => createLobby(BOT, "House Bot"));
      await setDoc(doc(dbFor(BOT), "users", BOT), { activeMatchCode: "NEWER1" }, { merge: true });
      await as(BOT, () => closeHostedLobby(code, BOT));
      const botUser = await getDoc(doc(dbFor(ADMIN), "users", BOT));
      expect(botUser.data()?.["activeMatchCode"]).toBe("NEWER1");
    });

    it("keeps the old lobby announcement writable only by the bot's account", async () => {
      const code = await openLobby();
      await setDoc(doc(dbFor(BOT), "houseBots", BOT), { code, updatedAt: Date.now() });
      await denied(setDoc(doc(dbFor(HOST), "houseBots", HOST), { code, updatedAt: Date.now() }));
      await denied(setDoc(doc(dbFor(GUEST), "houseBots", BOT), { code, updatedAt: Date.now() }));
      await denied(setDoc(doc(dbFor(SQUATTER), "houseBots", SQUATTER), { code, updatedAt: Date.now() }));
    });
  });

  describe("a whole online match, as the app writes it", () => {
    it("is allowed from lobby to agreed end", async () => {
      const code = await openLobby();
      await as(GUEST, () => joinLobby(code, GUEST, "Guest"));
      await as(GUEST, () => joinLobby(code, GUEST, "Guest"));
      await as(HOST, () => selectTeam(code, HOST, team("host-team")));
      await as(GUEST, () => selectTeam(code, GUEST, team("guest-team")));
      await as(HOST, () => updateSettings(code, DEFAULT_SETTINGS));
      await as(HOST, () => commitSeed(code, HOST));
      await as(GUEST, () => commitSeed(code, GUEST));
      await as(HOST, () => revealSeed(code, HOST));
      await as(GUEST, () => revealSeed(code, GUEST));
      await as(HOST, () => setReady(code, HOST, true));
      await as(GUEST, () => setReady(code, GUEST, true));
      await as(HOST, () =>
        startMatch({
          code,
          settings: DEFAULT_SETTINGS,
          hostUid: HOST,
          guestUid: GUEST,
        })
      );

      await as(HOST, () => setCoinFlipReady(code, true));
      await as(GUEST, () => setCoinFlipReady(code, false));
      await as(HOST, () => setCoinFlipWinner(code, "guest-team"));
      await as(GUEST, () => setCoinFlipChoice(code, "guest-team"));
      await as(HOST, () => setTurnDeadline(code, Date.now(), "t:1:1"));
      await as(GUEST, () => setTurnDeadline(code, Date.now(), "t:1:2"));
      await as(HOST, () => heartbeat(code, HOST));
      await as(GUEST, () => heartbeat(code, GUEST));
      await as(GUEST, () => pauseClock(code, GUEST));
      await as(GUEST, () =>
        resumeClock({
          code: code,
          uid: GUEST,
          remainingBankMs: 1000,
          newDeadline: Date.now(),
        })
      );
      const resume = { rng: {}, matchStats: {}, applied: 3 } as never;
      await as(HOST, () => persistMatch(code, {} as never, resume));
      await as(GUEST, () => persistMatch(code, {} as never, resume));
      await as(HOST, () => requestEndMatch(code, HOST));
      await as(GUEST, () => cancelEndMatch(code));
      await as(GUEST, () => requestEndMatch(code, GUEST));
      await as(HOST, () => finishMatch(code, "finished"));

      const finishedMatch = await stored(code);
      expect(finishedMatch.status).toBe("finished");
    });

    it("lets a coach abandon once the other has gone, and it stays over", async () => {
      const code = await activeMatch();
      await markQuiet(code, 25_000);
      await as(GUEST, () => finishMatch(code, "abandoned"));
      await denied(updateDoc(game(HOST, code), { status: "active" }));
    });
  });

  describe("a stranger", () => {
    it("can fetch a lobby by code but cannot list games", async () => {
      const code = await openLobby();
      const strangerView = await getDoc(game(STRANGER, code));
      expect(strangerView.exists()).toBe(true);
      await denied(getDocs(collection(dbFor(STRANGER), "games")));
    });

    it("cannot take the host's seat with the guest seat", async () => {
      const code = await openLobby();
      await denied(
        updateDoc(game(STRANGER, code), {
          guestUid: STRANGER,
          hostUid: STRANGER,
        })
      );
      const seatedMatch = await stored(code);
      expect(seatedMatch.hostUid).toBe(HOST);
    });

    it("cannot change anything else while taking the seat", async () => {
      const code = await openLobby();
      const {players} = await stored(code);
      const mine = {
        uid: STRANGER,
        displayName: "S",
        team: null,
        ready: false,
      };
      await denied(
        updateDoc(game(STRANGER, code), {
          guestUid: STRANGER,
          status: "active",
          players: { ...players, [STRANGER]: mine },
        })
      );
      await denied(
        updateDoc(game(STRANGER, code), {
          guestUid: STRANGER,
          players: { [STRANGER]: mine },
        })
      );
    });

    it("cannot be the host taking their own guest seat", async () => {
      const code = await openLobby();
      await denied(updateDoc(game(HOST, code), { guestUid: HOST }));
    });

    it("cannot take a seat in someone else's name", async () => {
      const code = await openLobby();
      await denied(updateDoc(game(STRANGER, code), { guestUid: GUEST }));
    });

    it("cannot join a full lobby, write to a match, or delete anything", async () => {
      const code = await joinedLobby();
      await denied(updateDoc(game(STRANGER, code), { guestUid: STRANGER }));
      await denied(updateDoc(game(STRANGER, code), { status: "abandoned" }));
      await denied(deleteDoc(game(STRANGER, code)));
    });

    it("cannot create a lobby that is already joined or seeded", async () => {
      const base = {
        code: "EVILEE",
        hostUid: STRANGER,
        status: "lobby",
        settings: DEFAULT_SETTINGS,
        players: { [STRANGER]: { uid: STRANGER } },
      };
      const ref = game(STRANGER, "EVILEE");
      await denied(setDoc(ref, { ...base, guestUid: GUEST }));
      await denied(setDoc(ref, { ...base, guestUid: null, status: "active" }));
      await denied(
        setDoc(ref, { ...base, guestUid: null, seedCommits: { [GUEST]: "x" } })
      );
    });
  });

  describe("the other coach in a game", () => {
    it("cannot take the host's seat, then delete the match", async () => {
      const code = await activeMatch();
      await denied(updateDoc(game(GUEST, code), { hostUid: GUEST }));
      await denied(updateDoc(game(HOST, code), { guestUid: HOST }));
      await denied(deleteDoc(game(GUEST, code)));
      await denied(deleteDoc(game(HOST, code)));
      const storedMatch = await stored(code);
      expect(storedMatch.status).toBe("active");
    });

    it("cannot edit the other coach's player entry", async () => {
      const code = await joinedLobby();
      await denied(as(GUEST, () => setReady(code, HOST, true)));
      await denied(as(HOST, () => selectTeam(code, GUEST, team("worse"))));
    });

    it("cannot change their own team once the match has started", async () => {
      const code = await activeMatch();
      await denied(as(GUEST, () => selectTeam(code, GUEST, team("better"))));
      await as(GUEST, () => heartbeat(code, GUEST));
    });

    it("cannot end a live match alone while the other coach is still there", async () => {
      const code = await activeMatch();
      await denied(as(GUEST, () => finishMatch(code, "abandoned")));
      await as(HOST, () => heartbeat(code, HOST));
      await denied(as(GUEST, () => finishMatch(code, "abandoned")));
      await markQuiet(code, 10_000);
      await denied(as(GUEST, () => finishMatch(code, "abandoned")));
    });

    it("cannot declare a finish the other coach did not ask for", async () => {
      const code = await activeMatch();
      await denied(as(GUEST, () => finishMatch(code, "finished")));
      await as(GUEST, () => requestEndMatch(code, GUEST));
      await denied(as(GUEST, () => finishMatch(code, "finished")));
      await as(HOST, () => finishMatch(code, "finished"));
    });

    it("cannot stay present with a stamp from the future", async () => {
      const code = await activeMatch();
      await denied(
        updateDoc(game(GUEST, code), {
          [`players.${GUEST}.lastSeen`]: Date.now() + 3_600_000,
        })
      );
    });

    it("cannot close a lobby, nor can the host start one before the seed", async () => {
      const code = await joinedLobby();
      await denied(as(GUEST, () => finishMatch(code, "abandoned")));
      await denied(
        as(HOST, () =>
          startMatch({
            code,
            settings: DEFAULT_SETTINGS,
            hostUid: HOST,
            guestUid: GUEST,
          })
        )
      );
    });

    it("cannot write the other coach's part of the toss, or write it twice", async () => {
      const code = await activeMatch();
      await as(HOST, () => selectTeamDirectly(code));
      await denied(as(GUEST, () => setCoinFlipReady(code, true)));
      await denied(as(GUEST, () => setCoinFlipWinner(code, "guest-team")));
      await as(HOST, () => setCoinFlipReady(code, true));
      await denied(as(HOST, () => setCoinFlipWinner(code, "host-team")));
      await as(GUEST, () => setCoinFlipReady(code, false));
      await denied(as(GUEST, () => setCoinFlipWinner(code, "guest-team")));
      await as(HOST, () => setCoinFlipWinner(code, "guest-team"));
      await denied(as(HOST, () => setCoinFlipWinner(code, "host-team")));
      await denied(as(HOST, () => setCoinFlipChoice(code, "host-team")));
      await as(GUEST, () => setCoinFlipChoice(code, "guest-team"));
      await denied(as(GUEST, () => setCoinFlipChoice(code, "host-team")));
    });

    it("cannot spend the other coach's clock or pause in their name", async () => {
      const code = await activeMatch();
      await denied(as(GUEST, () => pauseClock(code, HOST)));
      await denied(
        as(GUEST, () =>
          resumeClock({
            code: code,
            uid: HOST,
            remainingBankMs: 0,
            newDeadline: Date.now(),
          })
        )
      );
      await as(GUEST, () => pauseClock(code, GUEST));
      await as(GUEST, () =>
        resumeClock({
          code: code,
          uid: GUEST,
          remainingBankMs: 1000,
          newDeadline: Date.now(),
        })
      );
    });

    it("cannot start the match or change settings unless they host", async () => {
      const code = await seededLobby();
      await denied(
        as(GUEST, () =>
          startMatch({
            code,
            settings: DEFAULT_SETTINGS,
            hostUid: HOST,
            guestUid: GUEST,
          })
        )
      );
      await denied(
        as(GUEST, () =>
          updateSettings(code, { ...DEFAULT_SETTINGS, turnSeconds: 1 })
        )
      );
    });

    it("cannot speak for the other coach in an end request", async () => {
      const code = await activeMatch();
      await denied(as(GUEST, () => requestEndMatch(code, HOST)));
    });
  });

  describe("the shared seed", () => {
    it("takes each coach's own commit and reveal only", async () => {
      const code = await joinedLobby();
      await denied(as(GUEST, () => commitSeed(code, HOST)));
      await as(HOST, () => commitSeed(code, HOST));
      await as(GUEST, () => commitSeed(code, GUEST));
      await denied(as(GUEST, () => revealSeed(code, HOST)));
    });

    it("refuses a reveal until both coaches have committed", async () => {
      const code = await joinedLobby();
      await as(HOST, () => commitSeed(code, HOST));
      await denied(as(HOST, () => revealSeed(code, HOST)));
    });

    it("refuses a second commit or reveal, so nobody can pick the seed late", async () => {
      const code = await joinedLobby();
      await as(HOST, () => commitSeed(code, HOST));
      await as(GUEST, () => commitSeed(code, GUEST));
      await as(HOST, () => revealSeed(code, HOST));
      await denied(
        updateDoc(game(GUEST, code), { [`seedCommits.${GUEST}`]: "chosen" })
      );
      await denied(
        updateDoc(game(HOST, code), { [`seedReveals.${HOST}`]: "chosen" })
      );
    });
  });

  describe("a competition participant", () => {
    it.each(["leagues", "tournaments"])(
      "keeps the selected Sevens rules fixed in %s, including for the organizer",
      async (collectionName) => {
        const ref = doc(
          dbFor(ORGANIZER),
          collectionName,
          `rules-${collectionName}`
        );
        await setDoc(ref, {
          organizerUid: ORGANIZER,
          ruleset: "naf-sevens-2026-09-26",
          name: "NAF season",
        });
        await expect(
          updateDoc(ref, { name: "Renamed season" })
        ).resolves.toBeUndefined();
        await expect(updateDoc(ref, { ruleset: "gw-2025" })).rejects.toThrow();
        await expect(
          setDoc(
            doc(dbFor(ORGANIZER), collectionName, `unknown-${collectionName}`),
            { organizerUid: ORGANIZER, ruleset: "naf-latest" }
          )
        ).rejects.toThrow();
      }
    );

    it.each(["leagues", "tournaments"])(
      "keeps a game type fixed in %s and refuses an unknown one",
      async (collectionName) => {
        const ref = doc(
          dbFor(ORGANIZER),
          collectionName,
          `street-${collectionName}`
        );
        await setDoc(ref, {
          organizerUid: ORGANIZER,
          gameType: "street-bowl",
          name: "Street season",
        });
        await expect(
          updateDoc(ref, { name: "Renamed street season" })
        ).resolves.toBeUndefined();
        await expect(updateDoc(ref, { gameType: "sevens" })).rejects.toThrow();
        await expect(
          setDoc(
            doc(dbFor(ORGANIZER), collectionName, `dungeon-${collectionName}`),
            { organizerUid: ORGANIZER, gameType: "dungeon-bowl" }
          )
        ).rejects.toThrow();
      }
    );

    it.each(["leagues", "tournaments"])(
      "lets the organizer edit a %s document saved before game types",
      async (collectionName) => {
        const ref = doc(
          dbFor(ORGANIZER),
          collectionName,
          `legacy-${collectionName}`
        );
        await setDoc(ref, { organizerUid: ORGANIZER, name: "Old season" });
        await expect(
          updateDoc(ref, { name: "Old season, renamed" })
        ).resolves.toBeUndefined();
        await expect(
          updateDoc(ref, { gameType: "sevens" })
        ).resolves.toBeUndefined();
        await expect(
          updateDoc(ref, { gameType: "beach-bowl" })
        ).rejects.toThrow();
      }
    );


    let nextId = 0;

    async function league(ruleset?: SevensRuleset): Promise<LeagueDoc> {
      const list = entrants();
      const fixtures = generateRoundRobin(list);
      const doc_: LeagueDoc = {
        id: `league-${String(Date.now())}-${String(nextId++)}`,
        type: "league",
        name: "League",
        ...(ruleset !== undefined && { ruleset }),
        organizerUid: ORGANIZER,
        participantUids: [HOST, GUEST, THIRD, ORGANIZER],
        status: "active",
        entrants: list,
        fixtures,
        standings: computeStandings(list, fixtures, DEFAULT_LEAGUE_POINTS),
        points: DEFAULT_LEAGUE_POINTS,
        createdAt: 1,
        updatedAt: 1,
      };
      await setDoc(
        doc(dbFor(ORGANIZER), "leagues", doc_.id),
        JSON.parse(JSON.stringify(doc_))
      );
      return doc_;
    }

    async function tournament(ruleset?: SevensRuleset): Promise<TournamentDoc> {
      const list = entrants();
      const fixtures = generateSingleElimination(list);
      const doc_: TournamentDoc = {
        id: `cup-${String(Date.now())}-${String(nextId++)}`,
        type: "tournament",
        name: "Cup",
        ...(ruleset !== undefined && { ruleset }),
        organizerUid: ORGANIZER,
        participantUids: [HOST, GUEST, THIRD, ORGANIZER],
        status: "active",
        format: "single-elimination",
        entrants: list,
        fixtures,
        standings: computeStandings(list, fixtures),
        createdAt: 1,
        updatedAt: 1,
      };
      await setDoc(
        doc(dbFor(ORGANIZER), "tournaments", doc_.id),
        JSON.parse(JSON.stringify(doc_))
      );
      return doc_;
    }



    it.each([undefined, "gw-2025", "naf-sevens-2026-09-26"] as const)(
      "can report a league result and withdraw their own team with ruleset %s",
      async (ruleset) => {
        const comp = await league(ruleset);
        const { fixture } = guestsFixture(comp);
        const updated = await as(GUEST, () =>
          recordCompetitionFixture({
            context: context(comp, fixture.id),
            homeScore: 2,
            awayScore: 1,
          })
        );
        expect(updated.fixtures.find((f) => f.id === fixture.id)?.status).toBe(
          "complete"
        );

        const after = await as(GUEST, () =>
          withdrawFromCompetition(
            { competitionType: "league", competitionId: comp.id },
            `e-${GUEST}`
          )
        );
        expect(
          after.entrants.find((e) => e.id === `e-${GUEST}`)?.withdrawn
        ).toBe(true);
        const leagueSnapshot = await getDoc(leagueRef(ADMIN, comp.id));
        const stored = leagueSnapshot.data();
        expect(fixtureValue(stored)?.["ruleset"]).toBe(ruleset);
        await denied(
          updateDoc(leagueRef(GUEST, comp.id), {
            ruleset:
              ruleset === "naf-sevens-2026-09-26"
                ? "gw-2025"
                : "naf-sevens-2026-09-26",
          })
        );
      }
    );


    it("closes a withdrawn team's games as walkovers", async () => {
      const comp = await league();
      await as(GUEST, () =>
        withdrawFromCompetition(
          { competitionType: "league", competitionId: comp.id },
          `e-${GUEST}`
        )
      );
      const leagueDoc = await storedLeague(comp.id);
      const games = leagueDoc.fixtures.filter((f) =>
        [f.homeEntrantId, f.awayEntrantId].includes(`e-${GUEST}`)
      );
      expect(games).toHaveLength(3);
      for (const game of games) {
        expect(game.status).toBe("complete");
        expect(game.result?.walkover).toEqual({ withdrawnEntrantIndex: 0 });
      }
    });

    it("closes every game of a big league", async () => {
      const list = seedEntrants(
        [GUEST, ...Array.from({ length: 10 }, () => HOST)].map(
          (uid, index) => ({
            id: `e-${String(index)}`,
            teamId: `team-${String(index)}`,
            ownerUid: uid,
            coachUid: uid,
            name: `Team ${String(index)}`,
            rosterName: "Human",
          })
        )
      );
      const fixtures = generateRoundRobin(list);
      const big: LeagueDoc = {
        id: `league-big-${String(Date.now())}`,
        type: "league",
        name: "Big League",
        organizerUid: ORGANIZER,
        participantUids: [HOST, GUEST, ORGANIZER],
        status: "active",
        entrants: list,
        fixtures,
        standings: computeStandings(list, fixtures, DEFAULT_LEAGUE_POINTS),
        points: DEFAULT_LEAGUE_POINTS,
        createdAt: 1,
        updatedAt: 1,
      };
      await setDoc(
        leagueRef(ORGANIZER, big.id),
        JSON.parse(JSON.stringify(big))
      );
      await as(GUEST, () =>
        withdrawFromCompetition(
          { competitionType: "league", competitionId: big.id },
          "e-0"
        )
      );

      const bigLeague = await storedLeague(big.id);
      expect(
        bigLeague.fixtures.filter((f) => f.result?.walkover)
      ).toHaveLength(10);
    });

    it("cannot fake a walkover, or hide a played result as one", async () => {
      const comp = await league();
      const { fixture, rival } = guestsFixture(comp);
      const guestIndex = comp.entrants.findIndex((e) => e.id === `e-${GUEST}`);
      const walkover = (
        fixtures: LeagueDoc["fixtures"],
        result: Record<string, unknown>
      ) => {
        const copy = JSON.parse(JSON.stringify(fixtures));
        const game = copy.find((f: { id: string }) => f.id === fixture.id);
        game.status = "complete";
        game.result = { homeScore: 0, awayScore: 0, completedAt: 1, ...result };
        return copy;
      };
      const rivalWins = {
        winnerEntrantId: `e-${rival}`,
        walkover: { withdrawnEntrantIndex: guestIndex },
      };

      await denied(
        updateDoc(leagueRef(HOST, comp.id), {
          fixtures: walkover(comp.fixtures, rivalWins),
        })
      );

      await denied(
        updateDoc(leagueRef(GUEST, comp.id), {
          fixtures: walkover(comp.fixtures, {
            ...rivalWins,
            homeScore: fixture.homeEntrantId === `e-${GUEST}` ? 0 : 2,
            awayScore: fixture.homeEntrantId === `e-${GUEST}` ? 2 : 0,
          }),
        })
      );

      await updateDoc(leagueRef(ADMIN, comp.id), {
        entrants: comp.entrants.map((e) =>
          e.id === `e-${GUEST}` ? { ...e, withdrawn: true } : e
        ),
      });
      await denied(
        updateDoc(leagueRef(HOST, comp.id), {
          fixtures: walkover(comp.fixtures, {
            ...rivalWins,
            winnerEntrantId: `e-${GUEST}`,
          }),
        })
      );
      await updateDoc(leagueRef(HOST, comp.id), {
        fixtures: walkover(comp.fixtures, rivalWins),
      });
    });

    it("never records an online result only in a stale local copy", async () => {
      const comp = await league();

      localStorage.setItem(
        "bloodbowl_competitions",
        JSON.stringify({ [`league:${comp.id}`]: comp })
      );
      const { fixture } = guestsFixture(comp);

      await expect(
        as(STRANGER, () =>
          recordCompetitionFixture({
            context: context(comp, fixture.id),
            homeScore: 2,
            awayScore: 1,
          })
        )
      ).rejects.toMatchObject({ code: "permission-denied" });
      const copy = JSON.parse(
        fixtureValue(localStorage.getItem("bloodbowl_competitions"))
      );
      expect(
        copy[`league:${comp.id}`].fixtures.find(
          (f: { id: string }) => f.id === fixture.id
        ).status
      ).toBe("ready");
    });

    it("reports a refused online write even with a local competition of the same id", async () => {
      const comp = await league();
      localStorage.setItem(
        "bloodbowl_competitions",
        JSON.stringify({
          [`league:${comp.id}`]: { ...comp, organizerUid: null },
        })
      );
      const { fixture } = guestsFixture(comp);
      await expect(
        as(STRANGER, () =>
          recordCompetitionFixture({
            context: context(comp, fixture.id),
            homeScore: 2,
            awayScore: 1,
          })
        )
      ).rejects.toMatchObject({ code: "permission-denied" });
    });

    it("refuses a result for an online competition gone from the server", async () => {
      const comp = await league();
      localStorage.setItem(
        "bloodbowl_competitions",
        JSON.stringify({ [`league:${comp.id}`]: comp })
      );
      await deleteDoc(leagueRef(ORGANIZER, comp.id));
      const { fixture } = guestsFixture(comp);
      await expect(
        as(GUEST, () =>
          recordCompetitionFixture({
            context: context(comp, fixture.id),
            homeScore: 2,
            awayScore: 1,
          })
        )
      ).rejects.toThrow("Competition not found.");
      const copy = JSON.parse(
        fixtureValue(localStorage.getItem("bloodbowl_competitions"))
      );
      expect(
        copy[`league:${comp.id}`].fixtures.find(
          (f: { id: string }) => f.id === fixture.id
        ).status
      ).toBe("ready");
    });

    it("keeps a result recorded after the organizer loaded the page", async () => {
      const comp = await league();

      await updateDoc(leagueRef(ADMIN, comp.id), {
        entrants: comp.entrants.map((e) =>
          e.id === `e-${HOST}` ? { ...e, withdrawn: true } : e
        ),
      });
      const stale = await as(ORGANIZER, () =>
        getCompetition("league", comp.id)
      );
      const played = fixtureValue(
        comp.fixtures.find(
          (f) =>
            [f.homeEntrantId, f.awayEntrantId].includes(`e-${GUEST}`) &&
            [f.homeEntrantId, f.awayEntrantId].includes(`e-${THIRD}`)
        )
      );
      await as(GUEST, () =>
        recordCompetitionFixture({
          context: context(comp, played.id),
          homeScore: 2,
          awayScore: 1,
        })
      );

      await as(ORGANIZER, () => closeWalkovers(fixtureValue(stale)));

      const stored = await storedLeague(comp.id);
      expect(
        stored.fixtures.find((f) => f.id === played.id)?.result
      ).toMatchObject({ homeScore: 2, awayScore: 1 });
      expect(stored.fixtures.filter((f) => f.result?.walkover)).toHaveLength(3);
    });

    it("sends a withdrawn team's knockout opponent through", async () => {
      const comp = await tournament();
      const first = fixtureValue(
        comp.fixtures.find(
          (f) =>
            f.round === 1 &&
            [f.homeEntrantId, f.awayEntrantId].includes(`e-${GUEST}`)
        )
      );
      const rival =
        first.homeEntrantId === `e-${GUEST}`
          ? first.awayEntrantId
          : first.homeEntrantId;
      await as(GUEST, () =>
        withdrawFromCompetition(
          { competitionType: "tournament", competitionId: comp.id },
          `e-${GUEST}`
        )
      );
      const tournamentSnapshot = await getDoc(
        doc(dbFor(ADMIN), "tournaments", comp.id)
      );
      const stored = tournamentSnapshot.data() as TournamentDoc;
      const final = fixtureValue(
        stored.fixtures.find((f) => f.id === first.nextFixtureId)
      );
      expect([final.homeEntrantId, final.awayEntrantId]).toContain(rival);
    });

    it("walks over a knockout game whose opponent arrives after the withdrawal", async () => {
      const comp = await tournament();
      const semi = fixtureValue(
        comp.fixtures.find(
          (f) =>
            f.round === 1 &&
            [f.homeEntrantId, f.awayEntrantId].includes(`e-${GUEST}`)
        )
      );
      const guestHome = semi.homeEntrantId === `e-${GUEST}`;
      await as(GUEST, () =>
        recordCompetitionFixture({
          context: context(comp, semi.id),
          homeScore: guestHome ? 2 : 0,
          awayScore: guestHome ? 0 : 2,
        })
      );
      await as(GUEST, () =>
        withdrawFromCompetition(
          { competitionType: "tournament", competitionId: comp.id },
          `e-${GUEST}`
        )
      );
      const other = fixtureValue(
        comp.fixtures.find((f) => f.round === 1 && f.id !== semi.id)
      );
      const reporter = fixtureValue(other.homeEntrantId).replace("e-", "");
      await as(reporter, () =>
        recordCompetitionFixture({
          context: context(comp, other.id),
          homeScore: 2,
          awayScore: 1,
        })
      );
      const tournamentSnapshot = await getDoc(
        doc(dbFor(ADMIN), "tournaments", comp.id)
      );
      const stored = tournamentSnapshot.data() as TournamentDoc;
      const final = fixtureValue(
        stored.fixtures.find((f) => f.id === semi.nextFixtureId)
      );
      expect(final.status).toBe("complete");
      expect(final.result?.walkover).toBeDefined();
      expect(final.result?.winnerEntrantId).toBe(other.homeEntrantId);
    });

    it("can report a tournament match, which advances the winner", async () => {
      const comp = await tournament();
      const first = fixtureValue(
        comp.fixtures.find((f) => f.status === "ready")
      );
      const updated = await as(GUEST, () =>
        recordCompetitionFixture({
          context: context(comp, first.id),
          homeScore: 2,
          awayScore: 1,
        })
      );
      const next = fixtureValue(
        updated.fixtures.find((f) => f.id === first.nextFixtureId)
      );
      const winner = first.homeEntrantId;
      expect([next.homeEntrantId, next.awayEntrantId]).toContain(winner);
    });

    it.each([undefined, "gw-2025", "naf-sevens-2026-09-26"] as const)(
      "can report a knockout game won on Penalties with ruleset %s, which advances the winner",
      async (ruleset) => {
        const comp = await tournament(ruleset);
        const mine = fixtureValue(
          comp.fixtures.find(
            (f) =>
              f.status === "ready" &&
              [f.homeEntrantId, f.awayEntrantId].includes(`e-${GUEST}`)
          )
        );
        const updated = await as(GUEST, () =>
          recordCompetitionFixture({
            context: context(comp, mine.id),
            homeScore: 1,
            awayScore: 1,
            penalties: {
              home: 2,
              away: 3,
            },
          })
        );
        const next = fixtureValue(
          updated.fixtures.find((f) => f.id === mine.nextFixtureId)
        );
        expect([next.homeEntrantId, next.awayEntrantId]).toContain(
          mine.awayEntrantId
        );
        const ref = doc(dbFor(GUEST), "tournaments", comp.id);
        const refSnapshot = await getDoc(ref);
        expect(fixtureValue(refSnapshot.data())?.["ruleset"]).toBe(ruleset);
        await denied(
          updateDoc(ref, {
            ruleset:
              ruleset === "naf-sevens-2026-09-26"
                ? "gw-2025"
                : "naf-sevens-2026-09-26",
          })
        );
      }
    );

    it("cannot name a Penalties winner the shoot-out does not support, or in a league", async () => {
      const cup = await tournament();
      const mine = fixtureValue(
        cup.fixtures.find(
          (f) =>
            f.status === "ready" &&
            [f.homeEntrantId, f.awayEntrantId].includes(`e-${GUEST}`)
        )
      );
      const reporterEntrantIndex = cup.entrants.findIndex(
        (e) => e.ownerUid === GUEST
      );
      const reportLevel = (
        ref: ReturnType<typeof doc>,
        all: { id: string }[],
        fixtureId: string,
        penalties: unknown,
        winnerEntrantId: string | null
      ) => {
        const fixtures = JSON.parse(JSON.stringify(all));
        const target = fixtures.find((f: { id: string }) => f.id === fixtureId);
        target.status = "complete";
        target.result = {
          homeScore: 1,
          awayScore: 1,
          penalties,
          winnerEntrantId,
          completedAt: 1,
        };
        return updateDoc(ref, { fixtures, reporterEntrantIndex });
      };
      const cupRef = doc(dbFor(GUEST), "tournaments", cup.id);
      for (const [penalties, winner] of [
        [{ home: 3, away: 2 }, mine.awayEntrantId],

        [{ home: 2, away: 2 }, mine.homeEntrantId],
        [{ home: 3, away: 1 }, mine.homeEntrantId],
      ] as const) {
        await denied(
          reportLevel(cupRef, cup.fixtures, mine.id, penalties, winner)
        );
      }

      const comp = await league();
      const { fixture } = guestsFixture(comp);
      await denied(
        reportLevel(
          leagueRef(GUEST, comp.id),
          comp.fixtures,
          fixture.id,
          { home: 3, away: 2 },
          fixture.homeEntrantId
        )
      );

      await reportLevel(
        leagueRef(GUEST, comp.id),
        comp.fixtures,
        fixture.id,
        null,
        null
      );
    });

    it("sees the result stand when the other coach reports first", async () => {
      const comp = await league();
      const { fixture, rival } = guestsFixture(comp);

      const stale = structuredClone(comp);
      await as(rival, () =>
        recordCompetitionFixture({
          context: context(comp, fixture.id),
          homeScore: 2,
          awayScore: 1,
        })
      );
      const staleFixture = fixtureValue(
        stale.fixtures.find((f) => f.id === fixture.id)
      );
      staleFixture.status = "complete";
      staleFixture.result = {
        homeScore: 2,
        awayScore: 1,
        completedAt: 999,
      };
      stale.reporterEntrantIndex = stale.entrants.findIndex(
        (e) => e.ownerUid === GUEST
      );
      await denied(
        setDoc(leagueRef(GUEST, comp.id), JSON.parse(JSON.stringify(stale)))
      );

      const raced = await as(GUEST, () =>
        recordCompetitionFixture({
          context: context(comp, fixture.id),
          homeScore: 2,
          awayScore: 1,
        })
      );
      expect(
        raced.fixtures.find((f) => f.id === fixture.id)?.result?.homeScore
      ).toBe(2);
    });

    it("counts the result for the later coach's team, once", async () => {
      const comp = await league();
      const { fixture, rival } = guestsFixture(comp);
      const guestTeam = fixtureValue(
        comp.entrants.find((e) => e.ownerUid === GUEST)
      );
      const homeIsGuest = fixture.homeEntrantId === guestTeam.id;
      saveTeam(team(guestTeam.teamId));
      await as(rival, () =>
        recordCompetitionFixture({
          context: context(comp, fixture.id),
          homeScore: 2,
          awayScore: 1,
        })
      );
      localStorage.clear();
      saveTeam(team(guestTeam.teamId));

      const report = () =>
        as(GUEST, () =>
          recordCompetitionFixture({
            context: context(comp, fixture.id),
            homeScore: 2,
            awayScore: 1,
          })
        );
      await report();
      await report();

      const counted = fixtureValue(getTeamById(guestTeam.teamId));
      expect([counted.wins ?? 0, counted.losses ?? 0]).toEqual(
        homeIsGuest ? [1, 0] : [0, 1]
      );
    });

    it("cannot put an open competition back to draft, or open a draft", async () => {
      const comp = await league();
      await denied(updateDoc(leagueRef(GUEST, comp.id), { status: "draft" }));
      await updateDoc(leagueRef(ORGANIZER, comp.id), { status: "draft" });
      await denied(updateDoc(leagueRef(GUEST, comp.id), { status: "active" }));
    });

    it("counts a same-named fixture in another competition", async () => {
      const first = await league();
      const second = await league();
      const { fixture } = guestsFixture(first);
      const guestTeam = fixtureValue(
        first.entrants.find((e) => e.ownerUid === GUEST)
      );
      expect(second.fixtures.map((f) => f.id)).toContain(fixture.id);
      saveTeam(team(guestTeam.teamId));
      for (const comp of [first, second]) {
        await as(GUEST, () =>
          recordCompetitionFixture({
            context: context(comp, fixture.id),
            homeScore: 2,
            awayScore: 1,
          })
        );
      }
      const counted = fixtureValue(getTeamById(guestTeam.teamId));
      expect((counted.wins ?? 0) + (counted.losses ?? 0)).toBe(2);
    });

    it("cannot complete a fixture without a real result, or relink a bracket", async () => {
      const comp = await league();

      const { fixture } = guestsFixture(comp);
      const reporterEntrantIndex = comp.entrants.findIndex(
        (e) => e.ownerUid === GUEST
      );
      for (const result of [
        undefined,
        { homeScore: -1, awayScore: "two", completedAt: 1 },
      ]) {
        const fixtures = JSON.parse(JSON.stringify(comp.fixtures));
        const target = fixtures.find(
          (f: { id: string }) => f.id === fixture.id
        );
        target.status = "complete";
        if (result) target.result = result;
        await denied(
          updateDoc(leagueRef(GUEST, comp.id), {
            fixtures,
            reporterEntrantIndex,
          })
        );
      }

      const cup = await tournament();
      const fixtures = JSON.parse(JSON.stringify(cup.fixtures));
      const linked = fixtures.findIndex(
        (f: { nextFixtureId?: string }) => f.nextFixtureId
      );
      fixtures[linked].nextFixtureId = "somewhere-else";
      await denied(
        updateDoc(doc(dbFor(GUEST), "tournaments", cup.id), { fixtures })
      );
    });

    it("cannot report a fixture they are not in, even naming a team of theirs", async () => {
      const comp = await league();
      const { fixture } = guestsFixture(comp);
      const outsider = fixtureValue(
        [HOST, THIRD, ORGANIZER].find(
          (uid) =>
            uid !== ORGANIZER &&
            ![fixture.homeEntrantId, fixture.awayEntrantId].includes(`e-${uid}`)
        )
      );
      await denied(
        as(outsider, () =>
          recordCompetitionFixture({
            context: context(comp, fixture.id),
            homeScore: 9,
            awayScore: 0,
          })
        )
      );
      const forged = JSON.parse(JSON.stringify(comp.fixtures));
      const target = forged.find((f: { id: string }) => f.id === fixture.id);
      target.status = "complete";
      target.result = { homeScore: 9, awayScore: 0, completedAt: 1 };
      for (const reporterEntrantIndex of [
        comp.entrants.findIndex((e) => e.ownerUid === outsider),
        comp.entrants.findIndex((e) => e.ownerUid === GUEST),
      ]) {
        await denied(
          updateDoc(leagueRef(outsider, comp.id), {
            fixtures: forged,
            reporterEntrantIndex,
          })
        );
      }
    });

    it("can be reported by the organizer, who need not play in it", async () => {
      const comp = await league();
      const fixture = fixtureValue(
        comp.fixtures.find(
          (f) => ![f.homeEntrantId, f.awayEntrantId].includes(`e-${ORGANIZER}`)
        )
      );
      const updated = await as(ORGANIZER, () =>
        recordCompetitionFixture({
          context: context(comp, fixture.id),
          homeScore: 1,
          awayScore: 0,
        })
      );
      expect(updated.fixtures.find((f) => f.id === fixture.id)?.status).toBe(
        "complete"
      );
    });

    it("cannot fake a bye, or fill a later slot with anyone but a winner", async () => {
      const comp = await league();
      const { fixture } = guestsFixture(comp);
      const bye = JSON.parse(JSON.stringify(comp.fixtures));
      const faked = bye.find((f: { id: string }) => f.id === fixture.id);
      faked.status = "complete";
      faked.result = { homeScore: 0, awayScore: 0, bye: true, completedAt: 0 };
      await denied(updateDoc(leagueRef(GUEST, comp.id), { fixtures: bye }));

      const cup = await tournament();
      const fixtures = JSON.parse(JSON.stringify(cup.fixtures));
      const later = fixtures.find(
        (f: { sourceFixtureIds?: string[] }) => f.sourceFixtureIds?.length
      );
      later.homeEntrantId = `e-${GUEST}`;
      await denied(
        updateDoc(doc(dbFor(GUEST), "tournaments", cup.id), { fixtures })
      );

      const emptyFinal = JSON.parse(JSON.stringify(cup.fixtures));
      const final = emptyFinal.find(
        (f: { nextFixtureId?: string }) => !f.nextFixtureId
      );
      final.status = "complete";
      final.result = {
        homeScore: 0,
        awayScore: 0,
        winnerEntrantId: `e-${GUEST}`,
        bye: true,
        completedAt: 0,
      };
      await denied(
        updateDoc(doc(dbFor(GUEST), "tournaments", cup.id), {
          fixtures: emptyFinal,
        })
      );
    });

    it("cannot name a winner the scores do not support, or send one down the wrong branch", async () => {
      const cup = await tournament();
      const ready = cup.fixtures.filter((f) => f.status === "ready");
      const mine = fixtureValue(
        ready.find((f) =>
          [f.homeEntrantId, f.awayEntrantId].includes(`e-${GUEST}`)
        )
      );
      const reporterEntrantIndex = cup.entrants.findIndex(
        (e) => e.ownerUid === GUEST
      );
      const cupRef = doc(dbFor(GUEST), "tournaments", cup.id);
      const write = (edit: (fixtures: EditableFixture[]) => void) => {
        const fixtures = JSON.parse(JSON.stringify(cup.fixtures));
        edit(fixtures);
        return updateDoc(cupRef, { fixtures, reporterEntrantIndex });
      };
      const report = (
        fixtures: EditableFixture[],
        winnerEntrantId: string | null
      ) => {
        const target = fixtureValue(fixtures.find((f) => f.id === mine.id));
        target.status = "complete";
        target.result = {
          homeScore: 2,
          awayScore: 1,
          winnerEntrantId,
          completedAt: 1,
        };
      };

      for (const winner of [mine.awayEntrantId, `e-${THIRD}`]) {
        await denied(
          write((fixtures) => {
            report(fixtures, winner);
          })
        );
      }

      await denied(
        write((fixtures) => {
          report(fixtures, mine.homeEntrantId);
          const next = fixtureValue(
            fixtures.find((f) => f["id"] === mine.nextFixtureId)
          );
          const wrong = mine.nextSlot === "home" ? "away" : "home";
          next[`${wrong}EntrantId`] = mine.homeEntrantId;
        })
      );
    });

    it("cannot advance anyone from an unfinished fixture, or jam a slot", async () => {
      const cup = await tournament();
      const cupRef = doc(dbFor(GUEST), "tournaments", cup.id);
      const source = fixtureValue(
        cup.fixtures.find((f) => f.status === "ready" && f.nextFixtureId)
      );
      const slot = `${String(source.nextSlot)}EntrantId`;
      const unfinished = JSON.parse(JSON.stringify(cup.fixtures));
      unfinished.find((f: { id: string }) => f.id === source.id).result = {
        homeScore: 0,
        awayScore: 0,
        winnerEntrantId: `e-${THIRD}`,
        completedAt: 1,
      };
      unfinished.find((f: { id: string }) => f.id === source.nextFixtureId)[
        slot
      ] = `e-${THIRD}`;
      await denied(updateDoc(cupRef, { fixtures: unfinished }));

      const jammed = JSON.parse(JSON.stringify(cup.fixtures));
      jammed.find((f: { id: string }) => f.id === source.nextFixtureId)[slot] =
        "";
      await denied(updateDoc(cupRef, { fixtures: jammed }));
    });

    it("cannot store a far-future stamp when hosting or joining", async () => {
      const stamp = Date.now() + 3_600_000;
      const ref = game(STRANGER, "FUTURE");
      await denied(
        setDoc(ref, {
          code: "FUTURE",
          hostUid: STRANGER,
          guestUid: null,
          status: "lobby",
          settings: DEFAULT_SETTINGS,
          players: { [STRANGER]: { uid: STRANGER, lastSeen: stamp } },
        })
      );
      const code = await openLobby();
      const {players} = await stored(code);
      await denied(
        updateDoc(game(STRANGER, code), {
          guestUid: STRANGER,
          players: {
            ...players,
            [STRANGER]: { uid: STRANGER, lastSeen: stamp },
          },
        })
      );
    });

    it("cannot rewrite a played result", async () => {
      const comp = await league();
      const { fixture } = guestsFixture(comp);
      await as(GUEST, () =>
        recordCompetitionFixture({
          context: context(comp, fixture.id),
          homeScore: 2,
          awayScore: 1,
        })
      );
      const currentSnapshot = await getDoc(leagueRef(ADMIN, comp.id));
      const current_ = currentSnapshot.data() as LeagueDoc;
      const fixtures = structuredClone(current_.fixtures);
      fixtureValue(
        fixtureValue(fixtures.find((f) => f.id === fixture.id)).result
      ).homeScore = 9;
      await denied(updateDoc(leagueRef(GUEST, comp.id), { fixtures }));
    });

    it("cannot change a pairing, or add or remove a fixture", async () => {
      const comp = await league();
      const fixtures = JSON.parse(JSON.stringify(comp.fixtures));
      fixtures[0].homeEntrantId = `e-${THIRD}`;
      await denied(updateDoc(leagueRef(GUEST, comp.id), { fixtures }));
      await denied(
        updateDoc(leagueRef(GUEST, comp.id), {
          fixtures: JSON.parse(JSON.stringify(comp.fixtures.slice(1))),
        })
      );
    });

    it("cannot touch another coach's entrant or the list of entrants", async () => {
      const comp = await league();
      const others = structuredClone(comp.entrants);
      fixtureValue(others.find((e) => e.ownerUid === HOST)).withdrawn = true;
      await denied(updateDoc(leagueRef(GUEST, comp.id), { entrants: others }));
      await denied(
        updateDoc(leagueRef(GUEST, comp.id), {
          entrants: comp.entrants.slice(1),
        })
      );
      const handedOver = structuredClone(comp.entrants);
      fixtureValue(handedOver.find((e) => e.ownerUid === GUEST)).ownerUid =
        HOST;
      await denied(
        updateDoc(leagueRef(GUEST, comp.id), { entrants: handedOver })
      );
    });

    it("cannot change who organizes or takes part", async () => {
      const comp = await league();
      await denied(
        updateDoc(leagueRef(GUEST, comp.id), { organizerUid: GUEST })
      );
      await denied(
        updateDoc(leagueRef(GUEST, comp.id), { participantUids: [GUEST] })
      );
    });

    it("gains nothing from writing false standings, status or a champion", async () => {
      const comp = await league();
      await updateDoc(leagueRef(GUEST, comp.id), {
        status: "complete",
        standings: [{ entrantId: `e-${GUEST}`, points: 99 }],
      });
      const read = await as(GUEST, () => getCompetition("league", comp.id));
      expect(read?.status).toBe("active");
      expect(read?.standings.map((row) => row.points)).toEqual([0, 0, 0, 0]);

      const cup = await tournament();
      await updateDoc(doc(dbFor(GUEST), "tournaments", cup.id), {
        championEntrantId: `e-${GUEST}`,
      });
      const cupRead = await as(GUEST, () =>
        getCompetition("tournament", cup.id)
      );
      expect(
        (cupRead as TournamentDoc | null)?.championEntrantId
      ).toBeUndefined();
    });

    it("can do anything to it as organizer, and nothing as an outsider", async () => {
      const comp = await league();
      await updateDoc(leagueRef(ORGANIZER, comp.id), { name: "Renamed" });
      await denied(
        updateDoc(leagueRef(STRANGER, comp.id), { status: "complete" })
      );
    });
  });
});
