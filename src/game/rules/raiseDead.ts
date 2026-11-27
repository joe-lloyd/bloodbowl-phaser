import { getRosterByRosterName } from "../../data/RosterTemplates";
import type { IEventBus } from "../../services/EventBus";
import type { IGameService } from "../../services/interfaces/IGameService";
import {
  InjuryType,
  type Player,
  PlayerStatus,
  PositionKeyWord,
  createPlayer,
} from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import {
  type PendingDevelopment,
  type Team,
  TeamSpecialRule,
  calculateTeamValue,
  isPendingRecruit,
} from "../../types/Team";
import { GameEventNames } from "../../types/events";
import { staysOnRoster } from "./leagueRoster";
import { uniquePlayerId } from "./playerSlots";

export function addReserveLineman(team: Team): Player | null {
  const template = getRosterByRosterName(team.rosterName).playerTemplates.find(
    (candidate) => candidate.keywords.includes(PositionKeyWord.LINEMAN)
  );
  if (!template) return null;
  const number = Math.max(0, ...team.players.map((player) => player.number)) + 1;
  const player = createPlayer(template, team.id, number);
  player.id = uniquePlayerId(team, player.id);
  player.status = PlayerStatus.RESERVE;
  team.players.push(player);
  return player;
}

export function raiseDead(
  gameService: IGameService,
  eventBus: IEventBus,
  victim: Player
): void {
  if (victim.stats.ST > 4 || hasSkill(victim.skills, SkillType.STUNTY)) return;
  const team = gameService
    .getTeams()
    .find(
      (candidate) =>
        candidate.id !== victim.teamId &&
        getRosterByRosterName(candidate.rosterName).specialRules.includes(
          TeamSpecialRule.MASTERS_OF_UNDEATH
        )
    );
  if (!team) return;
  const state = gameService.getState();
  if (state.raisedDead?.[team.id]) return;
  const raised = addReserveLineman(team);
  if (!raised) return;
  state.raisedDead ??= {};
  state.raisedDead[team.id] = raised.id;
  eventBus.emit(
    GameEventNames.UI_Notification,
    `Masters of Undeath: ${team.name} raises ${raised.playerName} in Reserves!`
  );
  eventBus.emit(GameEventNames.RefreshBoard, undefined);
}

export type RaisedDeadOffer = Extract<
  PendingDevelopment,
  { kind: "raised-dead-recruit" }
>;

export function canKeepRaisedDead(team: Team, playerId: string): boolean {
  return (
    team.players.filter(
      (player) =>
        player.id !== playerId &&
        staysOnRoster(team, player) &&
        !isPendingRecruit(team, player.id)
    ).length < team.maxRosterSize
  );
}

export function offerRaisedDeadRecruit(team: Team, playerId: string): void {
  const player = team.players.find((candidate) => candidate.id === playerId);
  if (!player) return;
  if (
    team.advancementMode === "matched-play" ||
    player.injuries.includes(InjuryType.DEAD)
  ) {
    team.players = team.players.filter(
      (candidate) => candidate.id !== playerId
    );
    return;
  }
  team.pendingDevelopment ??= [];
  if (
    team.pendingDevelopment.some(
      (entry) =>
        entry.kind === "raised-dead-recruit" && entry.playerId === playerId
    )
  )
    return;
  team.pendingDevelopment.push({
    id: `raised-dead-${playerId}`,
    kind: "raised-dead-recruit",
    playerId,
    createdAt: Date.now(),
  });
}

export function resolveRaisedDeadRecruit(
  team: Team,
  entry: RaisedDeadOffer,
  keep: boolean
): void {
  if (!team.pendingDevelopment?.some((pending) => pending.id === entry.id))
    return;
  if (keep && !canKeepRaisedDead(team, entry.playerId))
    throw new Error("The roster has no room for this Lineman.");
  if (!keep)
    team.players = team.players.filter(
      (player) => player.id !== entry.playerId
    );
  team.pendingDevelopment = team.pendingDevelopment.filter(
    (pending) =>
      pending.id !== entry.id &&
      (keep || !("playerId" in pending) || pending.playerId !== entry.playerId)
  );
  team.teamValue = calculateTeamValue(team);
}
