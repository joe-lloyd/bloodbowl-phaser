import { InjuryType, type Player } from "../../types/Player";
import {
  type RosterName,
  type Team,
  calculateTeamValue,
  createTeam,
  lockAdvancementMode,
} from "../../types/Team";
import { getRosterByRosterName } from "../../data/RosterTemplates";
import { DEFAULT_GAME_TYPE, type GameType } from "../variants/gameTypes";
import { draftRulesFor } from "./draftRules";
import { nextFreeNumber, staysOnRoster } from "./leagueRoster";
import { ROSTER_SLOTS, rosterSlotsFor } from "./playerSlots";

export const GUTTER_UNLOCK_WORTH = 750_000;

export const CLUB_GAME_TYPES: readonly GameType[] = [
  "sevens",
  "street-bowl",
  "beach-bowl",
  "gutter-bowl",
];

export const CLUB_ROSTER_SLOTS = rosterSlotsFor({ club: {} });

export const CLUB_MAX_POSITIONALS = 5;

const TOURNAMENT_ID_PREFIX = "tournament-";

export function clubPlayers(team: Team): Player[] {
  return team.players.filter(
    (player) =>
      player.playerKind !== "journeyman" && staysOnRoster(team, player)
  );
}

const CLUB_COLORS = { primary: 0x8e1b1b, secondary: 0xffffff };

export function foundClub(name: string, rosterName: RosterName): Team {
  const team = createTeam(
    name,
    rosterName,
    CLUB_COLORS,
    getRosterByRosterName(rosterName).rerollCost,
    draftRulesFor(DEFAULT_GAME_TYPE).budget,
    "advanced-league"
  );
  lockAdvancementMode(team);
  team.club = {};
  return team;
}

export function clubWorth(team: Team): number {
  return calculateTeamValue(team) + team.treasury;
}

export function gutterUnlocked(team: Team): boolean {
  if (!team.club) return false;
  return (
    team.club.gutterUnlocked === true ||
    clubWorth(team) >= GUTTER_UNLOCK_WORTH
  );
}

export function latchGutterUnlock(team: Team): void {
  if (team.club && !team.club.gutterUnlocked && gutterUnlocked(team))
    team.club.gutterUnlocked = true;
}

function defaultSquad(team: Team): string[] {
  return clubPlayers(team)
    .filter((player) => player.number <= ROSTER_SLOTS)
    .map((player) => player.id);
}

export function squadFollowsSevens(team: Team, gameType: GameType): boolean {
  return gameType !== DEFAULT_GAME_TYPE && !team.club?.squads?.[gameType];
}

export function squadIds(team: Team, gameType: GameType): string[] {
  const squads = team.club?.squads;
  const chosen = squads?.[gameType] ?? squads?.[DEFAULT_GAME_TYPE];
  if (!chosen) return defaultSquad(team);
  const rostered = new Set(clubPlayers(team).map((player) => player.id));
  return chosen.filter((id) => rostered.has(id));
}

export function setSquadMember(
  team: Team,
  gameType: GameType,
  change: { playerId: string; plays: boolean }
): void {
  if (!team.club) return;
  const others = squadIds(team, gameType).filter((id) => id !== change.playerId);
  team.club.squads = {
    ...team.club.squads,
    [gameType]: change.plays ? [...others, change.playerId] : others,
  };
}

export function followSevens(team: Team, gameType: GameType): void {
  if (!team.club?.squads || gameType === DEFAULT_GAME_TYPE) return;
  team.club.squads = Object.fromEntries(
    Object.entries(team.club.squads).filter(([type]) => type !== gameType)
  );
}

export function staysHome(team: Team, gameType: GameType): Set<string> {
  if (!team.club) return new Set();
  const squad = new Set(squadIds(team, gameType));
  return new Set(
    clubPlayers(team)
      .filter((player) => !squad.has(player.id))
      .map((player) => player.id)
  );
}

