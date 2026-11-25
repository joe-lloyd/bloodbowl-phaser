import { kickoffTurnOf } from "../game/kickoff/kickRecord";
import { mustRedeclare } from "../game/rules/awaitingDeclaration";
import { HeadlessGame } from "../headless/HeadlessGame";
import { type GameSnapshot } from "../headless/serialization";
import {
  type HeadlessCommand,
  type PendingDecision,
  type PlayerActions,
} from "../headless/protocol";
import { GamePhase, type GameState, SubPhase } from "../types/GameState";
import { type Player, PlayerStatus } from "../types/Player";
import { type ActionType } from "../types/events";
import type { DopeStat } from "../types/decisions";
import { FormationManager } from "../game/managers/FormationManager";
import { assignPlayers, setupLabel } from "../game/setup/deployment";
import { GameConfig, getSevensSetupZone } from "../config/GameConfig";
import { SetupValidator } from "../game/validators/SetupValidator";
import { isConfinedToReserves } from "../game/kickoff/driveEffects";
import { decisionOwner } from "../network/OwnershipGate";
import {
  kickoffChoiceCandidates,
  kickoffTurnCandidates,
} from "./kickoffCandidates";
import { describePlayer, square, stepCandidates } from "./stepCandidates";
import { isStandableSquare } from "../game/rules/pitchSquares";

type CandidateKind =
  | "decision"
  | "setup"
  | "kickoff"
  | "declare"
  | "step"
  | "end-activation"
  | "end-turn";

export interface Candidate {
  kind: CandidateKind;
  commands: [HeadlessCommand, ...HeadlessCommand[]];

  label: string;
}

export interface DecisionPoint {
  teamId: string;
  phase: GamePhase;
  pending: PendingDecision | null;
  candidates: Candidate[];
}

const SUPPORTED_DECLARATIONS = new Set<ActionType>([
  "move",
  "block",
  "multipleBlock",
  "blitz",
  "pass",
  "handoff",
  "foul",
  "ballAndChain",
  "stab",
  "chainsaw",
  "breatheFire",
  "chomp",
  "vomit",
  "secureBall",
  "gaze",
  "throwTeamMate",
  "punt",
]);

function playerTargetCandidates(
  pending: Extract<PendingDecision, { type: "bite-target" }>,
  name: (id: string) => string
): Candidate[] {
  const verb = { "squig-block": "Block", "squig-knock-down": "Knock down" };
  const action = pending.purpose ? verb[pending.purpose] : "Bite";
  const candidates = pending.targetIds.map((playerId) =>
    one({ type: "choose-bite-target", playerId }, `${action} ${name(playerId)}`)
  );
  if (pending.purpose === "squig-block") return candidates;
  const decline = pending.purpose === "squig-knock-down" ? "Become Distracted" : "Bite nobody";
  return [...candidates, one({ type: "choose-bite-target" }, decline)];
}

export async function enumerateDecision(
  game: HeadlessGame,
  kickingTeamId: string | null
): Promise<DecisionPoint> {
  const state = game.ctx.gameService.getState();
  const pending = game.pendingDecision();
  const activeTeamId = state.activeTeamId ?? game.ctx.team1.id;

  if (pending) {
    const gs = game.ctx.gameService;
    return {
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
      const kicker = kickoffActor(state, kickingTeamId);
      return at(kicker, await kickoffPhaseCandidates(game, kicker));
    }
    case GamePhase.PLAY:
      return at(activeTeamId, await playCandidates(game));
    default:
      return at(activeTeamId, []);
  }
}

function kickoffActor(state: GameState, kickingTeamId: string | null): string {
  return (
    (kickoffTurnOf(state) ? null : kickingTeamId) ?? state.activeTeamId ?? ""
  );
}

