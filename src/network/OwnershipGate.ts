import { isCommandOf } from "./commandKinds";
import { whenEngineQuiet } from "../game/core/GameFlowManager";
import { HeadlessGame } from "../headless/HeadlessGame";
import {
  type CommandResponse,
  DECISION_REPLIES,
  type HeadlessCommand,
  type PendingDecision,
} from "../headless/protocol";
import { GamePhase } from "../types/GameState";
import { shoppingTeamId } from "../game/inducements/pregame";

const THROW_TEAMMATE = "throw-teammate";

export interface GateContext {
  activeTeamId: string | null;
  pendingDecision: PendingDecision | null;

  teamIdOfPlayer(playerId: string): string | undefined;
  hostTeamId: string;

  phase?: GamePhase;

  weatherReady?: string[];

  inducementShopper?: string | null;

  kickUnderWay?: boolean;
}

export type GateVerdict =
  | { allowed: true }
  | { allowed: false; reason: GateRejectReason };

const NOT_YOUR_TURN = "not-your-turn";
const NOT_YOUR_PLAYER = "not-your-player";
const NOT_YOUR_DECISION = "not-your-decision";
const DECISION_PENDING = "decision-pending";
const NO_DECISION_PENDING = "no-decision-pending";
const GATE_REJECT_REASONS = [
  NOT_YOUR_TURN,
  NOT_YOUR_PLAYER,
  NOT_YOUR_DECISION,
  DECISION_PENDING,
  NO_DECISION_PENDING,
  "host-only",
] as const;

type GateRejectReason = (typeof GATE_REJECT_REASONS)[number];

export function refusalMessage(reason: string): string {
  const code = GATE_REJECT_REASONS.find(
    (known) => reason === known || reason.startsWith(`${known}:`)
  );
  switch (code) {
    case NOT_YOUR_TURN:
      return "Your turn has ended, so that was not played.";
    case NOT_YOUR_PLAYER:
      return "That player is on the other team.";
    case NOT_YOUR_DECISION:
      return "That choice is the other coach's to make.";
    case DECISION_PENDING:
      return "Answer the open choice first.";
    case NO_DECISION_PENDING:
      return "That choice has already been made.";
    case "host-only":
      return "Only the host can do that.";
    case undefined:
      return "The game did not allow that.";
  }
}

const allow: GateVerdict = { allowed: true };
const deny = (reason: GateRejectReason): GateVerdict => ({
  allowed: false,
  reason,
});

export function decisionOwner(
  pending: PendingDecision,
  ctx: GateContext
): string | undefined {
  if (pending.type === "block-dice") return pending.choiceStage === "attacker-reroll"
    ? ctx.teamIdOfPlayer(pending.attackerId) : pending.chooserTeamId;
  if (pending.type === "push-direction") return pending.chooserTeamId ?? ctx.teamIdOfPlayer(pending.attackerId);
  if (pending.type === "follow-up") return ctx.teamIdOfPlayer(pending.attackerId);
  if (pending.type === "touchback") return pending.teamId;
  return pending.chooserTeamId;
}

const duringOwnTurn = (
  ctx: GateContext,
  senderTeamId: string,
  then: () => GateVerdict
): GateVerdict =>
  ctx.activeTeamId === senderTeamId ? then() : deny(NOT_YOUR_TURN);

const ownsPlayer = (
  ctx: GateContext,
  senderTeamId: string,
  playerId: string
): GateVerdict =>
  ctx.teamIdOfPlayer(playerId) === senderTeamId
    ? allow
    : deny(NOT_YOUR_PLAYER);

const sameTeam = (
  teamId: string,
  senderTeamId: string,
  reason: GateRejectReason
): GateVerdict => (teamId === senderTeamId ? allow : deny(reason));

const BLOCK_REROLL_COMMANDS = new Set<HeadlessCommand["type"]>([
  "team-reroll-block",
  "pro-reroll-block",
  "brawler-reroll-block",
  "veteran-reroll-block",
]);

function checkDecisionReply(
  command: HeadlessCommand,
  senderTeamId: string,
  ctx: GateContext
): GateVerdict {
  if (!ctx.pendingDecision) return deny(NO_DECISION_PENDING);
  const pending = ctx.pendingDecision;
  const owner = decisionOwner(pending, ctx);
  if (owner !== senderTeamId) return deny(NOT_YOUR_DECISION);
  if (pending.type !== "block-dice") return allow;
  const rerollStage = pending.choiceStage === "attacker-reroll";
  if (command.type === "choose-block-result" && rerollStage)
    return deny(DECISION_PENDING);
  if (command.type === "keep-block-dice" && !rerollStage)
    return deny(NOT_YOUR_DECISION);
  if (
    BLOCK_REROLL_COMMANDS.has(command.type) &&
    ctx.teamIdOfPlayer(pending.attackerId) !== senderTeamId
  )
    return deny(NOT_YOUR_DECISION);
  return allow;
}

function checkWeatherReady(
  teamId: string,
  senderTeamId: string,
  ctx: GateContext
): GateVerdict {
  const guestReady = ctx.weatherReady?.some((id) => id !== ctx.hostTeamId);
  if (senderTeamId === ctx.hostTeamId && !guestReady)
    return deny(NOT_YOUR_TURN);
  return sameTeam(teamId, senderTeamId, NOT_YOUR_PLAYER);
}

function checkPurchase(
  teamId: string,
  senderTeamId: string,
  ctx: GateContext
): GateVerdict {
  if (ctx.inducementShopper && ctx.inducementShopper !== senderTeamId)
    return deny(NOT_YOUR_TURN);
  return sameTeam(teamId, senderTeamId, NOT_YOUR_PLAYER);
}

