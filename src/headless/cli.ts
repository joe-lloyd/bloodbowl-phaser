import * as readline from "node:readline";
import * as fs from "node:fs";
import { HeadlessGame } from "./HeadlessGame";
import { type CommandResponse } from "./protocol";
import { type GameSnapshot, type PlayerSnapshot } from "./serialization";
import { SCENARIOS } from "../data/scenarios";
import { GamePhase } from "../types/GameState";
import { GameConfig } from "../config/GameConfig";
import type { RuleConfig, ScriptResult } from "../game/rules-lab";
import type * as RuleLab from "../game/rules-lab";
import type * as RuleScenarios from "../data/ruleScenarios";

interface CliOptions {
  scenario?: string | undefined;
  seed?: number;
  json: boolean;
  script?: string | undefined;
  rule?: string | undefined;
  config?: string | undefined;
  outcome?: string | undefined;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { json: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--scenario":
        options.scenario = argv[++i];
        break;
      case "--seed":
        options.seed = Number(argv[++i]);
        break;
      case "--json":
        options.json = true;
        break;
      case "--script":
        options.script = argv[++i];
        break;
      case "--rule":
        options.rule = argv[++i];
        break;
      case "--config":
        options.config = argv[++i];
        break;
      case "--outcome":
        options.outcome = argv[++i];
        break;
      case "--help":
        printHelp();
        process.exit(0);
    }
  }
  return options;
}

function printHelp(): void {
  process.stderr.write(
    [
      "Blood Bowl headless runner",
      "",
      "Options:",
      "  --scenario <id>   start from a scenario (see src/data/scenarios.ts)",
      "  --seed <n>        RNG seed for a deterministic game",
      "  --json            JSON-lines mode: one command in, one response out",
      "  --script <file>   run commands from file (one JSON per line), exit 1 on failure",
      '  --rule <skill>    run a rule\'s catalog configurations (e.g. --rule "Sure Hands")',
      "  --config <id>     narrow --rule to one configuration",
      "  --outcome <id>    narrow --rule to one outcome",
      "                    with --seed: run exactly that seed, report the outcome",
      "  --help            this text",
      "",
      "Text-mode commands: any protocol command as JSON, or shortcuts:",
      "  state | legal | legal <playerId> | help | quit",
      "",
      'Example protocol command: {"type":"move","playerId":"...","path":[{"x":8,"y":5}]}',
    ].join("\n") + "\n"
  );
}

const PITCH_WIDTH = GameConfig.PITCH_WIDTH;
const PITCH_HEIGHT = GameConfig.PITCH_HEIGHT;

function placePlayerCell(
  grid: string[][],
  mark: string,
  p: PlayerSnapshot
): void {
  if (!p.position) return;
  const { x, y } = p.position;
  if (y < 0 || y >= PITCH_HEIGHT || x < 0 || x >= PITCH_WIDTH) return;
  const downed = p.status === "Prone" || p.status === "Stunned" ? "*" : "";
  const cell = `${mark}${String(p.number)}${downed}`;
  const row = grid[y];
  if (!row) return;
  row[x] = cell.length > 2 ? cell.slice(0, 3) : ` ${cell}`;
}

function markBallCell(grid: string[][], ball: { x: number; y: number }): void {
  const { x, y } = ball;
  if (y < 0 || y >= PITCH_HEIGHT || x < 0 || x >= PITCH_WIDTH) return;
  const row = grid[y];
  const existing = row?.[x];
  if (row && existing !== undefined)
    row[x] = existing.trim() === "." ? " o" : existing.trim() + "o";
}

function renderPitch(snapshot: GameSnapshot): string {
  const grid: string[][] = Array.from({ length: PITCH_HEIGHT }, () =>
    Array.from({ length: PITCH_WIDTH }, () => " .")
  );

  for (const [teamIndex, team] of snapshot.teams.entries()) {
    const mark = teamIndex === 0 ? "A" : "B";
    for (const p of team.players) placePlayerCell(grid, mark, p);
  }

  if (snapshot.ballPosition) markBallCell(grid, snapshot.ballPosition);

  const header =
    ' '.repeat(4) +
    Array.from({ length: PITCH_WIDTH }, (_, i) =>
      String(i).padStart(3, " ")
    ).join("");
  const rows = grid.map(
    (row, y) =>
      String(y).padStart(3, " ") +
      " " +
      row.map((cell) => cell.padStart(3, " ")).join("")
  );
  return [header, ...rows].join("\n");
}

