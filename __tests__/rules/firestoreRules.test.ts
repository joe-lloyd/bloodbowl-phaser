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

const current = vi.hoisted(() => ({ db: null as unknown, uid: "" }));
vi.mock("../../src/firebase/config", () => ({
  getDb: () => current.db,
  isFirebaseConfigured: () => true,
}));

vi.mock("../../src/firebase/auth", () => ({
  getCurrentUser: () => ({ uid: current.uid }),
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
  current.uid = uid;
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

async function seededLobby(): Promise<string> {
  const code = await joinedLobby();
  await as(HOST, () => commitSeed(code, HOST));
  await as(GUEST, () => commitSeed(code, GUEST));
  await as(HOST, () => revealSeed(code, HOST));
  await as(GUEST, () => revealSeed(code, GUEST));
  return code;
}

async function markQuiet(code: string, uid: string, ms: number): Promise<void> {
  await updateDoc(game(ADMIN, code), {
    [`players.${uid}.lastSeen`]: Date.now() - ms,
  });
}

/** The teams are chosen in the lobby; a toss test needs them after it. */
async function selectTeamDirectly(code: string): Promise<void> {
  await updateDoc(game(ADMIN, code), {
    [`players.${HOST}.team`]: { id: "host-team" },
    [`players.${GUEST}.team`]: { id: "guest-team" },
  });
}

async function activeMatch(): Promise<string> {
  const code = await seededLobby();
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

    it("lets a coach abandon once the other has gone, and it stays over", async () => {
      const code = await activeMatch();
      await markQuiet(code, HOST, 25_000);
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

    it("cannot end a live match alone while the other coach is still there", async () => {
      const code = await activeMatch();
      await denied(as(GUEST, () => finishMatch(code, "abandoned")));
      await as(HOST, () => heartbeat(code, HOST));
      await denied(as(GUEST, () => finishMatch(code, "abandoned")));
      await markQuiet(code, HOST, 10_000);
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
      await denied(as(HOST, () => startMatch(code, DEFAULT_SETTINGS, HOST, GUEST)));
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
      await denied(as(GUEST, () => resumeClock(code, HOST, 0, Date.now())));
      await as(GUEST, () => pauseClock(code, GUEST));
      await as(GUEST, () => resumeClock(code, GUEST, 1000, Date.now()));
    });

    it("cannot start the match or change settings unless they host", async () => {
      const code = await seededLobby();
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
    /** A fixture with the guest in it, and the coach they play. */
    const guestsFixture = (comp: LeagueDoc) => {
      const fixture = comp.fixtures.find((f) =>
        [f.homeEntrantId, f.awayEntrantId].includes(`e-${GUEST}`)
      )!;
      const rival = [fixture.homeEntrantId, fixture.awayEntrantId]
        .find((id) => id !== `e-${GUEST}`)!
        .replace("e-", "");
      return { fixture, rival };
    };

    it("can report a league result and withdraw their own team", async () => {
      const comp = await league();
      const { fixture } = guestsFixture(comp);
      const updated = await as(GUEST, () =>
        recordCompetitionFixture(context(comp, fixture.id), 2, 1)
      );
      expect(
        updated.fixtures.find((f) => f.id === fixture.id)?.status
      ).toBe("complete");

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
      const { fixture, rival } = guestsFixture(comp);
      // The second coach has read the fixture as open, then writes late
      const stale = structuredClone(comp);
      await as(rival, () =>
        recordCompetitionFixture(context(comp, fixture.id), 2, 1)
      );
      const staleFixture = stale.fixtures.find((f) => f.id === fixture.id)!;
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
        recordCompetitionFixture(context(comp, fixture.id), 2, 1)
      );
      expect(
        raced.fixtures.find((f) => f.id === fixture.id)?.result?.homeScore
      ).toBe(2);
    });

    it("counts the result for the later coach's team, once", async () => {
      const comp = await league();
      const { fixture, rival } = guestsFixture(comp);
      const guestTeam = comp.entrants.find((e) => e.ownerUid === GUEST)!;
      const homeIsGuest = fixture.homeEntrantId === guestTeam.id;
      saveTeam(team(guestTeam.teamId));
      await as(rival, () =>
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

    it("counts a same-named fixture in another competition", async () => {
      const first = await league();
      const second = await league();
      const { fixture } = guestsFixture(first);
      const guestTeam = first.entrants.find((e) => e.ownerUid === GUEST)!;
      expect(second.fixtures.map((f) => f.id)).toContain(fixture.id);
      saveTeam(team(guestTeam.teamId));
      for (const comp of [first, second]) {
        await as(GUEST, () =>
          recordCompetitionFixture(context(comp, fixture.id), 2, 1)
        );
      }
      const counted = getTeamById(guestTeam.teamId)!;
      expect((counted.wins ?? 0) + (counted.losses ?? 0)).toBe(2);
    });

    it("cannot complete a fixture without a real result, or relink a bracket", async () => {
      const comp = await league();
      // The guest's own fixture and team, so only the result is at fault
      const { fixture } = guestsFixture(comp);
      const reporterEntrantIndex = comp.entrants.findIndex(
        (e) => e.ownerUid === GUEST
      );
      for (const result of [
        undefined,
        { homeScore: -1, awayScore: "two", completedAt: 1 },
      ]) {
        const fixtures = JSON.parse(JSON.stringify(comp.fixtures));
        const target = fixtures.find((f: { id: string }) => f.id === fixture.id);
        target.status = "complete";
        if (result) target.result = result;
        await denied(
          updateDoc(leagueRef(GUEST, comp.id), { fixtures, reporterEntrantIndex })
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
      const outsider = [HOST, THIRD, ORGANIZER].find(
        (uid) =>
          uid !== ORGANIZER &&
          ![fixture.homeEntrantId, fixture.awayEntrantId].includes(`e-${uid}`)
      )!;
      await denied(
        as(outsider, () =>
          recordCompetitionFixture(context(comp, fixture.id), 9, 0)
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
      const fixture = comp.fixtures.find(
        (f) =>
          ![f.homeEntrantId, f.awayEntrantId].includes(`e-${ORGANIZER}`)
      )!;
      const updated = await as(ORGANIZER, () =>
        recordCompetitionFixture(context(comp, fixture.id), 1, 0)
      );
      expect(
        updated.fixtures.find((f) => f.id === fixture.id)?.status
      ).toBe("complete");
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

      // A final with neither finalist yet, won by a bye
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
      const mine = ready.find((f) =>
        [f.homeEntrantId, f.awayEntrantId].includes(`e-${GUEST}`)
      )!;
      const reporterEntrantIndex = cup.entrants.findIndex(
        (e) => e.ownerUid === GUEST
      );
      const cupRef = doc(dbFor(GUEST), "tournaments", cup.id);
      const write = (edit: (fixtures: Record<string, never>[]) => void) => {
        const fixtures = JSON.parse(JSON.stringify(cup.fixtures));
        edit(fixtures);
        return updateDoc(cupRef, { fixtures, reporterEntrantIndex });
      };
      const report = (
        fixtures: { id: string; status: string; result: unknown }[],
        winnerEntrantId: string | null,
        homeScore = 2,
        awayScore = 1
      ) => {
        const target = fixtures.find((f) => f.id === mine.id)!;
        target.status = "complete";
        target.result = { homeScore, awayScore, winnerEntrantId, completedAt: 1 };
      };

      // The loser, then a stranger to the fixture
      for (const winner of [mine.awayEntrantId, `e-${THIRD}`]) {
        await denied(write((fixtures) => report(fixtures as never, winner)));
      }
      // The real winner, placed in the slot it does not feed
      await denied(
        write((fixtures) => {
          report(fixtures as never, mine.homeEntrantId);
          const next = (fixtures as never as Record<string, unknown>[]).find(
            (f) => f.id === mine.nextFixtureId
          )!;
          const wrong = mine.nextSlot === "home" ? "away" : "home";
          next[`${wrong}EntrantId`] = mine.homeEntrantId;
        })
      );
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
      const players = (await stored(code)).players;
      await denied(
        updateDoc(game(STRANGER, code), {
          guestUid: STRANGER,
          players: { ...players, [STRANGER]: { uid: STRANGER, lastSeen: stamp } },
        })
      );
    });

    it("cannot rewrite a played result", async () => {
      const comp = await league();
      const { fixture } = guestsFixture(comp);
      await as(GUEST, () =>
        recordCompetitionFixture(context(comp, fixture.id), 2, 1)
      );
      const current_ = (await getDoc(leagueRef(ADMIN, comp.id))).data() as LeagueDoc;
      const fixtures = structuredClone(current_.fixtures);
      fixtures.find((f) => f.id === fixture.id)!.result!.homeScore = 9;
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
