import {
  type GameSnapshot,
  type PlayerSnapshot,
} from "../headless/serialization";
import { type HeadlessCommand } from "../headless/protocol";
import { GamePhase } from "../types/GameState";
import { PlayerStatus } from "../types/Player";
import { GameConfig } from "../config/GameConfig";
import { obstacleKindAt } from "../game/rules/pitchSquares";

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
  `${p.id} (${p.positionName}) at (${String(p.position?.x)},${String(p.position?.y)})`;

type Fail = (rule: string, message: string) => void;

function squareChecks(
  onPitch: PlayerSnapshot[],
  fail: Fail
): Map<string, PlayerSnapshot> {
  const occupied = new Map<string, PlayerSnapshot>();
  for (const p of onPitch) {
    const key = `${String(p.position!.x)},${String(p.position!.y)}`;
    const other = occupied.get(key);
    if (other)
      fail(
        "one-player-per-square",
        `${where(p)} shares a square with ${other.id}`
      );
    occupied.set(key, p);
    if (!inBounds(p.position!))
      fail("player-in-bounds", `${where(p)} is off the pitch grid`);
    if (p.position && obstacleKindAt(p.position))
      fail("player-off-obstacles", `${where(p)} stands on an obstacle`);
    if (!ON_PITCH_STATUSES.has(p.status)) {
      fail(
        "on-pitch-status",
        `${where(p)} is on the pitch with status ${p.status}`
      );
    }
  }
  return occupied;
}

function offPitchChecks(
  after: GameSnapshot,
  players: PlayerSnapshot[],
  fail: Fail
): void {
  if (after.phase !== GamePhase.PLAY) return;
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

function teamChecks(
  before: GameSnapshot,
  after: GameSnapshot,
  fail: Fail
): void {
  for (const team of after.teams) {
    const count = team.players.filter((p) => p.position).length;

    const swarmed = after.setup?.swarming?.teams[team.id]?.roll ?? 0;
    if (count > 7 + swarmed)
      fail(
        "seven-a-side",
        `${team.name} has ${String(count)} players on the pitch`
      );
    if (team.rerolls < 0)
      fail(
        "rerolls-non-negative",
        `${team.name} has ${String(team.rerolls)} re-rolls`
      );
    const scoreBefore = before.score[team.id] ?? 0;
    const scoreAfter = after.score[team.id] ?? 0;
    if (scoreAfter < scoreBefore) {
      fail(
        "score-monotonic",
        `${team.name}'s score fell from ${String(scoreBefore)} to ${String(scoreAfter)}`
      );
    }
    if (scoreAfter > scoreBefore + 1) {
      fail(
        "one-touchdown-per-command",
        `${team.name}'s score jumped from ${String(scoreBefore)} to ${String(scoreAfter)}`
      );
    }
  }
}

function ballChecks(
  after: GameSnapshot,
  occupied: Map<string, PlayerSnapshot>,
  decisionPending: boolean,
  fail: Fail
): void {
  if (after.ballPosition && !inBounds(after.ballPosition)) {
    fail(
      "ball-in-bounds",
      `ball at (${String(after.ballPosition.x)},${String(after.ballPosition.y)})`
    );
  }

  if (
    after.phase !== GamePhase.PLAY ||
    !after.ballPosition ||
    decisionPending
  )
    return;
  const holder = occupied.get(
    `${String(after.ballPosition.x)},${String(after.ballPosition.y)}`
  );
  if (holder && holder.status !== PlayerStatus.ACTIVE) {
    fail(
      "downed-player-holds-ball",
      `${where(holder)} is ${holder.status} with the ball`
    );
  }
}

function turnChecks(
  before: GameSnapshot,
  after: GameSnapshot,
  players: PlayerSnapshot[],
  fail: Fail
): void {
  if (after.phase === GamePhase.PLAY && after.activePlayer) {
    const owner = players.find((p) => p.id === after.activePlayer!.id);
    if (owner && owner.teamId !== after.activeTeamId) {
      fail(
        "active-player-on-active-team",
        `${owner.id} is still the active player during ${String(after.activeTeamId)}'s turn`
      );
    }
  }

  if (after.turn.turnNumber > GameConfig.TURNS_PER_HALF) {
    fail(
      "turn-limit",
      `turn ${String(after.turn.turnNumber)} exceeds ${String(GameConfig.TURNS_PER_HALF)} per half`
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
}

export function checkInvariants(
  before: GameSnapshot,
  after: GameSnapshot,
  decisionPending: boolean
): InvariantViolation[] {
  const out: InvariantViolation[] = [];
  const fail = (rule: string, message: string) => {
    out.push({ rule, message });
  };
  const players = after.teams.flatMap((t) => t.players);
  const occupied = squareChecks(
    players.filter((p) => p.position),
    fail
  );
  offPitchChecks(after, players, fail);
  teamChecks(before, after, fail);
  ballChecks(after, occupied, decisionPending, fail);
  turnChecks(before, after, players, fail);
  return out;
}

export interface RuleMonitor {
  observe(
    command: HeadlessCommand,
    before: GameSnapshot,
    after: GameSnapshot,
    decisionPending: boolean
  ): InvariantViolation[];
}

function blitzBlockCheck(
  command: HeadlessCommand,
  before: GameSnapshot,
  blitzBlocks: Map<string, number>,
  fail: Fail
): void {
  if (command.type === "declare-action") blitzBlocks.delete(command.playerId);
  if (command.type !== "block" || before.activePlayer?.action !== "blitz")
    return;
  const blocks = (blitzBlocks.get(command.attackerId) ?? 0) + 1;
  blitzBlocks.set(command.attackerId, blocks);
  if (blocks > 1) {
    fail(
      "one-block-per-blitz",
      `${command.attackerId} made block ${String(blocks)} in one Blitz`
    );
  }
}

function passTurnoverCheck(
  command: HeadlessCommand,
  team: string,
  after: GameSnapshot,
  fail: Fail
): void {
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

function movementChecks(
  before: GameSnapshot,
  after: GameSnapshot,
  fail: Fail
): void {
  const afterPlayers = after.teams.flatMap((t) => t.players);
  for (const player of afterPlayers) {
    const used = after.turn.movementUsed[player.id] ?? 0;

    if (used <= (before.turn.movementUsed[player.id] ?? 0)) continue;
    const mover =
      before.teams.flatMap((t) => t.players).find((p) => p.id === player.id) ??
      player;
    const allowance =
      mover.stats.MA + (mover.skills.includes("Sprint") ? 3 : 2);
    if (used > allowance) {
      fail(
        "movement-allowance",
        `${player.id} has moved ${String(used)} squares, allowance ${String(allowance)}`
      );
    }
  }
}

export function createRuleMonitor(): RuleMonitor {
  const blitzBlocks = new Map<string, number>();

  let passingTeam: string | null = null;

  return {
    observe(command, before, after, decisionPending) {
      const out = checkInvariants(before, after, decisionPending);
      const fail = (rule: string, message: string) => {
        out.push({ rule, message });
      };

      blitzBlockCheck(command, before, blitzBlocks, fail);

      if (command.type === "pass" || command.type === "handoff") {
        passingTeam = before.activeTeamId;
      }
      if (passingTeam && !decisionPending) {
        passTurnoverCheck(command, passingTeam, after, fail);
        passingTeam = null;
      }

      movementChecks(before, after, fail);
      return out;
    },
  };
}
