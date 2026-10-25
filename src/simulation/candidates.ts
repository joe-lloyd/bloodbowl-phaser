/**
 * Candidate enumeration: every concrete thing the deciding coach may send
 * next, derived from the engine's own legality checks.
 *
 * A coach never invents a command. It picks one of these, so a rejection of
 * a candidate means the engine's "what is legal" and "what it accepts" have
 * drifted apart, which the runner reports as a finding.
 *
 * A candidate is a short command sequence because setup is one decision
 * (pick a formation) that takes several placements to carry out.
 */

import { HeadlessGame } from "../headless/HeadlessGame";
import { GameSnapshot } from "../headless/serialization";
import {
  GridPosition,
  HeadlessCommand,
  PendingDecision,
} from "../headless/protocol";
import { GamePhase, SubPhase } from "../types/GameState";
import {
  Player,
  PlayerCondition,
  PlayerStatus,
  hasCondition,
} from "../types/Player";
import { ActionType } from "../types/events";
import { FormationManager } from "../game/managers/FormationManager";
import { PassController } from "../game/controllers/PassController";
import { legalHandoffTargets } from "../game/rules/handoff";
import { legalBlockReplacementTargets } from "../game/rules/blockReplacements";
import { GameConfig } from "../config/GameConfig";
import { jumpTargets } from "../game/rules/jump";
import { moveAllowance } from "../game/skills/movement";
import {
  isConfinedToReserves,
  withDriveModifiers,
} from "../game/kickoff/driveEffects";
import { hasSkill, SkillType } from "../types/Skills";

export type CandidateKind =
  | "decision"
  | "setup"
  | "kickoff"
  | "declare"
  | "step"
  | "end-activation"
  | "end-turn";

export interface Candidate {
  kind: CandidateKind;
  commands: HeadlessCommand[];
  /** Plain-English description, shown to Jev and written to recordings. */
  label: string;
}

/** Who must act, and what they may do. */
export interface DecisionPoint {
  teamId: string;
  phase: GamePhase;
  pending: PendingDecision | null;
  candidates: Candidate[];
}

/** Actions the step enumerator knows how to carry through to completion. */
const SUPPORTED_DECLARATIONS = new Set<ActionType>([
  "move",
  "block",
  "blitz",
  "pass",
  "handoff",
  "foul",
  "standUp",
  "ballAndChain",
  "stab",
  "chainsaw",
  "breatheFire",
  "chomp",
  "vomit",
]);

const chebyshev = (a: GridPosition, b: GridPosition) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

const square = (p: GridPosition) => `(${p.x},${p.y})`;

const onPitch = (p: GridPosition) =>
  p.x >= 0 &&
  p.x < GameConfig.PITCH_WIDTH &&
  p.y >= 0 &&
  p.y < GameConfig.PITCH_HEIGHT;

export function describePlayer(player: Player): string {
  const where = player.gridPosition ? ` at ${square(player.gridPosition)}` : "";
  return `${player.positionName} #${player.number}${where}`;
}

/**
 * The decision point the game is waiting on. `kickingTeamId` is tracked by
 * the runner because a KICKOFF snapshot does not say who kicks.
 */
export async function enumerateDecision(
  game: HeadlessGame,
  kickingTeamId: string | null
): Promise<DecisionPoint> {
  const snapshot = game.snapshot();
  const pending = game.pendingDecision();
  const activeTeamId = snapshot.activeTeamId ?? snapshot.teams[0].id;

  if (pending) {
    return {
      teamId: decisionOwner(pending, activeTeamId),
      phase: snapshot.phase,
      pending,
      candidates: decisionCandidates(game, pending),
    };
  }

  const at = (teamId: string, candidates: Candidate[]): DecisionPoint => ({
    teamId,
    phase: snapshot.phase,
    pending: null,
    candidates,
  });

  switch (snapshot.phase) {
    case GamePhase.SETUP: {
      const inSetup =
        snapshot.subPhase === SubPhase.SETUP_KICKING ||
        snapshot.subPhase === SubPhase.SETUP_RECEIVING;
      if (!inSetup) {
        return at(activeTeamId, [
          {
            kind: "setup",
            commands: [{ type: "coin-flip" }],
            label: "Flip the coin",
          },
        ]);
      }
      return at(activeTeamId, await setupCandidates(game, activeTeamId));
    }
    case GamePhase.KICKOFF: {
      const kicker = kickingTeamId ?? activeTeamId;
      return at(kicker, kickoffCandidates(game, snapshot, kicker));
    }
    case GamePhase.PLAY:
      return at(activeTeamId, await playCandidates(game, snapshot));
    default:
      return at(activeTeamId, []);
  }
}

