import type { DeathbowlFlow } from "../../services/gameService/matchFlow";
import type { GameParts } from "../../services/gameService/parts";
import { resetDriveState } from "../../services/gameService/driveLifecycle";
import { GamePhase } from "../../types/GameState";
import { GameEventNames } from "../../types/events";
import { PlayerStatus } from "../../types/Player";
import { movePlayerToBox } from "../rules/playerLocation";
import { replenishTeamRerolls } from "../teamRerolls";
import { activeLayout, activeRules } from "../variants/activeMatch";
import {
  everyone,
  type FourSeating,
  playOrderAfter,
  seatOf,
  teamsOf,
} from "../seating";
import { placeOpeningBalls, rollOff } from "./openingBalls";
import { type Placing, placings } from "./placings";
import { scoredTurnOperation } from "./scoredTurn";
import { scoreTouchdown } from "./touchdown";

export function deathbowlFlow(
  parts: GameParts,
  seating: FourSeating
): DeathbowlFlow {
  return {
    kind: "deathbowl",
    scoreRun: "continue",
    begin: () => {
      parts.state.points ??= Object.fromEntries(
        teamsOf(seating).map(({ id }) => [id, 0])
      );
      parts.state.turn.teamId = rollOff(parts.diceController, teamsOf(seating)).id;
      setUpNextSeat(parts, seating);
    },
    seatSetUp: () => {
      setUpNextSeat(parts, seating);
    },
    touchdown: (scorer, ball) => {
      scoreTouchdown(parts, seating, { scorer, ball });
    },
    turnEnding: (endingTeamId) => {
      const scorers = parts.state.turn.scoringTeamIds;
      if (!scorers) return false;
      const order = turnOrderFrom(parts, seating, endingTeamId);
      parts.flowManager.add(
        scoredTurnOperation(order.map((id) => seatOf(seating, id)), scorers)
      );
      return true;
    },
    halfOver: () => {
      if (parts.state.turn.isHalf2) fullTime(parts);
      else halfTime(parts, seating);
    },
    fullTime: () => {
      announcePlacings(parts, seatPlacings(parts, seating));
    },
    standings: () => ({ kind: "placings", rows: seatPlacings(parts, seating) }),
  };
}

function turnOrderFrom(
  parts: GameParts,
  seating: FourSeating,
  teamId: string
): string[] {
  const rotation = parts.state.turn.isHalf2 ? -1 : 1;
  const after = playOrderAfter(seating, teamId, rotation).map(({ id }) => id);
  return [teamId, ...after.slice(0, -1)];
}

function setUpNextSeat(parts: GameParts, seating: FourSeating): void {
  const done = parts.state.setup?.confirmedTeamIds ?? [];
  const order = turnOrderFrom(parts, seating, parts.state.turn.teamId);
  const next = order.find((id) => !done.includes(id));
  if (next) parts.setupManager.startSeatSetup(next);
  else startHalf(parts, seating);
}

function startHalf(parts: GameParts, seating: FourSeating): void {
  const { state, diceController } = parts;
  placeOpeningBalls(state, activeLayout(), {
    count: activeRules().format.ballCount,
    rollD8: (ball) => diceController.rollD8(`Opening ball ${String(ball + 1)}`),
  });
  parts.rerollArbiter.beginHalf(teamsOf(seating).map(({ id }) => id));
  parts.turnManager.beginHalf(state.turn.teamId, state.turn.isHalf2 ? -1 : 1);
}

function halfTime(parts: GameParts, seating: FourSeating): void {
  const { state, eventBus } = parts;
  state.turn.isHalf2 = true;
  resetDriveState(parts);
  for (const player of everyone(seating)) {
    if (player.status === PlayerStatus.KO)
      movePlayerToBox(player, { box: "reserves" }, eventBus);
  }
  delete state.seriousKnockoutIds;
  replenishTeamRerolls(state);
  parts.turnManager.seedTurnCounts(0);
  state.phase = GamePhase.HALFTIME;
  eventBus.emit(GameEventNames.PhaseChanged, { phase: GamePhase.HALFTIME });
  eventBus.emit(GameEventNames.UI_LogEntry, {
    category: "drive",
    headline: "Halftime",
    detail: placingsLine(parts, seatPlacings(parts, seating)),
  });
  setUpNextSeat(parts, seating);
}

function fullTime(parts: GameParts): void {
  const { state } = parts;
  state.phase = GamePhase.GAME_OVER;
  state.activeTeamId = null;
  state.result ??= { reason: "completed" };
  parts.eventBus.emit(GameEventNames.PhaseChanged, {
    phase: GamePhase.GAME_OVER,
  });
}

function seatPlacings(parts: GameParts, seating: FourSeating): Placing[] {
  const { points = {}, score } = parts.state;
  return placings(
    teamsOf(seating).map(({ id }) => ({
      teamId: id,
      points: points[id] ?? 0,
      touchdowns: score[id] ?? 0,
    }))
  );
}

function placingsLine(parts: GameParts, rows: readonly Placing[]): string {
  return rows
    .map(({ teamId, place, points, touchdowns }) => {
      const name = parts.game.getTeam(teamId)?.name ?? teamId;
      return `${String(place)}. ${name} ${String(points)} pts, ${String(touchdowns)} TD`;
    })
    .join("; ");
}

function announcePlacings(parts: GameParts, rows: readonly Placing[]): void {
  const line = `FULL TIME — ${placingsLine(parts, rows)}`;
  parts.eventBus.emit(GameEventNames.UI_Notification, line);
  parts.eventBus.emit(GameEventNames.UI_GameLog, line);
}
