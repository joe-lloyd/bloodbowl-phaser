/**
 * firestore.rules against the emulator, driving the app's real lobby and
 * competition code as each coach. `pnpm test:rules` starts the emulator, or
 * point FIRESTORE_EMULATOR_HOST at a running one. Skipped without either.
 */
import { readFileSync } from "node:fs";
import { deleteApp, FirebaseApp, initializeApp } from "firebase/app";
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
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = "demo-bloodbowl-rules";

const current = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../../src/firebase/config", () => ({
  getDb: () => current.db,
  isFirebaseConfigured: () => true,
}));

import {
  cancelEndMatch,
  commitSeed,
  createLobby,
  finishMatch,
  heartbeat,
  joinLobby,
  LobbyDoc,
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
  CompetitionEntrant,
  DEFAULT_LEAGUE_POINTS,
  LeagueDoc,
  TournamentDoc,
} from "../../src/competition/types";
import { getTeamById, saveTeam } from "../../src/game/managers/TeamManager";
import { Team } from "../../src/types/Team";

const HOST = "host-uid";
const GUEST = "guest-uid";
const STRANGER = "stranger-uid";
const ORGANIZER = "organizer-uid";
const THIRD = "third-uid";
const ADMIN = "owner";

const apps: FirebaseApp[] = [];
const dbs = new Map<string, Firestore>();

function dbFor(uid: string): Firestore {
  const known = dbs.get(uid);
  if (known) return known;
  const app = initializeApp({ projectId: PROJECT }, uid);
  apps.push(app);
  const db = getFirestore(app);
  const [host, port] = (EMULATOR as string).split(":");
  connectFirestoreEmulator(
    db,
    host,
    Number(port),
    // The emulator treats the token "owner" as having no rules at all
    { mockUserToken: uid === ADMIN ? ADMIN : { sub: uid, user_id: uid } }
  );
  dbs.set(uid, db);
  return db;
}

/** Run the app's own code as this signed-in coach. */
function as<T>(uid: string, work: () => Promise<T>): Promise<T> {
  current.db = dbFor(uid);
  return work();
}

const game = (uid: string, code: string) => doc(dbFor(uid), "games", code);

const denied = (write: Promise<unknown>) =>
  expect(write).rejects.toMatchObject({ code: "permission-denied" });

const stored = async (code: string) =>
  (await getDoc(game(ADMIN, code))).data() as LobbyDoc;

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

async function activeMatch(): Promise<string> {
  const code = await joinedLobby();
  await as(HOST, () => startMatch(code, DEFAULT_SETTINGS, HOST, GUEST));
  return code;
}