function decisionOwner(pending: PendingDecision, activeTeamId: string): string {
  switch (pending.type) {
    case "touchback":
      return pending.teamId;
    case "push-direction":
      return pending.chooserTeamId ?? activeTeamId;
    case "follow-up":
      return activeTeamId;
    default:
      return pending.chooserTeamId;
  }
}

function decisionCandidates(
  game: HeadlessGame,
  pending: PendingDecision
): Candidate[] {
  const one = (command: HeadlessCommand, label: string): Candidate => ({
    kind: "decision",
    commands: [command],
    label,
  });
  const gs = game.ctx.gameService;
  const name = (id: string) => {
    const player = gs.getPlayerById(id);
    return player ? describePlayer(player) : id;
  };

  switch (pending.type) {
    case "block-dice": {
      const out = pending.options.map((option, index) =>
        one(
          { type: "choose-block-result", index },
          `Take the ${option.label} result`
        )
      );
      if (pending.teamRerollAvailable) {
        out.push(
          one(
            { type: "team-reroll-block", attackerId: pending.attackerId },
            "Spend a team re-roll on the block dice"
          )
        );
      }
      if (pending.proAvailable) {
        pending.options.forEach((option, dieIndex) =>
          out.push(
            one(
              {
                type: "pro-reroll-block",
                attackerId: pending.attackerId,
                dieIndex,
              },
              `Pro re-roll the ${option.label} die`
            )
          )
        );
      }
      if (pending.brawlerAvailable) {
        out.push(
          one(
            { type: "brawler-reroll-block", attackerId: pending.attackerId },
            "Brawler re-roll the Both Down die"
          )
        );
      }
      return out;
    }
    case "push-direction":
      return pending.options.map((o) =>
        one(
          { type: "choose-push-direction", x: o.x, y: o.y },
          `Push to ${square(o)}`
        )
      );
    case "follow-up":
      return [
        one({ type: "choose-follow-up", followUp: true }, "Follow up"),
        one({ type: "choose-follow-up", followUp: false }, "Stay put"),
      ];
    case "touchback": {
      const team = gs.getTeam(pending.teamId);
      return (team?.players ?? [])
        .filter((p) => p.gridPosition && p.status === PlayerStatus.ACTIVE)
        .map((p) =>
          one(
            { type: "touchback", playerId: p.id },
            `Give the ball to ${describePlayer(p)}`
          )
        );
    }
    case "reroll": {
      const out = pending.sources.map((source) =>
        one(
          { type: "use-reroll", accept: true, source },
          `Re-roll the ${pending.rollKind} with a ${source} re-roll`
        )
      );
      out.push(
        one(
          { type: "use-reroll", accept: false },
          `Accept the failed ${pending.rollKind}`
        )
      );
      return out;
    }
    case "reaction":
      return [
        one({ type: "use-reaction", accept: true }, `Use ${pending.skill}`),
        one(
          { type: "use-reaction", accept: false },
          `Do not use ${pending.skill}`
        ),
      ];
    case "interception":
      return [
        ...pending.candidates.map((c) =>
          one(
            { type: "choose-interception", playerId: c.playerId },
            `Try to intercept with ${name(c.playerId)} (modifier ${c.modifier})`
          )
        ),
        one({ type: "choose-interception" }, "Do not intercept"),
      ];
    case "apothecary":
      return [
        one(
          { type: "use-apothecary", accept: true },
          `Use the Apothecary on ${name(pending.playerId)}`
        ),
        one({ type: "use-apothecary", accept: false }, "Keep the Apothecary"),
      ];
    case "kickoff-event":
      // Coach-owned kickoff steps (Blitz, Charge, Quick Snap, ...) are
      // optional; confirming an untouched step and skipping it both close it.
      return [
        one({ type: "kickoff-skip" }, `Skip the ${pending.event} step`),
        one({ type: "kickoff-confirm" }, `Confirm the ${pending.event} step`),
      ];
  }
}

async function setupCandidates(
  game: HeadlessGame,
  teamId: string
): Promise<Candidate[]> {
  const legal = (await game.execute({ type: "legal-actions" })).legalActions;
  const setup = legal?.setup;
  if (setup?.canChooseConcession) {
    return [
      {
        kind: "setup",
        commands: [{ type: "setup-concession", teamId, concede: false }],
        label: "Play on with fewer than three players",
      },
    ];
  }

  const gs = game.ctx.gameService;
  const team = gs.getTeam(teamId)!;
  const isTeam1 = teamId === game.ctx.team1.id;
  const clear: HeadlessCommand[] = (setup?.placements ?? []).map((p) => ({
    type: "remove-player",
    playerId: p.playerId,
  }));
  // Strongest players go first so they land on the line of scrimmage.
  const eligible = team.players
    .filter(
      (p) =>
        p.status === PlayerStatus.ACTIVE ||
        p.status === PlayerStatus.RESERVE ||
        p.status === PlayerStatus.PRONE ||
        p.status === PlayerStatus.STUNNED
    )
    // Sweltering Heat and similar drive effects bench players for a drive.
    .filter((p) => !isConfinedToReserves(p, gs.getState()))
    .sort((a, b) => b.stats.ST - a.stats.ST || a.number - b.number);

  return new FormationManager()
    .getBuiltInFormations(isTeam1)
    .map((formation) => ({
      kind: "setup" as const,
      label: `Set up in the ${formation.name} formation`,
      commands: [
        ...clear,
        ...formation.positions.slice(0, Math.min(eligible.length, 7)).map(
          (pos, index): HeadlessCommand => ({
            type: "place-player",
            playerId: eligible[index].id,
            x: pos.x,
            y: pos.y,
          })
        ),
        { type: "confirm-setup", teamId },
      ],
    }));
}

