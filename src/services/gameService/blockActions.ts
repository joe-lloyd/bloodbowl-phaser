/**
 * The Block steps GameService takes before handing over to the block engine:
 * whether a Block may be rolled, the square of movement a Blitz's Block
 * costs, closing the dice and push dialogs, and the free follow-up into the
 * vacated square.
 */

import { steadyFootingSaves } from "@/game/rules/steadyFooting";
import { isBallAt } from "@/game/managers/movementShared";
import { GameEventNames } from "@/types/events";
import { Player, PlayerStatus } from "@/types/Player";
import { BounceOperation } from "@/game/operations/BounceOperation";
import { PickupOperation } from "@/game/operations/PickupOperation";
import { ArmourOperation } from "@/game/operations/ArmourOperation";
import { CrowdInjuryOperation } from "@/game/operations/CrowdInjuryOperation";
import {
  foldTrigger,
  gatherParticipants,
  adjacentStanding,
  withRerollOffer,
  FollowUpContext,
} from "@/game/skills";
import { moveAllowance } from "@/game/skills/movement";
import {
  rushModifier,
  trapdoorOpens,
} from "@/game/inducements/matchInducements";
import { withDriveModifiers } from "@/game/kickoff/driveEffects";
import { BlockResult } from "../BlockResolutionService";
import type { GameParts } from "./parts";
import { awaitingSecondAction } from "./activation";

/** A Block only targets a Standing player of the other team. */
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

export async function multipleBlock(
  parts: GameParts,
  attackerId: string,
  defender1Id: string,
  defender2Id: string
): Promise<void> {
  if (awaitingSecondAction(parts, attackerId)) return;
  await parts.blockManager.startMultipleBlock(
    attackerId,
    defender1Id,
    defender2Id
  );
}

export async function rollBlockDice(
  parts: GameParts,
  attackerId: string,
  defenderId: string,
  numDice: number,
  isAttackerChoice: boolean
): Promise<void> {
  const declaration = parts.state.activePlayer;
  if (
    declaration?.id !== attackerId ||
    awaitingSecondAction(parts, attackerId) ||
    (declaration.action !== "block" && declaration.action !== "blitz") ||
    declaration.blockReplacement ||
    parts.game.hasUsedBlitzBlock(attackerId)
  ) {
    parts.eventBus.emit(
      GameEventNames.UI_Notification,
      "No normal Block is available for this declaration."
    );
    parts.eventBus.emit(GameEventNames.UI_BlockRollCancelled);
    return;
  }

  // A player that is down or stunned can never throw a block
  const blocker = parts.game.getPlayerById(attackerId);
  if (!blocker || blocker.status !== PlayerStatus.ACTIVE) {
    parts.eventBus.emit(
      GameEventNames.UI_Notification,
      "A prone or stunned player cannot block!"
    );
    parts.eventBus.emit(GameEventNames.UI_BlockRollCancelled);
    return;
  }

  // Only a Standing opponent can be Blocked; a downed one is Fouled
  if (!isStandingOpponent(blocker, parts.game.getPlayerById(defenderId))) {
    parts.eventBus.emit(
      GameEventNames.UI_Notification,
      "Only a Standing opponent can be Blocked."
    );
    parts.eventBus.emit(GameEventNames.UI_BlockRollCancelled);
    return;
  }

  // The block is happening — commit the declaration (a Blitz declared and
  // blocked without moving first still spends the team's Blitz).
  parts.playerActionManager.commitAction(attackerId);

  // The block at the end of a Blitz costs 1 movement (see
  // chargeBlitzBlockSquare). The Blitz's one Block is spent the moment it
  // is committed, whatever the dice later say.
  if (
    parts.state.activePlayer?.action === "blitz" &&
    parts.state.activePlayer.id === attackerId
  ) {
    if (!(await parts.game.chargeBlitzBlockSquare(attackerId))) return;
    parts.marks.blitzBlockUsed.add(attackerId);
  }

  await parts.blockManager.rollBlockDice(
    attackerId,
    defenderId,
    numDice,
    isAttackerChoice
  );
}

/**
 * Charge the square of movement a Block costs during a Blitz: the Blitz's
 * own block, and Frenzy's second block (2025 p.128: "performing a second
 * Block Action will also cost the player a square of movement. If this
 * player has no movement left, then they must Rush. If this player cannot
 * Rush then they cannot perform the second Block Action."). A point beyond
 * MA is a Rush, rolled BEFORE the block: on a failure the blitzer falls
 * over in front of their target. Returns whether the block may go ahead.
 */