function leaveBannedStaffHome(team: Team, gameType: GameType): void {
  const draft = draftRulesFor(gameType);
  if (!draft.apothecary) team.apothecary = false;
  if (!draft.assistantCoaches) team.coaches = 0;
  if (!draft.cheerleaders) team.cheerleaders = 0;
}

function missingNextGame(players: Player[], home: Set<string>): string[] {
  return players
    .filter(
      (player) =>
        home.has(player.id) &&
        player.injuries.includes(InjuryType.MISS_NEXT_GAME)
    )
    .map((player) => player.id);
}

export function prepareClubSquad(
  team: Team,
  gameType: GameType,
  competition = false
): void {
  if (!team.club) return;
  const home = staysHome(team, gameType);
  team.club.matchHome = [...home];
  const served = competition ? missingNextGame(team.players, home) : [];
  if (served.length > 0) team.club.matchServed = served;
  team.players = team.players.filter((player) => !home.has(player.id));
  team.club.matchSquad = team.players.map((player) => player.id);
  leaveBannedStaffHome(team, gameType);
}

export function clubSquad(team: Team, gameType: GameType): Team {
  const squad = structuredClone(team);
  prepareClubSquad(squad, gameType);
  delete squad.club;
  return squad;
}

function renumberClashes(team: Team, homeIds: Set<string>): void {
  const homeNumbers = new Set(
    team.players
      .filter((player) => homeIds.has(player.id))
      .map((player) => player.number)
  );
  for (const player of team.players) {
    if (homeIds.has(player.id) || !homeNumbers.has(player.number)) continue;
    player.number = nextFreeNumber(team);
  }
}

function backFromHome(player: Player, served: Set<string>): Player {
  const back = structuredClone(player);
  if (served.has(back.id))
    back.injuries = back.injuries.filter(
      (injury) => injury !== InjuryType.MISS_NEXT_GAME
    );
  return back;
}

export function restoreClubHome(team: Team, stored: Team): void {
  if (!stored.club) return;
  const served = new Set(team.club?.matchServed);
  const removedAfterMatch = new Set(team.club?.matchSquad);
  const played = new Map(team.players.map((player) => [player.id, player]));
  const storedIds = new Set(stored.players.map((player) => player.id));
  const homeIds = new Set(
    [...storedIds].filter(
      (id) => !played.has(id) && !removedAfterMatch.has(id)
    )
  );
  team.players = [
    ...stored.players.flatMap((player) => {
      const own = played.get(player.id);
      if (own) return [own];
      return homeIds.has(player.id) ? [backFromHome(player, served)] : [];
    }),
    ...team.players.filter((player) => !storedIds.has(player.id)),
  ];
  renumberClashes(team, homeIds);
  team.club = structuredClone(stored.club);
  team.apothecary = stored.apothecary;
  team.coaches = stored.coaches;
  team.cheerleaders = stored.cheerleaders;
}

export function raiseToGutterFloor(team: Team): void {
  team.treasury += Math.max(0, GUTTER_UNLOCK_WORTH - clubWorth(team));
  latchGutterUnlock(team);
}

export function carryGutterUnlock(team: Team, stored: Team | undefined): void {
  if (team.club && stored?.club?.gutterUnlocked)
    team.club.gutterUnlocked = true;
  latchGutterUnlock(team);
}

export function gutterLockReason(team: Team): string | undefined {
  if (!team.club || gutterUnlocked(team)) return undefined;
  return `Gutter Bowl opens when team value plus treasury reaches ${thousands(GUTTER_UNLOCK_WORTH)} (now ${thousands(clubWorth(team))}).`;
}

export function thousands(gold: number): string {
  return `${String(Math.floor(gold / 1000))}k`;
}

export function careerCounts(team: Team, counted: boolean): boolean {
  return !team.club || counted;
}

export function inTournament(team: Team): boolean {
  return team.activeCompetitionId?.startsWith(TOURNAMENT_ID_PREFIX) ?? false;
}

export function friendlyRefusal(team: Team): string | undefined {
  return team.club && inTournament(team)
    ? `${team.name} is playing a tournament. A club in a tournament plays no other games until the tournament ends.`
    : undefined;
}
