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
  HeadlessCommand,
  PendingDecision,
  PlayerActions,
} from "../headless/protocol";
import { GamePhase, SubPhase } from "../types/GameState";
import { Player, PlayerStatus } from "../types/Player";
import { ActionType } from "../types/events";
import type { DopeStat } from "../types/decisions";
import { FormationManager } from "../game/managers/FormationManager";
import { GameConfig, getSevensSetupZone } from "../config/GameConfig";
import { SetupValidator } from "../game/validators/SetupValidator";
import { isConfinedToReserves } from "../game/kickoff/driveEffects";
import { decisionOwner } from "../network/OwnershipGate";
import { describePlayer, square, stepCandidates } from "./stepCandidates";

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
  "multipleBlock",
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
  "secureBall",
  "gaze",
  "throwTeamMate",
]);

/**
 * The decision point the game is waiting on. `kickingTeamId` is tracked by
 * the runner because a KICKOFF snapshot does not say who kicks.
 */
export async function enumerateDecision(
  game: HeadlessGame,
  kickingTeamId: string | null
): Promise<DecisionPoint> {
  // Read the state directly: a snapshot is costly and this runs thousands
  // of times in a lookahead.
  const state = game.ctx.gameService.getState();
  const pending = game.pendingDecision();
  const activeTeamId = state.activeTeamId ?? game.ctx.team1.id;

  if (pending) {
    const gs = game.ctx.gameService;
    return {
      // The same owner online play enforces: a follow-up stays the
      // attacker's even when a turnover has already passed the turn.
      teamId:
        decisionOwner(pending, {
          activeTeamId,
          pendingDecision: pending,
          teamIdOfPlayer: (id) => gs.getPlayerById(id)?.teamId,
          hostTeamId: game.ctx.team1.id,
        }) ?? activeTeamId,
      phase: state.phase,
      pending,
      candidates: decisionCandidates(game, pending),
    };
  }

  const at = (teamId: string, candidates: Candidate[]): DecisionPoint => ({
    teamId,
    phase: state.phase,
    pending: null,
    candidates,
  });

  switch (state.phase) {
    case GamePhase.SETUP: {
      const inSetup =
        state.subPhase === SubPhase.SETUP_KICKING ||
        state.subPhase === SubPhase.SETUP_RECEIVING;
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
      return at(kicker, kickoffCandidates(game, game.snapshot(), kicker));
    }
    case GamePhase.PLAY:
      return at(activeTeamId, await playCandidates(game));
    default:
      return at(activeTeamId, []);
  }
}

type PendingOf<T extends PendingDecision["type"]> = Extract<
  PendingDecision,
  { type: T }
>;

const one = (command: HeadlessCommand, label: string): Candidate => ({
  kind: "decision",
  commands: [command],
  label,
});