export async function chargeBlitzBlockSquare(
  parts: GameParts,
  attackerId: string
): Promise<boolean> {
  const attacker = parts.game.getPlayerById(attackerId);
  if (!attacker) return false;
  const effectiveAttacker = withDriveModifiers(attacker, parts.state);
  const newUsed = (parts.state.turn.movementUsed.get(attackerId) || 0) + 1;
  if (newUsed > moveAllowance(effectiveAttacker)) {
    parts.eventBus.emit(
      GameEventNames.UI_Notification,
      "No movement left to make the Blitz block!"
    );
    parts.eventBus.emit(GameEventNames.UI_BlockRollCancelled);
    return false;
  }
  parts.state.turn.movementUsed.set(attackerId, newUsed);
  if (newUsed <= effectiveAttacker.stats.MA) return true;

  // The Blitz block's rush may be rerolled (Sure Feet / team)
  const check = await withRerollOffer(
    { gameService: parts.game, eventBus: parts.eventBus },
    attacker,
    "rush",
    () =>
      parts.diceController.rollSkillCheck(
        "Rush",
        2,
        rushModifier(parts.state, attacker),
        attacker.playerName
      )
  );
  if (
    check.success ||
    (await steadyFootingSaves(
      attacker,
      parts.diceController,
      parts.eventBus,
      parts.game
    ))
  )
    return true;

  attacker.status = PlayerStatus.PRONE;
  parts.eventBus.emit(GameEventNames.PlayerKnockedDown, {
    playerId: attackerId,
  });
  parts.eventBus.emit(GameEventNames.PlayerStatusChanged, attacker);
  if (parts.ballManager.hasBall(attackerId) && attacker.gridPosition) {
    parts.flowManager.add(new BounceOperation(attacker.gridPosition), true);
  }
  parts.flowManager.add(new ArmourOperation(attackerId), true);
  // The block never happens — release any dialog waiting on dice
  parts.eventBus.emit(GameEventNames.UI_BlockRollCancelled);
  parts.game.triggerTurnover("Failed Rush on Blitz block");
  return false;
}

export async function resolveBlock(
  parts: GameParts,
  attackerId: string,
  defenderId: string,
  result: BlockResult
): Promise<void> {
  // Online, both coaches see the dice; close them for the one who didn't pick
  parts.eventBus.emit(GameEventNames.DecisionResolved, {
    type: "block-dice",
    result: result.type,
  });
  await parts.blockManager.resolveBlock(attackerId, defenderId, result);
}

export async function executePush(
  parts: GameParts,
  attackerId: string,
  defenderId: string,
  push: {
    direction: { x: number; y: number };
    resultType: string;
    followUp: boolean;
  }
): Promise<void> {
  // Before the push: a chain push asks for the next direction from inside
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

/**
 * Follow-up into the square the pushed player vacated. This move is FREE:
 * no movement cost, no dodge, no rush — a Blitz already paid its movement
 * (and rolled any Rush) before the block.
 */
export async function followUpPush(
  parts: GameParts,
  attackerId: string,
  targetSquare: { x: number; y: number }
): Promise<void> {
  const { state, eventBus } = parts;
  const attacker = parts.game.getPlayerById(attackerId);
  if (!attacker || !attacker.gridPosition) return;

  // Trigger point: the blocker follows up (Frenzy-style effects hook here)
  const followCtx: FollowUpContext = {
    attacker,
    targetSquare,
    decisions: parts.decisionService,
    flow: parts.flowManager,
    triggers: [],
  };
  await foldTrigger(
    "onFollowUp",
    gatherParticipants(
      attacker,
      undefined,
      adjacentStanding(attacker.gridPosition, [
        ...parts.team1.players,
        ...parts.team2.players,
      ])
    ),
    followCtx
  );
  followCtx.triggers.forEach((t) =>
    eventBus.emit(GameEventNames.SkillTriggered, t)
  );

  const from = { ...attacker.gridPosition };
  attacker.gridPosition = { ...targetSquare };

  // A carrier keeps the ball while following up. A kick still in the air
  // stays over its landing square: nobody under it carries it.
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
    ballFrom: carriedBall ? from : undefined,
    ballPath: carriedBall ? [from, { ...targetSquare }] : undefined,
    ballJoinStep: 0,
  });

  // Treacherous Trapdoor (L12): following up onto it may drop the blocker.
  if (trapdoorOpens(state, parts.diceController, attacker, targetSquare)) {
    attacker.gridPosition = undefined;
    parts.flowManager.add(
      new CrowdInjuryOperation(attackerId, { ...targetSquare }, false, {
        carriedBall: !!carriedBall,
      }),
      true
    );
    // Decided now, as for a crowd push: the activation ends straight after.
    if (attacker.teamId === state.activeTeamId) {
      parts.game.triggerTurnover("Fell through a Trapdoor");
    }
    return;
  }

  // Following up onto a loose ball is entering its square — the player must
  // roll to pick it up. PickupOperation is the same path a move takes, so a
  // failed pickup bounces through BounceOperation (throw-in, catches) and
  // is a turnover. Without this the player just stood on the ball holding
  // nothing. A kick still in the air (a Charge! Blitz) is not loose yet.
  const looseBallHere = !carriedBall && isBallAt(state, targetSquare);
  if (looseBallHere) {
    const pickup = new PickupOperation(attackerId);
    await pickup.execute(parts.game.getFlowContext());
    if (!pickup.success) return; // the bounce and turnover are queued
  }

  parts.game.checkForTouchdown(attackerId);
}
