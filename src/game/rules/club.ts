import {
  type Player,
  type PlayerTemplate,
  PositionKeyWord,
  TraitKeyWord,
  createPlayer,
} from "../../types/Player";
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
import { ROSTER_SLOTS, uniquePlayerId } from "./playerSlots";
import type { EditDecision } from "./teamEditLegality";

export const GUTTER_UNLOCK_WORTH = 750_000;

const GUTTER_BOWL: GameType = "gutter-bowl";

const TOURNAMENT_ID_PREFIX = "tournament-";

export type SpecialistHire =
  | { hired: true; player: Player }
  | { hired: false; reason: string };

function isLineman(player: Pick<Player, "keywords">): boolean {
  return player.keywords.includes(PositionKeyWord.LINEMAN);
}

function rosteredPlayers(team: Team): Player[] {
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

export function isGutterSpecialist(team: Team, player: Player): boolean {
  return team.club?.gutterSpecialistId === player.id;
}

export function gutterSpecialist(team: Team): Player | undefined {
  return rosteredPlayers(team).find((player) =>
    isGutterSpecialist(team, player)
  );
}

export function corePlayers(team: Team): Player[] {
  return rosteredPlayers(team).filter(
    (player) => !isGutterSpecialist(team, player)
  );
}

export function gutterSitsOut(team: Team): Player | undefined {
  if (!gutterSpecialist(team)) return undefined;
  const core = corePlayers(team);
  if (core.length < draftRulesFor(GUTTER_BOWL).maxPlayers) return undefined;
  const linemen = core.filter(isLineman);
  return (
    linemen.find((player) => player.id === team.club?.gutterSitsOutId) ??
    linemen.at(-1)
  );
}

export function staysHome(team: Team, gameType: GameType): Set<string> {
  if (!team.club) return new Set();
  const away =
    gameType === GUTTER_BOWL ? gutterSitsOut(team) : gutterSpecialist(team);
  return new Set(away ? [away.id] : []);
}

function leaveBannedStaffHome(team: Team, gameType: GameType): void {
  const draft = draftRulesFor(gameType);
  if (!draft.apothecary) team.apothecary = false;
  if (!draft.assistantCoaches) team.coaches = 0;
  if (!draft.cheerleaders) team.cheerleaders = 0;
}

export function prepareClubSquad(team: Team, gameType: GameType): void {
  if (!team.club) return;
  const home = staysHome(team, gameType);
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

export function restoreClubHome(team: Team, stored: Team): void {
  if (!stored.club) return;
  const removedAfterMatch = new Set(team.club?.matchSquad ?? []);
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
      return homeIds.has(player.id) ? [structuredClone(player)] : [];
    }),
    ...team.players.filter((player) => !storedIds.has(player.id)),
  ];
  renumberClashes(team, homeIds);
  team.club = structuredClone(stored.club);
  team.apothecary = stored.apothecary;
  team.coaches = stored.coaches;
  team.cheerleaders = stored.cheerleaders;
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

function positionRefusal(team: Team, template: PlayerTemplate): string | undefined {
  const rostered = rosteredPlayers(team);
  const ofPosition = rostered.filter(
    (player) => player.positionName === template.positionName
  ).length;
  if (template.maxAllowed !== undefined && ofPosition >= template.maxAllowed)
    return `${template.positionName}: the ${team.rosterName} roster allows 0-${String(template.maxAllowed)}, and the club has ${String(ofPosition)}.`;
  const { maxBigGuys } = getRosterByRosterName(team.rosterName);
  const bigGuy = (player: Pick<Player, "keywords">) =>
    player.keywords.includes(TraitKeyWord.BIG_GUY);
  if (
    maxBigGuys !== undefined &&
    bigGuy(template) &&
    rostered.filter(bigGuy).length >= maxBigGuys
  )
    return `${team.rosterName} clubs may have at most ${String(maxBigGuys)} Big Guy${maxBigGuys === 1 ? "" : "s"}.`;
  return undefined;
}

export function gutterSpecialistRefusal(
  team: Team,
  template: PlayerTemplate
): string | undefined {
  if (!team.club) return "Only a club can hire a Gutter Bowl specialist.";
  const locked = gutterLockReason(team);
  if (locked) return locked;
  if (gutterSpecialist(team))
    return "The club already has its Gutter Bowl specialist.";
  if (isLineman(template))
    return "The Gutter Bowl specialist is the fifth positional, so it cannot be a Lineman.";
  const refusal = positionRefusal(team, template);
  if (refusal) return refusal;
  if (team.treasury < template.cost) return "Not enough gold in the treasury.";
  return undefined;
}

export function hireGutterSpecialist(
  team: Team,
  template: PlayerTemplate
): SpecialistHire {
  const reason = gutterSpecialistRefusal(team, template);
  if (reason || !team.club) return { hired: false, reason: reason ?? "" };
  const player = createPlayer(
    template,
    team.id,
    nextFreeNumber(team, ROSTER_SLOTS + 1)
  );
  player.id = uniquePlayerId(team, player.id);
  player.cost = template.cost;
  team.players.push(player);
  team.treasury -= template.cost;
  team.club.gutterSpecialistId = player.id;
  team.teamValue = calculateTeamValue(team);
  return { hired: true, player };
}

export function chooseGutterSitsOut(
  team: Team,
  playerId: string
): EditDecision {
  const chosen = corePlayers(team).find((player) => player.id === playerId);
  if (!team.club || !chosen || !isLineman(chosen))
    return {
      allowed: false,
      reason: "The player who sits out Gutter Bowl must be a Core Sevens Lineman.",
    };
  team.club.gutterSitsOutId = chosen.id;
  return { allowed: true };
}

export function careerCounts(team: Team, competition: boolean): boolean {
  return !team.club || competition;
}

export function shirtMoveRefusal(
  team: Team,
  from: number,
  to: number
): string | undefined {
  const number = gutterSpecialist(team)?.number;
  if (number === undefined) return undefined;
  const intoCore =
    (from === number && to <= ROSTER_SLOTS) ||
    (to === number && from <= ROSTER_SLOTS);
  return intoCore
    ? "The Gutter Bowl specialist keeps a shirt number above 11, so the Core Sevens squad keeps all eleven."
    : undefined;
}

export function inTournament(team: Team): boolean {
  return team.activeCompetitionId?.startsWith(TOURNAMENT_ID_PREFIX) ?? false;
}

export function friendlyRefusal(team: Team): string | undefined {
  return team.club && inTournament(team)
    ? `${team.name} is playing a tournament. A club in a tournament plays no other games until the tournament ends.`
    : undefined;
}
