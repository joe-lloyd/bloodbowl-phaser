import type { GameParts } from "../../services/gameService/parts";
import { GameEventNames } from "../../types/events";
import { type Player, PlayerStatus } from "../../types/Player";
import { type FlowContext } from "../core/GameFlowManager";
import { GameOperation } from "../core/GameOperation";
import { BounceOperation } from "../operations/BounceOperation";
import { CatchOperation } from "../operations/CatchOperation";
import {
  type BallId,
  ballSquare,
  mayTakeBall,
  otherBallSquare,
  placeBall,
} from "../rules/balls";
import { type FourSeating, playerAt } from "../seating";
import { activeLayout } from "../variants/activeMatch";
import type { Square } from "../variants/pitchLayouts";
import { centreSquare } from "./openingBalls";
import { awardPoints } from "./points";

const otherBall = (ball: BallId): BallId => (ball === 0 ? 1 : 0);

function liftedBalls(
  parts: GameParts,
  seating: FourSeating,
  { scorer, ball }: { scorer: Player; ball: BallId }
): BallId[] {
  const other = otherBall(ball);
  const at = ballSquare(parts.state, other);
  const holder = at ? playerAt(seating, at) : undefined;
  const holds =
    holder?.teamId === scorer.teamId && holder.status === PlayerStatus.ACTIVE;
  return holds ? [ball, other] : [ball];
}

function countTouchdown(parts: GameParts, scorer: Player): void {
  const { state, eventBus } = parts;
  const { teamId } = scorer;
  state.score[teamId] = (state.score[teamId] ?? 0) + 1;
  awardPoints(parts, scorer, "touchdown");
  eventBus.emit(GameEventNames.Touchdown, {
    teamId,
    score: state.score[teamId],
    scorerId: scorer.id,
  });
  const team = parts.game.getTeam(teamId)?.name ?? teamId;
  const detail = `${scorer.playerName} scores for ${team}, touchdown ${String(state.score[teamId])}. The ball re-enters in the centre.`;
  eventBus.emit(GameEventNames.UI_Announce, {
    kind: "touchdown",
    headline: "Touchdown!",
    subtitle: detail,
  });
  eventBus.emit(GameEventNames.UI_LogEntry, {
    category: "score",
    headline: "TOUCHDOWN!",
    detail,
    teamId,
  });
}

export function scoreTouchdown(
  parts: GameParts,
  seating: FourSeating,
  scored: { scorer: Player; ball: BallId }
): void {
  const { state, flowManager } = parts;
  const { teamId } = scored.scorer;
  const lifted = liftedBalls(parts, seating, scored);
  for (const ball of lifted) placeBall(state, ball, null);
  countTouchdown(parts, scored.scorer);
  const scorers = state.turn.scoringTeamIds ?? [];
  if (!scorers.includes(teamId))
    state.turn.scoringTeamIds = [...scorers, teamId];
  if (state.activeTeamId === teamId) state.turn.endsAfterActivation = true;
  if (state.activePlayer?.id === scored.scorer.id)
    delete state.activePlayer.stalling;
  for (const ball of lifted) flowManager.add(new BallReentryOperation(ball));
}

function landing(
  context: FlowContext,
  ball: BallId,
  square: Square
): GameOperation | null {
  const { gameService } = context;
  const state = gameService.getState();
  const player = gameService.getPlayerAt(square.x, square.y);
  const standing = player?.status === PlayerStatus.ACTIVE;
  if (player && standing && mayTakeBall(state, player, ball)) {
    gameService.placeBall(ball, square);
    return new CatchOperation(player.id, { origin: "bounce", ball });
  }
  const other = otherBallSquare(state, ball);
  const onOtherBall = other?.x === square.x && other.y === square.y;
  if (player || onOtherBall)
    return new BounceOperation(square, { ball, bounces: 1 });
  gameService.placeBall(ball, square);
  context.eventBus.emit(GameEventNames.BallPlaced, { ...square });
  return null;
}

class BallReentryOperation extends GameOperation {
  public readonly name = "BallReentry";

  private readonly ball: BallId;

  constructor(ball: BallId) {
    super();
    this.ball = ball;
  }

  execute(context: FlowContext): Promise<void> {
    const dice = context.gameService.getDiceController();
    const label = `Ball ${String(this.ball + 1)} re-enters`;
    const square = centreSquare(activeLayout(), () => dice.rollD8(label), []);
    context.eventBus.emit(GameEventNames.UI_LogEntry, {
      category: "drive",
      headline: label,
      detail: `It drops onto square ${String(square.x)}, ${String(square.y)}.`,
    });
    const next = landing(context, this.ball, square);
    if (next) context.flowManager.add(next, true);
    return Promise.resolve();
  }
}
