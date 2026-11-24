import { markBlitzBlockUsed } from "./blockActions";
import { isTurnRunning } from "@/game/kickoff/kickoffTurn";
import { adjacentSquare } from "./squares";
import { GamePhase } from "@/types/GameState";
import { GameEventNames } from "@/types/events";
import { type Player, PlayerStatus } from "@/types/Player";
import { SkillType, hasSkill } from "@/types/Skills";
import { GameOperation } from "@/game/core/GameOperation";
import { BounceOperation } from "@/game/operations/BounceOperation";
import { ArmourOperation } from "@/game/operations/ArmourOperation";
import { BreatheFireOperation } from "@/game/operations/BreatheFireOperation";
import { ProjectileVomitOperation } from "@/game/operations/ProjectileVomitOperation";
import { HypnoticGazeOperation } from "@/game/operations/HypnoticGazeOperation";
import { ChompOperation } from "@/game/operations/ChompOperation";
import { ChainsawAttackOperation } from "@/game/operations/ChainsawAttackOperation";
import { FoulOperation } from "@/game/operations/FoulOperation";
import { StabOperation } from "@/game/operations/StabOperation";
import { ThrowTeammateOperation } from "@/game/operations/ThrowTeammateOperation";
import { type SwoopFacing, isSwoopFacing } from "@/game/rules/throwTeammate";
import { BombardierOperation } from "@/game/operations/BombardierOperation";
import {
  BallAndChainOperation,
  type BallAndChainSquare,
} from "@/game/operations/BallAndChainOperation";
import { moveAllowance } from "@/game/skills/movement";
import { withDriveModifiers } from "@/game/kickoff/driveEffects";
import {
  type BlockReplacement,
  BLOCK_REPLACEMENT_DEFINITIONS,
} from "@/types/BlockReplacement";
import { isLegalBlockReplacementTarget } from "@/game/rules/blockReplacements";
import type { GameParts } from "./parts";
import { awaitingSecondAction, whenSettled } from "./activation";
import { rushSucceeds } from "./rush";

type SpecialAction = BlockReplacement | "gaze";

const SPECIAL_ACTION_SKILL: Partial<Record<SpecialAction, SkillType>> = {
  breatheFire: SkillType.BREATHE_FIRE,
  vomit: SkillType.PROJECTILE_VOMIT,
  gaze: SkillType.HYPNOTIC_GAZE,
  chainsaw: SkillType.CHAINSAW,
};

function requiredSkill(kind: SpecialAction): SkillType {
  return SPECIAL_ACTION_SKILL[kind] ?? SkillType.MONSTROUS_MOUTH;
}

export async function foulPlayer({
  parts,
  foulerId,
  targetX,
  targetY,
}: {
  parts: GameParts;
  foulerId: string;
  targetX: number;
  targetY: number;
}): Promise<void> {
  if (awaitingSecondAction(parts, foulerId)) return;
  if (parts.state.phase !== GamePhase.PLAY) {
    return;
  }

  const fouler = parts.game.getPlayerById(foulerId);
  if (!fouler?.gridPosition) {
    return;
  }

  if (!(await whenSettled(parts))) return;
  if (!foulWasDeclared(parts, foulerId)) {
    parts.eventBus.emit(
      GameEventNames.UI_Notification,
      `${fouler.playerName} has no Foul declared.`
    );
    return;
  }

  const square = parts.game.getPlayerById(foulerId)?.gridPosition;
  if (!adjacentSquare(square, { x: targetX, y: targetY })) {
    parts.eventBus.emit(
      GameEventNames.UI_Notification,
      `${fouler.playerName} must stand next to the player to Foul them.`
    );
    return;
  }

  parts.flowManager.add(new FoulOperation(foulerId, targetX, targetY));
}