function renderStatus(snapshot: GameSnapshot): string {
  const scores = snapshot.teams
    .map((t) => `${t.name}: ${String(snapshot.score[t.id] ?? 0)}`)
    .join("  |  ");
  const active =
    snapshot.teams.find((t) => t.id === snapshot.activeTeamId)?.name ?? "-";
  return `[${snapshot.phase}${snapshot.subPhase ? "/" + snapshot.subPhase : ""}] turn ${String(snapshot.turn.turnNumber)}${snapshot.turn.isHalf2 ? " (H2)" : ""}  active: ${active}  weather: ${snapshot.weather}  |  ${scores}`;
}

function renderEvents(response: CommandResponse): string {
  return response.events
    .filter((e) => !String(e.name).startsWith("ui:"))
    .map((e) => `  • ${e.name}${e.data ? " " + safeJson(e.data) : ""}`)
    .join("\n");
}

function safeJson(data: unknown): string {
  try {
    const text = JSON.stringify(data);
    return text.length > 120 ? text.slice(0, 117) + "..." : text;
  } catch {
    return "<unserializable>";
  }
}

function parseTextCommand(line: string): unknown | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (trimmed === "state") return { type: "state" };
  if (trimmed === "legal") return { type: "legal-actions" };
  if (trimmed.startsWith("legal "))
    return { type: "legal-actions", playerId: trimmed.slice(6).trim() };
  try {
    return JSON.parse(trimmed);
  } catch {
    return { type: `unparseable:${trimmed}` };
  }
}

function resolveScenario(id: string | undefined) {
  const scenario = id ? SCENARIOS.find((s) => s.id === id) : undefined;
  if (id && !scenario) {
    process.stderr.write(
      `Unknown scenario '${id}'. Available: ${SCENARIOS.map((s) => s.id).join(", ")}\n`
    );
    process.exit(1);
  }
  return scenario;
}

const toStderr =
  (label: string) =>
  (...args: unknown[]) =>
    process.stderr.write(
      `${label} ${args.map((a) => (typeof a === "string" ? a : safeJson(a))).join(" ")}\n`
    );

function redirectConsoleToStderr(): void {
  console.log = toStderr("[log]");
  console.info = toStderr("[info]");
  console.warn = toStderr("[warn]");
  console.error = toStderr("[error]");
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  const scenario = resolveScenario(options.scenario);

  if (options.json || options.script || options.rule) {
    redirectConsoleToStderr();
  }

  if (options.rule) {
    await runRuleMode(options);
    return;
  }

  const game = new HeadlessGame({
    scenario,
    seed: options.seed,
    startingPhase: scenario ? undefined : GamePhase.SETUP,
  });

  process.stderr.write(
    `Headless game ready (seed ${String(game.ctx.seed)}${scenario ? `, scenario ${scenario.id}` : ""})\n`
  );

  if (options.script) {
    await runScript(game, options.script);
    return;
  }

  if (options.json) {
    await runJsonMode(game);
    return;
  }

  await runTextMode(game);
}

type RuleEntry = (typeof RuleScenarios.RULE_SCENARIOS)[number];

function ruleConfigs(
  options: CliOptions,
  entries: readonly RuleEntry[]
): { entry: RuleEntry; configs: RuleConfig[] } {
  const entry = entries.find(
    (e) => e.skill.toLowerCase() === options.rule!.toLowerCase()
  );
  if (!entry) {
    const covered = entries.map((e) => e.skill).join(", ");
    process.stderr.write(
      `No catalog entry for rule '${String(options.rule)}'. Covered rules: ${covered}\n`
    );
    process.exit(1);
  }

  const configs = selected(entry.configs, options.config);
  if (configs.length === 0) {
    process.stderr.write(
      `No configuration '${String(options.config)}' for ${entry.skill}. ` +
        `Available: ${entry.configs.map((c) => c.id).join(", ")}\n`
    );
    process.exit(1);
  }
  return { entry, configs };
}

function selected<T extends { id: string }>(
  items: T[],
  id: string | undefined
): T[] {
  return id ? items.filter((item) => item.id === id) : items;
}

function skillEventLines(result: ScriptResult, names: string[]): string {
  return result.events
    .filter((e) => names.includes(e.name))
    .map((e) => `      event ${e.name}: ${JSON.stringify(e.data)}`)
    .join("\n");
}

function reportSeed(
  config: RuleConfig,
  seed: number,
  result: ScriptResult,
  out: (line: string) => void
): void {
  for (const outcome of config.outcomes) {
    out(
      `  seed ${String(seed)} → ${outcome.id}: ${
        outcome.matches(result) ? "MATCHED" : "not matched"
      }`
    );
  }
}

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

function writeLine(line: string): void {
  process.stdout.write(line + "\n");
}

