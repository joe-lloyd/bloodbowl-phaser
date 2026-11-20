import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  as,
  closeEmulatorApps,
  denied,
  EMULATOR,
  loadRules,
  uniqueUid,
} from "./emulator";

vi.mock("../../src/firebase/config", async () => {
  const { current } = await import("./emulator");
  return { getDb: () => current.db, isFirebaseConfigured: () => true };
});

vi.mock("../../src/firebase/auth", async () => {
  const { current } = await import("./emulator");
  return { getCurrentUser: () => ({ uid: current.uid }) };
});

import {
  createComputerTeamFromTemplate,
  getComputerTeamTemplates,
} from "../../src/competition/computerTeamTemplates";
import {
  enterCompetition,
  leaveCompetition,
  openOnlineCompetition,
  startOnlineCompetition,
} from "../../src/competition/online";
import {
  getCompetition,
  listOpenCompetitions,
  updateCompetition,
} from "../../src/competition/repository";
import type {
  CompetitionDoc,
  CompetitionEntrant,
} from "../../src/competition/types";
import { acceptFriend, requestFriend } from "../../src/firebase/friends";
import {
  sendCompetitionInvite,
  sendFixtureInvite,
} from "../../src/firebase/invites";
import { createLobby, joinLobby } from "../../src/firebase/lobby";
import { loadTeams, setTeamRepository } from "../../src/game/managers/TeamManager";
import { friendshipKey } from "../../src/social/friends";
import type { Team } from "../../src/types/Team";

let templateIndex = 0;

function coachTeam(): Team {
  const templates = getComputerTeamTemplates();
  const template = templates[templateIndex++ % templates.length];
  if (!template) throw new Error("no computer templates");
  const team = createComputerTeamFromTemplate(template.id);
  delete team.computerCoached;
  delete team.computerTemplateId;
  team.coachName = "Coach";
  return team;
}

async function openLeague(organizer: string, places = 4): Promise<CompetitionDoc> {
  return as(organizer, () =>
    openOnlineCompetition({
      type: "league",
      name: "Spike Cup",
      organizerUid: organizer,
      team: null,
      online: { places, listed: true, roundDays: 7, computerGames: "simulate" },
    })
  );
}

function extraEntrant(id: string, ownerUid: string): CompetitionEntrant {
  return { id, teamId: id, ownerUid, name: id, rosterName: "Orc", seed: 9 };
}

const stored = async (competition: CompetitionDoc, uid: string) => {
  const found = await as(uid, () => getCompetition(competition.type, competition.id));
  if (!found) throw new Error("competition missing");
  return found;
};

