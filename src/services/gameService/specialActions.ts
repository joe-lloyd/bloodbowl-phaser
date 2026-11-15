/**
 * Foul and the Special Actions: Stab and the other attacks that may replace
 * a Blitz's Block, Hypnotic Gaze, Throw Team-mate, Bombardier and Ball &
 * Chain. Each checks the declaration, then queues its operation.
 */

import { steadyFootingSaves } from "@/game/rules/steadyFooting";
import { GamePhase } from "@/types/GameState";
import { GameEventNames } from "@/types/events";
import { Player, PlayerStatus } from "@/types/Player";
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
import { SwoopFacing, isSwoopFacing } from "@/game/rules/throwTeammate";
import { BombardierOperation } from "@/game/operations/BombardierOperation";
import {
  BallAndChainOperation,
  BallAndChainSquare,
} from "@/game/operations/BallAndChainOperation";
import { withRerollOffer } from "@/game/skills";
import { moveAllowance } from "@/game/skills/movement";
import { rushModifier } from "@/game/inducements/matchInducements";
import { withDriveModifiers } from "@/game/kickoff/driveEffects";
import {
  BlockReplacement,
  BLOCK_REPLACEMENT_DEFINITIONS,
} from "@/types/BlockReplacement";
import { isLegalBlockReplacementTarget } from "@/game/rules/blockReplacements";
import type { GameParts } from "./parts";
import { awaitingSecondAction, whenSettled } from "./activation";

type SpecialAction = BlockReplacement | "gaze";

const SPECIAL_ACTION_SKILL: Partial<Record<SpecialAction, SkillType>> = {
  breatheFire: SkillType.BREATHE_FIRE,
  vomit: SkillType.PROJECTILE_VOMIT,
  gaze: SkillType.HYPNOTIC_GAZE,
  chainsaw: SkillType.CHAINSAW,
};

/** The trait performSpecialAction checks; any other kind needs Monstrous Mouth. */
function requiredSkill(kind: SpecialAction): SkillType {
  return SPECIAL_ACTION_SKILL[kind] ?? SkillType.MONSTROUS_MOUTH;
}

export async function foulPlayer(
  parts: GameParts,
  foulerId: string,
  targetX: number,
  targetY: number
): Promise<void> {
  if (awaitingSecondAction(parts, foulerId)) return;
  if (parts.state.phase !== GamePhase.PLAY) {
    return;
  }

  const fouler = parts.game.getPlayerById(foulerId);
  if (!fouler || !fouler.gridPosition) {
    return;
  }
  // The Foul's activation gate (Bone Head, …) settles first, and a failed
  // one that ended the activation or changed it to a Move stops it here
  if (!(await whenSettled(parts))) return;
  const declared = parts.state.activePlayer;
  if (
    declared?.id !== foulerId ||
    declared.action !== "foul" ||
    parts.turnManager.isTurnoverInProgress()
  ) {
    parts.eventBus.emit(
      GameEventNames.UI_Notification,
      `${fouler.playerName} has no Foul declared.`
    );
    return;
  }
  // A Foul is made on a downed opponent the fouler stands next to
  const square = fouler.gridPosition;
  if (
    !square ||
    Math.max(Math.abs(square.x - targetX), Math.abs(square.y - targetY)) !== 1
  ) {
    parts.eventBus.emit(
      GameEventNames.UI_Notification,
      `${fouler.playerName} must stand next to the player to Foul them.`
    );
    return;
  }

  parts.flowManager.add(new FoulOperation(foulerId, targetX, targetY));
}

/**
 * Stab Special Action (2025 p.136): unmodifiable Armour Roll against an
 * adjacent Standing opponent; the activation ends after the stab. Legal
 * as the declared "stab" action, or during a Blitz in place of the Block.
 */
export async function stabPlayer(
  parts: GameParts,
  attackerId: string,
  targetId: string
): Promise<boolean> {
  if (awaitingSecondAction(parts, attackerId)) return false;
  const gate = await commitBlockReplacement(
    parts,
    attackerId,
    targetId,
    "stab"
  );
  if (!gate.accepted) return false;
  if (!gate.proceed) return true;

  // A Dump-Off caught in the end zone has ended the drive
  if (!(await parts.blockManager.offerDumpOff(targetId))) return true;
  parts.flowManager.add(new StabOperation(attackerId, targetId));
  return true;
}

