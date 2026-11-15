/**
 * Starting a Pass, Hand-off or Punt: the checks GameService makes before it
 * queues the operation that resolves it.
 */

import { GamePhase } from "@/types/GameState";
import { Player } from "@/types/Player";
import { SkillType, hasSkill } from "@/types/Skills";
import { PassController } from "@/game/controllers/PassController";
import { PassOperation } from "@/game/operations/PassOperation";
import { HandoffOperation } from "@/game/operations/HandoffOperation";
import { PuntOperation } from "@/game/operations/PuntOperation";
import { isLegalHandoffTarget } from "@/game/rules/handoff";
import { weatherEffects } from "@/game/rules/weather";
import { GameConfig } from "@/config/GameConfig";
import type { GameParts } from "./parts";
import {
  awaitingSecondAction,
  biteBeforeBallAction,
  takeUnsatedBloodlust,
} from "./activation";

type Square = { x: number; y: number };
type ActionStart = { success: boolean; result?: string };

/**
 * Start Pass Action (Replaces throwBall)
 * Queues a PassOperation in the FlowManager.
 */
export async function throwBall(
  parts: GameParts,
  passerId: string,
  target: Square,
  hailMary: boolean
): Promise<ActionStart> {
  if (awaitingSecondAction(parts, passerId))
    return { success: false, result: "second-action-not-declared" };
  // NOTE: Signature kept async for compatibility, but it resolves immediately
  // while the operation runs in background/flow.

  if (parts.state.phase !== GamePhase.PLAY) {
    return { success: false, result: "Not in play phase" };
  }

  console.log(
    `[GameService] Starting Pass Action: ${passerId} -> ${target.x},${target.y}`
  );

  // 1. Validation (Keep basic checks here or move to op?)
  // Basic checks for "Can I start this op?"
  const passer = parts.game.getPlayerById(passerId);
  if (!passer || !passer.gridPosition) {
    return { success: false, result: "Player not found" };
  }
  if (!holdsBall(parts, passerId, passer.gridPosition)) {
    return { success: false, result: "Player does not have ball" };
  }
  const refusal = passTargetRefusal(
    parts,
    passer,
    passer.gridPosition,
    target,
    hailMary
  );
  if (refusal) return { success: false, result: refusal };

  // 2. Queue Operation
  const pass = new PassOperation(passerId, target.x, target.y, hailMary);
  if (takeUnsatedBloodlust(parts, passerId)) {
    biteBeforeBallAction(parts, passerId, () =>
      parts.flowManager.add(pass, true)
    );
    return { success: true, result: "Bloodlust: bite before the pass" };
  }
  parts.flowManager.add(pass);

  // 3. Return success (The flow takes over)
  return { success: true, result: "Pass Started" };
}

/** Whether the passer holds the ball (the ball manager, or the ball's square). */
function holdsBall(parts: GameParts, passerId: string, square: Square) {
  if (parts.ballManager.hasBall(passerId)) return true;
  const ballPos = parts.state.ballPosition;
  return !!ballPos && ballPos.x === square.x && ballPos.y === square.y;
}

/** Why a Pass may not be aimed at this square, or null when it may. */
function passTargetRefusal(
  parts: GameParts,
  passer: Player,
  from: Square,
  target: Square,
  hailMary: boolean
): string | null {
  // Hail Mary Pass: "they may declare any square on the pitch as the
  // target square rather than using the Range Ruler" (2025 rulebook p.129).
  if (hailMary && !hasSkill(passer.skills, SkillType.HAIL_MARY_PASS)) {
    return "Player does not have Hail Mary Pass";
  }
  if (
    target.x < 0 ||
    target.y < 0 ||
    target.x >= GameConfig.PITCH_WIDTH ||
    target.y >= GameConfig.PITCH_HEIGHT
  ) {
    return "Target is off the pitch";
  }
  // "The declared square must be wholly underneath the maximum range of
  // the Range Ruler" (p.74).
  if (
    !hailMary &&
    PassController.rangeValue(from, { x: target.x, y: target.y }) === null
  ) {
    return "Target is beyond the Range Ruler";
  }

  // A Hail Mary is thrown as a Long Bomb, so a Blizzard refuses it too.
  const type = hailMary
    ? "Long Bomb"
    : parts.passController.measureRange(from, { x: target.x, y: target.y })
        .type;
  if (!weatherEffects(parts.state.weather).passTypes.includes(type)) {
    return `${parts.state.weather}: only a Quick or Short Pass may be attempted`;
  }
  return null;
}

/**
 * Start Hand-off Action. Queues a HandoffOperation — no Passing Ability
 * Test, no scatter, no interception. The ball is placed directly in the
 * target team-mate's square and they make a single Catch attempt. Targets
 * a player id, not a square: a Hand-off targets a person.
 */
export async function handOffBall(
  parts: GameParts,
  passerId: string,
  targetPlayerId: string
): Promise<ActionStart> {
  if (awaitingSecondAction(parts, passerId))
    return { success: false, result: "second-action-not-declared" };
  if (parts.state.phase !== GamePhase.PLAY) {
    return { success: false, result: "Not in play phase" };
  }

  const passer = parts.game.getPlayerById(passerId);
  if (!passer || !passer.gridPosition) {
    return { success: false, result: "Player not found" };
  }
  if (!holdsBall(parts, passerId, passer.gridPosition)) {
    return { success: false, result: "Player does not have ball" };
  }

  const target = parts.game.getPlayerById(targetPlayerId);
  if (!target || !target.gridPosition) {
    return { success: false, result: "Target not found" };
  }
  if (!isLegalHandoffTarget(passer, target)) {
    return { success: false, result: "Illegal hand-off target" };
  }

  const handoff = new HandoffOperation(passerId, targetPlayerId);
  if (takeUnsatedBloodlust(parts, passerId)) {
    biteBeforeBallAction(parts, passerId, () =>
      parts.flowManager.add(handoff, true)
    );
    return { success: true, result: "Bloodlust: bite before the hand-off" };
  }
  parts.flowManager.add(handoff);
  return { success: true, result: "Hand-off Started" };
}

export async function puntBall(
  parts: GameParts,
  playerId: string,
  facingX: number,
  facingY: number
): Promise<void> {
  if (awaitingSecondAction(parts, playerId)) return;
  const player = parts.game.getPlayerById(playerId);
  if (
    !player?.gridPosition ||
    parts.marks.puntUsedThisTurn ||
    parts.state.activePlayer?.id !== playerId ||
    parts.state.activePlayer.action !== "punt" ||
    !hasSkill(player.skills, SkillType.PUNT) ||
    !parts.ballManager.hasBall(playerId)
  ) {
    return;
  }
  parts.marks.puntUsedThisTurn = true;
  parts.flowManager.add(new PuntOperation(playerId, facingX, facingY));
}
