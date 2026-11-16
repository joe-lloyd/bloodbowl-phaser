/** Mechanical skill ablations. Scripted actions are never counted as AI use. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { RULE_SCENARIOS } from "../../../src/data/ruleScenarios";
import { runRuleConfig } from "../../../src/game/rules-lab";
import { GameEventNames } from "../../../src/types/events";
import { enumerateDecision } from "../../../src/simulation/candidates";
import { plannerCoach } from "../../../src/simulation/ai/planner";
import { createCoachRng } from "../../../src/simulation/rng";
import type { HeadlessGame } from "../../../src/headless/HeadlessGame";
import type { RuleConfig } from "../../../src/game/rules-lab";
import type { SkillType } from "../../../src/types/Skills";
import { PlayerStatus } from "../../../src/types/Player";

export function endpoints(game: HeadlessGame) {
  const state = game.ctx.gameService.getState();
  return [game.ctx.team1, game.ctx.team2].map((team) => ({
    score: state.score[team.id] ?? 0,
    rerolls: team.rerolls,
    players: team.players.map((p) => ({
      number: p.number,
      status: p.status,
      x: p.gridPosition?.x ?? null,
      y: p.gridPosition?.y ?? null,
      carrying:
        p.status === PlayerStatus.ACTIVE &&
        !!p.gridPosition &&
        p.gridPosition.x === state.ballPosition?.x &&
        p.gridPosition.y === state.ballPosition?.y,
      injuries: p.injuries.length,
      conditions: p.conditions ?? [],
      acted: p.hasActed,
    })),
  }));
}

export async function probeRun(
  config: RuleConfig,
  skill: SkillType,
  seed: number,
  remove: boolean
) {
  let holders = 0,
    rolls = 0,
    failedRolls = 0,
    triggers = 0,
    turnovers = 0;
  const result = await runRuleConfig(config, seed, (game) => {
    for (const p of [...game.ctx.team1.players, ...game.ctx.team2.players]) {
      if (p.skills.some((s) => s.type === skill)) holders++;
      if (remove) p.skills = p.skills.filter((s) => s.type !== skill);
    }
    game.ctx.eventBus.on(GameEventNames.DiceRoll, (data) => {
      rolls++;
      if (data.resultState === "failure" || data.resultState === "fumble")
        failedRolls++;
    });
    game.ctx.eventBus.on(GameEventNames.SkillTriggered, (data) => {
      if (data.skill === skill) triggers++;
    });
    game.ctx.eventBus.on(GameEventNames.Turnover, () => turnovers++);
  });
  return {
    holders,
    rolls,
    failedRolls,
    triggers,
    turnovers,
    rejected: result.responses.filter((r) => !r.ok).length,
    commands: result.responses.length,
    pending: result.game.pendingDecision()?.type ?? null,
    endpoint: endpoints(result.game),
  };
}

async function firstChoice(config: RuleConfig, seed: number) {
  const expected = config.script?.[0];
  if (expected?.type !== "declare-action")
    return { status: "not an opening declaration" };
  let sample: unknown;
  await runRuleConfig({ ...config, script: [] }, seed, async (game) => {
    const point = await enumerateDecision(game, null);
    const choice = await plannerCoach.choose({
      game,
      point,
      snapshot: game.snapshot(),
      rng: createCoachRng(seed),
    });
    const chosen = point.candidates[choice.index]?.commands[0];
    sample = {
      expectedAction: expected.action,
      offered: point.candidates.some(
        (c) =>
          c.commands[0].type === "declare-action" &&
          c.commands[0].action === expected.action
      ),
      chosen: chosen?.type === "declare-action" ? chosen.action : chosen?.type,
      note: choice.note,
    };
  });
  return sample;
}

async function probePair(config: RuleConfig, skill: SkillType, seed: number) {
  try {
    const withSkill = await probeRun(config, skill, seed, false);
    const withoutSkill = await probeRun(config, skill, seed, true);
    const comparable =
      withSkill.holders > 0 &&
      withSkill.rejected === 0 &&
      withoutSkill.rejected === 0 &&
      withSkill.pending === withoutSkill.pending;
    return {
      skill: skill,
      config: config.id,
      seed,
      withSkill,
      withoutSkill,
      comparable,
      endpointChanged:
        comparable &&
        JSON.stringify(withSkill.endpoint) !==
          JSON.stringify(withoutSkill.endpoint),
    };
  } catch (error) {
    return {
      skill: skill,
      config: config.id,
      seed,
      error: String(error),
      comparable: false,
    };
  }
}

async function main() {
  const out = resolve(process.argv[2] ?? "sim-results/advanced-probes");
  mkdirSync(out, { recursive: true });
  const seeds = Number(process.argv[3] ?? 32);
  if (!Number.isSafeInteger(seeds) || seeds < 1)
    throw new Error("Invalid seed count");
  const rows = [];
  const selections = [];
  const source = readFileSync(new URL(import.meta.url));
  const pipelineDigest = createHash("sha256").update(source).digest("hex");
  writeFileSync(join(out, "probe-source.ts"), source);
  for (const entry of RULE_SCENARIOS)
    for (const config of entry.configs) {
      try {
        selections.push({
          skill: entry.skill,
          config: config.id,
          ...((await firstChoice(config, 71)) as object),
        });
      } catch (error) {
        selections.push({
          skill: entry.skill,
          config: config.id,
          error: String(error),
        });
      }
      for (let seed = 1; seed <= seeds; seed++) {
        rows.push(await probePair(config, entry.skill, seed));
      }
      writeFileSync(
        join(out, "probes.json"),
        JSON.stringify({ seeds, rows, selections, pipelineDigest })
      );
      console.log(JSON.stringify({ config: config.id, rows: rows.length }));
    }
}

if (process.argv[1]?.endsWith("/probes.ts")) await main();
