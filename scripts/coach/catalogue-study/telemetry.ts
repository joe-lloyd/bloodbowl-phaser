import type { HeadlessGame } from "../../../src/headless/HeadlessGame";
import type {
  CommandResponse,
  HeadlessCommand,
} from "../../../src/headless/protocol";
import { GameEventNames } from "../../../src/types/events";
import {
  PlayerStatus,
  PlayerCondition,
  TraitKeyWord,
  hasCondition,
} from "../../../src/types/Player";
import { SkillType, hasSkill } from "../../../src/types/Skills";
import type { RollTally, SkillObservation } from "./model";
import { GameConfig } from "../../../src/config/GameConfig";
import { optionKey } from "../../../src/simulation/telemetry";

type Data = Record<string, unknown>;
const increment = (tally: Record<string, number>, key: string) => {
  tally[key] = (tally[key] ?? 0) + 1;
};
const sideOf = (game: HeadlessGame, id: string | undefined) =>
  id === game.ctx.teams[1].id ? 1 : 0;
const THIRDS = ["left-third", "middle-third", "right-third"] as const;
const third = (at: { x: number } | null) =>
  at
    ? (THIRDS[Math.floor((3 * at.x) / GameConfig.PITCH_WIDTH)] ?? "right-third")
    : "off-pitch";

function commandContext(game: HeadlessGame, command: HeadlessCommand) {
  const state = game.ctx.gameService.getState();
  const active = state.activePlayer;
  const action =
    command.type === "declare-action"
      ? command.action
      : (active?.action ?? command.type);
  const actorId =
    "playerId" in command
      ? command.playerId
      : "attackerId" in command
        ? command.attackerId
        : active?.id;
  const players = [...game.ctx.teams[0].players, ...game.ctx.teams[1].players].map(
    (p) => ({
      id: p.id,
      teamId: p.teamId,
      name: p.playerName,
      at: p.gridPosition ? { ...p.gridPosition } : null,
      carrying:
        p.status === PlayerStatus.ACTIVE &&
        !!p.gridPosition &&
        p.gridPosition.x === state.balls[0].at?.x &&
        p.gridPosition.y === state.balls[0].at?.y,
      helper:
        p.status === PlayerStatus.ACTIVE &&
        !hasCondition(p, PlayerCondition.DISTRACTED) &&
        !hasSkill(p.skills, SkillType.REALLY_STUPID),
      thrall: p.keywords.includes(TraitKeyWord.THRALL),
    })
  );
  return {
    action,
    players,
    actor: players.find((p) => p.id === actorId),
    phase: state.phase,
    half: state.turn.isHalf2 ? 2 : 1,
    turn: state.turn.turnNumber,
    score: { ...state.score },
  };
}
type Context = ReturnType<typeof commandContext>;

function nearby(context: Context, player: Context["players"][number]) {
  return context.players.filter(
    (p) =>
      p.id !== player.id &&
      p.teamId === player.teamId &&
      p.at &&
      player.at &&
      Math.max(
        Math.abs(p.at.x - player.at.x),
        Math.abs(p.at.y - player.at.y)
      ) === 1
  );
}

function observeSkill(
  game: HeadlessGame,
  context: Context,
  data: Data,
  step: number,
  skills: Map<string, SkillObservation>
) {
  const player = context.players.find((p) => p.id === data["playerId"]);
  if (!player) return;
  const side = sideOf(game, player.teamId);
  const adjacent = nearby(context, player);
  let effect = String(data["effect"]);
  for (const p of context.players)
    effect = effect.split(p.name).join(`<${p.id}>`);
  const observation: SkillObservation = {
    side,
    playerId: player.id,
    skill: String(data["skill"]),
    effect,
    action: context.action,
    phase: context.phase,
    half: context.half,
    turn: context.turn,
    zone: third(player.at),
    carrying: player.carrying,
    adjacentThralls: adjacent.filter((p) => p.thrall).length,
    adjacentHelpers: adjacent.filter((p) => p.helper).length,
    scoreDifference:
      (context.score[player.teamId] ?? 0) -
      (context.score[side === 0 ? game.ctx.teams[1].id : game.ctx.teams[0].id] ?? 0),
    count: 1,
    firstStep: step,
  };
  const key = JSON.stringify({ ...observation, count: 0, firstStep: 0 });
  const existing = skills.get(key);
  if (existing) existing.count++;
  else skills.set(key, observation);
}

