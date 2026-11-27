import { seedCompetitionId } from "../seeding/seedMeta";
import { TeamLibraryGate } from "../ui/components/TeamManagement/TeamLibraryGate";
import {
  setTeamLibraryRetry,
  setTeamLibraryStatus,
} from "../game/managers/TeamManager";
import { TeamManagement } from "../ui/components/pages/TeamManagement";
import {
  CLOUD_LEAGUE,
  guestSeat,
  hostAlone,
  hostReady,
  LOBBY_PATH,
  openGamesList,
  organizedByMe,
  organizedByRival,
  otherCoaches,
  RANDOM_ROLL,
  rolledPlayer,
  seed,
  signedIn,
  teamAt,
  withClubs,
  withSquadsClub,
  withFriends,
  withInvites,
} from "./cloudScenes";
import { at, pages, routed } from "./pageRoutes";
import { click, later } from "./variantHelpers";
import type { Drive, Row, Variant } from "./variant";

const SIGNED_OUT = "Signed out";
const teamPages = (section: string, list: readonly Row[]) =>
  pages("Team pages", section, list);
const competitionPages = (section: string, list: readonly Row[]) =>
  pages("Competitions", section, list);
const teamList = routed("/build-team");

const nothing = () => undefined;

const press =
  (label: string): Drive =>
  () =>
    later(400, () => {
      click("button", label);
    });

const pickTeam = (roster: string, at: number) => {
  const matches = [
    ...document.querySelectorAll<HTMLButtonElement>("button[aria-pressed]"),
  ].filter((button) => button.textContent.includes(`${roster} Founders`));
  matches.at(at)?.click();
};

const menu = routed("/");
const select = (query: string) => routed(`/select-team${query}`);

const MENU = pages("Pre-match", "Main menu", [
  { id: "page-menu", title: SIGNED_OUT, view: menu },
  {
    id: "page-menu-signed-in",
    title: "Signed in, two invitations",
    prepare: withInvites,
    view: menu,
  },
  {
    id: "page-sign-in",
    title: "Sign in",
    view: menu,
    drive: press("Host Game"),
  },
]);

const SELECT = pages("Pre-match", "Team selection", [
  { id: "page-select", title: "Two coaches", view: select("") },
  {
    id: "page-select-picked",
    title: "Both teams picked",
    view: select(""),
    drive: () =>
      later(500, () => {
        pickTeam("Human", 0);
        pickTeam("Orc", -1);
      }),
  },
  {
    id: "page-select-computer",
    title: "Against the computer",
    view: select(""),
    drive: press("Versus computer"),
  },
  {
    id: "page-select-gutter",
    title: "Gutter Bowl",
    view: select("?gameType=gutter-bowl"),
  },
  {
    id: "page-select-empty",
    title: "Not enough teams",
    prepare: nothing,
    view: select(""),
  },
]);

const showAdvancement = () =>
  later(500, () => {
    const sections = [...document.querySelectorAll("section")];
    sections.at(-1)?.scrollIntoView({ block: "end" });
  });

const playerPage = () => {
  const team = teamAt(0);
  return at(`/build-team/${team.id}/player/${String(team.players[0]?.id)}`);
};

const builder = (index: number) => () => at(`/build-team/${teamAt(index).id}`);

const TEAMS = teamPages("Teams", [
  {
    id: "page-teams",
    title: "The team list",
    view: teamList,
  },
  {
    id: "page-teams-empty",
    title: "No teams yet",
    prepare: nothing,
    view: teamList,
  },
  ...(["loading", "failed"] as const).map(
    (status): Row => ({
      id: `page-library-${status}`,
      title:
        status === "loading" ? "The library is loading" : "The library failed",
      prepare: () => {
        seed();
        setTeamLibraryStatus(status);
        setTeamLibraryRetry(() => {
          setTeamLibraryStatus("loaded");
        });
      },
      view: routed(
        "/build-team",
        <TeamLibraryGate>
          <TeamManagement />
        </TeamLibraryGate>
      ),
    })
  ),
]);

const BUILDER = teamPages("Team builder", [
  {
    id: "page-builder-new",
    title: "Choosing a roster",
    view: routed("/build-team/new-team"),
  },
  { id: "page-builder", title: "A team", view: builder(0) },
  { id: "page-builder-other", title: "Another roster", view: builder(3) },
]);

const PLAYER = teamPages("Player development", [
  { id: "page-player", title: "A player", view: playerPage },
  {
    id: "page-player-spp",
    title: "Enough points for any advancement",
    prepare: rolledPlayer(),
    view: playerPage,
    drive: showAdvancement,
  },
  {
    id: "page-player-random",
    title: "Two random skills to choose from",
    prepare: rolledPlayer(RANDOM_ROLL),
    view: playerPage,
    drive: showAdvancement,
  },
  {
    id: "page-player-dice",
    title: "Rolling the characteristic die",
    prepare: rolledPlayer(),
    view: playerPage,
    drive: (fx) => {
      const stop = press("Characteristic")(fx);
      later(800, () => {
        click("button", "Roll D8");
        showAdvancement();
      });
      return stop;
    },
  },
  {
    id: "page-player-missing",
    title: "Player not found",
    view: routed("/build-team/x/player/y"),
  },
]);