function kickoffCandidates(
  game: HeadlessGame,
  snapshot: GameSnapshot,
  kickingTeamId: string
): Candidate[] {
  const team = snapshot.teams.find((t) => t.id === kickingTeamId);
  const kicker = team?.players.find(
    (p) => p.position && p.status === PlayerStatus.ACTIVE
  );
  if (!kicker) return [];
  const kicksRight = kickingTeamId === game.ctx.team1.id;
  const out: Candidate[] = [];
  for (const depth of [2, 4, 6]) {
    for (const y of [2, 5, 8]) {
      const x = kicksRight ? GameConfig.PITCH_WIDTH - 1 - depth : depth;
      out.push({
        kind: "kickoff",
        commands: [{ type: "kick-ball", playerId: kicker.id, x, y }],
        label: `Kick to ${square({ x, y })}`,
      });
    }
  }
  return out;
}

async function playCandidates(
  game: HeadlessGame,
  snapshot: GameSnapshot
): Promise<Candidate[]> {
  const gs = game.ctx.gameService;
  const active = snapshot.activePlayer;
  const activeTeamId = snapshot.activeTeamId;
  const actor = active ? gs.getPlayerById(active.id) : undefined;
  if (active && actor && actor.teamId === activeTeamId) {
    return stepCandidates(game, actor, active);
  }

  const legal = (await game.execute({ type: "legal-actions" })).legalActions;
  const out: Candidate[] = [];
  for (const entry of legal?.players ?? []) {
    const player = gs.getPlayerById(entry.playerId);
    if (!player) continue;
    for (const action of entry.actions) {
      if (!SUPPORTED_DECLARATIONS.has(action)) continue;
      out.push({
        kind: "declare",
        commands: [{ type: "declare-action", playerId: player.id, action }],
        label: `${describePlayer(player)} declares ${action}`,
      });
    }
    for (const replacement of entry.replacementActions ?? []) {
      if (!replacement.blitz) continue;
      out.push({
        kind: "declare",
        commands: [
          {
            type: "declare-action",
            playerId: player.id,
            action: "blitz",
            blockReplacement: replacement.blockReplacement,
          },
        ],
        label: `${describePlayer(player)} declares ${replacement.label}`,
      });
    }
  }
  if (legal?.canEndTurn) {
    out.push({
      kind: "end-turn",
      commands: [{ type: "end-turn" }],
      label: "End the turn",
    });
  }
  return out;
}

