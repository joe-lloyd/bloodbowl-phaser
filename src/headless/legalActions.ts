import { ballInReach, ballOnSquare } from "@/game/rules/balls";
import { type HeadlessGameContext } from "./createHeadlessGame";
import {
  type GridPosition,
  type LegalActions,
  type PendingDecision,
  type PlayerActions,
} from "./protocol";
import { type ActionType } from "../types/events";
import { isTurnRunning, kickoffTurnAllows } from "../game/kickoff/kickoffTurn";
import { GamePhase, type GameState } from "../types/GameState";
import { type Player, PlayerStatus } from "../types/Player";
import { FormationManager } from "../game/managers/FormationManager";
import { seatOf } from "../game/seating";
import { areAdjacent } from "../game/elements/GridUtils";
import {
  type ActionAvailability,
  canBlitzTo,
  canFoulFrom,
  computeActionAvailability,
  razzleDazzleAllows,
} from "../game/rules/actionAvailability";
import { legalHandoffTargets } from "../game/rules/handoff";
import {
  BLOCK_REPLACEMENTS,
  BLOCK_REPLACEMENT_DEFINITIONS,
} from "../types/BlockReplacement";
import { legalBlockReplacementTargets } from "../game/rules/blockReplacements";
import { spendFor } from "../game/inducements/matchInducements";
import { openTargets } from "../game/rules/turnSpend";

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
    canEndTurn: isTurnRunning(state) && !pending,
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
  if (!isTurnRunning(state) || !team) return [];
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
  const reachable = gs.getAvailableMovements(player.id, "jump");
  const ledger = spendFor(state, teamId);
  const rivals = gs
    .getTeams()
    .map((team) => team.id)
    .filter((id) => id !== teamId);
  const availability = computeActionAvailability({
    player,
    ballPosition: ballInReach(state, square, reachable) ?? state.balls[0].at,
    opponents,
    teammates: gs.getTeammates(player.id),
    reachable,
    turn: { ...state.turn, spend: ledger },
    hasMovedInAction: false,
  });
  const open = {
    blitz: [...openTargets(state.turn.spend, rivals, "blitz")],
    foul: [...openTargets(ledger, rivals, "foul")],
  };
  const against =
    rivals.length > 1
      ? targetsInReach({ ...open, opponents, ends: [square, ...reachable] })
      : open;
  const actions = razzleDazzleSecond(
    state,
    player.id,
    declarableActions({
      player,
      availability,
      canBlitz: against.blitz.length > 0,
      canFoul: against.foul.length > 0,
      carriesBall: ballOnSquare(state, square),
      canBlock: adjacentStanding.length > 0,
    }).filter((action) => kickoffTurnAllows(state, action))
  );
  if (actions.length === 0) return null;

  const entry: PlayerActions = {
    playerId: player.id,
    playerName: player.playerName,
    actions,
    ...(rivals.length > 1 && { against }),
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

function targetsInReach({
  blitz,
  foul,
  opponents,
  ends,
}: {
  blitz: readonly string[];
  foul: readonly string[];
  opponents: readonly Player[];
  ends: readonly GridPosition[];
}): { blitz: string[]; foul: string[] } {
  const reaches = (teamId: string, near: typeof canBlitzTo) =>
    opponents.some((o) => o.teamId === teamId && near(o, ends));
  return {
    blitz: blitz.filter((teamId) => reaches(teamId, canBlitzTo)),
    foul: foul.filter((teamId) => reaches(teamId, canFoulFrom)),
  };
}

function allowed(entries: [ActionType, boolean][]): ActionType[] {
  return entries.filter(([, ok]) => ok).map(([action]) => action);
}

function declarableActions({
  player,
  availability,
  canBlitz,
  canFoul,
  carriesBall,
  canBlock,
}: {
  player: Player;
  availability: ActionAvailability;
  canBlitz: boolean;
  canFoul: boolean;
  carriesBall: boolean;
  canBlock: boolean;
}): ActionType[] {
  if (availability.ballAndChain) return ["ballAndChain"];
  if (player.status === PlayerStatus.PRONE) {
    return allowed([
      ["move", availability.move || availability.standUp],
      ["blitz", canBlitz],
      ["foul", canFoul],

      ["punt", availability.punt],
      ["gaze", availability.gaze],
    ]);
  }
  if (player.status !== PlayerStatus.ACTIVE) return [];
  const actions = allowed([
    ["move", availability.move],
    ["block", canBlock],
    ["multipleBlock", availability.multipleBlock],
    ["blitz", canBlitz],
    ["pass", carriesBall && availability.pass],
    ["handoff", availability.handoff],
    ["secureBall", availability.secureBall],
    ["throwTeamMate", availability.throwTeammate || availability.kickTeammate],
    ["punt", availability.punt],
    ["gaze", availability.gaze],

    ["foul", canFoul && availability.foul],
  ]);
  for (const replacement of availability.directBlockReplacements) {
    if (!actions.includes(replacement)) actions.push(replacement);
  }
  return actions;
}

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
    return {
        blockReplacement: replacement,
        label: `Blitz (with ${BLOCK_REPLACEMENT_DEFINITIONS[replacement].label})`,
        direct,
        blitz,
        ...targets,
      };
  });
}


function setupActions(ctx: HeadlessGameContext): LegalActions["setup"] {
  const gs = ctx.gameService;
  const state = gs.getState();
  if (state.phase !== GamePhase.SETUP || !state.activeTeamId) return undefined;
  const status = gs.getSetupStatus(state.activeTeamId);
  if (!status) return undefined;
  const { index, team } = seatOf(gs.getSeating(), state.activeTeamId);
  const isTeam1 = index === 0;
  return {
    status,
    placements: team.players.flatMap((player) =>
      player.gridPosition
        ? { playerId: player.id, ...player.gridPosition }
        : []
    ),
    presetNames:
      gs.getSeating().kind === "pair"
        ? new FormationManager()
            .getBuiltInFormations(isTeam1)
            .map((formation) => formation.name)
        : [],
    canPlace: status.concessionDecision !== "pending",
    canApplyPreset: status.concessionDecision !== "pending" && !status.swarming,
    canChooseConcession: status.concessionDecision === "pending",
    canConfirm: status.canConfirm,
  };
}