function blockDiceCandidates(pending: PendingOf<"block-dice">): Candidate[] {
  const out =
    pending.choiceStage === "attacker-reroll"
      ? [
          one(
            { type: "keep-block-dice", attackerId: pending.attackerId },
            "Keep the block dice"
          ),
        ]
      : pending.options.map((option, index) =>
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
  if (pending.veteranRerollAvailable) {
    out.push(
      one(
        { type: "veteran-reroll-block", attackerId: pending.attackerId },
        "Spend the Veteran's re-roll on the block dice"
      )
    );
  }
  return out;
}

function decisionCandidates(
  game: HeadlessGame,
  pending: PendingDecision
): Candidate[] {
  const gs = game.ctx.gameService;
  const name = (id: string) => {
    const player = gs.getPlayerById(id);
    return player ? describePlayer(player) : id;
  };

  switch (pending.type) {
    case "block-dice":
      return blockDiceCandidates(pending);
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
    case "bite-target":
      return [
        ...pending.targetIds.map((playerId) =>
          one(
            { type: "choose-bite-target", playerId },
            `Bite ${name(playerId)}`
          )
        ),
        one({ type: "choose-bite-target" }, "Bite nobody"),
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
    case "inducement-choice":
      return inducementCandidates(game, pending, name);
    case "foul-assists":
      // Every assist first: adding them all is the default
      return Array.from({ length: pending.available + 1 }, (_, i) => {
        const count = pending.available - i;
        return one(
          { type: "choose-foul-assists", count },
          `Add ${count} of ${pending.available} Offensive Assists to the Foul`
        );
      });
    case "kickoff-event":
      // Coach-owned kickoff steps (Blitz, Charge, Quick Snap, ...) are
      // optional; confirming an untouched step and skipping it both close it.
      return [
        one({ type: "kickoff-skip" }, `Skip the ${pending.event} step`),
        one({ type: "kickoff-confirm" }, `Confirm the ${pending.event} step`),
      ];
  }
}

function inducementCandidates(
  game: HeadlessGame,
  pending: PendingOf<"inducement-choice">,
  name: (id: string) => string
): Candidate[] {
  if (pending.kind === "sports-wizard") {
    return wizardCandidates(game, pending.chooserTeamId, pending.playerIds);
  }
  // Every offered player, with every offered skill or characteristic;
  // a Desperate Measure may also be kept for later.
  const extras: { skill?: string; stat?: DopeStat }[] = pending.skills
    ? pending.skills.map((skill) => ({ skill }))
    : pending.stats
      ? pending.stats.map((stat) => ({ stat }))
      : [{}];
  const out = pending.playerIds.flatMap((playerId) =>
    extras.map((extra) =>
      one(
        { type: "choose-inducement", playerId, ...extra },
        `${pending.kind}: ${name(playerId)}${extra.skill ? ` learns ${extra.skill}` : ""}${extra.stat ? ` gains +1 ${extra.stat}` : ""}`
      )
    )
  );
  if (pending.optional) {
    out.push(
      one(
        { type: "choose-inducement" },
        pending.kind === "team-captain"
          ? "Appoint no Team Captain"
          : `Keep ${pending.kind} for later`
      )
    );
  }
  return out;
}

/** The first square of the zone, column by column, that `legal` accepts. */
function firstLegalSquare(
  playerId: string,
  zone: { minX: number; maxX: number },
  legal: (placement: { playerId: string; x: number; y: number }) => boolean
): { playerId: string; x: number; y: number } | null {
  for (let x = zone.minX; x <= zone.maxX; x++) {
    for (let y = 0; y < GameConfig.PITCH_HEIGHT; y++) {
      const candidate = { playerId, x, y };
      if (legal(candidate)) return candidate;
    }
  }
  return null;
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
  if (setup?.status.swarming) {
    const swarm = setup.status.swarming;
    const positions = [...setup.placements];
    const commands: HeadlessCommand[] = [];
    const zone = getSevensSetupZone(isTeam1);
    const validator = new SetupValidator();
    const limits = {
      minimum: setup.status.requiredPlayerCount,
      maximum:
        setup.status.requiredPlayerCount + swarm.maximumAdditionalPlayers,
    };
    const reserves = team.players.filter(
      (player) => !player.gridPosition && gs.isSetupEligible(player.id)
    );
    for (const player of reserves.slice(
      0,
      swarm.maximumAdditionalPlayers - swarm.additionalPlayerCount
    )) {
      const placement = firstLegalSquare(
        player.id,
        zone,
        (candidate) =>
          validator.validatePlacement(
            candidate,
            positions,
            isTeam1,
            setup.status.availablePlayerCount,
            limits
          ).valid
      );
      if (!placement) continue;
      positions.push(placement);
      commands.push({ type: "place-player", ...placement });
    }
    commands.push({ type: "confirm-setup", teamId });
    return [
      { kind: "setup", commands, label: "Add reserve Linemen with Swarming" },
    ];
  }
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
  // An available Team Captain must be set up (p.155): bring them into the seven.
  const captainAt = eligible.findIndex((p) => p.teamCaptain);
  if (captainAt >= 7) eligible.splice(6, 0, ...eligible.splice(captainAt, 1));

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

/**
 * The Sports-Wizard: keep it, or Zap! or Fireball an opponent on the pitch.
 * Spells on the coach's own players are legal but never worth offering.
 */
function wizardCandidates(
  game: HeadlessGame,
  teamId: string,
  playerIds: string[]
): Candidate[] {
  const gs = game.ctx.gameService;
  const opponents = playerIds
    .map((id) => gs.getPlayerById(id)!)
    .filter((p) => p.teamId !== teamId && p.gridPosition);
  return [
    {
      kind: "decision",
      commands: [{ type: "choose-inducement" }],
      label: "Keep the Sports-Wizard for later",
    },
    ...opponents.flatMap((p): Candidate[] => [
      {
        kind: "decision",
        commands: [{ type: "choose-inducement", spell: "zap", playerId: p.id }],
        label: `Zap! ${p.playerName}`,
      },
      {
        kind: "decision",
        commands: [
          { type: "choose-inducement", spell: "fireball", ...p.gridPosition! },
        ],
        label: `Fireball at ${square(p.gridPosition!)}`,
      },
    ]),
  ];
}

function kickoffCandidates(
  game: HeadlessGame,
  snapshot: GameSnapshot,
  kickingTeamId: string
): Candidate[] {
  const team = snapshot.teams.find((t) => t.id === kickingTeamId);
  if (!team) return [];
  const kicker = team.players.find(
    (p) => p.position && p.status === PlayerStatus.ACTIVE
  );
  // A team with nobody on the pitch still kicks off, with no kicker.
  if (!kicker && team.players.some((p) => p.position)) return [];
  const kicksRight = kickingTeamId === game.ctx.team1.id;
  const out: Candidate[] = [];
  for (const depth of [2, 4, 6]) {
    for (const y of [2, 5, 8]) {
      const x = kicksRight ? GameConfig.PITCH_WIDTH - 1 - depth : depth;
      out.push({
        kind: "kickoff",
        commands: [
          kicker
            ? { type: "kick-ball", playerId: kicker.id, x, y }
            : { type: "kick-ball", teamId: team.id, x, y },
        ],
        label: `Kick to ${square({ x, y })}`,
      });
    }
  }
  return out;
}

/** The declarations the step enumerator can carry through for one player. */
function declareCandidates(player: Player, entry: PlayerActions): Candidate[] {
  const out: Candidate[] = [];
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
  return out;
}

async function playCandidates(game: HeadlessGame): Promise<Candidate[]> {
  const gs = game.ctx.gameService;
  const state = gs.getState();
  const active = state.activePlayer;
  const activeTeamId = state.activeTeamId;
  const actor = active ? gs.getPlayerById(active.id) : undefined;
  if (active && actor && actor.teamId === activeTeamId) {
    return stepCandidates(game, actor, active);
  }

  const legal = (await game.execute({ type: "legal-actions" })).legalActions;
  const out: Candidate[] = [];
  for (const entry of legal?.players ?? []) {
    const player = gs.getPlayerById(entry.playerId);
    if (player) out.push(...declareCandidates(player, entry));
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
