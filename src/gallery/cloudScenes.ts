import { loadTeams, saveTeams } from "../game/managers/TeamManager";
import { dehydrateTeam } from "../data/persistence/teamPersistence";
import { readLocalCompetitions } from "../competition/repository";
import type { CompetitionDoc } from "../competition/types";
import { DEFAULT_SETTINGS, type LobbyDoc } from "../firebase/lobby";
import { seedDevelopmentData } from "../seeding/runner";
import type { PendingAdvancementRoll } from "../types/Player";
import { SkillCategory, SkillType } from "../types/Skills";
import type { Team } from "../types/Team";
import { putDocument, signIn } from "./cloud/cloudData";

const ME = "gallery-me";
const RIVAL = "gallery-rival";
const THIRD = "gallery-third";
const CODE = "BLOOD7";

export const seed = () => {
  seedDevelopmentData();
};

const ROSTERS = ["Human", "Orc", "Dwarf", "Wood Elf"];

export const teamAt = (index: number): Team => {
  const team = loadTeams().find(
    ({ rosterName }) => rosterName === ROSTERS[index]
  );
  if (!team) throw new Error("The seed data has no teams.");
  return team;
};

const profile = (
  uid: string,
  coachName: string,
  { friendCode, lastSeen }: { friendCode: string; lastSeen: number }
) => {
  putDocument(`coaches/${uid}`, { uid, coachName, friendCode, lastSeen });
  putDocument(`friendCodes/${friendCode}`, { uid });
};

export function signedIn(): void {
  seed();
  signIn({
    uid: ME,
    displayName: "Joe",
    email: "coach@gallery.invalid",
    emailVerified: true,
    photoURL: null,
  });
  profile(ME, "Joe", { friendCode: "BLQDBXW2", lastSeen: Date.now() });
  profile(RIVAL, "Grimgutz", {
    friendCode: "RRCWARBW",
    lastSeen: Date.now(),
  });
  profile(THIRD, "Morgana the Pale", {
    friendCode: "PAJEELF7",
    lastSeen: Date.now() - 9e6,
  });
}

const friendship = (other: string, status: string, requesterUid: string) => {
  const uids = ME < other ? [ME, other] : [other, ME];
  putDocument(`friendships/${uids.join("__")}`, {
    uids,
    requesterUid,
    status,
    createdAt: Date.now(),
  });
};

export function withFriends(): void {
  signedIn();
  friendship(RIVAL, "accepted", ME);
  friendship(THIRD, "pending", THIRD);
}

const invite = (kind: string, fromUid: string, extra: object = {}) => {
  putDocument(`invites/${kind}__${fromUid}__${ME}`, {
    kind,
    fromUid,
    toUid: ME,
    createdAt: Date.now(),
    ...extra,
  });
};

export function withInvites(): void {
  withFriends();
  invite("match", RIVAL, { code: CODE });
  invite("competition", THIRD, {
    competitionType: "league",
    competitionId: "gallery-online",
    competitionName: "The Friday League",
  });
}

const player = (uid: string, displayName: string, team: Team | null) => ({
  uid,
  displayName,
  team,
  ready: false,
  lastSeen: Date.now(),
});

function lobbyDoc(hostUid: string, patch: Partial<LobbyDoc> = {}): LobbyDoc {
  return {
    code: CODE,
    hostUid,
    guestUid: null,
    status: "lobby",
    settings: DEFAULT_SETTINGS,
    players: {
      [hostUid]: player(hostUid, hostUid === ME ? "Joe" : "Grimgutz", null),
    },
    createdAt: 0,
    ...patch,
  };
}

const openLobby = (lobby: LobbyDoc) => {
  putDocument(`games/${lobby.code}`, lobby);
};

export const LOBBY_PATH = `/online/lobby/${CODE}`;

export function hostAlone(): void {
  withFriends();
  openLobby(lobbyDoc(ME, { listed: true }));
}

const bothPlayers = (ready: boolean) => ({
  [ME]: { ...player(ME, "Joe", teamAt(0)), ready },
  [RIVAL]: { ...player(RIVAL, "Grimgutz", teamAt(1)), ready },
});

export const hostReady = (ready: boolean) => () => {
  withFriends();
  openLobby(lobbyDoc(ME, { guestUid: RIVAL, players: bothPlayers(ready) }));
};

export function guestSeat(): void {
  withFriends();
  openLobby(lobbyDoc(RIVAL, { guestUid: ME, players: bothPlayers(false) }));
}

export function openGamesList(): void {
  withInvites();
  openLobby(lobbyDoc(RIVAL, { listed: true }));
  openLobby(
    lobbyDoc(THIRD, {
      code: "PALE77",
      listed: true,
      players: {
        [THIRD]: player(THIRD, "Morgana the Pale", teamAt(2)),
      },
    })
  );
}

export function otherCoaches(): void {
  signedIn();
  [1, 2, 3].forEach((index) => {
    const team = teamAt(index);
    putDocument(`users/${RIVAL}/teams/${team.id}`, dehydrateTeam(team));
  });
}

export const CLOUD_LEAGUE = "/leagues/gallery-online";

const draftLeague = (): CompetitionDoc => {
  const draft = readLocalCompetitions().find(
    (doc) => doc.type === "league" && doc.status === "draft"
  );
  if (!draft) throw new Error("The seed data has no draft league.");
  return draft;
};

const signUps = (organizerUid: string) => () => {
  withFriends();
  const league = draftLeague();
  putDocument("leagues/gallery-online", {
    ...league,
    id: "gallery-online",
    name: "The Friday League",
    organizerUid,
    participantUids: [RIVAL, organizerUid],
    entrants: league.entrants.slice(0, 2).map((entrant) => ({
      ...entrant,
      ownerUid: RIVAL,
      coachUid: RIVAL,
      coachName: "Grimgutz",
    })),
    fixtures: [],
    standings: [],
    online: {
      places: 8,
      listed: true,
      roundDays: 7,
      computerGames: "simulate",
    },
  });
};

export const organizedByMe = signUps(ME);
export const organizedByRival = signUps(RIVAL);

export function withClubs(): void {
  signedIn();
  void saveTeams(
    loadTeams().map((team) =>
      ROSTERS.slice(0, 2).includes(team.rosterName)
        ? { ...team, club: {} }
        : team
    )
  );
}

export const RANDOM_ROLL: PendingAdvancementRoll = {
  kind: "random-primary",
  category: SkillCategory.GENERAL,
  candidates: [
    { skill: SkillType.BLOCK, firstD6: 2, secondD6: 3 },
    { skill: SkillType.FEND, firstD6: 4, secondD6: 1 },
  ],
};

export const rolledPlayer = (roll?: PendingAdvancementRoll) => () => {
  seed();
  void saveTeams(
    loadTeams().map((team) => {
      const [first, ...rest] = team.players;
      if (team.rosterName !== ROSTERS[0] || !first) return team;
      const ready = {
        ...first,
        spp: 30,
        ...(roll ? { pendingAdvancementRoll: roll } : {}),
      };
      return { ...team, players: [ready, ...rest] };
    })
  );
};
