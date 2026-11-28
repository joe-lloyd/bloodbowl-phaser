import { assertPregamePurchasesComplete } from "../game/inducements/pregame";

import { type HeadlessGameContext } from "./createHeadlessGame";
import {
  type EmittedEvent,
  type HeadlessCommand,
  type PendingDecision,
} from "./protocol";
import { playersAdjacent } from "./legalActions";
import { GameEventNames } from "../types/events";
import { GamePhase, type GameState } from "../types/GameState";
import { type Player, PlayerStatus } from "../types/Player";
import { BlockValidator } from "../game/validators/BlockValidator";
import { isBlockReplacement } from "../types/BlockReplacement";
import { Inducement } from "../types/Inducements";
import {
  type ReserveMoveDecisionAnswer,
  canChooseBiteTarget,
} from "../types/decisions";
import { isStandableSquare } from "../game/rules/pitchSquares";
import { pairSeating, pairTeams } from "../game/seating";
import { answerReserveMove } from "../services/gameService/decisionAnswers";

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

export interface CommandHost {
  readonly ctx: HeadlessGameContext;

  takePending<T extends PendingDecision["type"]>(type: T): PendingOf<T>;

  restorePending(pending: PendingDecision): void;

  dropHeldFollowUp(): void;
  logEvent(event: EmittedEvent): void;
}

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
  if (ctx.teams.every((team) => team.id !== teamId)) {
    throw new Error(`unknown-team:${teamId}`);
  }
}

function assertRivalTarget(
  ctx: HeadlessGameContext,
  playerId: string,
  against: string
): void {
  if (!ctx.gameService.getTeam(against)) {
    throw new Error(`unknown-team:${against}`);
  }
  if (requirePlayer(ctx, playerId).teamId === against) {
    throw new Error(`own-team-target:${against}`);
  }
}

function refuseUnless(
  host: CommandHost,
  pending: PendingDecision,
  accepted: boolean,
  error: string
): asserts accepted {
  if (accepted) return;
  host.restorePending(pending);
  throw new Error(error);
}

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
    if (attacker.status !== PlayerStatus.ACTIVE) {
      await gs.rollBlockDice({ attackerId: cmd.attackerId, defenderId: cmd.defenderId, numDice: 0, isAttackerChoice: false });
      return;
    }
    throw new Error("block-not-declared");
  }

  if (gs.hasUsedBlitzBlock(cmd.attackerId)) {
    throw new Error("blitz-block-already-used");
  }
  if (!isLegalBlockTarget(attacker, defender)) {
    throw new Error("illegal-block-target");
  }
  const allPlayers = ctx.teams.flatMap((team) => team.players);
  const analysis = blockValidator.analyzeBlock({ attacker: attacker, defender: defender, allPlayers: allPlayers, activeTeamId: gs.getActiveTeamId() });
  await gs.rollBlockDice({ attackerId: cmd.attackerId, defenderId: cmd.defenderId, numDice: analysis.diceCount, isAttackerChoice: !analysis.isUphill }
  );
}

async function coinFlip({
  ctx,
  logEvent,
}: CommandHost): Promise<void> {
  const gs = ctx.gameService;
  assertPregamePurchasesComplete(gs.getState());

  if (!gs.canCoinFlip()) {
    throw new Error("coin-flip-only-before-first-drive");
  }
  const roll = ctx.rng.rollDie(2);
  const [heads, tails] = pairTeams(pairSeating(gs.getSeating()));
  const kickingTeam = roll === 1 ? heads : tails;
  logEvent({
    name: "headless:coinFlip",
    data: { kickingTeamId: kickingTeam.id },
  });

  ctx.eventBus.emit(GameEventNames.DiceRoll, {
    rollType: "Coin Toss",
    diceType: "1d2",
    value: roll,
    total: roll,
    description: `Coin Toss: ${kickingTeam.name} kicks`,
    resultState: "none",
    teamId: kickingTeam.id,
  });
  gs.startSetup(kickingTeam.id);
}

async function answerKickoffStep(
  host: CommandHost,
  error: string,
  answer: () => boolean
): Promise<void> {
  const pending = host.takePending("kickoff-event");
  refuseUnless(host, pending, answer(), error);
}

function accepted(ok: boolean, refusal: string): Promise<void> {
  return ok ? Promise.resolve() : Promise.reject(new Error(refusal));
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
    cmd.x === undefined || cmd.y === undefined
      ? {}
      : { square: { x: cmd.x, y: cmd.y } };
  refuseUnless(
    host,
    pending,
    validStat &&
      validSpell &&
      host.ctx.gameService.answerInducementChoice({
        ...(cmd.playerId !== undefined && { playerId: cmd.playerId }),
        ...(cmd.skill !== undefined && { skill: cmd.skill }),
        ...(stat !== undefined && { stat: stat }),
        ...(spell !== undefined && { spell: spell }),
        ...square,
      }),
    "invalid-inducement-choice"
  );
}

