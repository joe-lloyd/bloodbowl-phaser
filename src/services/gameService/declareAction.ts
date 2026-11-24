import { kickoffTurnOf } from "@/game/kickoff/kickRecord";
import { ballOnSquare } from "@/game/rules/ballInTheAir";
import { type GameState } from "@/types/GameState";
import { type ActionType, GameEventNames } from "@/types/events";
import {
  type Player,
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
  type ActionDeclaredContext,
  SkillRegistry,
} from "@/game/skills";
import { holdsMeasure } from "@/game/inducements/matchInducements";
import { kickoffTurnAllows } from "@/game/kickoff/kickoffTurn";
import { razzleDazzleAllows } from "@/game/rules/actionAvailability";
import { DesperateMeasure } from "@/game/inducements/desperateMeasures";
import {
  type BlockReplacement,
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

const ONCE_PER_TURN_ACTIONS: ReadonlySet<string | null> = new Set<ActionType>([
  "blitz",
  "pass",
  "handoff",
  "foul",
  "throwTeamMate",
]);

const STANDING_ACTION_SKILL: Partial<Record<ActionType, SkillType>> = {
  stab: SkillType.STAB,
  throwBomb: SkillType.BOMBARDIER,
  ballAndChain: SkillType.BALL_AND_CHAIN,
  breatheFire: SkillType.BREATHE_FIRE,
  vomit: SkillType.PROJECTILE_VOMIT,
  chomp: SkillType.MONSTROUS_MOUTH,
  chainsaw: SkillType.CHAINSAW,
};

export function declareAction({
  parts,
  playerId,
  action,
  blockReplacement: requestedReplacement,
  options = {},
}: {
  parts: GameParts;
  playerId: string;
  action: ActionType;
  blockReplacement?: BlockReplacement;
  options?: { razzleDazzle?: boolean };
}): boolean {
  if (!parts.game.canActivate(playerId)) return false;
  if (!kickoffTurnAllows(parts.state, action)) return false;

  const activating = parts.game.getPlayerById(playerId);
  if (!activating) return false;

  return declareForPlayer({
    parts,
    playerId,
    action,
    ...(requestedReplacement === undefined
      ? {}
      : { blockReplacement: requestedReplacement }),
    options,
    activating,
  });
}

type PlayerDeclaration = Parameters<typeof declareAction>[0] & {
  activating: Player;
};
function declareForPlayer({
  parts,
  playerId,
  action,
  blockReplacement: requestedReplacement,
  options = {},
  activating,
}: PlayerDeclaration): boolean {
  const held = parts.state.activePlayer;
  const firstAction = secondActionAfter(parts, held, playerId);
  if (
    razzleDazzleRefuses({
      parts,
      activating,
      action,
      firstAction,
      options,
    })
  ) {
    return false;
  }

  const directReplacement = blockReplacementForDirectAction(action);
  const blockReplacement = requestedReplacement ?? directReplacement;
  if (
    !firstAction &&
    !mayRedeclare({
      parts,
      activating,
      action,
      directReplacement,
      blockReplacement,
    })
  ) {
    return false;
  }
  if (
    !replacementAllowed({
      parts,
      activating,
      action,
      replacement: {
        requested: requestedReplacement,
        direct: directReplacement,
        chosen: blockReplacement,
      },
    })
  ) {
    return false;
  }

  expireActivationConditions(parts, activating);
  if (declarationRulesRefuse(parts, activating, action)) return false;
  return recordDeclaration(parts, {
    player: activating,
    action,
    blockReplacement,
    firstAction,
    held,
    razzleDazzle: options.razzleDazzle,
  });
}

function secondActionAfter(
  parts: GameParts,
  held: Declaration | null,
  playerId: string
): ActionType | undefined {
  if (held?.razzleDazzle?.awaitingSecond && held.id !== playerId) {
    parts.game.finishActivation(held.id);
  }
  return held?.id === playerId && held.razzleDazzle?.awaitingSecond
    ? held.razzleDazzle.actions[0]
    : undefined;
}

function razzleDazzleRefuses({
  parts,
  activating,
  action,
  firstAction,
  options,
}: {
  parts: GameParts;
  activating: Player;
  action: ActionType;
  firstAction: ActionType | undefined;
  options: { razzleDazzle?: boolean };
}): boolean {
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
      !!kickoffTurnOf(parts.state) ||
      !holdsMeasure(
        parts.state,
        activating.teamId,
        DesperateMeasure.RAZZLE_DAZZLE
      ) ||
      parts.playerActionManager.isActionCommitted(activating.id).committed)
  );
}

function mayRedeclare({
  parts,
  activating,
  action,
  directReplacement,
  blockReplacement,
}: {
  parts: GameParts;
  activating: Player;
  action: ActionType;
  directReplacement: BlockReplacement | undefined;
  blockReplacement: BlockReplacement | undefined;
}): boolean {
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

  const live = parts.state.activePlayer;
  if (!live) return true;
  if (live.blockReplacement || blockReplacement) return false;
  return releaseLiveDeclaration({
    parts,
    live,
    playerId: activating.id,
    action,
  });
}

