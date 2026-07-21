/**
 * Runs a rule configuration headlessly and searches seeds by outcome.
 * Shared by the generated tests (Node), the CLI rule runner, and the
 * sandbox's in-browser seed finder — the engine is Phaser-free, so a run
 * is just a HeadlessGame driven by the config's script.
 */

import { HeadlessGame } from "../../headless/HeadlessGame";
import {
  HeadlessCommand,
  CommandResponse,
  PendingDecision,
} from "../../headless/protocol";
import { Scenario } from "../../types/Scenario";
import { Player, PlayerStatus } from "../../types/Player";
import {
  RuleConfig,
  RuleOutcome,
  ScriptResult,
  DecisionPolicy,
} from "./types";

const PLAYER_REF = /^(team1|team2):(\d+)$/;

/** Resolve "team1:0"-style refs to this run's player/team ids. */
export function resolveRef(game: HeadlessGame, ref: string): string {
  const match = PLAYER_REF.exec(ref);
  if (match) {
    const team = match[1] === "team1" ? game.ctx.team1 : game.ctx.team2;
    const player = team.players[Number(match[2])];
    if (!player) throw new Error(`no player for ref '${ref}'`);
    return player.id;
  }
  if (ref === "team1") return game.ctx.team1.id;
  if (ref === "team2") return game.ctx.team2.id;
  return ref;
}

const ID_FIELDS = [
  "playerId",
  "attackerId",
  "defenderId",
  "player1Id",
  "player2Id",
  "teamId",
  "kickingTeamId",
] as const;

function resolveCommand(
  game: HeadlessGame,
  command: HeadlessCommand
): HeadlessCommand {
  const resolved = { ...command } as Record<string, unknown>;
  for (const field of ID_FIELDS) {
    const value = resolved[field];
    if (typeof value === "string") {
      resolved[field] = resolveRef(game, value);
    }
  }
  return resolved as HeadlessCommand;
}

function answerDecision(
  pending: PendingDecision,
  game: HeadlessGame,
  policy: DecisionPolicy
): HeadlessCommand | null {
  const custom = policy.custom?.(pending, game);
  if (custom !== undefined) return custom; // null = leave pending

  switch (pending.type) {
    case "block-dice": {
      let index = 0;
      if (policy.preferBlockResult) {
        const preferred = pending.options.findIndex(
          (o) => o.type === policy.preferBlockResult
        );
        if (preferred >= 0) index = preferred;
      }
      return { type: "choose-block-result", index };
    }
    case "push-direction": {
      const dir = pending.options[0];
      return { type: "choose-push-direction", x: dir.x, y: dir.y };
    }
    case "follow-up":
      return { type: "choose-follow-up", followUp: policy.followUp ?? true };
    case "touchback": {
      const team =
        pending.teamId === game.ctx.team1.id ? game.ctx.team1 : game.ctx.team2;
      const receiver = team.players.find(
        (p: Player) => p.gridPosition && p.status === PlayerStatus.ACTIVE
      );
      return receiver ? { type: "touchback", playerId: receiver.id } : null;
    }
    case "reroll": {
      const setting = policy.acceptRerolls ?? true;
      if (setting === false) return { type: "use-reroll", accept: false };
      return {
        type: "use-reroll",
        accept: true,
        source: typeof setting === "string" ? setting : undefined,
      };
    }
    case "reaction":
      return { type: "use-reaction", accept: policy.acceptReactions ?? true };
    case "interception": {
      // Default: the defending coach picks the least-penalised interceptor.
      if ((policy.acceptInterceptions ?? true) === false) {
        return { type: "choose-interception" };
      }
      const best = [...pending.candidates].sort(
        (a, b) => b.modifier - a.modifier
      )[0];
      return { type: "choose-interception", playerId: best?.playerId };
    }
  }
}

export async function runRuleConfig(
  config: RuleConfig,
  seed: number
): Promise<ScriptResult> {
  const scenario: Scenario = {
    id: `rule-config-${config.id}`,
    name: config.name,
    description: config.description,
    setup: config.setup,
  };
  const game = new HeadlessGame({ scenario, seed });
  if (config.rerolls?.team1) game.ctx.team1.rerolls = config.rerolls.team1;
  if (config.rerolls?.team2) game.ctx.team2.rerolls = config.rerolls.team2;

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
    // Answer decisions until the step fully resolves (bounded per step)
    for (let guard = 0; response.pendingDecision && guard < 25; guard++) {
      decisions.push(response.pendingDecision);
      const reply = answerDecision(response.pendingDecision, game, policy);
      if (reply === null) break script; // policy wants it left pending
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

/**
 * Bounded deterministic seed search: first seed in [from, from+limit) whose
 * run exhibits the outcome. Throws with the exhausted range when none does.
 */
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
  const from = opts?.from ?? config.seedSearch?.from ?? 1;
  const limit = opts?.limit ?? config.seedSearch?.limit ?? 200;

  for (let seed = from; seed < from + limit; seed++) {
    const result = await runRuleConfig(config, seed);
    if (outcome.matches(result)) return { seed, result };
  }
  throw new Error(
    `no seed in [${from}, ${from + limit}) produced outcome '${outcomeId}' ` +
      `for config '${config.id}'`
  );
}
