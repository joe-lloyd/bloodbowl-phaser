import { type Player, PlayerStatus } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import type { ReserveMoveDecisionRequest } from "../../types/decisions";
import { type FlowContext } from "../core/GameFlowManager";
import { GameOperation } from "../core/GameOperation";
import { BounceOperation } from "../operations/BounceOperation";
import { secretWeaponsAfterDrive } from "../operations/secretWeaponsAfterDrive";
import { type BallId, ballOf, ballOnSquare } from "../rules/balls";
import { squareAt } from "../rules/frames";
import { movePlayerToBox } from "../rules/playerLocation";
import type { Seat } from "../seating";
import { activeRules } from "../variants/activeMatch";
import type { Square } from "../variants/pitchLayouts";

interface HeldBall {
  readonly ball: BallId;
  readonly at: Square;
}

function heldBySecretWeapons(
  context: FlowContext,
  players: readonly Player[]
): HeldBall[] {
  const state = context.gameService.getState();
  const held: HeldBall[] = [];
  for (const player of players) {
    const ball = ballOf(state, player);
    const at = player.gridPosition;
    const weapon = hasSkill(player.skills, SkillType.SECRET_WEAPON);
    if (weapon && at && ball !== undefined) held.push({ ball, at: { ...at } });
  }
  return held;
}

async function sendOffSecretWeapons(
  context: FlowContext,
  scorers: readonly Seat[]
): Promise<void> {
  const players = scorers.flatMap(({ team }) => team.players);
  const held = heldBySecretWeapons(context, players);
  await secretWeaponsAfterDrive(context, players);
  for (const { ball, at } of held) {
    if (!context.gameService.getPlayerAt(at.x, at.y))
      context.flowManager.add(new BounceOperation(at, { ball }));
  }
}

function freeSquares(context: FlowContext, seat: Seat, along: number): Square[] {
  const { gameService } = context;
  const { min, max } = seat.frame.arm.setupAcross;
  const row = Array.from({ length: max - min + 1 }, (_, i) =>
    squareAt(seat.frame, along, min + i)
  );
  return row.filter(
    (square) =>
      !gameService.getPlayerAt(square.x, square.y) &&
      !ballOnSquare(gameService.getState(), square)
  );
}

function reserveOffer(
  context: FlowContext,
  seat: Seat
): ReserveMoveDecisionRequest | null {
  const { players } = seat.team;
  const onPitch = players.filter((player) => player.gridPosition).length;
  const reserves = players.filter(
    (player) => player.status === PlayerStatus.RESERVE && !player.gridPosition
  );
  const { scrimmage } = seat.frame.arm;
  const line = freeSquares(context, seat, scrimmage);
  const squares = line.length > 0 ? line : freeSquares(context, seat, scrimmage - 1);
  const room = onPitch < activeRules().setup.maxOnPitch;
  if (!room || reserves.length === 0 || squares.length === 0) return null;
  return {
    type: "reserve-move",
    chooserTeamId: seat.team.id,
    playerIds: reserves.map(({ id }) => id),
    squares,
  };
}

async function moveReserves(context: FlowContext, seat: Seat): Promise<void> {
  const decisions = context.gameService.getDecisionService();
  let offer = reserveOffer(context, seat);
  while (offer) {
    const { move } = await decisions.request(offer);
    const player = move && seat.team.players.find(({ id }) => id === move.playerId);
    if (!move || !player) return;
    movePlayerToBox(player, { box: "pitch", position: move.square }, context.eventBus);
    offer = reserveOffer(context, seat);
  }
}

export class ScoredTurnOperation extends GameOperation {
  public readonly name = "ScoredTurn";

  private readonly order: readonly Seat[];
  private readonly scorers: readonly Seat[];

  constructor(order: readonly Seat[], scoringTeamIds: readonly string[]) {
    super();
    this.order = order;
    this.scorers = order.filter(({ team }) => scoringTeamIds.includes(team.id));
  }

  async execute(context: FlowContext): Promise<void> {
    await sendOffSecretWeapons(context, this.scorers);
    await context.gameService.rollKORecovery();
    for (const seat of this.order) await moveReserves(context, seat);
  }
}
