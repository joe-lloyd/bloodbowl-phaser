/**
 * OwnershipGate - who may send which command right now.
 *
 * One rule set consulted twice: authoritatively by the host before executing
 * a command, and locally by each client to lock its own input while waiting.
 * Never throws — returns a typed verdict so out-of-turn commands are
 * rejected, not crashed on.
 *
 * Ownership rules:
 * - Queries (state / legal-actions) are always allowed.
 * - Decision replies belong to the deciding side: block-dice to its
 *   chooserTeamId, push-direction and follow-up to the attacker's team,
 *   touchback to the receiving team.
 * - While a decision is pending, all other commands wait.
 * - Setup placement belongs to the placed player's team; confirm-setup to
 *   the confirming team; coin-flip / start-setup to the host.
 * - Each coach readies up for the opening weather, the guest before the host.
 * - Play commands belong to the active team, and may only reference that
 *   team's own players.
 */

import { whenEngineQuiet } from "../game/core/GameFlowManager";
import { HeadlessGame } from "../headless/HeadlessGame";
import {
  CommandResponse,
  DECISION_REPLIES,
  HeadlessCommand,
  PendingDecision,
} from "../headless/protocol";
import { GamePhase } from "../types/GameState";
import { shoppingTeamId } from "../game/inducements/pregame";

export interface GateContext {
  activeTeamId: string | null;
  pendingDecision: PendingDecision | null;
  /** Resolve which team a player belongs to (undefined if unknown) */
  teamIdOfPlayer(playerId: string): string | undefined;
  hostTeamId: string;
  /** Current phase — kickoff is owned by the kicking (non-active) team */
  phase?: GamePhase;
  /** Teams whose coach is ready for the opening weather roll. */
  weatherReady?: string[];
  /** The team buying pregame inducements now, if any. */
  inducementShopper?: string | null;
}

export type GateVerdict =
  | { allowed: true }
  | { allowed: false; reason: GateRejectReason };

const GATE_REJECT_REASONS = [
  "not-your-turn",
  "not-your-player",
  "not-your-decision",
  "decision-pending",
  "no-decision-pending",
  "host-only",
] as const;

export type GateRejectReason = (typeof GATE_REJECT_REASONS)[number];

/**
 * What to tell a coach whose command was refused. `reason` is the gate's
 * code or the engine's, which may add detail after a colon.
 */
