import { assertPregamePurchasesComplete } from "../game/inducements/pregame";
/**
 * Command handlers - one per command type, run by HeadlessGame.execute once a
 * command has passed its shape check and the pending-decision gate.
 */

import { HeadlessGameContext } from "./createHeadlessGame";
import { EmittedEvent, HeadlessCommand, PendingDecision } from "./protocol";
import { playersAdjacent } from "./legalActions";
import { GameEventNames } from "../types/events";
import { GamePhase, GameState } from "../types/GameState";
import { Player, PlayerStatus } from "../types/Player";
import { BlockValidator } from "../game/validators/BlockValidator";
import { isBlockReplacement } from "../types/BlockReplacement";
import { Inducement } from "../types/Inducements";

/** Queries answer from state in execute and never reach a handler. */
type QueryCommand = Extract<
  HeadlessCommand,
  { type: "state" | "legal-actions" | "offer-inducements" }
>;
export type PlayCommand = Exclude<HeadlessCommand, QueryCommand>;
type PlayCommandOf<T extends PlayCommand["type"]> = Extract<
  PlayCommand,
  { type: T }
>;
type PendingOf<T extends PendingDecision["type"]> = Extract<
  PendingDecision,
  { type: T }
>;

/** What a handler may read and change on the game it runs in. */
export interface CommandHost {
  readonly ctx: HeadlessGameContext;
  /** Take the decision a reply answers; throws unless it is the one pending. */
  takePending<T extends PendingDecision["type"]>(type: T): PendingOf<T>;
  /** Put back a decision whose reply was refused, so it can be answered again. */
  restorePending(pending: PendingDecision): void;
  /** Forget a follow-up held back while another decision was answered. */
  dropHeldFollowUp(): void;
  setKickingTeam(teamId: string): void;
  logEvent(event: EmittedEvent): void;
}

/**
 * Every playable command type has a handler, so a new one fails the build
 * until it is handled. Handlers are async so a refusal always rejects.
 */
type CommandHandlers = {
  [T in PlayCommand["type"]]: (
    host: CommandHost,
    cmd: PlayCommandOf<T>
  ) => Promise<void>;
};

export function dispatchCommand<T extends PlayCommand["type"]>(
  host: CommandHost,
  type: T,
  cmd: PlayCommandOf<T>
): Promise<void> {
  const handler: CommandHandlers[T] = COMMAND_HANDLERS[type];
  return handler(host, cmd);
}

const blockValidator = new BlockValidator();

function requirePlayer(ctx: HeadlessGameContext, playerId: string): Player {
  const player = ctx.gameService.getPlayerById(playerId);
  if (!player) throw new Error(`unknown-player:${playerId}`);
  return player;
}

function assertTeam(ctx: HeadlessGameContext, teamId: string): void {
  if (teamId !== ctx.team1.id && teamId !== ctx.team2.id) {
    throw new Error(`unknown-team:${teamId}`);
  }
}

/** Fail a refused reply, keeping its decision pending. */
function refuseUnless(
  host: CommandHost,
  pending: PendingDecision,
  accepted: boolean,
  error: string
): void {
  if (accepted) return;
  host.restorePending(pending);
  throw new Error(error);
}

/** Fail with the engine's own setup error when it refuses a command. */
function requireSetup(
  host: CommandHost,
  accepted: boolean,
  fallback: string
): void {
  if (!accepted) {
    throw new Error(host.ctx.gameService.getLastSetupError() ?? fallback);
  }
}

function requireOk(result: { ok: boolean; errors: string[] }): void {
  if (!result.ok) throw new Error(result.errors.join(","));
}

/** The attacker was declared for a plain Block or Blitz block and may throw it now. */
function isDeclaredBlock(
  declaration: GameState["activePlayer"],
  attackerId: string
): boolean {
  if (declaration?.id !== attackerId) return false;
  if (declaration.razzleDazzle?.awaitingSecond) return false;
  if (declaration.action !== "block" && declaration.action !== "blitz") {
    return false;
  }
  return !declaration.blockReplacement;
}

function isLegalBlockTarget(attacker: Player, defender: Player): boolean {
  return (
    defender.teamId !== attacker.teamId &&
    playersAdjacent(attacker, defender) &&
    defender.status === PlayerStatus.ACTIVE
  );
}

