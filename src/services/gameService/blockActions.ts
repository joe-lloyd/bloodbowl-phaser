import { kickoffTurnOf } from "@/game/kickoff/kickRecord";
import { isBallAt } from "@/game/managers/movementShared";
import { GameEventNames } from "@/types/events";
import { type Player, PlayerStatus } from "@/types/Player";
import { BounceOperation } from "@/game/operations/BounceOperation";
import { PickupOperation } from "@/game/operations/PickupOperation";
import { ArmourOperation } from "@/game/operations/ArmourOperation";
import { CrowdInjuryOperation } from "@/game/operations/CrowdInjuryOperation";
import {
  foldTrigger,
  gatherParticipants,
  adjacentStanding,
  type FollowUpContext,
} from "@/game/skills";
import { moveAllowance } from "@/game/skills/movement";
import { trapdoorOpens } from "@/game/inducements/matchInducements";
import { withDriveModifiers } from "@/game/kickoff/driveEffects";
import { type BlockResult } from "../BlockResolutionService";
import type { GameParts } from "./parts";
import { everyone } from "@/game/seating";
import { awaitingSecondAction } from "./activation";
import { rushSucceeds } from "./rush";

function isStandingOpponent(
  player: Player,
  other: Player | undefined
): boolean {
  return (
    !!other &&
    other.teamId !== player.teamId &&
    other.status === PlayerStatus.ACTIVE
  );
}

export async function forceBlock(
  parts: GameParts,
  attackerId: string,
  defenderId: string
): Promise<void> {
  const { blockManager, game, movementManager, state } = parts;
  const attacker = game.getPlayerById(attackerId);
  if (!attacker || state.activePlayer?.id !== attackerId) return;

  state.activePlayer = {
    id: attackerId,
    action: "block",
    committed: true,
    forcedBlock: true,
  };
  if (attacker.status === PlayerStatus.PRONE) {
    await movementManager.standUp(attackerId);
    if (game.hasPlayerActed(attackerId)) return;
  }

  blockManager.previewBlock(attackerId, defenderId);
  await blockManager.startBlock(attackerId, defenderId);
}

export async function multipleBlock({
  parts,
  attackerId,
  defender1Id,
  defender2Id,
}: {
  parts: GameParts;
  attackerId: string;
  defender1Id: string;
  defender2Id: string;
}): Promise<void> {
  if (awaitingSecondAction(parts, attackerId)) return;
  if (kickoffTurnOf(parts.state))
    throw new Error("player-not-in-kickoff-turn");
  await parts.blockManager.startMultipleBlock(
    attackerId,
    defender1Id,
    defender2Id
  );
}

export async function rollBlockDice({
  parts,
  attackerId,
  defenderId,
  numDice,
  isAttackerChoice,
}: {
  parts: GameParts;
  attackerId: string;
  defenderId: string;
  numDice: number;
  isAttackerChoice: boolean;
}): Promise<void> {
  const refusal = blockRefusal(parts, attackerId, defenderId);
  if (refusal) {
    parts.eventBus.emit(GameEventNames.UI_Notification, refusal);
    parts.eventBus.emit(GameEventNames.UI_BlockRollCancelled, undefined);
    return;
  }

  parts.playerActionManager.commitAction(attackerId);

  if (
    parts.state.activePlayer?.action === "blitz" &&
    parts.state.activePlayer.id === attackerId
  ) {
    if (!(await parts.game.chargeBlitzBlockSquare(attackerId))) return;
    markBlitzBlockUsed(parts);
  }

  await parts.blockManager.rollBlockDice(
    attackerId,
    defenderId,
    numDice,
    isAttackerChoice
  );
}

export function markBlitzBlockUsed({ state }: GameParts): void {
  if (state.activePlayer) state.activePlayer.blitzBlockUsed = true;
}

export async function chargeBlitzBlockSquare(
  parts: GameParts,
  attackerId: string
): Promise<boolean> {
  const attacker = parts.game.getPlayerById(attackerId);
  if (!attacker) return false;
  const effectiveAttacker = withDriveModifiers(attacker, parts.state);
  const newUsed = (parts.state.turn.movementUsed.get(attackerId) ?? 0) + 1;
  if (newUsed > moveAllowance(effectiveAttacker)) {
    parts.eventBus.emit(
      GameEventNames.UI_Notification,
      "No movement left to make the Blitz block!"
    );
    parts.eventBus.emit(GameEventNames.UI_BlockRollCancelled, undefined);
    return false;
  }
  parts.state.turn.movementUsed.set(attackerId, newUsed);
  if (newUsed <= effectiveAttacker.stats.MA) return true;

  if (await rushSucceeds(parts, attacker)) return true;

  fallAfterBlitzRush(parts, attacker);
  return false;
}

export async function resolveBlock({
  parts,
  attackerId,
  defenderId,
  result,
}: {
  parts: GameParts;
  attackerId: string;
  defenderId: string;
  result: BlockResult;
}): Promise<void> {
  parts.eventBus.emit(GameEventNames.DecisionResolved, {
    type: "block-dice",
    result: result.type,
  });
  await parts.blockManager.resolveBlock(attackerId, defenderId, result);
}

