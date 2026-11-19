import { fixtureValue } from "../../testing/fixtureValue";
import { HeadlessGame } from "../../headless/HeadlessGame";
import {
  type HeadlessCommand,
  type CommandResponse,
  type PendingDecision,
} from "../../headless/protocol";
import { type Scenario } from "../../types/Scenario";
import { type Player, PlayerStatus } from "../../types/Player";
import {
  type RuleConfig,
  type RuleOutcome,
  type ScriptResult,
  type DecisionPolicy,
} from "./types";
import { resolveReference, resolveCommandReferences } from "./references";

export function resolveRef(game: HeadlessGame, ref: string): string {
  return resolveReference(game.ctx, ref);
}

function resolveCommand(
  game: HeadlessGame,
  command: HeadlessCommand
): HeadlessCommand {
  return resolveCommandReferences(game.ctx, command);
}

type Decision<T extends PendingDecision["type"]> = Extract<
  PendingDecision,
  { type: T }
>;

function blockIndex(
  pending: Decision<"block-dice">,
  policy: DecisionPolicy
): number {
  if (!policy.preferBlockResult) return 0;
  const preferred = pending.options.findIndex(
    (o) => o.type === policy.preferBlockResult
  );
  return preferred >= 0 ? preferred : 0;
}

function touchbackAnswer(
  pending: Decision<"touchback">,
  game: HeadlessGame
): HeadlessCommand | null {
  const team =
    pending.teamId === game.ctx.team1.id ? game.ctx.team1 : game.ctx.team2;
  const receiver = team.players.find(
    (p: Player) => p.gridPosition && p.status === PlayerStatus.ACTIVE
  );
  return receiver ? { type: "touchback", playerId: receiver.id } : null;
}

function rerollAnswer(policy: DecisionPolicy): HeadlessCommand {
  const setting = policy.acceptRerolls ?? true;
  if (setting === false) return { type: "use-reroll", accept: false };
  return {
    type: "use-reroll",
    accept: true,
    ...(typeof setting === "string" ? { source: setting } : {}),
  };
}

function interceptionAnswer(
  pending: Decision<"interception">,
  policy: DecisionPolicy
): HeadlessCommand {
  if (!(policy.acceptInterceptions ?? true)) {
    return { type: "choose-interception" };
  }
  const best = [...pending.candidates].sort(
    (a, b) => b.modifier - a.modifier
  )[0];
  return {
    type: "choose-interception",
    ...(best ? { playerId: best.playerId } : {}),
  };
}

function consentAnswer(
  pending: Decision<"follow-up" | "reaction" | "bite-target" | "apothecary">,
  policy: DecisionPolicy
): HeadlessCommand {
  switch (pending.type) {
    case "follow-up":
      return { type: "choose-follow-up", followUp: policy.followUp ?? true };
    case "reaction":
      return { type: "use-reaction", accept: policy.acceptReactions ?? true };
    case "bite-target":
      return policy.acceptReactions === false
        ? { type: "choose-bite-target" }
        : {
            type: "choose-bite-target",
            ...(pending.targetIds[0] ? { playerId: pending.targetIds[0] } : {}),
          };
    case "apothecary":
      return { type: "use-apothecary", accept: policy.useApothecary ?? false };
  }
}

function inducementAnswer(
  pending: Decision<"inducement-choice">
): HeadlessCommand {
  return pending.optional
    ? { type: "choose-inducement" }
    : {
        type: "choose-inducement",
        ...(pending.playerIds[0] ? { playerId: pending.playerIds[0] } : {}),
        ...(pending.skills?.[0] ? { skill: pending.skills[0] } : {}),
      };
}

export function answerDecision(
  pending: PendingDecision,
  game: HeadlessGame,
  policy: DecisionPolicy
): HeadlessCommand | null {
  const custom = policy.custom?.(pending, game);
  if (custom !== undefined) return custom;

  return automaticAnswer(pending, game, policy);
}

