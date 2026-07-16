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
 * - Play commands belong to the active team, and may only reference that
 *   team's own players.
 */

import { HeadlessCommand, PendingDecision } from "../headless/protocol";

export interface GateContext {
  activeTeamId: string | null;
  pendingDecision: PendingDecision | null;
  /** Resolve which team a player belongs to (undefined if unknown) */
  teamIdOfPlayer(playerId: string): string | undefined;
  hostTeamId: string;
}

export type GateVerdict =
  | { allowed: true }
  | { allowed: false; reason: GateRejectReason };

export type GateRejectReason =
  | "not-your-turn"
  | "not-your-player"
  | "not-your-decision"
  | "decision-pending"
  | "no-decision-pending"
  | "host-only";

const allow: GateVerdict = { allowed: true };
const deny = (reason: GateRejectReason): GateVerdict => ({
  allowed: false,
  reason,
});

const DECISION_REPLIES = new Set([
  "choose-block-result",
  "choose-push-direction",
  "choose-follow-up",
  "touchback",
]);

/** Which team owns the pending decision. */
export function decisionOwner(
  pending: PendingDecision,
  ctx: GateContext
): string | undefined {
  switch (pending.type) {
    case "block-dice":
      return pending.chooserTeamId;
    case "push-direction":
    case "follow-up":
      // The attacker steers pushes and follow-ups
      return ctx.teamIdOfPlayer(pending.attackerId);
    case "touchback":
      return pending.teamId;
  }
}

export function checkOwnership(
  command: HeadlessCommand,
  senderTeamId: string,
  ctx: GateContext
): GateVerdict {
  // Queries never mutate — anyone may look
  if (command.type === "state" || command.type === "legal-actions") {
    return allow;
  }

  // Decision replies: only the deciding side, only while one is pending
  if (DECISION_REPLIES.has(command.type)) {
    if (!ctx.pendingDecision) return deny("no-decision-pending");
    const owner = decisionOwner(ctx.pendingDecision, ctx);
    return owner === senderTeamId ? allow : deny("not-your-decision");
  }
  if (ctx.pendingDecision) {
    return deny("decision-pending");
  }

  const ownsPlayer = (playerId: string): GateVerdict =>
    ctx.teamIdOfPlayer(playerId) === senderTeamId
      ? allow
      : deny("not-your-player");

  switch (command.type) {
    // Match ceremony is driven by the host
    case "coin-flip":
    case "start-setup":
      return senderTeamId === ctx.hostTeamId ? allow : deny("host-only");

    // Setup: both teams place their own players in parallel
    case "place-player":
    case "remove-player":
      return ownsPlayer(command.playerId);
    case "swap-players": {
      const first = ownsPlayer(command.player1Id);
      return first.allowed ? ownsPlayer(command.player2Id) : first;
    }
    case "confirm-setup":
      return command.teamId === senderTeamId ? allow : deny("not-your-turn");

    // Kickoff: the kicking team's coach acts through their own player
    case "select-kicker":
    case "kick-ball":
      return ownsPlayer(command.playerId);

    // Block references two players; the attacker must be yours
    case "block":
      if (ctx.activeTeamId !== senderTeamId) return deny("not-your-turn");
      return ownsPlayer(command.attackerId);

    case "end-turn":
      return ctx.activeTeamId === senderTeamId ? allow : deny("not-your-turn");

    // All remaining play commands act through a single own player
    default: {
      if (ctx.activeTeamId !== senderTeamId) return deny("not-your-turn");
      const playerId = (command as { playerId?: string }).playerId;
      return playerId ? ownsPlayer(playerId) : allow;
    }
  }
}
