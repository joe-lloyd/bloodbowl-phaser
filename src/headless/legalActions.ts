/**
 * Legal action enumeration for the legal-actions query, built on the
 * engine's own validators so no rule is decided here.
 */

import { ballOnSquare } from "@/game/rules/ballInTheAir";
import { HeadlessGameContext } from "./createHeadlessGame";
import {
  GridPosition,
  LegalActions,
  PendingDecision,
  PlayerActions,
} from "./protocol";
import { ActionType } from "../types/events";
import { GamePhase, GameState } from "../types/GameState";
import { Player, PlayerStatus } from "../types/Player";
import { FormationManager } from "../game/managers/FormationManager";
import { areAdjacent } from "../game/elements/GridUtils";
import {
  ActionAvailability,
  computeActionAvailability,
  razzleDazzleAllows,
} from "../game/rules/actionAvailability";
import { legalHandoffTargets } from "../game/rules/handoff";
import {
  BLOCK_REPLACEMENTS,
  BLOCK_REPLACEMENT_DEFINITIONS,
} from "../types/BlockReplacement";
import { legalBlockReplacementTargets } from "../game/rules/blockReplacements";
import { foulSpent } from "../game/inducements/matchInducements";

export function playersAdjacent(a: Player, b: Player): boolean {
  return (
    !!a.gridPosition &&
    !!b.gridPosition &&
    areAdjacent(a.gridPosition, b.gridPosition)
  );
}

export function enumerateLegalActions({
  ctx,
  pending,
  focusPlayerId,
}: {
  ctx: HeadlessGameContext;
  pending: PendingDecision | null;
  focusPlayerId?: string;
}): LegalActions {
  const state = ctx.gameService.getState();
  const legal: LegalActions = {
    phase: state.phase,
    subPhase: state.subPhase ?? null,
    activeTeamId: state.activeTeamId,
    pendingDecision: pending,
    players: pending ? [] : playActions(ctx, focusPlayerId),
    canEndTurn: state.phase === GamePhase.PLAY && !pending,
  };
  const setup = pending ? undefined : setupActions(ctx);
  if (setup) legal.setup = setup;
  return legal;
}

function playActions(
  ctx: HeadlessGameContext,
  focusPlayerId: string | undefined
): PlayerActions[] {
  const gs = ctx.gameService;
  const state = gs.getState();
  const team = state.activeTeamId ? gs.getTeam(state.activeTeamId) : undefined;
  if (state.phase !== GamePhase.PLAY || !team) return [];
  const opponents = gs.getOpponents(team.id);
  return team.players.flatMap((player) => {
    const entry = playerActions({
      ctx,
      state,
      teamId: team.id,
      opponents,
      player,
      focus: focusPlayerId === player.id,
    });
    return entry ? [entry] : [];
  });
}

function playerActions({
  ctx,
  state,
  teamId,
  opponents,
  player,
  focus,
}: {
  ctx: HeadlessGameContext;
  state: GameState;
  teamId: string;
  opponents: Player[];
  player: Player;
  focus: boolean;
}): PlayerActions | null {
  const gs = ctx.gameService;
  const square = player.gridPosition;
  if (!square || !gs.canActivate(player.id)) return null;

  const adjacentStanding = opponents.filter(
    (o) => playersAdjacent(player, o) && o.status === PlayerStatus.ACTIVE
  );
  const adjacentDown = opponents.filter(
    (o) =>
      playersAdjacent(player, o) &&
      (o.status === PlayerStatus.PRONE || o.status === PlayerStatus.STUNNED)
  );
  const reachable = gs.getAvailableMovements(player.id);
  const availability = computeActionAvailability({
    player,
    ballPosition: state.ballPosition,
    opponents,
    teammates: gs.getTeammates(player.id),
    reachable,
    turn: { ...state.turn, hasFouled: foulSpent(state, teamId) },
    hasMovedInAction: false,
  });
  const actions = razzleDazzleSecond(
    state,
    player.id,
    declarableActions({
      player,
      availability,
      hasBlitzed: state.turn.hasBlitzed,
      canFoul: !foulSpent(state, teamId),
      carriesBall: ballOnSquare(state, square),
      canBlock: adjacentStanding.length > 0,
      canFoulAdjacent: adjacentDown.length > 0,
    })
  );
  if (actions.length === 0) return null;

  const entry: PlayerActions = {
    playerId: player.id,
    playerName: player.playerName,
    actions,
    replacementActions: replacementActions({
      player,
      square,
      opponents,
      reachable,
      availability,
      focus,
    }),
  };
  if (focus) {
    entry.moveTargets = gs
      .getAvailableMovements(player.id)
      .map(({ x, y }): GridPosition => ({ x, y }));
    entry.blockTargets = adjacentStanding.map((o) => o.id);
    entry.foulTargets = adjacentDown.map((o) => o.id);
    entry.handoffTargets = legalHandoffTargets(
      player,
      gs.getTeammates(player.id)
    ).map((mate) => mate.id);
  }
  return entry;
}

