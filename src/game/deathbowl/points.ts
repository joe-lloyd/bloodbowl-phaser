import type { GameParts } from "../../services/gameService/parts";
import { type GameEvents, GameEventNames } from "../../types/events";
import type { Player } from "../../types/Player";
import { InjuryResult } from "../controllers/InjuryController";
import { playerById } from "../seating";

const POINTS = {
  touchdown: 10,
  interception: 5,
  casualty: 5,
  completion: 2,
  ko: 2,
  "crowd-surf": 2,
  "pick-up": 1,
  "hand-off": 1,
  stun: 1,
} as const;

export type PointsReason = keyof typeof POINTS;

type Ledger = Pick<GameParts, "state" | "eventBus" | "seating">;

type InjuryRolled = GameEvents[typeof GameEventNames.InjuryRolled];

export function awardPoints(
  parts: Ledger,
  earner: Player,
  reason: PointsReason
): void {
  const { state, eventBus } = parts;
  const { teamId } = earner;
  const points = POINTS[reason];
  state.points ??= {};
  const total = (state.points[teamId] ?? 0) + points;
  state.points[teamId] = total;
  eventBus.emit(GameEventNames.PointsAwarded, {
    teamId,
    playerId: earner.id,
    reason,
    points,
    total,
  });
}

function contactReason({ result, stunnedToReserves }: InjuryRolled): PointsReason {
  switch (result) {
    case InjuryResult.STUNNED:
      return stunnedToReserves ? "crowd-surf" : "stun";
    case InjuryResult.KO:
      return "ko";
    case InjuryResult.BADLY_HURT:
    case InjuryResult.SERIOUSLY_HURT:
    case InjuryResult.DEAD:
      return "casualty";
  }
}

function rivalCauser(parts: Ledger, injury: InjuryRolled): Player | undefined {
  if (injury.causerId === undefined) return undefined;
  const causer = playerById(parts.seating, injury.causerId);
  const victim = playerById(parts.seating, injury.playerId);
  return causer && victim && causer.teamId !== victim.teamId ? causer : undefined;
}

export function bindPoints(parts: Ledger): void {
  const { eventBus, seating } = parts;
  const credit = (playerId: string, reason: PointsReason) => {
    const earner = playerById(seating, playerId);
    if (earner) awardPoints(parts, earner, reason);
  };
  eventBus.on(GameEventNames.BallPickup, ({ playerId, success }) => {
    if (success) credit(playerId, "pick-up");
  });
  eventBus.on(GameEventNames.PassCompleted, ({ playerId, action }) => {
    credit(playerId, action === "handoff" ? "hand-off" : "completion");
  });
  eventBus.on(GameEventNames.PassIntercepted, ({ interceptorId }) => {
    credit(interceptorId, "interception");
  });
  eventBus.on(GameEventNames.InjuryRolled, (injury) => {
    const causer = rivalCauser(parts, injury);
    if (causer) awardPoints(parts, causer, contactReason(injury));
  });
}