function observeRoll(
  game: HeadlessGame,
  context: Context,
  data: Data,
  turnover: Set<string>,
  rolls: Map<string, RollTally>
) {
  const roll = String(data["rollType"]).replace(/\s*\(.*/, "");
  const side = sideOf(
    game,
    typeof data["teamId"] === "string" ? data["teamId"] : context.actor?.teamId
  );
  const adjacent = context.actor ? nearby(context, context.actor) : [];
  const sample = {
    side,
    roll,
    action: context.action,
    carrying: !!context.actor?.carrying,
    adjacentThralls: adjacent.filter((p) => p.thrall).length,
    adjacentHelpers: adjacent.filter((p) => p.helper).length,
  };
  const key = JSON.stringify(sample);
  const tally = rolls.get(key) ?? {
    ...sample,
    attempts: 0,
    failures: 0,
    turnoversInCommand: 0,
  };
  tally.attempts++;
  if (data["resultState"] === "failure" || data["resultState"] === "fumble")
    tally.failures++;
  if (turnover.has(side === 0 ? game.ctx.teams[0].id : game.ctx.teams[1].id))
    tally.turnoversInCommand++;
  rolls.set(key, tally);
}

export function createTelemetry(game: HeadlessGame) {
  const skills = new Map<string, SkillObservation>();
  const rolls = new Map<string, RollTally>();
  const decisions: Record<string, number> = {};
  const counters: Record<string, number> = {};
  let step = 0;
  const original = game.execute.bind(game);
  const observe = (context: Context, events: CommandResponse["events"]) => {
    const turnover = new Set(
      events
        .filter((e) => e.name === GameEventNames.Turnover)
        .map((e) => (e.data as { teamId: string }).teamId)
    );
    for (const event of events) {
      const data = (event.data ?? {}) as Data;
      if (event.name === GameEventNames.SkillTriggered)
        observeSkill(game, context, data, step, skills);
      if (event.name === GameEventNames.DiceRoll)
        observeRoll(game, context, data, turnover, rolls);
      if (event.name === GameEventNames.DecisionRequested)
        increment(decisions, String(data["type"]));
      increment(counters, event.name);
      if (event.name === GameEventNames.PlayerCasualtyInflicted)
        increment(
          counters,
          `casualty:${String(data["cause"])}:${String(data["sppEligible"])}`
        );
    }
  };
  let batch: { context: Context; events: CommandResponse["events"] } | null =
    null;

  const measuredEvents = [
    GameEventNames.SkillTriggered,
    GameEventNames.DiceRoll,
    GameEventNames.DecisionRequested,
    GameEventNames.DecisionResolved,
    GameEventNames.Turnover,
    GameEventNames.TurnStarted,
    GameEventNames.TurnEnded,
    GameEventNames.Touchdown,
    GameEventNames.PlayerCasualtyInflicted,
    GameEventNames.PlayerStatusChanged,
    GameEventNames.PlayerKnockedDown,
    GameEventNames.PlayerMoved,
    GameEventNames.PassAttempted,
    GameEventNames.PassCompleted,
    GameEventNames.BallPickup,
  ] as const;
  for (const name of measuredEvents) {
    game.ctx.eventBus.on(name, (data) => {
      const event = { name, data };
      if (batch) batch.events.push(event);
      else observe(commandContext(game, { type: "state" }), [event]);
    });
  }
  game.execute = async (command: unknown) => {
    const typed = command as HeadlessCommand;

    if (["state", "legal-actions", "offer-inducements"].includes(typed.type))
      return original(command);
    const context = commandContext(game, typed);
    const previous = batch;
    const current = { context, events: [] satisfies CommandResponse["events"] };
    batch = current;
    let response: CommandResponse;
    try {
      response = await original(command);
    } finally {
      batch = previous;
    }
    if (response.ok) {
      increment(counters, `accepted:${optionKey(typed)}`);
      if (context.actor)
        increment(
          counters,
          `accepted:${String(sideOf(game, context.actor.teamId))}:${optionKey(typed)}`
        );
    }
    observe(context, current.events);
    step++;
    return response;
  };
  return {
    snapshot: () => ({
      skills: [...skills.values()],
      rolls: [...rolls.values()],
      decisions,
      counters,
    }),
  };
}
