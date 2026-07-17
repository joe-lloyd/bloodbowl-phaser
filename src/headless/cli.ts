/**
 * Blood Bowl headless console runner.
 *
 *   pnpm headless                          interactive text mode, default teams
 *   pnpm headless --scenario basic-scrimmage --seed 42
 *   pnpm headless --json                   JSON-lines protocol on stdin/stdout (AI mode)
 *   pnpm headless --script moves.jsonl     replay a command script, exit non-zero on failure
 *
 * JSON mode contract: one JSON command per stdin line, exactly one JSON
 * response per stdout line. All diagnostics go to stderr.
 */

import * as readline from "node:readline";
import * as fs from "node:fs";
import { HeadlessGame } from "./HeadlessGame";
import { CommandResponse } from "./protocol";
import { GameSnapshot, PlayerSnapshot } from "./serialization";
import { SCENARIOS } from "../data/scenarios";
import { GamePhase } from "../types/GameState";
import { GameConfig } from "../config/GameConfig";

interface CliOptions {
  scenario?: string;
  seed?: number;
  json: boolean;
  script?: string;
  rule?: string;
  config?: string;
  outcome?: string;
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

// ===== Text rendering =====

const PITCH_WIDTH = GameConfig.PITCH_WIDTH;
const PITCH_HEIGHT = GameConfig.PITCH_HEIGHT;

function renderPitch(snapshot: GameSnapshot): string {
  const grid: string[][] = Array.from({ length: PITCH_HEIGHT }, () =>
    Array.from({ length: PITCH_WIDTH }, () => " .")
  );

  snapshot.teams.forEach((team, teamIndex) => {
    const mark = teamIndex === 0 ? "A" : "B";
    team.players.forEach((p: PlayerSnapshot) => {
      if (!p.position) return;
      const { x, y } = p.position;
      if (y < 0 || y >= PITCH_HEIGHT || x < 0 || x >= PITCH_WIDTH) return;
      const downed = p.status === "Prone" || p.status === "Stunned" ? "*" : "";
      const cell = `${mark}${p.number}${downed}`;
      grid[y][x] = cell.length > 2 ? cell.slice(0, 3) : ` ${cell}`;
    });
  });

  if (snapshot.ballPosition) {
    const { x, y } = snapshot.ballPosition;
    if (y >= 0 && y < PITCH_HEIGHT && x >= 0 && x < PITCH_WIDTH) {
      const existing = grid[y][x];
      grid[y][x] = existing.trim() === "." ? " o" : existing.trim() + "o";
    }
  }

  const header =
    "    " +
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
    .map((t) => `${t.name}: ${snapshot.score[t.id] ?? 0}`)
    .join("  |  ");
  const active =
    snapshot.teams.find((t) => t.id === snapshot.activeTeamId)?.name ?? "-";
  return `[${snapshot.phase}${snapshot.subPhase ? "/" + snapshot.subPhase : ""}] turn ${snapshot.turn.turnNumber}${snapshot.turn.isHalf2 ? " (H2)" : ""}  active: ${active}  weather: ${snapshot.weather}  |  ${scores}`;
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

// ===== Command handling =====

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

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  const scenario = options.scenario
    ? SCENARIOS.find((s) => s.id === options.scenario)
    : undefined;
  if (options.scenario && !scenario) {
    process.stderr.write(
      `Unknown scenario '${options.scenario}'. Available: ${SCENARIOS.map((s) => s.id).join(", ")}\n`
    );
    process.exit(1);
  }

  // In JSON/rule mode nothing but results may reach stdout: reroute
  // console.* (engine diagnostics like "[Flow] Executing:") to stderr.
  if (options.json || options.script || options.rule) {
    const toStderr =
      (label: string) =>
      (...args: unknown[]) =>
        process.stderr.write(
          `${label} ${args.map((a) => (typeof a === "string" ? a : safeJson(a))).join(" ")}\n`
        );
    console.log = toStderr("[log]");
    console.info = toStderr("[info]");
    console.warn = toStderr("[warn]");
    console.error = toStderr("[error]");
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
    `Headless game ready (seed ${game.ctx.seed}${scenario ? `, scenario ${scenario.id}` : ""})\n`
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

// ===== Rule runner mode =====

async function runRuleMode(options: CliOptions): Promise<void> {
  const { RULE_SCENARIOS } = await import("../data/ruleScenarios");
  const { runRuleConfig, findSeed } = await import("../game/rules-lab");
  const { GameEventNames } = await import("../types/events");

  const entry = RULE_SCENARIOS.find(
    (e) => e.skill.toLowerCase() === options.rule!.toLowerCase()
  );
  if (!entry) {
    const covered = RULE_SCENARIOS.map((e) => e.skill).join(", ");
    process.stderr.write(
      `No catalog entry for rule '${options.rule}'. Covered rules: ${covered}\n`
    );
    process.exit(1);
  }

  const configs = options.config
    ? entry.configs.filter((c) => c.id === options.config)
    : entry.configs;
  if (configs.length === 0) {
    process.stderr.write(
      `No configuration '${options.config}' for ${entry.skill}. ` +
        `Available: ${entry.configs.map((c) => c.id).join(", ")}\n`
    );
    process.exit(1);
  }

  const out = (line: string) => process.stdout.write(line + "\n");
  let failed = false;

  for (const config of configs) {
    out(`\n=== ${entry.skill}: ${config.name} (${config.id})`);
    out(`    ${config.description}`);

    const skillEvents = (result: {
      events: { name: string; data?: unknown }[];
    }) =>
      result.events
        .filter(
          (e) =>
            e.name === GameEventNames.SkillTriggered ||
            e.name === GameEventNames.RerollUsed
        )
        .map((e) => `      event ${e.name}: ${JSON.stringify(e.data)}`)
        .join("\n");

    if (options.seed !== undefined) {
      // Fixed seed: run it once, report which outcome(s) it produced
      const result = await runRuleConfig(config, options.seed);
      for (const outcome of config.outcomes) {
        out(
          `  seed ${options.seed} → ${outcome.id}: ${
            outcome.matches(result) ? "MATCHED" : "not matched"
          }`
        );
      }
      const events = skillEvents(result);
      if (events) out(events);
      continue;
    }

    const outcomes = options.outcome
      ? config.outcomes.filter((o) => o.id === options.outcome)
      : config.outcomes;
    for (const outcome of outcomes) {
      try {
        const found = await findSeed(config, outcome.id);
        outcome.verify?.(found.result);
        out(`  ✓ ${outcome.id}: seed ${found.seed} — ${outcome.name}`);
        const events = skillEvents(found.result);
        if (events) out(events);
      } catch (error) {
        failed = true;
        out(
          `  ✗ ${outcome.id}: ${error instanceof Error ? error.message : error}`
        );
      }
    }
  }
  process.exit(failed ? 1 : 0);
}

async function runScript(game: HeadlessGame, file: string): Promise<void> {
  const lines = fs
    .readFileSync(file, "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  const WATCHDOG_MS = 30_000;
  for (let i = 0; i < lines.length; i++) {
    let command: unknown;
    try {
      command = JSON.parse(lines[i]);
    } catch {
      process.stderr.write(`Line ${i + 1}: invalid JSON\n`);
      process.exit(1);
    }

    const response = await Promise.race([
      game.execute(command),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), WATCHDOG_MS)
      ),
    ]);

    if (response === null) {
      process.stderr.write(
        `Line ${i + 1}: stalled (watchdog ${WATCHDOG_MS}ms)\n`
      );
      process.exit(1);
    }
    process.stdout.write(JSON.stringify(response) + "\n");
    if (!response.ok) {
      process.stderr.write(`Line ${i + 1}: rejected — ${response.reason}\n`);
      process.exit(1);
    }
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

    const response = await game.execute(command);
    if (!response.ok) {
      print(`✗ ${response.reason}`);
    } else {
      const events = renderEvents(response);
      if (events) print(events);
      if (response.legalActions) print(safeJsonPretty(response.legalActions));
      if (response.pendingDecision) {
        print(`! decision required: ${safeJson(response.pendingDecision)}`);
      }
      print(renderStatus(response.snapshot));
      print(renderPitch(response.snapshot));
    }
    rl.prompt();
  }
  process.exit(0);
}

function safeJsonPretty(data: unknown): string {
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return "<unserializable>";
  }
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err?.stack ?? err}\n`);
  process.exit(1);
});
