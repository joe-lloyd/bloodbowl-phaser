/**
 * Declaring an Action: each check that may refuse it, in the order they
 * run, then the declaration and the activation gate it queues.
 */

import { ballOnSquare } from "@/game/rules/ballInTheAir";
import { GameState } from "@/types/GameState";
import { ActionType, GameEventNames } from "@/types/events";
import {
  Player,
  PlayerStatus,
  PlayerCondition,
  hasCondition,
  removeCondition,
} from "@/types/Player";
import { SkillType, hasSkill } from "@/types/Skills";
import { PlayerActionManager } from "@/game/managers/PlayerActionManager";
import { canSecureBall } from "@/game/rules/secureBall";
import { ActivationGateOperation } from "@/game/operations/ActivationGateOperation";
import {
  foldActionDeclared,
  ActionDeclaredContext,
  SkillRegistry,
} from "@/game/skills";
import { holdsMeasure } from "@/game/inducements/matchInducements";
import { razzleDazzleAllows } from "@/game/rules/actionAvailability";
import { DesperateMeasure } from "@/game/inducements/desperateMeasures";
import {
  BlockReplacement,
  BLOCK_REPLACEMENT_DEFINITIONS,
  blockReplacementForDirectAction,
} from "@/types/BlockReplacement";
import {
  hasReachableBlockReplacementTarget,
  legalBlockReplacementTargets,
} from "@/game/rules/blockReplacements";
import type { GameParts } from "./parts";
import { couldScoreWithoutDice } from "./activation";

type Declaration = NonNullable<GameState["activePlayer"]>;

/** Actions that spend a team's once-per-turn allowance (Throw Team-mate
 *  shares Pass's). Only these carry the release/commit rules of
 *  `defer-action-commitment` — Move, Block, and the special actions have no
 *  allowance at stake and keep the engine's free-replacement behaviour. */
const ONCE_PER_TURN_ACTIONS: ReadonlySet<string | null> = new Set<ActionType>([
  "blitz",
  "pass",
  "handoff",
  "foul",
  "throwTeamMate",
]);

/** The trait a Standing player needs for each of these Special Actions. */
const STANDING_ACTION_SKILL: Partial<Record<ActionType, SkillType>> = {
  stab: SkillType.STAB,
  throwBomb: SkillType.BOMBARDIER,
  ballAndChain: SkillType.BALL_AND_CHAIN,
  breatheFire: SkillType.BREATHE_FIRE,
  vomit: SkillType.PROJECTILE_VOMIT,
  chomp: SkillType.MONSTROUS_MOUTH,
  chainsaw: SkillType.CHAINSAW,
};

export function declareAction(
  parts: GameParts,
  playerId: string,
  action: ActionType,
  requestedReplacement?: BlockReplacement,
  options: { razzleDazzle?: boolean } = {}
): boolean {
  // Charge! (kickoff 10): the current Charge player acts outside any turn
  if (parts.kickoffEventManager.isChargeActive()) {
    return chargeDeclareAction(parts, playerId, action);
  }

  // Must be activatable at all: active team, on-pitch, standing or prone
  // (never Stunned), and not already activated this turn. The browser
  // checks this before calling; the headless protocol relies on this guard.
  if (!parts.game.canActivate(playerId)) return false;

  const activating = parts.game.getPlayerById(playerId);
  if (!activating) return false;

  const held = parts.state.activePlayer;
  const firstAction = secondActionAfter(parts, held, playerId);
  if (razzleDazzleRefuses(parts, activating, action, firstAction, options)) {
    return false;
  }

  const directReplacement = blockReplacementForDirectAction(action);
  const blockReplacement = requestedReplacement ?? directReplacement;
  if (
    !firstAction &&
    !mayRedeclare(
      parts,
      activating,
      action,
      directReplacement,
      blockReplacement
    )
  ) {
    return false;
  }
  if (
    !replacementAllowed(parts, activating, action, {
      requested: requestedReplacement,
      direct: directReplacement,
      chosen: blockReplacement,
    })
  ) {
    return false;
  }

  expireActivationConditions(parts, activating);
  if (moveRefused(parts, activating, action)) return false;
  if (!traitsAllow(parts, activating, action)) return false;
  if (rulesRefuse(parts, activating, action)) return false;
  return recordDeclaration(parts, {
    player: activating,
    action,
    blockReplacement,
    firstAction,
    held,
    razzleDazzle: options.razzleDazzle,
  });
}

/**
 * Razzle-Dazzle (L22): a player whose first Action has ended declares
 * the second, and this returns that first Action. Another player acting
 * ends that activation instead.
 */