export function refusalMessage(reason: string): string {
  const code = GATE_REJECT_REASONS.find(
    (known) => reason === known || reason.startsWith(`${known}:`)
  );
  switch (code) {
    case "not-your-turn":
      return "Your turn has ended, so that was not played.";
    case "not-your-player":
      return "That player is on the other team.";
    case "not-your-decision":
      return "That choice is the other coach's to make.";
    case "decision-pending":
      return "Answer the open choice first.";
    case "no-decision-pending":
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

const CHARGE_COMMANDS = new Set<HeadlessCommand["type"]>([
  "declare-action",
  "move",
  "block",
  "throw-teammate",
  "end-activation",
]);

/** Which team owns the pending decision. */
export function decisionOwner(
  pending: PendingDecision,
  ctx: GateContext
): string | undefined {
  switch (pending.type) {
    case "block-dice":
      return pending.choiceStage === "attacker-reroll"
        ? ctx.teamIdOfPlayer(pending.attackerId)
        : pending.chooserTeamId;
    case "kickoff-event":
    case "reroll":
    case "reaction":
    case "bite-target":
    case "interception":
    case "apothecary":
    case "inducement-choice":
    case "foul-assists":
      // The deciding team rides on the decision itself
      return pending.chooserTeamId;
    case "push-direction":
      // The attacker steers the push, unless the pushed player Sidesteps
      return pending.chooserTeamId ?? ctx.teamIdOfPlayer(pending.attackerId);
    case "follow-up":
      return ctx.teamIdOfPlayer(pending.attackerId);
    case "touchback":
      return pending.teamId;
  }
}

/** Run `then` only on the sender's own turn. */
const duringOwnTurn = (
  ctx: GateContext,
  senderTeamId: string,
  then: () => GateVerdict
): GateVerdict =>
  ctx.activeTeamId === senderTeamId ? then() : deny("not-your-turn");

const ownsPlayer = (
  ctx: GateContext,
  senderTeamId: string,
  playerId: string
): GateVerdict =>
  ctx.teamIdOfPlayer(playerId) === senderTeamId
    ? allow
    : deny("not-your-player");

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

/** Decision replies: only the deciding side, only while one is pending. */
function checkDecisionReply(
  command: HeadlessCommand,
  senderTeamId: string,
  ctx: GateContext
): GateVerdict {
  if (!ctx.pendingDecision) return deny("no-decision-pending");
  const pending = ctx.pendingDecision;
  const owner = decisionOwner(pending, ctx);
  if (owner !== senderTeamId) return deny("not-your-decision");
  if (pending.type !== "block-dice") return allow;
  const rerollStage = pending.choiceStage === "attacker-reroll";
  if (command.type === "choose-block-result" && rerollStage)
    return deny("decision-pending");
  if (command.type === "keep-block-dice" && !rerollStage)
    return deny("not-your-decision");
  if (
    BLOCK_REROLL_COMMANDS.has(command.type) &&
    ctx.teamIdOfPlayer(pending.attackerId) !== senderTeamId
  )
    return deny("not-your-decision");
  return allow;
}

/** The player a Charge! command acts through. */
function actingPlayerId(command: HeadlessCommand): string | undefined {
  if ("playerId" in command) return command.playerId;
  if ("attackerId" in command) return command.attackerId;
  if ("throwerId" in command) return command.throwerId;
  return undefined;
}

/** A Charge! kick-off event: the charging team moves its own players. */
function checkCharge(
  command: HeadlessCommand,
  senderTeamId: string,
  ctx: GateContext,
  pending: PendingDecision
): GateVerdict {
  const owner = decisionOwner(pending, ctx);
  if (owner !== senderTeamId) return deny("not-your-decision");
  const playerId = actingPlayerId(command);
  return playerId && ctx.teamIdOfPlayer(playerId) !== senderTeamId
    ? deny("not-your-player")
    : allow;
}

/**
 * Both coaches may ready up for the weather, so the two commands are put in
 * one order: the guest first, then the host. Two at once would each run
 * first on their own engine and the engines would disagree.
 */
function checkWeatherReady(
  teamId: string,
  senderTeamId: string,
  ctx: GateContext
): GateVerdict {
  const guestReady = ctx.weatherReady?.some((id) => id !== ctx.hostTeamId);
  if (senderTeamId === ctx.hostTeamId && !guestReady)
    return deny("not-your-turn");
  return sameTeam(teamId, senderTeamId, "not-your-player");
}

/** A pregame purchase: only by the buying team's coach, on their turn. */
function checkPurchase(
  teamId: string,
  senderTeamId: string,
  ctx: GateContext
): GateVerdict {
  if (ctx.inducementShopper && ctx.inducementShopper !== senderTeamId)
    return deny("not-your-turn");
  return sameTeam(teamId, senderTeamId, "not-your-player");
}

/** Pregame, ceremony, kick and post-match commands; undefined for others. */
function checkMatchCommand(
  command: HeadlessCommand,
  senderTeamId: string,
  ctx: GateContext
): GateVerdict | undefined {
  switch (command.type) {
    // Pregame inducements belong to the buying team's coach. Teams buy in
    // turn, so the coach whose turn it is not is refused here, before the
    // command is sent: two purchases at once would split the engines.
    case "select-inducement":
    case "remove-inducement":
    case "confirm-inducements":
      return checkPurchase(command.teamId, senderTeamId, ctx);

    case "ready-weather":
      return checkWeatherReady(command.teamId, senderTeamId, ctx);

    // Match ceremony is driven by the host
    case "coin-flip":
    case "start-setup":
      return sameTeam(ctx.hostTeamId, senderTeamId, "host-only");

    // Post-match choices belong to the coach of the affected team/player.
    case "award-mvp":
      if (ctx.phase !== GamePhase.GAME_OVER) return deny("not-your-turn");
      return sameTeam(command.teamId, senderTeamId, "not-your-player");
    case "assign-awarded-touchdown":
      if (ctx.phase !== GamePhase.GAME_OVER) return deny("not-your-turn");
      return ownsPlayer(ctx, senderTeamId, command.playerId);

    // Kickoff: the kicking team's coach acts through their own player. During
    // KICKOFF the kicking team is the NON-active team (active is the receiving
    // team, set last during SETUP_RECEIVING), so the active team can't kick.
    case "select-kicker":
    case "kick-ball":
      if (
        ctx.phase === GamePhase.KICKOFF &&
        ctx.activeTeamId === senderTeamId
      ) {
        return deny("not-your-turn");
      }
      return ownsPlayer(ctx, senderTeamId, command.playerId);
    default:
      return undefined;
  }
}

/**
 * Setup is sequential (kicking team, then receiving team): a coach may
 * only place/edit their own players while it is their setup turn, so a
 * coach who has finished can't keep editing during the opponent's setup.
 * Undefined for any other command.
 */
function checkSetupCommand(
  command: HeadlessCommand,
  senderTeamId: string,
  ctx: GateContext
): GateVerdict | undefined {
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
        sameTeam(command.teamId, senderTeamId, "not-your-turn")
      );
    default:
      return undefined;
  }
}

/** Turn play: the active coach acts through their own player. */
function checkPlayCommand(
  command: HeadlessCommand,
  senderTeamId: string,
  ctx: GateContext
): GateVerdict {
  const owns = (playerId: string) => ownsPlayer(ctx, senderTeamId, playerId);
  switch (command.type) {
    // Block references two players; the attacker must be yours
    case "block":
    case "multiple-block":
    case "stab":
    case "special-action":
      return duringOwnTurn(ctx, senderTeamId, () => owns(command.attackerId));
    case "throw-teammate":
    case "throw-bomb":
      return duringOwnTurn(ctx, senderTeamId, () => owns(command.throwerId));

    case "end-turn":
      return duringOwnTurn(ctx, senderTeamId, () => allow);

    // All remaining play commands act through a single own player
    default:
      return duringOwnTurn(ctx, senderTeamId, () => {
        const playerId = "playerId" in command ? command.playerId : undefined;
        return playerId ? owns(playerId) : allow;
      });
  }
}

export function checkOwnership(
  command: HeadlessCommand,
  senderTeamId: string,
  ctx: GateContext
): GateVerdict {
  // Queries never mutate — anyone may look
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
  if (
    pending?.type === "kickoff-event" &&
    pending.charge &&
    CHARGE_COMMANDS.has(command.type)
  ) {
    return checkCharge(command, senderTeamId, ctx, pending);
  }
  if (pending) return deny("decision-pending");

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
    weatherReady: gameService.getState().weatherReady,
    inducementShopper: shoppingTeamId(
      gameService.getState().pregameInducements,
      [game.ctx.team1.id, game.ctx.team2.id]
    ),
  };
}

/**
 * The refusal for a command, or null if its sender may run it. Checks once
 * the engine has played out what came before: a turn can end by itself in
 * that time, and an End Turn that arrives late must not end the next coach's.
 */
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