function checkMatchCommand(command: HeadlessCommand, senderTeamId: string, ctx: GateContext): GateVerdict | undefined {
  if (isCommandOf(command, ["select-inducement", "remove-inducement", "confirm-inducements"])) return checkPurchase(command.teamId, senderTeamId, ctx);
  if (command.type === "ready-weather") return checkWeatherReady(command.teamId, senderTeamId, ctx);
  if (isCommandOf(command, ["coin-flip", "start-setup"])) return sameTeam(ctx.hostTeamId, senderTeamId, "host-only");
  return checkEndOrKickCommand(command, senderTeamId, ctx);
}

function checkEndOrKickCommand(command: HeadlessCommand, senderTeamId: string, ctx: GateContext): GateVerdict | undefined {
  if (command.type === "award-mvp") return ctx.phase === GamePhase.GAME_OVER
    ? sameTeam(command.teamId, senderTeamId, NOT_YOUR_PLAYER) : deny(NOT_YOUR_TURN);
  if (command.type === "assign-awarded-touchdown") return ctx.phase === GamePhase.GAME_OVER
    ? ownsPlayer(ctx, senderTeamId, command.playerId) : deny(NOT_YOUR_TURN);
  if (isCommandOf(command, ["select-kicker", "kick-ball"])) {
    if (ctx.kickUnderWay) return deny(NOT_YOUR_TURN);
    if (ctx.phase === GamePhase.KICKOFF && ctx.activeTeamId === senderTeamId) return deny(NOT_YOUR_TURN);
    return ownsPlayer(ctx, senderTeamId, command.playerId);
  }
  return undefined;
}

function checkSetupCommand(
  command: HeadlessCommand,
  senderTeamId: string,
  ctx: GateContext
): GateVerdict | undefined {
  if (!isCommandOf(command, ["place-player", "remove-player", "swap-players", "confirm-setup", "apply-formation", "setup-concession"])) return undefined;
  const owns = (playerId: string) => ownsPlayer(ctx, senderTeamId, playerId);
  switch (command.type) {
    case "place-player":
    case "remove-player":
      return duringOwnTurn(ctx, senderTeamId, () => owns(command.playerId));
    case "swap-players":
      return duringOwnTurn(ctx, senderTeamId, () => {
        const first = owns(command.player1Id);
        return first.allowed ? owns(command.player2Id) : first;
      });
    case "confirm-setup":
    case "apply-formation":
    case "setup-concession":
      return duringOwnTurn(ctx, senderTeamId, () =>
        sameTeam(command.teamId, senderTeamId, NOT_YOUR_TURN)
      );
  }
}

function checkPlayCommand(
  command: HeadlessCommand,
  senderTeamId: string,
  ctx: GateContext
): GateVerdict {
  const owns = (playerId: string) => ownsPlayer(ctx, senderTeamId, playerId);
  if (!isCommandOf(command, ["block", "multiple-block", "stab", "special-action", THROW_TEAMMATE, "throw-bomb", "end-turn"])) return duringOwnTurn(ctx, senderTeamId, () => {
    const playerId = "playerId" in command ? command.playerId : undefined;
    return playerId ? owns(playerId) : allow;
  });
  switch (command.type) {
    case "block":
    case "multiple-block":
    case "stab":
    case "special-action":
      return duringOwnTurn(ctx, senderTeamId, () => owns(command.attackerId));
    case THROW_TEAMMATE:
    case "throw-bomb":
      return duringOwnTurn(ctx, senderTeamId, () => owns(command.throwerId));

    case "end-turn":
      return duringOwnTurn(ctx, senderTeamId, () => allow);

  }
}

export function checkOwnership(
  command: HeadlessCommand,
  senderTeamId: string,
  ctx: GateContext
): GateVerdict {
  if (
    command.type === "state" ||
    command.type === "legal-actions" ||
    command.type === "offer-inducements"
  ) {
    return allow;
  }

  if (command.type in DECISION_REPLIES) {
    return checkDecisionReply(command, senderTeamId, ctx);
  }
  const pending = ctx.pendingDecision;
  if (pending) return deny(DECISION_PENDING);

  return (
    checkMatchCommand(command, senderTeamId, ctx) ??
    checkSetupCommand(command, senderTeamId, ctx) ??
    checkPlayCommand(command, senderTeamId, ctx)
  );
}

export function gateContextOf(
  game: HeadlessGame,
  hostTeamId: string
): GateContext {
  const gameService = game.ctx.gameService;
  return {
    activeTeamId: gameService.getState().activeTeamId,
    pendingDecision: game.pendingDecision(),
    teamIdOfPlayer: (playerId) => gameService.getPlayerById(playerId)?.teamId,
    hostTeamId,
    phase: gameService.getState().phase,
    kickUnderWay: gameService.isKickUnderWay(),
    ...(gameService.getState().weatherReady !== undefined && { weatherReady: gameService.getState().weatherReady }),
    inducementShopper: shoppingTeamId(
      gameService.getState().pregameInducements,
      [game.ctx.team1.id, game.ctx.team2.id]
    ),
  };
}

export async function refusalOnceQuiet(options: {
  game: HeadlessGame;
  command: HeadlessCommand;
  senderTeamId: string;
  hostTeamId: string;
}): Promise<CommandResponse | null> {
  const { game, command, senderTeamId, hostTeamId } = options;
  await whenEngineQuiet();
  const verdict = checkOwnership(
    command,
    senderTeamId,
    gateContextOf(game, hostTeamId)
  );
  if (verdict.allowed) return null;
  return {
    ok: false,
    reason: verdict.reason,
    events: [],
    snapshot: game.snapshot(),
    pendingDecision: game.pendingDecision(),
  };
}