export async function executePush({
  parts,
  attackerId,
  defenderId,
  push,
}: {
  parts: GameParts;
  attackerId: string;
  defenderId: string;
  push: {
    direction: { x: number; y: number };
    resultType: string;
    followUp: boolean;
  };
}): Promise<void> {
  parts.eventBus.emit(GameEventNames.DecisionResolved, {
    type: "push-direction",
  });
  await parts.blockManager.executePush(
    attackerId,
    defenderId,
    push.direction,
    push.resultType,
    push.followUp
  );
}

export async function followUpPush(
  parts: GameParts,
  attackerId: string,
  targetSquare: { x: number; y: number }
): Promise<void> {
  const { state, eventBus } = parts;
  const attacker = parts.game.getPlayerById(attackerId);
  if (!attacker?.gridPosition) return;

  await triggerFollowUp(parts, {
    attacker,
    from: attacker.gridPosition,
    targetSquare,
  });

  const from = { ...attacker.gridPosition };
  attacker.gridPosition = { ...targetSquare };

  const carriedBall = isBallAt(state, from);
  if (carriedBall) {
    state.ballPosition = { ...targetSquare };
    eventBus.emit(GameEventNames.BallPlaced, { ...targetSquare });
  }

  eventBus.emit(GameEventNames.PlayerMoved, {
    playerId: attackerId,
    from,
    to: { ...targetSquare },
    path: [from, { ...targetSquare }],
    ...(carriedBall && { ballFrom: from, ballPath: [from, { ...targetSquare }] }),
    ballJoinStep: 0,
  });

  if (fallThroughFollowUp(parts, { attacker, targetSquare, carriedBall }))
    return;

  const looseBallHere = !carriedBall && isBallAt(state, targetSquare);
  if (looseBallHere) {
    const pickup = new PickupOperation(attackerId);
    await pickup.execute(parts.game.getFlowContext());
    if (!pickup.success) return;
  }

  parts.game.checkForTouchdown(attackerId);
}

function blockDeclarationRefuses(
  parts: GameParts,
  attackerId: string
): boolean {
  const declaration = parts.state.activePlayer;
  return (
    declaration?.id !== attackerId ||
    awaitingSecondAction(parts, attackerId) ||
    (declaration.action !== "block" && declaration.action !== "blitz") ||
    declaration.blockReplacement !== undefined ||
    declaration.forcedBlock === true ||
    parts.game.hasUsedBlitzBlock(attackerId)
  );
}
function blockRefusal(
  parts: GameParts,
  attackerId: string,
  defenderId: string
): string | null {
  if (blockDeclarationRefuses(parts, attackerId))
    return "No normal Block is available for this declaration.";
  const blocker = parts.game.getPlayerById(attackerId);
  if (blocker?.status !== PlayerStatus.ACTIVE)
    return "A prone or stunned player cannot block!";
  if (!isStandingOpponent(blocker, parts.game.getPlayerById(defenderId)))
    return "Only a Standing opponent can be Blocked.";
  return null;
}

function fallAfterBlitzRush(parts: GameParts, attacker: Player): void {
  attacker.status = PlayerStatus.PRONE;
  parts.eventBus.emit(GameEventNames.PlayerKnockedDown, {
    playerId: attacker.id,
  });
  parts.eventBus.emit(GameEventNames.PlayerStatusChanged, attacker);
  if (parts.ballManager.hasBall(attacker.id) && attacker.gridPosition) {
    parts.flowManager.add(new BounceOperation(attacker.gridPosition), true);
  }
  parts.flowManager.add(new ArmourOperation(attacker.id), true);

  parts.eventBus.emit(GameEventNames.UI_BlockRollCancelled, undefined);
  parts.game.triggerTurnover("Failed Rush on Blitz block");
}

async function triggerFollowUp(
  parts: GameParts,
  {
    attacker,
    from,
    targetSquare,
  }: {
    attacker: Player;
    from: { x: number; y: number };
    targetSquare: { x: number; y: number };
  }
): Promise<void> {
  const { eventBus } = parts;
  const followCtx: FollowUpContext = {
    attacker,
    targetSquare,
    decisions: parts.decisionService,
    flow: parts.flowManager,
    triggers: [],
  };
  const standing = adjacentStanding(from, everyone(parts.seating));
  await foldTrigger(
    "onFollowUp",
    gatherParticipants(attacker, undefined, standing),
    followCtx
  );
  for (const t of followCtx.triggers) {
    eventBus.emit(GameEventNames.SkillTriggered, t);
  }
}

function fallThroughFollowUp(
  parts: GameParts,
  {
    attacker,
    targetSquare,
    carriedBall,
  }: {
    attacker: Player;
    targetSquare: { x: number; y: number };
    carriedBall: boolean;
  }
): boolean {
  const { state } = parts;
  const attackerId = attacker.id;
  if (trapdoorOpens(state, parts.diceController, attacker, targetSquare)) {
    delete attacker.gridPosition;
    parts.flowManager.add(
      new CrowdInjuryOperation(attackerId, { ...targetSquare }, false, {
        carriedBall,
      }),
      true
    );

    if (attacker.teamId === state.activeTeamId) {
      parts.game.triggerTurnover("Fell through a Trapdoor");
    }
    return true;
  }

  return false;
}
