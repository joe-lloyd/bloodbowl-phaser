import { ballOnSquare } from "@/game/rules/ballInTheAir";
import { GamePhase } from "@/types/GameState";
import { type Player } from "@/types/Player";
import { SkillType, hasSkill } from "@/types/Skills";
import {
  PassController,
  type PassType,
} from "@/game/controllers/PassController";
import { PassOperation } from "@/game/operations/PassOperation";
import { HandoffOperation } from "@/game/operations/HandoffOperation";
import { PuntOperation } from "@/game/operations/PuntOperation";
import { isLegalHandoffTarget } from "@/game/rules/handoff";
import { weatherEffects } from "@/game/rules/weather";
import { carrierMayPass } from "@/game/kickoff/ballConditions";
import { pitchSquare } from "./squares";
import type { GameParts } from "./parts";
import {
  awaitingSecondAction,
  biteBeforeBallAction,
  takeUnsatedBloodlust,
} from "./activation";
import { isWallSquare } from "../../game/rules/pitchSquares";

interface Square {
  x: number;
  y: number;
}
interface ActionStart {
  success: boolean;
  result?: string;
}

export function throwBall({
  parts,
  passerId,
  target,
  hailMary,
}: {
  parts: GameParts;
  passerId: string;
  target: Square;
  hailMary: boolean;
}): ActionStart {
  if (awaitingSecondAction(parts, passerId))
    return { success: false, result: "second-action-not-declared" };

  if (parts.state.phase !== GamePhase.PLAY) {
    return { success: false, result: "Not in play phase" };
  }

  console.log(
    `[GameService] Starting Pass Action: ${passerId} -> ${String(target.x)},${String(target.y)}`
  );

  const carrier = transferCarrier(parts, passerId);
  if (!carrier.ok) return carrier.error;
  const { player: passer, position } = carrier;
  const refusal = passTargetRefusal({
    parts,
    passer,
    from: position,
    target,
    hailMary,
  });
  if (refusal) return { success: false, result: refusal };

  const pass = new PassOperation(passerId, target.x, target.y, hailMary);
  if (takeUnsatedBloodlust(parts, passerId)) {
    biteBeforeBallAction(parts, passerId, () => {
      parts.flowManager.add(pass, true);
    });
    return { success: true, result: "Bloodlust: bite before the pass" };
  }
  parts.flowManager.add(pass);

  return { success: true, result: "Pass Started" };
}

function holdsBall(parts: GameParts, passerId: string, square: Square) {
  if (parts.ballManager.hasBall(passerId)) return true;
  return ballOnSquare(parts.state, square);
}

function passTargetRefusal({
  parts,
  passer,
  from,
  target,
  hailMary,
}: {
  parts: GameParts;
  passer: Player;
  from: Square;
  target: Square;
  hailMary: boolean;
}): string | null {
  if (hailMary && !hasSkill(passer.skills, SkillType.HAIL_MARY_PASS)) {
    return "Player does not have Hail Mary Pass";
  }
  if (!carrierMayPass(parts.state)) {
    return "Sticky Sludge: the ball carrier cannot Pass this drive";
  }
  if (!pitchSquare(target) && !isWallSquare(target)) {
    return "Target is off the pitch";
  }

  if (hailMary) return weatherRefusal(parts, "Long Bomb");
  if (PassController.rangeValue(from, { x: target.x, y: target.y }) === null) {
    return "Target is beyond the Range Ruler";
  }
  const { type } = parts.passController.measureRange(from, {
    x: target.x,
    y: target.y,
  });
  return weatherRefusal(parts, type);
}

function weatherRefusal(parts: GameParts, type: PassType): string | null {
  const allowed = weatherEffects(parts.state.weather).passTypes;
  if (allowed.includes(type)) return null;
  const only = allowed.length === 1 ? "a Quick Pass" : "a Quick or Short Pass";
  return `${parts.state.weather}: only ${only} may be attempted`;
}

export function handOffBall(
  parts: GameParts,
  passerId: string,
  targetPlayerId: string
): ActionStart {
  if (awaitingSecondAction(parts, passerId))
    return { success: false, result: "second-action-not-declared" };
  if (parts.state.phase !== GamePhase.PLAY) {
    return { success: false, result: "Not in play phase" };
  }

  const carrier = transferCarrier(parts, passerId);
  if (!carrier.ok) return carrier.error;
  const { player: passer } = carrier;

  const target = parts.game.getPlayerById(targetPlayerId);
  if (!target?.gridPosition) {
    return { success: false, result: "Target not found" };
  }
  if (!isLegalHandoffTarget(passer, target)) {
    return { success: false, result: "Illegal hand-off target" };
  }

  const handoff = new HandoffOperation(passerId, targetPlayerId);
  if (takeUnsatedBloodlust(parts, passerId)) {
    biteBeforeBallAction(parts, passerId, () => {
      parts.flowManager.add(handoff, true);
    });
    return { success: true, result: "Bloodlust: bite before the hand-off" };
  }
  parts.flowManager.add(handoff);
  return { success: true, result: "Hand-off Started" };
}

export function puntBall({
  parts,
  playerId,
  facingX,
  facingY,
}: {
  parts: GameParts;
  playerId: string;
  facingX: number;
  facingY: number;
}): void {
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

function transferCarrier(
  parts: GameParts,
  playerId: string
):
  | { ok: true; player: Player; position: Square }
  | { ok: false; error: ActionStart } {
  const player = parts.game.getPlayerById(playerId);
  if (!player?.gridPosition)
    return { ok: false, error: { success: false, result: "Player not found" } };
  if (!holdsBall(parts, playerId, player.gridPosition))
    return {
      ok: false,
      error: { success: false, result: "Player does not have ball" },
    };
  return { ok: true, player, position: player.gridPosition };
}