export async function stabPlayer(
  parts: GameParts,
  attackerId: string,
  targetId: string
): Promise<boolean> {
  if (awaitingSecondAction(parts, attackerId)) return false;
  const gate = await commitBlockReplacement({
    parts,
    attackerId,
    targetId,
    replacement: "stab",
  });
  if (!gate.accepted) return false;
  if (!gate.proceed) return true;

  if (!(await parts.blockManager.offerDumpOff(targetId))) return true;
  parts.flowManager.add(new StabOperation(attackerId, targetId));
  return true;
}

export function throwTeammate(
  parts: GameParts,
  request: {
    throwerId: string;
    teammateId: string;
    x: number;
    y: number;
    mode?: "throw" | "kick";
    swoopFacing?: SwoopFacing;
  }
): void {
  const { throwerId, teammateId, x, y, mode, swoopFacing } = request;
  if (awaitingSecondAction(parts, throwerId)) return;
  const abilities = teammateThrowAbilities(parts, throwerId);
  if (!abilities) return;
  const { canThrow, canKick } = abilities;
  const declared =
    parts.state.activePlayer?.id === throwerId
      ? parts.state.activePlayer.action
      : undefined;
  if (declared !== "throwTeamMate") return;

  const resolved: "throw" | "kick" =
    mode ?? (canKick && !canThrow ? "kick" : "throw");
  if (swoopFacing !== undefined) checkSwoop(parts, teammateId, swoopFacing);

  parts.flowManager.add(
    new ThrowTeammateOperation(
      throwerId,
      teammateId,
      x,
      y,
      resolved,
      swoopFacing
    )
  );
}

function checkSwoop(
  parts: GameParts,
  teammateId: string,
  swoopFacing: SwoopFacing
): void {
  if (!isSwoopFacing(swoopFacing)) {
    throw new Error(`Unknown Swoop facing: ${String(swoopFacing)}`);
  }
  const teammate = parts.game.getPlayerById(teammateId);
  if (!teammate || !hasSkill(teammate.skills, SkillType.SWOOP)) {
    throw new Error("The thrown player does not have Swoop");
  }
}

export function throwBomb({
  parts,
  throwerId,
  x,
  y,
}: {
  parts: GameParts;
  throwerId: string;
  x: number;
  y: number;
}): void {
  if (awaitingSecondAction(parts, throwerId)) return;
  if (parts.state.phase !== GamePhase.PLAY) return;

  const thrower = parts.game.getPlayerById(throwerId);
  if (thrower?.status !== PlayerStatus.ACTIVE) return;
  if (!hasSkill(thrower.skills, SkillType.BOMBARDIER)) return;

  const declared =
    parts.state.activePlayer?.id === throwerId
      ? parts.state.activePlayer.action
      : undefined;
  if (declared !== "throwBomb") return;

  parts.flowManager.add(new BombardierOperation(throwerId, x, y));
}

export function ballAndChain({
  parts,
  fanaticId,
  facingX,
  facingY,
}: {
  parts: GameParts;
  fanaticId: string;
  facingX: number;
  facingY: number;
}): void {
  if (awaitingSecondAction(parts, fanaticId)) return;
  if (parts.state.phase !== GamePhase.PLAY) return;

  const fanatic = parts.game.getPlayerById(fanaticId);
  if (fanatic?.status !== PlayerStatus.ACTIVE) return;
  if (!hasSkill(fanatic.skills, SkillType.BALL_AND_CHAIN)) return;

  const declared =
    parts.state.activePlayer?.id === fanaticId
      ? parts.state.activePlayer.action
      : undefined;
  if (declared !== "ballAndChain") return;

  parts.flowManager.add(new BallAndChainOperation(fanaticId, facingX, facingY));
}

export async function ballAndChainCollision(
  parts: GameParts,
  square: BallAndChainSquare,
  targetId: string
): Promise<void> {
  parts.marks.ballAndChainSquare = square;
  if (square.pushedDownId) {
    await parts.blockManager.startBallAndChainPush(square.fanaticId, targetId);
  } else {
    await parts.blockManager.startBallAndChainBlock(square.fanaticId, targetId);
  }
}