async function block(
  host: CommandHost,
  cmd: PlayCommandOf<"block">
): Promise<void> {
  const { ctx } = host;
  const gs = ctx.gameService;
  const attacker = requirePlayer(ctx, cmd.attackerId);
  const defender = requirePlayer(ctx, cmd.defenderId);
  if (!isDeclaredBlock(gs.getState().activePlayer, attacker.id)) {
    // Keep the established cancellation-event contract for a downed
    // player's direct Block attempt. Other undeclared/forged commands
    // remain protocol failures.
    if (attacker.status !== PlayerStatus.ACTIVE) {
      await gs.rollBlockDice(cmd.attackerId, cmd.defenderId, 0, false);
      return;
    }
    throw new Error("block-not-declared");
  }
  // A Blitz allows only one block; report that invariant before target
  // legality because the first block may have pushed the defender away.
  if (gs.hasUsedBlitzBlock(cmd.attackerId)) {
    throw new Error("blitz-block-already-used");
  }
  if (!isLegalBlockTarget(attacker, defender)) {
    throw new Error("illegal-block-target");
  }
  const allPlayers = [...ctx.team1.players, ...ctx.team2.players];
  const analysis = blockValidator.analyzeBlock(
    attacker,
    defender,
    allPlayers,
    gs.getActiveTeamId()
  );
  await gs.rollBlockDice(
    cmd.attackerId,
    cmd.defenderId,
    analysis.diceCount,
    !analysis.isUphill
  );
}

async function coinFlip({
  ctx,
  logEvent,
  setKickingTeam,
}: CommandHost): Promise<void> {
  const gs = ctx.gameService;
  assertPregamePurchasesComplete(gs.getState());
  // Coin flip lives UI-side in the browser; headless resolves it with
  // the seeded RNG so it stays deterministic and replayable.
  if (!gs.canCoinFlip()) {
    throw new Error("coin-flip-only-before-first-drive");
  }
  const roll = ctx.rng.rollDie(2);
  const kickingTeam = roll === 1 ? ctx.team1 : ctx.team2;
  logEvent({
    name: "headless:coinFlip",
    data: { kickingTeamId: kickingTeam.id },
  });
  // A coin is a d2 — log it like every other roll
  ctx.eventBus.emit(GameEventNames.DiceRoll, {
    rollType: "Coin Toss",
    diceType: "1d2",
    value: roll,
    total: roll,
    description: `Coin Toss: ${kickingTeam.name} kicks`,
    resultState: "none",
    teamId: kickingTeam.id,
  });
  setKickingTeam(kickingTeam.id);
  gs.startSetup(kickingTeam.id);
}

/** Answer the pending kickoff step; the engine refuses what the step forbids. */
async function answerKickoffStep(
  host: CommandHost,
  error: string,
  answer: () => boolean
): Promise<void> {
  const pending = host.takePending("kickoff-event");
  refuseUnless(host, pending, answer(), error);
}

async function chooseInducement(
  host: CommandHost,
  cmd: PlayCommandOf<"choose-inducement">
): Promise<void> {
  const pending = host.takePending("inducement-choice");
  const { stat, spell } = cmd;
  const validStat = stat === undefined || stat === "ST" || stat === "AG";
  const validSpell =
    spell === undefined || spell === "fireball" || spell === "zap";
  const square =
    cmd.x !== undefined && cmd.y !== undefined
      ? { square: { x: cmd.x, y: cmd.y } }
      : {};
  refuseUnless(
    host,
    pending,
    validStat &&
      validSpell &&
      host.ctx.gameService.answerInducementChoice({
        playerId: cmd.playerId,
        skill: cmd.skill,
        stat,
        spell,
        ...square,
      }),
    "invalid-inducement-choice"
  );
}

async function specialAction(
  { ctx }: CommandHost,
  cmd: PlayCommandOf<"special-action">
): Promise<void> {
  // The protocol type rules these out; a raw command may still carry them.
  const action: string = cmd.action;
  if (action !== "gaze" && !isBlockReplacement(action)) {
    throw new Error("invalid-special-action");
  }
  if (action === "stab") {
    throw new Error("use-stab-command");
  }
  const performed = await ctx.gameService.performSpecialAction(
    cmd.action,
    cmd.attackerId,
    cmd.defenderId
  );
  if (!performed) throw new Error("illegal-special-action-target");
}