const CLUBS = teamPages("Clubs", [
  {
    id: "page-clubs",
    title: "The clubs",
    prepare: withClubs,
    view: routed("/clubs"),
  },
  {
    id: "page-clubs-empty",
    title: "No clubs yet",
    prepare: signedIn,
    view: routed("/clubs"),
  },
  {
    id: "page-club",
    title: "A club",
    prepare: withClubs,
    view: () => at(`/clubs/${teamAt(0).id}`),
  },
  {
    id: "page-club-squads",
    title: "A club with an extra player in its Street Bowl squad",
    prepare: withSquadsClub,
    view: () => at(`/clubs/${teamAt(0).id}`),
  },
  {
    id: "page-club-founding",
    title: "Founding a club",
    prepare: signedIn,
    view: routed("/clubs/new"),
  },
]);

const league = (name: string) => () =>
  at(`/leagues/${seedCompetitionId("league", name)}`);

const bracket = (name: string) => () =>
  at(`/tournaments/${seedCompetitionId("tournament", name)}`);

const cloudLeague = () => at(CLOUD_LEAGUE);

const hub = routed("/leagues");

const COMPETITIONS = competitionPages("Lists", [
  { id: "page-leagues", title: "Leagues", view: hub },
  { id: "page-leagues-empty", title: "None yet", prepare: nothing, view: hub },
  {
    id: "page-leagues-online",
    title: "Signed in, with open sign-ups",
    prepare: organizedByRival,
    view: hub,
  },
  {
    id: "page-tournaments",
    title: "Tournaments",
    view: routed("/tournaments"),
  },
]);

const LEAGUES = competitionPages("Leagues", [
  { id: "page-league", title: "Draft", view: league("founders-league") },
  { id: "page-league-active", title: "Running", view: league("autumn-league") },
  { id: "page-league-done", title: "Finished", view: league("legends-league") },
  {
    id: "page-league-signup",
    title: "Online sign-ups, entering a team",
    prepare: organizedByRival,
    drive: () =>
      later(900, () => {
        const choice = document.querySelector<HTMLSelectElement>(
          'select[aria-label="Team to enter"]'
        );
        if (!choice) return;
        choice.selectedIndex = 1;
        choice.dispatchEvent(new Event("change", { bubbles: true }));
      }),
    view: cloudLeague,
  },
  {
    id: "page-league-organizer",
    title: "Online sign-ups, the organizer",
    prepare: organizedByMe,
    view: cloudLeague,
  },
]);

const TOURNAMENTS = competitionPages("Tournaments", [
  { id: "page-bracket", title: "Running", view: bracket("winter-gauntlet") },
  { id: "page-bracket-done", title: "Finished", view: bracket("founders-cup") },
  {
    id: "page-bracket-draft",
    title: "Draft",
    view: bracket("rookie-rumble"),
  },
]);

const newTournament = routed("/tournaments/new");

const BUILDERS = competitionPages("Creating one", [
  { id: "page-new-tournament", title: "A tournament", view: newTournament },
  {
    id: "page-new-league",
    title: "A league",
    view: routed("/leagues/new"),
  },
  {
    id: "page-new-online",
    title: "An online tournament",
    prepare: signedIn,
    view: newTournament,
    drive: press("Online"),
  },
]);

const lobbyRoom = () => at(LOBBY_PATH);

const LOBBIES = pages("Online", "Lobby", [
  {
    id: "page-lobby-host",
    title: "Host, waiting for an opponent",
    prepare: hostAlone,
    view: lobbyRoom,
  },
  {
    id: "page-lobby-picked",
    title: "Host, both teams picked",
    prepare: hostReady(false),
    view: lobbyRoom,
  },
  {
    id: "page-lobby-ready",
    title: "Host, ready to start",
    prepare: hostReady(true),
    view: lobbyRoom,
  },
  {
    id: "page-lobby-guest",
    title: "Guest",
    prepare: guestSeat,
    view: lobbyRoom,
  },
  {
    id: "page-lobby-closed",
    title: "The lobby has closed",
    prepare: signedIn,
    view: lobbyRoom,
  },
  {
    id: "page-lobby-signed-out",
    title: SIGNED_OUT,
    view: lobbyRoom,
  },
  {
    id: "page-join",
    title: "Join a game",
    prepare: openGamesList,
    view: routed("/online/join"),
  },
]);

const friends = routed("/friends");
const shared = routed("/shared-teams");

const SOCIAL = pages("Online", "Friends and other coaches", [
  {
    id: "page-friends",
    title: "Friends, a request and invitations",
    prepare: withInvites,
    view: friends,
  },
  {
    id: "page-friends-empty",
    title: "No friends yet",
    prepare: signedIn,
    view: friends,
  },
  { id: "page-friends-signed-out", title: SIGNED_OUT, view: friends },
  {
    id: "page-shared",
    title: "Other coaches",
    prepare: otherCoaches,
    view: shared,
  },
  { id: "page-shared-signed-out", title: SIGNED_OUT, view: shared },
]);

const SOUND = teamPages("Sound test", [
  {
    id: "page-sound",
    title: "Every sound",
    prepare: withFriends,
    view: routed("/music"),
  },
]);

export const PAGE_VARIANTS: Variant[] = [
  ...MENU,
  ...SELECT,
  ...TEAMS,
  ...BUILDER,
  ...PLAYER,
  ...CLUBS,
  ...SOUND,
  ...COMPETITIONS,
  ...LEAGUES,
  ...TOURNAMENTS,
  ...BUILDERS,
  ...LOBBIES,
  ...SOCIAL,
];