function stepCandidates(
  game: HeadlessGame,
  player: Player,
  active: NonNullable<GameSnapshot["activePlayer"]>
): Candidate[] {
  const gs = game.ctx.gameService;
  const state = gs.getState();
  const at = player.gridPosition;
  const out: Candidate[] = [];
  const step = (command: HeadlessCommand, label: string) =>
    out.push({ kind: "step", commands: [command], label });

  if (at) {
    const action = active.action;
    const opponents = gs
      .getOpponents(player.teamId)
      .filter((o) => o.gridPosition);
    const adjacent = opponents.filter(
      (o) => chebyshev(o.gridPosition!, at) === 1
    );
    const carrying =
      !!state.ballPosition &&
      state.ballPosition.x === at.x &&
      state.ballPosition.y === at.y;
    const replacementPending =
      !!active.blockReplacement && !active.blockReplacementUsed;

    if (action === "ballAndChain" && player.status === PlayerStatus.ACTIVE) {
      for (const dx of [-1, 0, 1]) {
        for (const dy of [-1, 0, 1]) {
          const facing = { x: at.x + dx, y: at.y + dy };
          if ((dx === 0 && dy === 0) || !onPitch(facing)) continue;
          step(
            { type: "ball-and-chain", playerId: player.id, ...facing },
            `${describePlayer(player)} lurches towards ${square(facing)}`
          );
        }
      }
    }

    if (action === "standUp" && player.status === PlayerStatus.PRONE) {
      step(
        { type: "stand-up", playerId: player.id },
        `${describePlayer(player)} stands up`
      );
    }

    if (
      action !== "block" &&
      action !== "standUp" &&
      action !== "ballAndChain" &&
      !isDirectReplacement(action)
    ) {
      for (const target of gs.getAvailableMovements(player.id)) {
        if (chebyshev(target, at) !== 1) continue;
        step(
          {
            type: "move",
            playerId: player.id,
            path: [{ x: target.x, y: target.y }],
          },
          `${describePlayer(player)} steps to ${square(target)}`
        );
      }
    }

    const movesWithJumps =
      action === "move" ||
      action === "blitz" ||
      action === "pass" ||
      action === "handoff" ||
      action === "foul";
    if (
      movesWithJumps &&
      player.status === PlayerStatus.ACTIVE &&
      !hasCondition(player, PlayerCondition.ROOTED) &&
      !hasCondition(player, PlayerCondition.CHOMPED) &&
      gs.getMovementUsed(player.id) + 2 <=
        moveAllowance(withDriveModifiers(player, state))
    ) {
      const others = [...gs.getTeammates(player.id), ...opponents];
      const canJumpAnything =
        hasSkill(player.skills, SkillType.LEAP) ||
        hasSkill(player.skills, SkillType.POGO);
      for (const target of jumpTargets(at, others, canJumpAnything, (x, y) =>
        onPitch({ x, y })
      )) {
        step(
          {
            type: "jump",
            playerId: player.id,
            x: target.dest.x,
            y: target.dest.y,
          },
          `${describePlayer(player)} jumps over ${square(target.over)} to ${square(target.dest)}`
        );
      }
    }

    const canBlock =
      player.status === PlayerStatus.ACTIVE &&
      !replacementPending &&
      (action === "block" ||
        (action === "blitz" && !gs.hasUsedBlitzBlock(player.id)));
    if (canBlock) {
      for (const target of adjacent.filter(
        (o) => o.status === PlayerStatus.ACTIVE
      )) {
        step(
          { type: "block", attackerId: player.id, defenderId: target.id },
          `${describePlayer(player)} blocks ${describePlayer(target)}`
        );
      }
    }

    if (replacementPending && player.status === PlayerStatus.ACTIVE) {
      const replacement = active.blockReplacement!;
      for (const target of legalBlockReplacementTargets(
        player,
        opponents,
        replacement
      )) {
        step(
          replacement === "stab"
            ? { type: "stab", attackerId: player.id, defenderId: target.id }
            : {
                type: "special-action",
                action: replacement,
                attackerId: player.id,
                defenderId: target.id,
              },
          `${describePlayer(player)} uses ${replacement} on ${describePlayer(target)}`
        );
      }
    }

    if (action === "pass" && carrying && !state.turn.hasPassed) {
      // Every in-range square, not just team-mates: passes to opponents and
      // to empty grass are legal, and are where turnover rules get tested.
      const everyone = [...gs.getTeammates(player.id), ...opponents];
      for (let x = 0; x < GameConfig.PITCH_WIDTH; x++) {
        for (let y = 0; y < GameConfig.PITCH_HEIGHT; y++) {
          if (x === at.x && y === at.y) continue;
          if (PassController.rangeValue(at, { x, y }) === null) continue;
          const there = everyone.find(
            (p) => p.gridPosition?.x === x && p.gridPosition?.y === y
          );
          step(
            { type: "pass", playerId: player.id, x, y },
            there
              ? `${describePlayer(player)} passes to ${describePlayer(there)}`
              : `${describePlayer(player)} passes to the empty square ${square({ x, y })}`
          );
        }
      }
    }

    if (action === "handoff" && carrying) {
      for (const mate of legalHandoffTargets(
        player,
        gs.getTeammates(player.id)
      )) {
        step(
          { type: "handoff", playerId: player.id, targetId: mate.id },
          `${describePlayer(player)} hands off to ${describePlayer(mate)}`
        );
      }
    }

    if (action === "foul") {
      for (const target of adjacent.filter(
        (o) =>
          o.status === PlayerStatus.PRONE || o.status === PlayerStatus.STUNNED
      )) {
        step(
          { type: "foul", playerId: player.id, ...target.gridPosition! },
          `${describePlayer(player)} fouls ${describePlayer(target)}`
        );
      }
    }
  }

  out.push({
    kind: "end-activation",
    commands: [{ type: "end-activation", playerId: player.id }],
    label: `${describePlayer(player)} ends their activation`,
  });
  return out;
}

function isDirectReplacement(action: string | null): boolean {
  return (
    action === "stab" ||
    action === "chainsaw" ||
    action === "breatheFire" ||
    action === "chomp" ||
    action === "vomit"
  );
}