function secondActionAfter(
  parts: GameParts,
  held: Declaration | null,
  playerId: string
): ActionType | undefined {
  if (held?.razzleDazzle?.awaitingSecond && held.id !== playerId) {
    parts.game.finishActivation(held.id);
  }
  return held?.id === playerId && held.razzleDazzle?.awaitingSecond
    ? (held.razzleDazzle.actions[0] as ActionType)
    : undefined;
}

function razzleDazzleRefuses(
  parts: GameParts,
  activating: Player,
  action: ActionType,
  firstAction: ActionType | undefined,
  options: { razzleDazzle?: boolean }
): boolean {
  if (firstAction && !razzleDazzleAllows(firstAction, action)) {
    parts.eventBus.emit(
      GameEventNames.UI_Notification,
      "Razzle-Dazzle: the second Action cannot repeat the first, and only one of them may contain a Move."
    );
    return true;
  }
  return (
    !!options.razzleDazzle &&
    (!!firstAction ||
      !holdsMeasure(
        parts.state,
        activating.teamId,
        DesperateMeasure.RAZZLE_DAZZLE
      ) ||
      parts.playerActionManager.isActionCommitted(activating.id).committed)
  );
}

/** Whether a first Action may take over from the live declaration, if any. */
function mayRedeclare(
  parts: GameParts,
  activating: Player,
  action: ActionType,
  directReplacement: BlockReplacement | undefined,
  blockReplacement: BlockReplacement | undefined
): boolean {
  // A direct Special Action is a no-move declaration, exactly like a
  // standalone Block. Once this activation has spent movement the attack
  // must have been declared as a Blitz before the move began — refuse here
  // so a forged or stale command cannot bypass the availability gate.
  if (
    directReplacement &&
    (parts.state.turn.movementUsed.get(activating.id) ?? 0) > 0
  ) {
    const label = BLOCK_REPLACEMENT_DEFINITIONS[directReplacement].label;
    parts.eventBus.emit(
      GameEventNames.UI_Notification,
      `${activating.playerName} has already moved — ${label} must be declared as Blitz (with ${label}) before moving.`
    );
    return false;
  }
  // Replacement declarations are immutable for the activation: neither a
  // forged replacement nor a normal action may swap one in or out after the
  // player has started. Preserve the engine's existing Move-then-Block
  // declaration compatibility for ordinary actions.
  const live = parts.state.activePlayer;
  if (!live) return true;
  if (live.blockReplacement || blockReplacement) return false;
  return releaseLiveDeclaration(parts, live, activating.id, action);
}

/**
 * A live once-per-turn declaration (Blitz/Pass/Hand-off/Foul/Throw
 * Team-mate — the only actions with a team allowance at stake) must
 * release before this one takes over; a committed one refuses instead.
 * Actions with no allowance (Move, Block, the special actions, …) keep
 * the engine's existing free-replacement behaviour — e.g. Move-then-
 * Block for the same player is not "changing your mind" about anything.
 *
 * Separately, an activation GATE roll (Bone Head, Bloodlust, …) makes
 * the declaration binding the instant it fires, "before the die is even
 * thrown" (see ActivationGateOperation) — the only rules-sanctioned way
 * to change the declared action afterward is Bloodlust's own downgrade-
 * to-Move reaction, resolved inline by that same operation, never a
 * fresh declare-action. So a gate-committed declaration refuses ANY
 * redeclare regardless of whether the action itself carries a
 * once-per-turn allowance — this is distinct from (and checked before)
 * the once-per-turn case above: isActionCommitted() reports "movement"
 * instead of "gate" the moment real movement is spent, so the Move-
 * then-Block carve-out above is untouched by this check.
 */
function releaseLiveDeclaration(
  parts: GameParts,
  live: Declaration,
  playerId: string,
  action: ActionType
): boolean {
  const existingId = live.id;
  const status = parts.playerActionManager.isActionCommitted(existingId);
  // Nor may a player who has started the activation switch to another
  // Action: moving, or standing up, then declaring a Block would be a
  // Blitz that never spent the team's Blitz (and, from Prone, a free
  // Jump Up).
  const switching = existingId === playerId && live.action !== action;
  if (
    status.committed &&
    (switching ||
      status.reason === "gate" ||
      ONCE_PER_TURN_ACTIONS.has(live.action))
  ) {
    parts.eventBus.emit(
      GameEventNames.UI_Notification,
      `Cannot change the declared Action — ${PlayerActionManager.describeCommitReason(status.reason!)}.`
    );
    return false;
  }
  if (ONCE_PER_TURN_ACTIONS.has(live.action)) {
    parts.playerActionManager.cancelAction(existingId);
  }
  return true;
}