describe.skipIf(!EMULATOR)("online competitions", () => {
  beforeAll(loadRules);
  afterAll(closeEmulatorApps);
  beforeEach(() => {
    localStorage.clear();
    setTeamRepository(null);
  });

  it("take one team from each coach who signs up, and let them leave again", async () => {
    const organizer = uniqueUid("organizer");
    const amy = uniqueUid("amy");
    const league = await openLeague(organizer);
    expect(
      (await as(amy, () => listOpenCompetitions("league"))).map((found) => found.id)
    ).toContain(league.id);

    await as(amy, () => enterCompetition({ competition: league, team: coachTeam(), uid: amy }));
    const entered = await stored(league, amy);
    expect(entered.participantUids).toEqual([amy]);
    expect(entered.entrants).toEqual([expect.objectContaining({ ownerUid: amy })]);

    await denied(
      as(amy, () =>
        updateCompetition("league", league.id, (latest) => ({
          ...latest,
          entrants: [...latest.entrants, extraEntrant("second", amy)],
        }))
      )
    );

    await as(amy, () => leaveCompetition({ competition: entered, uid: amy }));
    expect((await stored(league, amy)).entrants).toEqual([]);
  });

  it("refuse a team entered in another coach's name, past the last place, or after the start", async () => {
    const organizer = uniqueUid("organizer");
    const [amy, bob, mallory] = [uniqueUid("amy"), uniqueUid("bob"), uniqueUid("mallory")];
    const league = await openLeague(organizer, 2);
    await as(amy, () => enterCompetition({ competition: league, team: coachTeam(), uid: amy }));

    await denied(
      as(mallory, () =>
        updateCompetition("league", league.id, (latest) => ({
          ...latest,
          entrants: [...latest.entrants, extraEntrant("forged", amy)],
          participantUids: [...latest.participantUids, mallory],
        }))
      )
    );
    await as(bob, () => enterCompetition({ competition: league, team: coachTeam(), uid: bob }));
    expect(
      (await as(mallory, () => listOpenCompetitions("league"))).map((found) => found.id)
    ).not.toContain(league.id);
    await denied(
      as(mallory, () =>
        updateCompetition("league", league.id, (latest) => ({
          ...latest,
          entrants: [...latest.entrants, extraEntrant("late", mallory)],
          participantUids: [...latest.participantUids, mallory],
        }))
      )
    );
    await denied(
      as(amy, () =>
        updateCompetition("league", league.id, (latest) => ({ ...latest, status: "active" }))
      )
    );
  });

  it("release the team that actually left, even when the page was out of date", async () => {
    const organizer = uniqueUid("organizer");
    const amy = uniqueUid("amy");
    const league = await openLeague(organizer);
    const [first, second] = [coachTeam(), coachTeam()];
    await as(amy, () => enterCompetition({ competition: league, team: first, uid: amy }));
    const stale = await stored(league, amy);
    await as(amy, () => leaveCompetition({ competition: stale, uid: amy }));
    await as(amy, () => enterCompetition({ competition: league, team: second, uid: amy }));

    await as(amy, () => leaveCompetition({ competition: stale, uid: amy }));
    const locks = new Map(loadTeams().map((team) => [team.id, team.activeCompetitionId]));
    expect([locks.get(first.id), locks.get(second.id)]).toEqual([undefined, undefined]);
  });

  it("refuse a sign-up or withdrawal that copies another coach's entrant", async () => {
    const organizer = uniqueUid("organizer");
    const [amy, bob, mallory] = [uniqueUid("amy"), uniqueUid("bob"), uniqueUid("mallory")];
    const league = await openLeague(organizer);
    await as(amy, () => enterCompetition({ competition: league, team: coachTeam(), uid: amy }));
    await as(bob, () => enterCompetition({ competition: league, team: coachTeam(), uid: bob }));

    await denied(
      as(mallory, () =>
        updateCompetition("league", league.id, (latest) => ({
          ...latest,
          entrants: [...latest.entrants, ...latest.entrants.slice(0, 1), extraEntrant("mine", mallory)],
          participantUids: [...latest.participantUids, mallory],
        }))
      )
    );
    await denied(
      as(amy, () =>
        updateCompetition("league", league.id, (latest) => {
          const others = latest.entrants.filter((entrant) => entrant.ownerUid !== amy);
          return {
            ...latest,
            entrants: [...others, ...others],
            participantUids: latest.participantUids.filter((uid) => uid !== amy),
          };
        })
      )
    );
    expect((await stored(league, amy)).entrants).toHaveLength(2);

    const amyEntrant = (await stored(league, amy)).entrants.find((entrant) => entrant.ownerUid === amy);
    await denied(
      as(mallory, () =>
        updateCompetition("league", league.id, (latest) => ({
          ...latest,
          entrants: [...latest.entrants, { ...extraEntrant(String(amyEntrant?.id), mallory), teamId: String(amyEntrant?.teamId) }],
          participantUids: [...latest.participantUids, mallory],
        }))
      )
    );
    await denied(
      as(mallory, () =>
        updateCompetition("league", league.id, (latest) => ({
          ...latest,
          entrants: [...latest.entrants, extraEntrant("own:mine", mallory)],
          participantUids: [...latest.participantUids, mallory],
        }))
      )
    );
  });

  it("keep a signed-up team coached by its coach", async () => {
    const organizer = uniqueUid("organizer");
    const amy = uniqueUid("amy");
    const league = await openLeague(organizer);
    await as(amy, () => enterCompetition({ competition: league, team: coachTeam(), uid: amy }));
    await denied(
      as(amy, () =>
        updateCompetition("league", league.id, (latest) => ({
          ...latest,
          entrants: latest.entrants.map((entrant) =>
            entrant.ownerUid === amy ? { ...entrant, computerCoached: true as const } : entrant
          ),
        }))
      )
    );
  });

  it("start when the organizer says, with computer teams in the empty places", async () => {
    const organizer = uniqueUid("organizer");
    const amy = uniqueUid("amy");
    const league = await openLeague(organizer, 4);
    await as(amy, () => enterCompetition({ competition: league, team: coachTeam(), uid: amy }));

    const started = await as(organizer, async () =>
      startOnlineCompetition({ competition: await stored(league, organizer), random: () => 0.3 })
    );

    expect(started.status).toBe("active");
    expect(started.entrants.filter((entrant) => entrant.computerCoached)).toHaveLength(3);
    expect(started.fixtures).toHaveLength(6);
    expect((await stored(league, amy)).online?.startedAt).toBeTypeOf("number");
    const late = uniqueUid("late");
    await expect(
      as(late, () => enterCompetition({ competition: started, team: coachTeam(), uid: late }))
    ).rejects.toThrow("Sign-ups for this competition are closed.");
    await denied(
      as(late, () =>
        updateCompetition("league", league.id, (latest) => ({
          ...latest,
          entrants: [...latest.entrants, extraEntrant("late", late)],
          participantUids: [...latest.participantUids, late],
        }))
      )
    );
  });

  it("send fixture invites only between its coaches, and competition invites only to friends", async () => {
    const organizer = uniqueUid("organizer");
    const [amy, bob, carol] = [uniqueUid("amy"), uniqueUid("bob"), uniqueUid("carol")];
    const league = await openLeague(organizer, 2);
    await as(amy, () => enterCompetition({ competition: league, team: coachTeam(), uid: amy }));
    await as(bob, () => enterCompetition({ competition: league, team: coachTeam(), uid: bob }));
    const context = { competitionType: "league" as const, competitionId: league.id, fixtureId: "round-1-match-1" };

    await as(amy, () => sendFixtureInvite({ fromUid: amy, toUid: bob, code: "ABC234", context, competitionName: league.name }));
    await denied(
      as(amy, () => sendFixtureInvite({ fromUid: amy, toUid: carol, code: "ABC234", context, competitionName: league.name }))
    );

    await denied(as(amy, () => sendCompetitionInvite({ fromUid: amy, toUid: carol, competition: league })));
    await as(amy, () => requestFriend({ me: amy, other: carol }));
    await as(carol, () => acceptFriend(friendshipKey(amy, carol)));
    await as(amy, () => sendCompetitionInvite({ fromUid: amy, toUid: carol, competition: league }));
  });

  it("hold a fixture lobby for the other coach, who gets the other team", async () => {
    const [amy, bob, mallory] = [uniqueUid("amy"), uniqueUid("bob"), uniqueUid("mallory")];
    const [home, away] = [coachTeam(), coachTeam()];
    const lobby = await as(amy, () =>
      createLobby(amy, "Amy", {
        context: { competitionType: "league", competitionId: "l", fixtureId: "f" },
        homeTeam: home,
        awayTeam: away,
        hostSide: "away",
        reservedFor: bob,
      })
    );
    expect(lobby.players[amy]?.team?.id).toBe(away.id);

    await expect(as(mallory, () => joinLobby(lobby.code, mallory, "Mallory"))).rejects.toThrow(
      "only the other coach in it can join"
    );
    const joined = await as(bob, () => joinLobby(lobby.code, bob, "Bob"));
    expect(joined.players[bob]?.team?.id).toBe(home.id);
  });
});