describe.skipIf(!EMULATOR)("firestore.rules", () => {
  beforeAll(async () => {
    const response = await fetch(
      `http://${EMULATOR}/emulator/v1/projects/${PROJECT}:securityRules`,
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
    await Promise.all([...dbs.values()].map(terminate));
    await Promise.all(apps.map(deleteApp));
  });

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
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
      await as(HOST, () => startMatch(code, DEFAULT_SETTINGS, HOST, GUEST));

      await as(HOST, () => setCoinFlipReady(code, true));
      await as(GUEST, () => setCoinFlipReady(code, false));
      await as(HOST, () => setCoinFlipWinner(code, "guest-team"));
      await as(GUEST, () => setCoinFlipChoice(code, "guest-team"));
      await as(HOST, () => setTurnDeadline(code, Date.now(), "t:1:1"));
      await as(GUEST, () => setTurnDeadline(code, Date.now(), "t:1:2"));
      await as(HOST, () => heartbeat(code, HOST));
      await as(GUEST, () => heartbeat(code, GUEST));
      await as(GUEST, () => pauseClock(code, GUEST));
      await as(GUEST, () => resumeClock(code, GUEST, 1000, Date.now()));
      const resume = { rng: {}, matchStats: {}, applied: 3 } as never;
      await as(HOST, () => persistMatch(code, {} as never, resume));
      await as(GUEST, () => persistMatch(code, {} as never, resume));
      await as(HOST, () => requestEndMatch(code, HOST));
      await as(GUEST, () => cancelEndMatch(code));
      await as(GUEST, () => requestEndMatch(code, GUEST));
      await as(HOST, () => finishMatch(code, "finished"));

      expect((await stored(code)).status).toBe("finished");
    });

    it("lets either coach force an abandon, and a finished match stays over", async () => {
      const code = await activeMatch();
      await as(GUEST, () => finishMatch(code, "abandoned"));
      await denied(updateDoc(game(HOST, code), { status: "active" }));
    });
  });

  describe("a stranger", () => {
    it("can fetch a lobby by code but cannot list games", async () => {
      const code = await openLobby();
      expect((await getDoc(game(STRANGER, code))).exists()).toBe(true);
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
      expect((await stored(code)).hostUid).toBe(HOST);
    });

    it("cannot change anything else while taking the seat", async () => {
      const code = await openLobby();
      const players = (await stored(code)).players;
      const mine = { uid: STRANGER, displayName: "S", team: null, ready: false };
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
      await denied(
        setDoc(ref, { ...base, guestUid: null, status: "active" })
      );
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
      expect((await stored(code)).status).toBe("active");
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

    it("cannot start the match or change settings unless they host", async () => {
      const code = await joinedLobby();
      await denied(
        as(GUEST, () => startMatch(code, DEFAULT_SETTINGS, HOST, GUEST))
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
    let nextId = 0;

    async function league(): Promise<LeagueDoc> {
      const list = entrants();
      const fixtures = generateRoundRobin(list);
      const doc_: LeagueDoc = {
        id: `league-${Date.now()}-${nextId++}`,
        type: "league",
        name: "League",
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

    async function tournament(): Promise<TournamentDoc> {
      const list = entrants();
      const fixtures = generateSingleElimination(list);
      const doc_: TournamentDoc = {
        id: `cup-${Date.now()}-${nextId++}`,
        type: "tournament",
        name: "Cup",
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

    const context = (comp: LeagueDoc | TournamentDoc, fixtureId: string) => ({
      competitionType: comp.type,
      competitionId: comp.id,
      fixtureId,
    });
    const leagueRef = (uid: string, id: string) =>
      doc(dbFor(uid), "leagues", id);

    it("can report a league result and withdraw their own team", async () => {
      const comp = await league();
      const fixture = comp.fixtures[0];
      const updated = await as(GUEST, () =>
        recordCompetitionFixture(context(comp, fixture.id), 2, 1)
      );
      expect(updated.fixtures[0].status).toBe("complete");

      const after = await as(GUEST, () =>
        withdrawFromCompetition(
          { competitionType: "league", competitionId: comp.id },
          `e-${GUEST}`
        )
      );
      expect(
        after.entrants.find((e) => e.id === `e-${GUEST}`)?.withdrawn
      ).toBe(true);
    });

    it("can report a tournament match, which advances the winner", async () => {
      const comp = await tournament();
      const first = comp.fixtures.find((f) => f.status === "ready")!;
      const updated = await as(GUEST, () =>
        recordCompetitionFixture(context(comp, first.id), 2, 1)
      );
      const next = updated.fixtures.find((f) => f.id === first.nextFixtureId)!;
      const winner = first.homeEntrantId;
      expect([next.homeEntrantId, next.awayEntrantId]).toContain(winner);
    });

    it("sees the result stand when the other coach reports first", async () => {
      const comp = await league();
      const fixture = comp.fixtures[0];
      // The second coach has read the fixture as open, then writes late
      const stale = structuredClone(comp);
      await as(HOST, () =>
        recordCompetitionFixture(context(comp, fixture.id), 2, 1)
      );
      stale.fixtures[0].status = "complete";
      stale.fixtures[0].result = {
        homeScore: 2,
        awayScore: 1,
        completedAt: 999,
      };
      await denied(
        setDoc(leagueRef(GUEST, comp.id), JSON.parse(JSON.stringify(stale)))
      );

      const raced = await as(GUEST, () =>
        recordCompetitionFixture(context(comp, fixture.id), 2, 1)
      );
      expect(raced.fixtures[0].result?.homeScore).toBe(2);
    });

    it("counts the result for the later coach's team, once", async () => {
      const comp = await league();
      const fixture = comp.fixtures[0];
      const guestTeam = comp.entrants.find((e) => e.ownerUid === GUEST)!;
      const homeIsGuest = fixture.homeEntrantId === guestTeam.id;
      expect(homeIsGuest || fixture.awayEntrantId === guestTeam.id).toBe(true);
      saveTeam(team(guestTeam.teamId));
      await as(HOST, () =>
        recordCompetitionFixture(context(comp, fixture.id), 2, 1)
      );
      localStorage.clear();
      saveTeam(team(guestTeam.teamId));

      const report = () =>
        as(GUEST, () =>
          recordCompetitionFixture(context(comp, fixture.id), 2, 1)
        );
      await report();
      await report();

      const counted = getTeamById(guestTeam.teamId)!;
      expect([counted.wins ?? 0, counted.losses ?? 0]).toEqual(
        homeIsGuest ? [1, 0] : [0, 1]
      );
    });

    it("cannot put an open competition back to draft, or open a draft", async () => {
      const comp = await league();
      await denied(
        updateDoc(leagueRef(GUEST, comp.id), { status: "draft" })
      );
      await updateDoc(leagueRef(ORGANIZER, comp.id), { status: "draft" });
      await denied(
        updateDoc(leagueRef(GUEST, comp.id), { status: "active" })
      );
    });

    it("cannot rewrite a played result", async () => {
      const comp = await league();
      await as(GUEST, () =>
        recordCompetitionFixture(context(comp, comp.fixtures[0].id), 2, 1)
      );
      const current_ = (await getDoc(leagueRef(ADMIN, comp.id))).data() as LeagueDoc;
      const fixtures = structuredClone(current_.fixtures);
      fixtures[0].result!.homeScore = 9;
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
      others.find((e) => e.ownerUid === HOST)!.withdrawn = true;
      await denied(
        updateDoc(leagueRef(GUEST, comp.id), { entrants: others })
      );
      await denied(
        updateDoc(leagueRef(GUEST, comp.id), {
          entrants: comp.entrants.slice(1),
        })
      );
      const handedOver = structuredClone(comp.entrants);
      handedOver.find((e) => e.ownerUid === GUEST)!.ownerUid = HOST;
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
      await denied(updateDoc(leagueRef(STRANGER, comp.id), { status: "complete" }));
    });
  });
});