function replacementAllowed(
  parts: GameParts,
  activating: Player,
  action: ActionType,
  replacement: {
    requested: BlockReplacement | undefined;
    direct: BlockReplacement | undefined;
    chosen: BlockReplacement | undefined;
  }
): boolean {
  const { requested, direct, chosen } = replacement;
  if (requested && action !== "blitz" && direct !== requested) return false;
  if (!chosen) return true;
  const definition = BLOCK_REPLACEMENT_DEFINITIONS[chosen];
  if (!hasSkill(activating.skills, definition.skill)) return false;
  if (action === "blitz") {
    return (
      !parts.state.turn.hasBlitzed &&
      hasReachableBlockReplacementTarget(
        activating,
        parts.game.getOpponents(activating.teamId),
        parts.game.getAvailableMovements(activating.id),
        chosen
      )
    );
  }
  return (
    action === definition.directAction &&
    legalBlockReplacementTargets(
      activating,
      parts.game.getOpponents(activating.teamId),
      chosen
    ).length > 0
  );
}

function expireActivationConditions(parts: GameParts, activating: Player) {
  // Distracted expires when the player is next activated
  if (hasCondition(activating, PlayerCondition.DISTRACTED)) {
    removeCondition(activating, PlayerCondition.DISTRACTED);
    parts.eventBus.emit(GameEventNames.PlayerStatusChanged, activating);
  }
  // Eye Gouged (cannot assist) also expires once the player is activated
  if (hasCondition(activating, PlayerCondition.EYE_GOUGED)) {
    removeCondition(activating, PlayerCondition.EYE_GOUGED);
    parts.eventBus.emit(GameEventNames.PlayerStatusChanged, activating);
  }
}

function moveRefused(
  parts: GameParts,
  activating: Player,
  action: ActionType
): boolean {
  // A Rooted player may not leave their square, so no Move-type actions
  if (
    hasCondition(activating, PlayerCondition.ROOTED) &&
    (action === "move" || action === "secureBall")
  ) {
    parts.eventBus.emit(
      GameEventNames.UI_Notification,
      `${activating.playerName} is Rooted and cannot Move!`
    );
    return true;
  }
  if (action !== "secureBall") return false;
  const others = [...parts.team1.players, ...parts.team2.players].filter(
    (p) => p.id !== activating.id && p.gridPosition
  );
  if (canSecureBall(activating, parts.state.ballPosition, others)) return false;
  parts.eventBus.emit(
    GameEventNames.UI_Notification,
    "Secure the Ball needs a loose ball with no Standing opponent within 2 squares"
  );
  return true;
}

/** Punt and Hypnotic Gaze let the player Move first, so a Prone player may
 *  still declare them and stand up as part of that Move (errata p.122). */
const canDeclareMoveFirst = (p: Player) =>
  p.status === PlayerStatus.ACTIVE || p.status === PlayerStatus.PRONE;

/** The trait each Move-first action needs. */
const MOVE_FIRST_ACTION_SKILL: Partial<Record<ActionType, SkillType>> = {
  punt: SkillType.PUNT,
  gaze: SkillType.HYPNOTIC_GAZE,
};

/** Whether the player's status and traits let them declare the action. */
function traitsAllow(
  parts: GameParts,
  player: Player,
  action: ActionType
): boolean {
  // Ball & Chain: a Standing Fanatic may declare NOTHING else (the lurch is
  // the only action available to them).
  if (
    action !== "ballAndChain" &&
    hasSkill(player.skills, SkillType.BALL_AND_CHAIN) &&
    player.status === PlayerStatus.ACTIVE
  ) {
    return false;
  }
  if (action === "block" || action === "multipleBlock") {
    return mayBlock(player, action);
  }
  // A Throw / Kick Team-mate Action needs the trait and a Standing thrower
  if (action === "throwTeamMate") {
    return (
      player.status === PlayerStatus.ACTIVE &&
      (hasSkill(player.skills, SkillType.THROW_TEAM_MATE) ||
        hasSkill(player.skills, SkillType.KICK_TEAM_MATE))
    );
  }
  if (action === "punt" && parts.marks.puntUsedThisTurn) return false;
  const moveFirst = MOVE_FIRST_ACTION_SKILL[action];
  if (moveFirst) {
    return canDeclareMoveFirst(player) && hasSkill(player.skills, moveFirst);
  }
  // Stab, Bombardier, Ball & Chain and the other Special Actions need their
  // trait and a Standing player
  const needed = STANDING_ACTION_SKILL[action];
  return (
    !needed ||
    (player.status === PlayerStatus.ACTIVE && hasSkill(player.skills, needed))
  );
}