async function kickoffPhaseCandidates(game: HeadlessGame, teamId: string) {
  const kickoff = kickoffTurnOf(game.ctx.gameService.getState());
  return kickoff
    ? kickoffTurnCandidates(game, kickoff, await playCandidates(game))
    : kickoffCandidates(game, game.snapshot(), teamId);
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
      return playerTargetCandidates(pending, name);
    case "interception":
      return [
        ...pending.candidates.map((c) =>
          one(
            { type: "choose-interception", playerId: c.playerId },
            `Try to intercept with ${name(c.playerId)} (modifier ${String(c.modifier)})`
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
      return Array.from({ length: pending.available + 1 }, (_, i) => {
        const count = pending.available - i;
        return one(
          { type: "choose-foul-assists", count },
          `Add ${String(count)} of ${String(pending.available)} Offensive Assists to the Foul`
        );
      });
    case "kickoff-event":
      return kickoffChoiceCandidates(game, pending);
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
          validator.validatePlacement({
            candidate: candidate,
            currentPositions: positions,
            isTeam1: isTeam1,
            availablePlayerCount: setup.status.availablePlayerCount,
            limits: limits,
          }).valid
      );
      if (!placement) continue;
      positions.push(placement);
      commands.push({ type: "place-player", ...placement });
    }
    return [
      {
        kind: "setup",
        commands: setupCommands(commands, teamId),
        label: "Add reserve Linemen with Swarming",
      },
    ];
  }
  const clear: HeadlessCommand[] = (setup?.placements ?? []).map((p) => ({
    type: "remove-player",
    playerId: p.playerId,
  }));

  const eligible = team.players
    .filter(
      (p) =>
        p.status === PlayerStatus.ACTIVE ||
        p.status === PlayerStatus.RESERVE ||
        p.status === PlayerStatus.PRONE ||
        p.status === PlayerStatus.STUNNED
    )

    .filter((p) => !isConfinedToReserves(p, gs.getState()));
  const kicking = gs.getState().setup?.kickingTeamId === teamId;
  const mustField = eligible.find((p) => p.teamCaptain)?.id;

  return new FormationManager()
    .getBuiltInFormations(isTeam1)
    .filter((formation) => formation.use !== (kicking ? "receive" : "kick"))
    .map((formation) => ({
      kind: "setup" as const,
      label: setupLabel(formation.name),
      commands: setupCommands(
        [
          ...clear,
          ...assignPlayers({
            squares: formation.positions,
            players: eligible,
            kicking,
            mustField,
          }).map(
            (pos): HeadlessCommand => ({
              type: "place-player",
              playerId: pos.playerId,
              x: pos.x,
              y: pos.y,
            })
          ),
        ],
        teamId
      ),
    }));
}

function setupCommands(
  placements: HeadlessCommand[],
  teamId: string
): Candidate["commands"] {
  const confirmation: HeadlessCommand = { type: "confirm-setup", teamId };
  const [first, ...rest] = placements;
  return first ? [first, ...rest, confirmation] : [confirmation];
}

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

function kickRows(): number[] {
  const middle = Math.floor(GameConfig.PITCH_HEIGHT / 2);
  const spread = Math.round((3 * GameConfig.PITCH_HEIGHT) / 11);
  return [middle - spread, middle, middle + spread];
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
    for (const y of kickRows()) {
      const x = kicksRight ? GameConfig.PITCH_WIDTH - 1 - depth : depth;
      if (!isStandableSquare({ x, y })) continue;
      out.push({
        kind: "kickoff",
        commands: [{ type: "kick-ball", playerId: kicker.id, x, y }],
        label: `Kick to ${square({ x, y })}`,
      });
    }
  }
  return out;
}

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
  const redeclaring = active && mustRedeclare(state, active.id);
  if (active && actor && actor.teamId === activeTeamId && !redeclaring) {
    return stepCandidates(game, actor, active);
  }

  const legal = (await game.execute({ type: "legal-actions" })).legalActions;
  const out: Candidate[] = [];
  for (const entry of legal?.players ?? []) {
    const player = gs.getPlayerById(entry.playerId);
    if (redeclaring && player?.id !== active.id) continue;
    if (player) out.push(...declareCandidates(player, entry));
  }
  if (redeclaring) {
    out.push({
      kind: "end-activation",
      commands: [{ type: "end-activation", playerId: active.id }],
      label: "End the activation",
    });
  } else if (legal?.canEndTurn) {
    out.push({
      kind: "end-turn",
      commands: [{ type: "end-turn" }],
      label: "End the turn",
    });
  }
  return out;
}