function answerReserve(
  host: CommandHost,
  move: ReserveMoveDecisionAnswer["move"]
): Promise<void> {
  const pending = host.takePending("reserve-move");
  const decisions = host.ctx.gameService.getDecisionService();
  const answered = answerReserveMove(decisions, move);
  refuseUnless(host, pending, answered, "invalid-reserve-move");
  return Promise.resolve();
}

async function specialAction(
  { ctx }: CommandHost,
  cmd: PlayCommandOf<"special-action">
): Promise<void> {
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
    host.ctx.gameService.startSetup(cmd.kickingTeamId);
  },
  "place-player": async (host, cmd) => {
    requireSetup(
      host,
      host.ctx.gameService.placePlayer(cmd.playerId, cmd.x, cmd.y),
      "illegal-placement"
    );
  },
  "remove-player": async ({ ctx }, cmd) => {
    ctx.gameService.removePlayer(cmd.playerId);
  },
  "swap-players": async (host, cmd) => {
    requireSetup(
      host,
      host.ctx.gameService.swapPlayers(cmd.player1Id, cmd.player2Id),
      "illegal-swap"
    );
  },
  "apply-formation": async ({ ctx }, cmd) => {
    assertTeam(ctx, cmd.teamId);
    const result = ctx.gameService.applySetupFormation(
      cmd.teamId,
      cmd.formation
    );
    const [firstSkip] = result.skipped;
    if (result.placedPlayerIds.length === 0 && firstSkip) {
      throw new Error(firstSkip.reason);
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
    if (host.ctx.gameService.isKickUnderWay())
      throw new Error("kick-already-in-the-air");
    const kicker = requirePlayer(host.ctx, cmd.playerId);
    if (!isStandableSquare({ x: cmd.x, y: cmd.y }))
      throw new Error("kick-target-blocked");
    const isTeam1Kicking = kicker.teamId === host.ctx.teams[0].id;
    await host.ctx.gameService.kickBall({ isTeam1Kicking: isTeam1Kicking, playerId: cmd.playerId, targetX: cmd.x, targetY: cmd.y }
    );
  },
  "kickoff-select-player": (host, cmd) =>
    answerKickoffStep(host, "invalid-kickoff-player", () =>
      host.ctx.gameService.selectKickoffEventPlayer(cmd.playerId)
    ),
  "kickoff-move-player": ({ ctx }, cmd) =>
    accepted(
      ctx.gameService.moveKickoffEventPlayer(cmd.playerId, cmd.x, cmd.y),
      "invalid-kickoff-move"
    ),
  "kickoff-reselect": ({ ctx }) =>
    accepted(
      ctx.gameService.reselectKickoffEventPlayers(),
      "kickoff-turn-already-played"
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
    if (cmd.against !== undefined) assertRivalTarget(ctx, cmd.playerId, cmd.against);
    const declared = ctx.gameService.declareAction({ playerId: cmd.playerId, action: cmd.action, ...(cmd.blockReplacement !== undefined && { blockReplacement: cmd.blockReplacement }), options: { ...(cmd.razzleDazzle !== undefined && { razzleDazzle: cmd.razzleDazzle }), ...(cmd.against !== undefined && { against: cmd.against }) } }
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
    const result = await ctx.gameService.throwBall({ passerId: cmd.playerId, targetX: cmd.x, targetY: cmd.y, hailMary: cmd.hailMary ?? false }
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
    await ctx.gameService.throwTeammate({ throwerId: cmd.throwerId, teammateId: cmd.teammateId, x: cmd.x, y: cmd.y, ...(cmd.mode !== undefined && { mode: cmd.mode }), ...(cmd.swoopFacing !== undefined && { swoopFacing: cmd.swoopFacing }) }
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
    const choice = pending.options[cmd.index];
    refuseUnless(
      host,
      pending,
      cmd.index >= 0 && cmd.index < pending.options.length && choice !== undefined,
      "invalid-block-result-index"
    );
    await host.ctx.gameService.resolveBlock(
      pending.attackerId,
      pending.defenderId,
      choice
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
    await host.ctx.gameService.executePush({ attackerId: pending.attackerId, defenderId: pending.defenderId, direction: { x: cmd.x, y: cmd.y }, resultType: pending.resultType, followUp: false }
    );
  },
  "choose-follow-up": async (host, cmd) => {
    const pending = host.takePending("follow-up");
    host.dropHeldFollowUp();
    if (cmd.followUp) {
      await host.ctx.gameService.followUpPush(
        pending.attackerId,
        pending.targetSquare
      );
    }

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
      canChooseBiteTarget(pending, cmd.playerId),
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

  "move-reserve": (host, { playerId, x, y }) =>
    answerReserve(host, { playerId, square: { x, y } }),
  "keep-reserves": (host) => answerReserve(host, null),

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