/**
 * A player who is down cannot plain-Block: standing up costs movement,
 * so a hit after rising is what Blitz is for. Jump Up is the exception —
 * it may declare a Block while Prone, with standing gated on an Agility
 * test (+1) resolved by the stand-up step. Multiple Block gets no such
 * exception.
 */
function mayBlock(player: Player, action: "block" | "multipleBlock") {
  const jumpUpProneBlock =
    action === "block" &&
    player.status === PlayerStatus.PRONE &&
    hasSkill(player.skills, SkillType.JUMP_UP);
  if (player.status !== PlayerStatus.ACTIVE && !jumpUpProneBlock) {
    return false;
  }
  return (
    action !== "multipleBlock" ||
    hasSkill(player.skills, SkillType.MULTIPLE_BLOCK)
  );
}

/** Rules may refuse the declaration outright (Unsteady vs Secure the Ball) */
function rulesRefuse(
  parts: GameParts,
  declaring: Player,
  action: ActionType
): boolean {
  const ctx: ActionDeclaredContext = {
    player: declaring,
    action,
    hasBall: ballOnSquare(parts.state, declaring.gridPosition),
    refused: false,
    triggers: [],
  };
  foldActionDeclared(ctx);
  for (const t of ctx.triggers) {
    parts.eventBus.emit(GameEventNames.SkillTriggered, t);
  }
  return ctx.refused;
}

/** Record the declaration once every check has passed. */
function recordDeclaration(
  parts: GameParts,
  declaring: {
    player: Player;
    action: ActionType;
    blockReplacement: BlockReplacement | undefined;
    /** The first Razzle-Dazzle Action, when this declares the second. */
    firstAction: ActionType | undefined;
    /** The declaration live before this one was made. */
    held: Declaration | null;
    razzleDazzle: boolean | undefined;
  }
): boolean {
  const { player, action, firstAction, held } = declaring;
  const playerId = player.id;
  // Stalling is judged from the moment of activation, so a re-declaration
  // (Move then Block) keeps what the first one saw
  const prior = parts.state.activePlayer;
  const stalling =
    prior?.id === playerId && prior.stalling !== undefined
      ? prior.stalling
      : couldScoreWithoutDice(parts, player);
  if (
    !parts.playerActionManager.declareAction(
      playerId,
      action,
      declaring.blockReplacement
    )
  ) {
    return false;
  }
  if (parts.state.activePlayer?.id === playerId) {
    parts.state.activePlayer.stalling = stalling;
  }
  const declared = parts.state.activePlayer!;
  if (firstAction) {
    declared.razzleDazzle = {
      actions: [firstAction, action],
      movementBefore: parts.state.turn.movementUsed.get(playerId) ?? 0,
    };
    if (held?.bloodlustUnsated) declared.bloodlustUnsated = true;
    // The activation's rolls (Bone Head, …) came with its first Action
    return true;
  }
  if (declaring.razzleDazzle) declared.razzleDazzle = { actions: [action] };
  // Negatraits roll between declaring and performing (Bone Head, …):
  // queued at the FRONT of the flow so the gate — decisions included —
  // resolves before the declared action can proceed
  if (
    player.skills.some((s) => SkillRegistry.get(s.type)?.onActivationDeclared)
  ) {
    parts.flowManager.add(new ActivationGateOperation(playerId, action), true);
  }
  return true;
}

/**
 * Charge! declarations run through the normal action state but deliberately
 * do not touch the coming turn's action flags or activation ledger.
 */
function chargeDeclareAction(
  parts: GameParts,
  playerId: string,
  action: ActionType
): boolean {
  const player = parts.game.getPlayerById(playerId);
  if (
    !player ||
    player.status !== PlayerStatus.ACTIVE ||
    parts.kickoffEventManager.getChargeActivePlayerId() !== playerId ||
    !parts.kickoffEventManager.canChargeAct(playerId, action)
  ) {
    return false;
  }

  let teammateMode: "throw" | "kick" | undefined;
  if (action === "throwTeamMate") {
    const canThrow = hasSkill(player.skills, SkillType.THROW_TEAM_MATE);
    const canKick = hasSkill(player.skills, SkillType.KICK_TEAM_MATE);
    if (!canThrow && !canKick) return false;
    teammateMode = canKick && !canThrow ? "kick" : "throw";
  }

  parts.state.activePlayer = { id: playerId, action };
  parts.kickoffEventManager.noteChargeActionDeclared(action, teammateMode);
  parts.eventBus.emit(
    GameEventNames.UI_Notification,
    `Charge! action declared: ${action}`
  );
  return true;
}