export async function performSpecialAction({
  parts,
  kind,
  attackerId,
  targetId,
}: {
  parts: GameParts;
  kind: SpecialAction;
  attackerId: string;
  targetId: string;
}): Promise<boolean> {
  if (awaitingSecondAction(parts, attackerId)) return false;
  if (!isTurnRunning(parts.state)) return false;
  const attacker = parts.game.getPlayerById(attackerId);
  if (attacker?.status !== PlayerStatus.ACTIVE) return false;

  if (kind !== "gaze") {
    const gate = await commitBlockReplacement({
      parts,
      attackerId,
      targetId,
      replacement: kind,
    });
    if (!gate.accepted) return false;
    if (!gate.proceed) return true;
  }

  if (!canUseSpecial(parts, { attacker, kind, targetId })) return false;

  return queueSpecialAction(parts, { attacker, kind, targetId });
}

function canUseSpecial(
  parts: GameParts,
  {
    attacker,
    kind,
    targetId,
  }: { attacker: Player; kind: SpecialAction; targetId: string }
): boolean {
  return (
    hasSkill(attacker.skills, requiredSkill(kind)) &&
    (kind !== "gaze" || mayGaze(parts, attacker, targetId))
  );
}
async function queueSpecialAction(
  parts: GameParts,
  {
    attacker,
    kind,
    targetId,
  }: { attacker: Player; kind: SpecialAction; targetId: string }
): Promise<boolean> {
  const attackerId = attacker.id;
  const target = parts.game.getPlayerById(targetId);
  if (
    target &&
    target.teamId !== attacker.teamId &&
    !(await parts.blockManager.offerDumpOff(targetId))
  ) {
    return true;
  }
  const operation = specialOperation(kind, attackerId, targetId);
  if (operation) parts.flowManager.add(operation);
  return true;
}

function mayGaze(parts: GameParts, attacker: Player, targetId: string) {
  const declared =
    parts.state.activePlayer?.id === attacker.id
      ? parts.state.activePlayer.action
      : undefined;
  const target = parts.game.getPlayerById(targetId);
  return !(
    declared !== "gaze" ||
    !target?.gridPosition ||
    target.teamId === attacker.teamId ||
    target.status !== PlayerStatus.ACTIVE ||
    !attacker.gridPosition ||
    Math.max(
      Math.abs(attacker.gridPosition.x - target.gridPosition.x),
      Math.abs(attacker.gridPosition.y - target.gridPosition.y)
    ) !== 1
  );
}

function specialOperation(
  kind: SpecialAction,
  attackerId: string,
  targetId: string
): GameOperation | null {
  switch (kind) {
    case "breatheFire":
      return new BreatheFireOperation(attackerId, targetId);
    case "vomit":
      return new ProjectileVomitOperation(attackerId, targetId);
    case "gaze":
      return new HypnoticGazeOperation(attackerId, targetId);
    case "chomp":
      return new ChompOperation(attackerId, targetId);
    case "chainsaw":
      return new ChainsawAttackOperation(attackerId, targetId);
    case "stab":
      return null;
  }
}