async function reportOutcomes(
  config: RuleConfig,
  options: CliOptions,
  lab: {
    findSeed: typeof RuleLab.findSeed;
    skillEvents: (result: ScriptResult) => string;
  }
): Promise<boolean> {
  let failed = false;
  for (const outcome of selected(config.outcomes, options.outcome)) {
    try {
      const found = await lab.findSeed(config, outcome.id);
      outcome.verify?.(found.result);
      writeLine(`  ✓ ${outcome.id}: seed ${String(found.seed)} — ${outcome.name}`);
      const events = lab.skillEvents(found.result);
      if (events) writeLine(events);
    } catch (error) {
      failed = true;
      writeLine(`  ✗ ${outcome.id}: ${errorText(error)}`);
    }
  }
  return failed;
}

async function runRuleMode(options: CliOptions): Promise<void> {
  const { RULE_SCENARIOS } = await import("../data/ruleScenarios");
  const { runRuleConfig, findSeed } = await import("../game/rules-lab");
  const { GameEventNames } = await import("../types/events");

  const { entry, configs } = ruleConfigs(options, RULE_SCENARIOS);

  let failed = false;

  const skillEvents = (result: ScriptResult) =>
    skillEventLines(result, [
      GameEventNames.SkillTriggered,
      GameEventNames.RerollUsed,
    ]);

  for (const config of configs) {
    writeLine(`\n=== ${entry.skill}: ${config.name} (${config.id})`);
    writeLine(`    ${config.description}`);

    if (options.seed !== undefined) {
      const result = await runRuleConfig(config, options.seed);
      reportSeed(config, options.seed, result, writeLine);
      const events = skillEvents(result);
      if (events) writeLine(events);
      continue;
    }

    if (await reportOutcomes(config, options, { findSeed, skillEvents })) {
      failed = true;
    }
  }
  process.exit(failed ? 1 : 0);
}

async function runScript(game: HeadlessGame, file: string): Promise<void> {
  const lines = fs
    .readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  const WATCHDOG_MS = 30_000;
  for (const [i, line] of lines.entries()) {
    let command: unknown;
    try {
      command = JSON.parse(line);
    } catch {
      process.stderr.write(`Line ${String(i + 1)}: invalid JSON\n`);
      process.exit(1);
    }

    const response = await Promise.race([
      game.execute(command),
      new Promise<null>((resolve) =>
        setTimeout(() => {
          resolve(null);
        }, WATCHDOG_MS)
      ),
    ]);

    if (response === null) {
      process.stderr.write(
        `Line ${String(i + 1)}: stalled (watchdog ${String(WATCHDOG_MS)}ms)\n`
      );
      process.exit(1);
    }
    process.stdout.write(JSON.stringify(response) + "\n");
    if (response.ok) {
      continue;
    }

    process.stderr.write(
      `Line ${String(i + 1)}: rejected — ${String(response.reason)}\n`
    );
    process.exit(1);
  }
  process.exit(0);
}

async function runJsonMode(game: HeadlessGame): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    terminal: false,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let command: unknown;
    try {
      command = JSON.parse(line);
    } catch {
      process.stdout.write(
        JSON.stringify({
          ok: false,
          reason: "malformed-command: invalid JSON",
          events: [],
          snapshot: game.snapshot(),
          pendingDecision: game.pendingDecision(),
        }) + "\n"
      );
      continue;
    }
    const response = await game.execute(command);
    process.stdout.write(JSON.stringify(response) + "\n");
  }
}

async function runTextMode(game: HeadlessGame): Promise<void> {
  const print = (text: string) => process.stdout.write(text + "\n");

  print(renderStatus(game.snapshot()));
  print(renderPitch(game.snapshot()));
  print('Type "help" for commands.');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "bb> ",
  });
  rl.prompt();

  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed === "quit" || trimmed === "exit") break;
    if (trimmed === "help") {
      printHelp();
      rl.prompt();
      continue;
    }

    const command = parseTextCommand(line);
    if (command === null) {
      rl.prompt();
      continue;
    }

    printResponse(await game.execute(command), print);
    rl.prompt();
  }
  process.exit(0);
}

function printResponse(
  response: CommandResponse,
  print: (text: string) => void
): void {
  if (!response.ok) {
    print(`✗ ${String(response.reason)}`);
    return;
  }
  const events = renderEvents(response);
  if (events) print(events);
  if (response.legalActions) print(safeJsonPretty(response.legalActions));
  if (response.pendingDecision) {
    print(`! decision required: ${safeJson(response.pendingDecision)}`);
  }
  print(renderStatus(response.snapshot));
  print(renderPitch(response.snapshot));
}

function safeJsonPretty(data: unknown): string {
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return "<unserializable>";
  }
}

main().catch((error) => {
  process.stderr.write(`Fatal: ${String(error?.stack ?? error)}\n`);
  process.exit(1);
});