const COMMAND_HANDLERS: CommandHandlers = {
  "coin-flip": coinFlip,
  "ready-weather": async ({ ctx }, cmd) => {
    assertTeam(ctx, cmd.teamId);
    if (!ctx.gameService.readyForWeather(cmd.teamId))
      throw new Error("not-weather-time");
  },
  "start-setup": async (host, cmd) => {
    assertTeam(host.ctx, cmd.kickingTeamId);
    assertPregamePurchasesComplete(host.ctx.gameService.getState());
    host.setKickingTeam(cmd.kickingTeamId);
    host.ctx.gameService.startSetup(cmd.kickingTeamId);
  },
  "place-player": async (host, cmd) =>
    requireSetup(
      host,
      host.ctx.gameService.placePlayer(cmd.playerId, cmd.x, cmd.y),
      "illegal-placement"
    ),
  "remove-player": async ({ ctx }, cmd) => {
    ctx.gameService.removePlayer(cmd.playerId);
  },
  "swap-players": async (host, cmd) =>
    requireSetup(
      host,
      host.ctx.gameService.swapPlayers(cmd.player1Id, cmd.player2Id),
      "illegal-swap"
    ),
  "apply-formation": async ({ ctx }, cmd) => {
    assertTeam(ctx, cmd.teamId);
    const result = ctx.gameService.applySetupFormation(
      cmd.teamId,
      cmd.formation
    );
    if (result.placedPlayerIds.length === 0 && result.skipped.length > 0) {
      throw new Error(result.skipped[0].reason);
    }
  },
  "setup-concession": async (host, cmd) => {
    assertTeam(host.ctx, cmd.teamId);
    requireSetup(
      host,
      host.ctx.gameService.resolveSetupConcession(cmd.teamId, cmd.concede),
      "illegal-concession"
    );
  },
  "confirm-setup": async (host, cmd) => {
    assertTeam(host.ctx, cmd.teamId);
    requireSetup(
      host,
      host.ctx.gameService.confirmSetup(cmd.teamId),
      "illegal-setup"
    );
  },
  "select-kicker": async ({ ctx }, cmd) => {
    ctx.gameService.selectKicker(cmd.playerId);
  },
  "kick-ball": async (host, cmd) => {
    const kicker =
      "playerId" in cmd ? requirePlayer(host.ctx, cmd.playerId) : null;
    const teamId = kicker?.teamId ?? ("teamId" in cmd ? cmd.teamId : undefined);
    const team = [host.ctx.team1, host.ctx.team2].find((t) => t.id === teamId);
    if (!team) throw new Error("invalid-kicking-team");
    // Only a team with nobody on the pitch kicks without a kicker.
    if (!kicker && team.players.some((p) => p.gridPosition))
      throw new Error("kick-needs-kicker");
    host.setKickingTeam(team.id);
    await host.ctx.gameService.kickBall(
      team.id === host.ctx.team1.id,
      kicker?.id ?? null,
      cmd.x,
      cmd.y
    );
  },
  "kickoff-select-player": (host, cmd) =>
    answerKickoffStep(host, "invalid-kickoff-player", () =>
      host.ctx.gameService.selectKickoffEventPlayer(cmd.playerId)
    ),
  "kickoff-move-player": (host, cmd) =>
    answerKickoffStep(host, "invalid-kickoff-move", () =>
      host.ctx.gameService.moveKickoffEventPlayer(cmd.playerId, cmd.x, cmd.y)
    ),
  "kickoff-place-player": (host, cmd) =>
    answerKickoffStep(host, "invalid-kickoff-placement", () =>
      host.ctx.gameService.placeKickoffEventPlayer(cmd.playerId, cmd.x, cmd.y)
    ),
  "kickoff-confirm": (host) =>
    answerKickoffStep(host, "kickoff-step-not-confirmable", () =>
      host.ctx.gameService.confirmKickoffEventStep()
    ),
  "kickoff-skip": (host) =>
    answerKickoffStep(host, "kickoff-step-not-skippable", () =>
      host.ctx.gameService.skipKickoffEventStep()
    ),
  "declare-action": async ({ ctx }, cmd) => {
    if (
      cmd.blockReplacement !== undefined &&
      !isBlockReplacement(cmd.blockReplacement)
    ) {
      throw new Error("invalid-block-replacement");
    }
    const declared = ctx.gameService.declareAction(
      cmd.playerId,
      cmd.action,
      cmd.blockReplacement,
      { razzleDazzle: cmd.razzleDazzle }
    );
    if (!declared) throw new Error("illegal-action-declaration");
  },
  "cancel-action": async ({ ctx }, cmd) => {
    if (!ctx.gameService.cancelAction(cmd.playerId)) {
      throw new Error("action-already-committed");
    }
  },
  move: async ({ ctx }, cmd) => {
    await ctx.gameService.movePlayer(cmd.playerId, cmd.path);
  },
  fumblerooski: async ({ ctx }, cmd) => {
    const square = { x: cmd.x, y: cmd.y };
    if (!ctx.gameService.dropBallWithFumblerooski(cmd.playerId, square)) {
      throw new Error("illegal-fumblerooski");
    }
  },
  "stand-up": async ({ ctx }, cmd) => {
    await ctx.gameService.standUp(cmd.playerId);
  },
  block,
  "multiple-block": async ({ ctx }, cmd) => {
    await ctx.gameService.multipleBlock(
      cmd.attackerId,
      cmd.defender1Id,
      cmd.defender2Id
    );
  },
  jump: async ({ ctx }, cmd) => {
    await ctx.gameService.jumpPlayer(cmd.playerId, { x: cmd.x, y: cmd.y });
  },
  pass: async ({ ctx }, cmd) => {
    const result = await ctx.gameService.throwBall(
      cmd.playerId,
      cmd.x,
      cmd.y,
      cmd.hailMary ?? false
    );
    if (!result.success) {
      throw new Error(result.result || "pass-failed");
    }
  },
  handoff: async ({ ctx }, cmd) => {
    const result = await ctx.gameService.handOffBall(
      cmd.playerId,
      cmd.targetId
    );
    if (!result.success) {
      throw new Error(result.result || "handoff-failed");
    }
  },
  punt: async ({ ctx }, cmd) => {
    await ctx.gameService.puntBall(cmd.playerId, cmd.x, cmd.y);
  },
  foul: async ({ ctx }, cmd) => {
    await ctx.gameService.foulPlayer(cmd.playerId, cmd.x, cmd.y);
  },
  stab: async ({ ctx }, cmd) => {
    if (!(await ctx.gameService.stabPlayer(cmd.attackerId, cmd.defenderId))) {
      throw new Error("illegal-stab-target");
    }
  },
  "throw-teammate": async ({ ctx }, cmd) => {
    await ctx.gameService.throwTeammate(
      cmd.throwerId,
      cmd.teammateId,
      cmd.x,
      cmd.y,
      cmd.mode,
      cmd.swoopFacing
    );
  },
  "throw-bomb": async ({ ctx }, cmd) => {
    await ctx.gameService.throwBomb(cmd.throwerId, cmd.x, cmd.y);
  },
  "ball-and-chain": async ({ ctx }, cmd) => {
    await ctx.gameService.ballAndChain(cmd.playerId, cmd.x, cmd.y);
  },
  "special-action": specialAction,
  "end-activation": async ({ ctx }, cmd) => {
    ctx.gameService.finishActivation(cmd.playerId);
  },
  "end-turn": async ({ ctx }) => {
    ctx.gameService.endTurn();
  },
  "award-mvp": async ({ ctx }, cmd) => {
    if (ctx.gameService.getPhase() !== GamePhase.GAME_OVER) {
      throw new Error("mvp-only-after-match");
    }
    assertTeam(ctx, cmd.teamId);
    const roll = ctx.rng.rollDie(cmd.nominatedPlayerIds.length);
    ctx.matchStats.awardMvp(cmd.teamId, cmd.nominatedPlayerIds, roll);
  },
  "assign-awarded-touchdown": async ({ ctx }, cmd) => {
    if (ctx.gameService.getPhase() !== GamePhase.GAME_OVER) {
      throw new Error("awarded-touchdown-only-after-match");
    }
    requirePlayer(ctx, cmd.playerId);
    ctx.matchStats.assignAwardedTouchdown(cmd.playerId);
  },

  // --- Decision replies ---
  "keep-block-dice": async ({ ctx }, cmd) => {
    ctx.gameService.keepBlockDice(cmd.attackerId);
  },
  "team-reroll-block": async ({ ctx }, cmd) => {
    ctx.gameService.teamRerollBlock(cmd.attackerId);
  },
  "pro-reroll-block": async ({ ctx }, cmd) => {
    ctx.gameService.proRerollBlockDie(cmd.attackerId, cmd.dieIndex);
  },
  "brawler-reroll-block": async ({ ctx }, cmd) => {
    ctx.gameService.brawlerRerollBlockDie(cmd.attackerId);
  },
  "veteran-reroll-block": async ({ ctx }, cmd) => {
    ctx.gameService.veteranRerollBlock(cmd.attackerId);
  },
  "choose-block-result": async (host, cmd) => {
    const pending = host.takePending("block-dice");
    refuseUnless(
      host,
      pending,
      cmd.index >= 0 && cmd.index < pending.options.length,
      "invalid-block-result-index"
    );
    await host.ctx.gameService.resolveBlock(
      pending.attackerId,
      pending.defenderId,
      pending.options[cmd.index]
    );
  },
  "choose-push-direction": async (host, cmd) => {
    const pending = host.takePending("push-direction");
    refuseUnless(
      host,
      pending,
      pending.options.some((d) => d.x === cmd.x && d.y === cmd.y),
      "invalid-push-direction"
    );
    await host.ctx.gameService.executePush(
      pending.attackerId,
      pending.defenderId,
      { x: cmd.x, y: cmd.y },
      pending.resultType,
      false
    );
  },
  "choose-follow-up": async (host, cmd) => {
    const pending = host.takePending("follow-up");
    host.dropHeldFollowUp();
    if (cmd.followUp) {
      // Free move: no movement cost, no dice (rush/dodge already paid)
      await host.ctx.gameService.followUpPush(
        pending.attackerId,
        pending.targetSquare
      );
    }
    // A Blitz block leaves the player active to continue moving; a plain
    // block ends the activation here.
    host.ctx.gameService.finishBlockActivation(pending.attackerId);
  },
  "use-reroll": async (host, cmd) => {
    const pending = host.takePending("reroll");
    refuseUnless(
      host,
      pending,
      cmd.source === undefined || pending.sources.includes(cmd.source),
      "invalid-reroll-source"
    );
    refuseUnless(
      host,
      pending,
      host.ctx.gameService.answerReroll(cmd.accept, cmd.source),
      "no-reroll-awaiting"
    );
  },
  "use-reaction": async (host, cmd) => {
    const pending = host.takePending("reaction");
    refuseUnless(
      host,
      pending,
      host.ctx.gameService.answerReaction(cmd.accept),
      "no-reaction-awaiting"
    );
  },
  "choose-bite-target": async (host, cmd) => {
    const pending = host.takePending("bite-target");
    refuseUnless(
      host,
      pending,
      cmd.playerId === undefined || pending.targetIds.includes(cmd.playerId),
      "invalid-bite-target"
    );
    refuseUnless(
      host,
      pending,
      host.ctx.gameService.answerBiteTarget(cmd.playerId),
      "no-bite-target-awaiting"
    );
  },
  "choose-interception": async (host, cmd) => {
    const pending = host.takePending("interception");
    refuseUnless(
      host,
      pending,
      cmd.playerId === undefined ||
        pending.candidates.some((c) => c.playerId === cmd.playerId),
      "invalid-interception-player"
    );
    refuseUnless(
      host,
      pending,
      host.ctx.gameService.answerInterception(cmd.playerId),
      "no-interception-awaiting"
    );
  },
  touchback: async (host, cmd) => {
    const pending = host.takePending("touchback");
    refuseUnless(
      host,
      pending,
      host.ctx.gameService.awardTouchback(cmd.playerId),
      "invalid-touchback-player"
    );
  },
  "use-apothecary": async (host, cmd) => {
    const pending = host.takePending("apothecary");
    refuseUnless(
      host,
      pending,
      host.ctx.gameService.answerApothecary(cmd.accept),
      "no-apothecary-awaiting"
    );
  },
  "choose-inducement": chooseInducement,
  "choose-foul-assists": async (host, cmd) => {
    const pending = host.takePending("foul-assists");
    refuseUnless(
      host,
      pending,
      host.ctx.gameService.answerFoulAssists(cmd.count),
      "invalid-foul-assists"
    );
  },

  // --- Sevens pregame inducements ---
  "select-inducement": async ({ ctx }, cmd) => {
    assertTeam(ctx, cmd.teamId);
    requireOk(
      await ctx.gameService.selectInducement(
        cmd.teamId,
        cmd.inducement as Inducement,
        cmd.quantity
      )
    );
  },
  "remove-inducement": async ({ ctx }, cmd) => {
    assertTeam(ctx, cmd.teamId);
    requireOk(
      await ctx.gameService.removeInducement(
        cmd.teamId,
        cmd.inducement as Inducement
      )
    );
  },
  "confirm-inducements": async ({ ctx }, cmd) => {
    assertTeam(ctx, cmd.teamId);
    requireOk(await ctx.gameService.confirmInducements(cmd.teamId));
  },
};