async function commitBlockReplacement({
  parts,
  attackerId,
  targetId,
  replacement,
}: {
  parts: GameParts;
  attackerId: string;
  targetId: string;
  replacement: BlockReplacement;
}): Promise<{ accepted: boolean; proceed: boolean }> {
  const command = replacementCommand({
    parts,
    attackerId,
    targetId,
    replacement,
  });
  if (!command) return { accepted: false, proceed: false };
  const { attacker, active } = command;

  const isBlitz = active.action === "blitz";
  const effectiveAttacker = withDriveModifiers(attacker, parts.state);
  let newMovementUsed: number | undefined;
  if (isBlitz) {
    if (active.blitzBlockUsed) {
      return { accepted: false, proceed: false };
    }
    const used = parts.state.turn.movementUsed.get(attackerId) ?? 0;
    newMovementUsed = used + 1;
    if (newMovementUsed > moveAllowance(effectiveAttacker)) {
      return { accepted: false, proceed: false };
    }
  }

  markReplacementUsed(parts, active);
  if (!isBlitz || newMovementUsed === undefined) {
    return { accepted: true, proceed: true };
  }
  chargeReplacementMovement(parts, attackerId, newMovementUsed);
  if (newMovementUsed <= effectiveAttacker.stats.MA) {
    return { accepted: true, proceed: true };
  }
  return rushBeforeReplacement(parts, attacker);
}
async function rushBeforeReplacement(
  parts: GameParts,
  attacker: Player
): Promise<{ accepted: boolean; proceed: boolean }> {
  if (await rushSucceeds(parts, attacker, { teamId: attacker.teamId })) {
    return { accepted: true, proceed: true };
  }
  fallBeforeTheAttack(parts, attacker);
  return { accepted: true, proceed: false };
}

function replacementCommand({
  parts,
  attackerId,
  targetId,
  replacement,
}: {
  parts: GameParts;
  attackerId: string;
  targetId: string;
  replacement: BlockReplacement;
}) {
  if (parts.state.phase !== GamePhase.PLAY) return null;
  const attacker = parts.game.getPlayerById(attackerId);
  const target = parts.game.getPlayerById(targetId);
  const active = parts.state.activePlayer;
  const definition = BLOCK_REPLACEMENT_DEFINITIONS[replacement];
  if (
    !attacker ||
    !target ||
    active?.id !== attackerId ||
    active.blockReplacement !== replacement ||
    active.blockReplacementUsed ||
    !replacementActionMatches(active.action, definition.directAction) ||
    !isLegalBlockReplacementTarget(attacker, target, replacement)
  ) {
    return null;
  }
  return { attacker, active };
}

function fallBeforeTheAttack(parts: GameParts, attacker: Player): void {
  const attackerId = attacker.id;
  attacker.status = PlayerStatus.PRONE;
  parts.eventBus.emit(GameEventNames.PlayerKnockedDown, {
    playerId: attackerId,
  });
  parts.eventBus.emit(GameEventNames.PlayerStatusChanged, attacker);
  if (parts.ballManager.hasBall(attackerId) && attacker.gridPosition) {
    parts.flowManager.add(
      new BounceOperation({ ...attacker.gridPosition }),
      true
    );
  }
  parts.flowManager.add(new ArmourOperation(attackerId), true);
  parts.game.finishActivation(attackerId);
  parts.game.triggerTurnover("Failed Rush on Blitz special attack");
}

function teammateThrowAbilities(parts: GameParts, throwerId: string) {
  if (!isTurnRunning(parts.state)) return;

  const thrower = parts.game.getPlayerById(throwerId);
  if (thrower?.status !== PlayerStatus.ACTIVE) return;
  const canThrow = hasSkill(thrower.skills, SkillType.THROW_TEAM_MATE);
  const canKick = hasSkill(thrower.skills, SkillType.KICK_TEAM_MATE);
  if (!canThrow && !canKick) return;

  return { canThrow, canKick };
}

function replacementActionMatches(
  action: string | null,
  directAction: string
): boolean {
  return action === "blitz" || action === directAction;
}

function foulWasDeclared(parts: GameParts, foulerId: string): boolean {
  const declared = parts.state.activePlayer;
  return (
    declared?.id === foulerId &&
    declared.action === "foul" &&
    !parts.turnManager.isTurnoverInProgress()
  );
}

function markReplacementUsed(
  parts: GameParts,
  active: NonNullable<GameParts["state"]["activePlayer"]>
): void {
  active.blockReplacementUsed = true;
  parts.playerActionManager.commitAction(active.id);
}
function chargeReplacementMovement(
  parts: GameParts,
  attackerId: string,
  used: number
): void {
  markBlitzBlockUsed(parts);
  parts.state.turn.movementUsed.set(attackerId, used);
}