function allowed(entries: [ActionType, boolean][]): ActionType[] {
  return entries.filter(([, ok]) => ok).map(([action]) => action);
}

function declarableActions({
  player,
  availability,
  hasBlitzed,
  canFoul,
  carriesBall,
  canBlock,
  canFoulAdjacent,
}: {
  player: Player;
  availability: ActionAvailability;
  hasBlitzed: boolean;
  canFoul: boolean;
  carriesBall: boolean;
  canBlock: boolean;
  canFoulAdjacent: boolean;
}): ActionType[] {
  // A Standing Fanatic may declare nothing but Ball & Chain.
  if (availability.ballAndChain) return ["ballAndChain"];
  if (player.status === PlayerStatus.PRONE) {
    // Standing up only costs movement, so every movement-based action
    // stays available to a prone player. Only plain Block is not.
    return allowed([
      ["standUp", true],
      ["move", availability.move],
      ["blitz", !hasBlitzed],
      ["foul", canFoul],
      // Move-first Special Actions may be declared Prone (errata p.122)
      ["punt", availability.punt],
      ["gaze", availability.gaze],
    ]);
  }
  if (player.status !== PlayerStatus.ACTIVE) return [];
  const actions = allowed([
    ["move", availability.move],
    ["block", canBlock],
    ["multipleBlock", availability.multipleBlock],
    ["blitz", !hasBlitzed],
    ["pass", carriesBall && availability.pass],
    ["handoff", availability.handoff],
    ["secureBall", availability.secureBall],
    ["throwTeamMate", availability.throwTeammate || availability.kickTeammate],
    ["punt", availability.punt],
    ["gaze", availability.gaze],
    ["foul", canFoul && canFoulAdjacent],
  ]);
  for (const replacement of availability.directBlockReplacements) {
    if (!actions.includes(replacement)) actions.push(replacement);
  }
  return actions;
}

/** Razzle-Dazzle: the second Action, within the measure's limits. */
function razzleDazzleSecond(
  state: GameState,
  playerId: string,
  actions: ActionType[]
): ActionType[] {
  const razzle = state.activePlayer?.razzleDazzle;
  if (state.activePlayer?.id !== playerId || !razzle?.awaitingSecond) {
    return actions;
  }
  const first = razzle.actions[0] as ActionType;
  return actions.filter((action) => razzleDazzleAllows(first, action));
}

function replacementActions({
  player,
  square,
  opponents,
  reachable,
  availability,
  focus,
}: {
  player: Player;
  square: GridPosition;
  opponents: Player[];
  reachable: GridPosition[];
  availability: ActionAvailability;
  focus: boolean;
}): NonNullable<PlayerActions["replacementActions"]> {
  const endSquares = [square, ...reachable];
  return BLOCK_REPLACEMENTS.flatMap((replacement) => {
    const direct = availability.directBlockReplacements.includes(replacement);
    const blitz = availability.blitzBlockReplacements.includes(replacement);
    if (!direct && !blitz) return [];
    const targets = focus
      ? {
          directTargets: legalBlockReplacementTargets(
            player,
            opponents,
            replacement
          ).map((target) => target.id),
          blitzTargets: opponents
            .filter((target) => canBlitzTo(target, endSquares))
            .map((target) => target.id),
        }
      : {};
    return [
      {
        blockReplacement: replacement,
        label: `Blitz (with ${BLOCK_REPLACEMENT_DEFINITIONS[replacement].label})`,
        direct,
        blitz,
        ...targets,
      },
    ];
  });
}

/** A Standing opponent next to a square the blitzer can end on. */
function canBlitzTo(target: Player, endSquares: GridPosition[]): boolean {
  const at = target.gridPosition;
  if (!at || target.status !== PlayerStatus.ACTIVE) return false;
  return endSquares.some(
    (square) =>
      Math.max(Math.abs(square.x - at.x), Math.abs(square.y - at.y)) === 1
  );
}

function setupActions(ctx: HeadlessGameContext): LegalActions["setup"] {
  const gs = ctx.gameService;
  const state = gs.getState();
  if (state.phase !== GamePhase.SETUP || !state.activeTeamId) return undefined;
  const status = gs.getSetupStatus(state.activeTeamId);
  if (!status) return undefined;
  const isTeam1 = state.activeTeamId === ctx.team1.id;
  return {
    status,
    placements: (isTeam1 ? ctx.team1 : ctx.team2).players.flatMap((player) =>
      player.gridPosition
        ? [{ playerId: player.id, ...player.gridPosition }]
        : []
    ),
    presetNames: new FormationManager()
      .getBuiltInFormations(isTeam1)
      .map((formation) => formation.name),
    canPlace: status.concessionDecision !== "pending",
    canApplyPreset: status.concessionDecision !== "pending" && !status.swarming,
    canChooseConcession: status.concessionDecision === "pending",
    canConfirm: status.canConfirm,
  };
}