/**
 * Throw / Kick Team-mate Action: a Standing player with the trait throws an
 * eligible team-mate (Right Stuff, ST 3 or less) at an aim square. Legal only
 * as the declared "throwTeamMate" action. `mode` picks Kick's harsher fumble;
 * when omitted it is inferred from the thrower's traits.
 */
export async function throwTeammate(
  parts: GameParts,
  request: {
    throwerId: string;
    teammateId: string;
    x: number;
    y: number;
    mode?: "throw" | "kick";
    swoopFacing?: SwoopFacing;
  }
): Promise<void> {
  const { throwerId, teammateId, x, y, mode, swoopFacing } = request;
  if (awaitingSecondAction(parts, throwerId)) return;
  if (
    parts.state.phase !== GamePhase.PLAY &&
    !parts.kickoffEventManager.isChargeActive()
  ) {
    return;
  }

  const thrower = parts.game.getPlayerById(throwerId);
  if (!thrower || thrower.status !== PlayerStatus.ACTIVE) return;
  const canThrow = hasSkill(thrower.skills, SkillType.THROW_TEAM_MATE);
  const canKick = hasSkill(thrower.skills, SkillType.KICK_TEAM_MATE);
  if (!canThrow && !canKick) return;

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

/** Swoop is the thrown player's skill, and using it is their choice. */
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

/**
 * Throw Bomb Special Action (Bombardier): a Standing player with the trait
 * lobs a bomb at a target square, resolved like a Pass. Legal only as the
 * declared "throwBomb" action.
 */
export async function throwBomb(
  parts: GameParts,
  throwerId: string,
  x: number,
  y: number
): Promise<void> {
  if (awaitingSecondAction(parts, throwerId)) return;
  if (parts.state.phase !== GamePhase.PLAY) return;

  const thrower = parts.game.getPlayerById(throwerId);
  if (!thrower || thrower.status !== PlayerStatus.ACTIVE) return;
  if (!hasSkill(thrower.skills, SkillType.BOMBARDIER)) return;

  const declared =
    parts.state.activePlayer?.id === throwerId
      ? parts.state.activePlayer.action
      : undefined;
  if (declared !== "throwBomb") return;

  parts.flowManager.add(new BombardierOperation(throwerId, x, y));
}

/**
 * Ball & Chain Special Action (Fanatic): the player lurches one square in a
 * chosen facing (a cardinal direction: an End Zone or a Sideline), deviated
 * by the Throw-in Template. Each call is one square, up to MA and then two
 * Rushes. Legal only as the declared "ballAndChain" action.
 */
export async function ballAndChain(
  parts: GameParts,
  fanaticId: string,
  facingX: number,
  facingY: number
): Promise<void> {
  if (awaitingSecondAction(parts, fanaticId)) return;
  if (parts.state.phase !== GamePhase.PLAY) return;

  const fanatic = parts.game.getPlayerById(fanaticId);
  if (!fanatic || fanatic.status !== PlayerStatus.ACTIVE) return;
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

/**
 * Special activation actions (Breathe Fire, Projectile Vomit, Hypnotic
 * Gaze, Chomp): legal as their declared action, or — where the book says
 * so — during a Blitz in place of the Block. Hypnotic Gaze has its own
 * pre-move and never replaces a Blitz block.
 */
export async function performSpecialAction(
  parts: GameParts,
  kind: SpecialAction,
  attackerId: string,
  targetId: string
): Promise<boolean> {
  if (awaitingSecondAction(parts, attackerId)) return false;
  if (parts.state.phase !== GamePhase.PLAY) return false;
  const attacker = parts.game.getPlayerById(attackerId);
  if (!attacker || attacker.status !== PlayerStatus.ACTIVE) return false;

  if (kind !== "gaze") {
    const gate = await commitBlockReplacement(
      parts,
      attackerId,
      targetId,
      kind
    );
    if (!gate.accepted) return false;
    if (!gate.proceed) return true;
  }

  if (!hasSkill(attacker.skills, requiredSkill(kind))) return false;
  if (kind === "gaze" && !mayGaze(parts, attacker, targetId)) return false;

  // Dump-Off is resolved before a directly-targeting opposition Special
  // Action, just as it is before a Block.
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

/** Hypnotic Gaze: the declared action, at a Standing adjacent opponent. */
function mayGaze(parts: GameParts, attacker: Player, targetId: string) {
  const declared =
    parts.state.activePlayer?.id === attacker.id
      ? parts.state.activePlayer.action
      : undefined;
  const target = parts.game.getPlayerById(targetId);
  return !(
    declared !== "gaze" ||
    !target ||
    !target.gridPosition ||
    target.teamId === attacker.teamId ||
    target.status !== PlayerStatus.ACTIVE ||
    !attacker.gridPosition ||
    Math.max(
      Math.abs(attacker.gridPosition.x - target.gridPosition.x),
      Math.abs(attacker.gridPosition.y - target.gridPosition.y)
    ) !== 1
  );
}

/** The operation each kind queues; a Stab goes through stabPlayer instead. */
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

/**
 * Validate and atomically commit the selected replacement before any roll
 * or target mutation. Invalid/stale commands leave the state untouched.
 */
async function commitBlockReplacement(
  parts: GameParts,
  attackerId: string,
  targetId: string,
  replacement: BlockReplacement
): Promise<{ accepted: boolean; proceed: boolean }> {
  const command = replacementCommand(parts, attackerId, targetId, replacement);
  if (!command) return { accepted: false, proceed: false };
  const { attacker, active } = command;

  const isBlitz = active.action === "blitz";
  const effectiveAttacker = withDriveModifiers(attacker, parts.state);
  let newMovementUsed: number | undefined;
  if (isBlitz) {
    // The declaration may still be uncommitted here (the attack itself is
    // what commits it) — only a Blitz block already spent this activation
    // makes the command stale.
    if (parts.marks.blitzBlockUsed.has(attackerId)) {
      return { accepted: false, proceed: false };
    }
    const used = parts.state.turn.movementUsed.get(attackerId) ?? 0;
    newMovementUsed = used + 1;
    if (newMovementUsed > moveAllowance(effectiveAttacker)) {
      return { accepted: false, proceed: false };
    }
  }

  // Commitment boundary: all legality checks passed. From here the attack
  // and team Blitz are spent even if a required Rush subsequently fails.
  active.blockReplacementUsed = true;
  parts.playerActionManager.commitAction(attackerId);
  if (!isBlitz || newMovementUsed === undefined) {
    return { accepted: true, proceed: true };
  }
  parts.marks.blitzBlockUsed.add(attackerId);
  parts.state.turn.movementUsed.set(attackerId, newMovementUsed);
  if (newMovementUsed <= effectiveAttacker.stats.MA) {
    return { accepted: true, proceed: true };
  }
  const check = await withRerollOffer(
    { gameService: parts.game, eventBus: parts.eventBus },
    attacker,
    "rush",
    () =>
      parts.diceController.rollSkillCheck(
        "Rush",
        2,
        rushModifier(parts.state, attacker),
        attacker.playerName,
        attacker.teamId
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
  ) {
    return { accepted: true, proceed: true };
  }
  fallBeforeTheAttack(parts, attacker);
  return { accepted: true, proceed: false };
}

/** The attacker and declaration a replacement command names, if it is legal. */
function replacementCommand(
  parts: GameParts,
  attackerId: string,
  targetId: string,
  replacement: BlockReplacement
) {
  if (parts.state.phase !== GamePhase.PLAY) return null;
  const attacker = parts.game.getPlayerById(attackerId);
  const target = parts.game.getPlayerById(targetId);
  const active = parts.state.activePlayer;
  const definition = BLOCK_REPLACEMENT_DEFINITIONS[replacement];
  if (
    !attacker ||
    !target ||
    !active ||
    active.id !== attackerId ||
    active.blockReplacement !== replacement ||
    active.blockReplacementUsed ||
    (active.action !== "blitz" && active.action !== definition.directAction) ||
    !isLegalBlockReplacementTarget(attacker, target, replacement)
  ) {
    return null;
  }
  return { attacker, active };
}

/** A failed Rush for a Blitz's Special Action: the attacker falls over. */
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