function releaseLiveDeclaration({
  parts,
  live,
  playerId,
  action,
}: {
  parts: GameParts;
  live: Declaration;
  playerId: string;
  action: ActionType;
}): boolean {
  const existingId = live.id;
  const status = parts.playerActionManager.isActionCommitted(existingId);

  const switching = existingId === playerId && live.action !== action;
  if (
    status.committed &&
    (switching ||
      status.reason === "gate" ||
      ONCE_PER_TURN_ACTIONS.has(live.action))
  ) {
    parts.eventBus.emit(
      GameEventNames.UI_Notification,
      `Cannot change the declared Action — ${PlayerActionManager.describeCommitReason(status.reason)}.`
    );
    return false;
  }
  if (ONCE_PER_TURN_ACTIONS.has(live.action)) {
    parts.playerActionManager.cancelAction(existingId);
  }
  return true;
}

function replacementAllowed({
  parts,
  activating,
  action,
  replacement,
}: {
  parts: GameParts;
  activating: Player;
  action: ActionType;
  replacement: {
    requested: BlockReplacement | undefined;
    direct: BlockReplacement | undefined;
    chosen: BlockReplacement | undefined;
  };
}): boolean {
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
        parts.game.getAvailableMovements(activating.id, "jump"),
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
  if (hasCondition(activating, PlayerCondition.DISTRACTED)) {
    removeCondition(activating, PlayerCondition.DISTRACTED);
    parts.eventBus.emit(GameEventNames.PlayerStatusChanged, activating);
  }

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

const canDeclareMoveFirst = (p: Player) =>
  p.status === PlayerStatus.ACTIVE || p.status === PlayerStatus.PRONE;

const MOVE_FIRST_ACTION_SKILL: Partial<Record<ActionType, SkillType>> = {
  punt: SkillType.PUNT,
  gaze: SkillType.HYPNOTIC_GAZE,
};

function traitsAllow(
  parts: GameParts,
  player: Player,
  action: ActionType
): boolean {
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

  return otherTraitsAllow(parts, player, action);
}

function otherTraitsAllow(
  parts: GameParts,
  player: Player,
  action: ActionType
): boolean {
  if (action === "throwTeamMate") {
    return (
      player.status === PlayerStatus.ACTIVE &&
      (hasSkill(player.skills, SkillType.THROW_TEAM_MATE) ||
        hasSkill(player.skills, SkillType.KICK_TEAM_MATE))
    );
  }
  if (action === "punt" && parts.state.turn.hasPunted) return false;
  const moveFirst = MOVE_FIRST_ACTION_SKILL[action];
  if (moveFirst) {
    return canDeclareMoveFirst(player) && hasSkill(player.skills, moveFirst);
  }

  const needed = STANDING_ACTION_SKILL[action];
  return (
    !needed ||
    (player.status === PlayerStatus.ACTIVE && hasSkill(player.skills, needed))
  );
}

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

function recordDeclaration(
  parts: GameParts,
  declaring: {
    player: Player;
    action: ActionType;
    blockReplacement: BlockReplacement | undefined;

    firstAction: ActionType | undefined;

    held: Declaration | null;
    razzleDazzle: boolean | undefined;
  }
): boolean {
  const { player, action } = declaring;
  const playerId = player.id;

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
  const declared = parts.state.activePlayer;
  if (!declared)
    throw new Error("Declared action did not establish an active player");
  return finishDeclaration(parts, declaring, declared);
}

type DeclarationRequest = Parameters<typeof recordDeclaration>[1];
function finishDeclaration(
  parts: GameParts,
  declaring: DeclarationRequest,
  declared: Declaration
): boolean {
  const { player, action, firstAction, held } = declaring;
  const playerId = player.id;
  if (firstAction) {
    declared.razzleDazzle = {
      actions: [firstAction, action],
      movementBefore: parts.state.turn.movementUsed.get(playerId) ?? 0,
    };
    if (held?.bloodlustUnsated) declared.bloodlustUnsated = true;

    return true;
  }
  if (declaring.razzleDazzle) declared.razzleDazzle = { actions: [action] };

  if (
    player.skills.some(
      (s) => SkillRegistry.get(s.type)?.onActivationDeclared !== undefined
    )
  ) {
    parts.flowManager.add(new ActivationGateOperation(playerId, action), true);
  }
  return true;
}

function declarationRulesRefuse(
  parts: GameParts,
  player: Player,
  action: ActionType
): boolean {
  return (
    moveRefused(parts, player, action) ||
    !traitsAllow(parts, player, action) ||
    rulesRefuse(parts, player, action)
  );
}
