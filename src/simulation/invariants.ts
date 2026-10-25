/**
 * Rules that must hold after every accepted command, whatever the dice did.
 *
 * Each check reads only the serialized snapshot, so a violation can be
 * reproduced from a recording without the coach that caused it.
 */

import { GameSnapshot, PlayerSnapshot } from "../headless/serialization";
import { HeadlessCommand } from "../headless/protocol";
import { GamePhase } from "../types/GameState";
import { PlayerStatus } from "../types/Player";
import { GameConfig } from "../config/GameConfig";

const ON_PITCH_STATUSES = new Set<PlayerStatus>([
  PlayerStatus.ACTIVE,
  PlayerStatus.PRONE,
  PlayerStatus.STUNNED,
]);

export interface InvariantViolation {
  rule: string;
  message: string;
}

const inBounds = (p: { x: number; y: number }) =>
  p.x >= 0 &&
  p.x < GameConfig.PITCH_WIDTH &&
  p.y >= 0 &&
  p.y < GameConfig.PITCH_HEIGHT;

const where = (p: PlayerSnapshot) =>
  `${p.id} (${p.positionName}) at (${p.position?.x},${p.position?.y})`;

export function checkInvariants(
  before: GameSnapshot,
  after: GameSnapshot,
  decisionPending: boolean
): InvariantViolation[] {
  const out: InvariantViolation[] = [];
  const fail = (rule: string, message: string) => out.push({ rule, message });
  const players = after.teams.flatMap((t) => t.players);
  const onPitch = players.filter((p) => p.position);

  const occupied = new Map<string, PlayerSnapshot>();
  for (const p of onPitch) {
    const key = `${p.position!.x},${p.position!.y}`;
    const other = occupied.get(key);
    if (other)
      fail(
        "one-player-per-square",
        `${where(p)} shares a square with ${other.id}`
      );
    occupied.set(key, p);
    if (!inBounds(p.position!))
      fail("player-in-bounds", `${where(p)} is off the pitch grid`);
    if (!ON_PITCH_STATUSES.has(p.status)) {
      fail(
        "on-pitch-status",
        `${where(p)} is on the pitch with status ${p.status}`
      );
    }
  }

  if (after.phase === GamePhase.PLAY) {
    for (const p of players) {
      if (
        !p.position &&
        ON_PITCH_STATUSES.has(p.status) &&
        p.status !== PlayerStatus.ACTIVE
      ) {
        fail("off-pitch-status", `${p.id} is off the pitch but ${p.status}`);
      }
    }
  }

  for (const team of after.teams) {
    const count = team.players.filter((p) => p.position).length;
    if (count > 7)
      fail("seven-a-side", `${team.name} has ${count} players on the pitch`);
    if (team.rerolls < 0)
      fail("rerolls-non-negative", `${team.name} has ${team.rerolls} re-rolls`);
    const scoreBefore = before.score[team.id] ?? 0;
    const scoreAfter = after.score[team.id] ?? 0;
    if (scoreAfter < scoreBefore) {
      fail(
        "score-monotonic",
        `${team.name}'s score fell from ${scoreBefore} to ${scoreAfter}`
      );
    }
    if (scoreAfter > scoreBefore + 1) {
      fail(
        "one-touchdown-per-command",
        `${team.name}'s score jumped from ${scoreBefore} to ${scoreAfter}`
      );
    }
  }

  if (after.ballPosition && !inBounds(after.ballPosition)) {
    fail(
      "ball-in-bounds",
      `ball at (${after.ballPosition.x},${after.ballPosition.y})`
    );
  }

  // A downed player cannot hold the ball: it must have bounced. Mid-decision
  // the bounce may still be queued, so only check settled states.
  if (
    after.phase === GamePhase.PLAY &&
    after.ballPosition &&
    !decisionPending
  ) {
    const holder = occupied.get(
      `${after.ballPosition.x},${after.ballPosition.y}`
    );
    if (holder && holder.status !== PlayerStatus.ACTIVE) {
      fail(
        "downed-player-holds-ball",
        `${where(holder)} is ${holder.status} with the ball`
      );
    }
  }

  if (after.phase === GamePhase.PLAY && after.activePlayer) {
    const owner = players.find((p) => p.id === after.activePlayer!.id);
    if (owner && owner.teamId !== after.activeTeamId) {
      fail(
        "active-player-on-active-team",
        `${owner.id} is still the active player during ${after.activeTeamId}'s turn`
      );
    }
  }

  if (after.turn.turnNumber > GameConfig.TURNS_PER_HALF) {
    fail(
      "turn-limit",
      `turn ${after.turn.turnNumber} exceeds ${GameConfig.TURNS_PER_HALF} per half`
    );
  }
  if (
    before.turn.isHalf2 &&
    !after.turn.isHalf2 &&
    after.phase !== GamePhase.GAME_OVER
  ) {
    fail(
      "half-monotonic",
      "the match went from the second half back to the first"
    );
  }

  return out;
}

/**
 * Rules that need to know which command ran, or what happened over several
 * commands: one Block per Blitz, a pass the passing team does not end up
 * holding is a turnover, and nobody moves further than MA plus Rushes.
 * Wraps checkInvariants, so a caller needs only this.
 */
export interface RuleMonitor {
  observe(
    command: HeadlessCommand,
    before: GameSnapshot,
    after: GameSnapshot,
    decisionPending: boolean
  ): InvariantViolation[];
}

export function createRuleMonitor(): RuleMonitor {
  const blitzBlocks = new Map<string, number>();
  /** The passing team while a Pass or Hand-off is still resolving. */
  let passingTeam: string | null = null;

  return {
    observe(command, before, after, decisionPending) {
      const out = checkInvariants(before, after, decisionPending);
      const fail = (rule: string, message: string) =>
        out.push({ rule, message });

      if (command.type === "block" && before.activePlayer?.action === "blitz") {
        const key = `${before.turn.isHalf2}-${before.turn.turnNumber}-${before.activeTeamId}-${command.attackerId}`;
        const blocks = (blitzBlocks.get(key) ?? 0) + 1;
        blitzBlocks.set(key, blocks);
        if (blocks > 1) {
          fail(
            "one-block-per-blitz",
            `${command.attackerId} made block ${blocks} in one Blitz`
          );
        }
      }

      if (command.type === "pass" || command.type === "handoff") {
        passingTeam = before.activeTeamId;
      }
      if (passingTeam && !decisionPending) {
        const team = passingTeam;
        passingTeam = null;
        const stillTheirTurn =
          after.phase === GamePhase.PLAY && after.activeTeamId === team;
        const holder = after.ballPosition
          ? after.teams
              .flatMap((t) => t.players)
              .find(
                (p) =>
                  p.position?.x === after.ballPosition!.x &&
                  p.position?.y === after.ballPosition!.y &&
                  p.status === PlayerStatus.ACTIVE
              )
          : undefined;
        if (stillTheirTurn && holder?.teamId !== team) {
          fail(
            "uncaught-pass-is-turnover",
            `after a ${command.type} by ${team} the ball is ${holder ? `held by ${holder.id}` : "loose"} and it is still ${team}'s turn`
          );
        }
      }

      for (const player of after.teams.flatMap((t) => t.players)) {
        const used = after.turn.movementUsed[player.id] ?? 0;
        const allowance =
          player.stats.MA + (player.skills.includes("Sprint") ? 3 : 2);
        if (used > allowance) {
          fail(
            "movement-allowance",
            `${player.id} has moved ${used} squares, allowance ${allowance}`
          );
        }
      }
      return out;
    },
  };
}
