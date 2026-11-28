import type { PointsReason } from "../../../game/deathbowl/points";
import { ServiceContainer } from "../../../services/ServiceContainer";
import type { GameEventNames, GameEvents } from "../../../types/events";

const REASONS: Record<PointsReason, string> = {
  touchdown: "Touchdown",
  interception: "Interception",
  casualty: "Casualty",
  completion: "Completed pass",
  ko: "Knock-out",
  "crowd-surf": "Crowd surf",
  "pick-up": "Pick-up",
  "hand-off": "Hand-off",
  stun: "Stun",
};

type PointsAward = GameEvents[typeof GameEventNames.PointsAwarded];

export function pointsLine({ teamId, playerId, reason, points, total }: PointsAward) {
  const gs = ServiceContainer.isInitialized()
    ? ServiceContainer.getInstance().gameService
    : null;
  const team = gs?.getTeam(teamId)?.name ?? teamId;
  const player = gs?.getPlayerById(playerId)?.playerName ?? playerId;
  return {
    headline: `${team} +${String(points)} points`,
    detail: `${REASONS[reason]} by ${player}. ${String(total)} points in all.`,
  };
}