function isConsentDecision(
  pending: PendingDecision
): pending is Decision<
  "follow-up" | "reaction" | "bite-target" | "apothecary"
> {
  return (
    pending.type === "follow-up" ||
    pending.type === "reaction" ||
    pending.type === "bite-target" ||
    pending.type === "apothecary"
  );
}

function automaticAnswer(
  pending: PendingDecision,
  game: HeadlessGame,
  policy: DecisionPolicy
): HeadlessCommand | null {
  if (isConsentDecision(pending)) return consentAnswer(pending, policy);
  switch (pending.type) {
    case "kickoff-event":
      return { type: "kickoff-skip" };
    case "block-dice":
      return {
        type: "choose-block-result",
        index: blockIndex(pending, policy),
      };
    case "push-direction": {
      const dir = fixtureValue(pending.options[0]);
      return { type: "choose-push-direction", x: dir.x, y: dir.y };
    }
    case "touchback":
      return touchbackAnswer(pending, game);
    case "reroll":
      return rerollAnswer(policy);
    case "interception":
      return interceptionAnswer(pending, policy);
    case "foul-assists":
      return { type: "choose-foul-assists", count: pending.available };
    case "inducement-choice":
      return inducementAnswer(pending);
  }
}

function createRuleGame(config: RuleConfig, seed: number): HeadlessGame {
  const scenario: Scenario = {
    id: `rule-config-${config.id}`,
    name: config.name,
    description: config.description,
    setup: config.setup,
  };
  const game = new HeadlessGame({ scenario, seed });
  if (config.setup.turn !== undefined) {
    game.ctx.gameService.seedTurnCounts(config.setup.turn);
  }
  if (config.rerolls?.team1) game.ctx.team1.rerolls = config.rerolls.team1;
  if (config.rerolls?.team2) game.ctx.team2.rerolls = config.rerolls.team2;
  return game;
}

export async function runRuleConfig(
  config: RuleConfig,
  seed: number,
  prepareGame?: (game: HeadlessGame) => void | Promise<void>
): Promise<ScriptResult> {
  const game = createRuleGame(config, seed);
  await prepareGame?.(game);

  const policy = config.decisionPolicy ?? {};
  const responses: CommandResponse[] = [];
  const decisions: PendingDecision[] = [];

  const execute = async (command: HeadlessCommand) => {
    const response = await game.execute(resolveCommand(game, command));
    responses.push(response);
    return response;
  };

  script: for (const step of config.script ?? []) {
    let response = await execute(step);

    for (let guard = 0; response.pendingDecision && guard < 25; guard++) {
      decisions.push(response.pendingDecision);
      const reply = answerDecision(response.pendingDecision, game, policy);
      if (reply === null) break script;
      response = await execute(reply);
    }
  }

  return {
    game,
    responses,
    decisions,
    events: responses.flatMap((r) => r.events),
    snapshot: game.snapshot(),
  };
}

export interface FoundSeed {
  seed: number;
  result: ScriptResult;
}

export async function findSeed(
  config: RuleConfig,
  outcomeId: string,
  opts?: { from?: number; limit?: number }
): Promise<FoundSeed> {
  const outcome: RuleOutcome | undefined = config.outcomes.find(
    (o) => o.id === outcomeId
  );
  if (!outcome) {
    throw new Error(`config '${config.id}' has no outcome '${outcomeId}'`);
  }
  const { from, limit } = searchRange(config, opts);

  for (let seed = from; seed < from + limit; seed++) {
    const result = await runRuleConfig(config, seed);
    if (outcome.matches(result)) return { seed, result };
  }
  throw new Error(
    `no seed in [${String(from)}, ${String(from + limit)}) produced outcome '${outcomeId}' ` +
      `for config '${config.id}'`
  );
}

function searchRange(
  config: RuleConfig,
  opts?: { from?: number; limit?: number }
) {
  return {
    from: opts?.from ?? config.seedSearch?.from ?? 1,
    limit: opts?.limit ?? config.seedSearch?.limit ?? 200,
  };
}
