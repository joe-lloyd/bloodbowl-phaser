/**
 * `pnpm sim`: a batch of matches between two coaches, with a summary and a
 * recording of every match that broke something.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { RosterName } from "../../types/Team";
import { Coach } from "../coach";
import { JevStats } from "../coaches/jev";
import { Finding, FindingKind, MatchRecording, runMatch } from "../runMatch";
import { createCoachRng } from "../rng";
import { buildMatchDump, renderIndexHtml, renderMatchHtml } from "../viewer";
import { CoachName, makeCoach } from "./shared";

const BLOCKING: ReadonlySet<FindingKind> = new Set([
  "invariant",
  "engine-error",
  "no-candidates",
  "budget-exhausted",
]);

export interface RunOptions {
  games: number;
  seed: number;
  rosters: RosterName[];
  home: CoachName;
  away: CoachName;
  maxCommands?: number;
  out: string;
  record: "all" | "failures" | "none";
  concurrency: number;
  strict: boolean;
  /** Write a playback page next to every recording, plus an index. */
  html: boolean;
}

interface MatchSummary {
  file: string | null;
  seed: number;
  rosters: [string, string];
  score: [number, number];
  phase: string;
  commands: number;
  ms: number;
  findings: number;
}

export async function runBatch(options: RunOptions): Promise<number> {
  fs.mkdirSync(options.out, { recursive: true });
  const jevStats: JevStats[] = [];
  const coaches: [Coach, Coach] = [
    makeCoach(options.home, jevStats),
    makeCoach(options.away, jevStats),
  ];
  const pairing = createCoachRng(options.seed);
  const plan = Array.from({ length: options.games }, (_, i) => ({
    seed: options.seed + i,
    rosters: [pairing.pick(options.rosters), pairing.pick(options.rosters)] as [
      RosterName,
      RosterName,
    ],
  }));

  const matches: MatchSummary[] = [];
  const findings: (Finding & { file: string | null; seed: number })[] = [];
  const commandCounts: Record<string, number> = {};
  let next = 0;
  let done = 0;
  const started = Date.now();

  const worker = async () => {
    while (next < plan.length) {
      const { seed, rosters } = plan[next++];
      const t0 = Date.now();
      let recording: MatchRecording;
      try {
        recording = await runMatch({
          seed,
          rosters,
          coaches,
          maxCommands: options.maxCommands,
        });
      } catch (error) {
        findings.push(runnerThrew(error, seed));
        done++;
        continue;
      }
      const ms = Date.now() - t0;
      const file = await keepRecording(options, seed, rosters, recording);
      countCommands(commandCounts, recording);
      for (const finding of recording.findings)
        findings.push({ ...finding, file, seed });
      matches.push({
        file,
        seed,
        rosters,
        score: recording.final.score,
        phase: recording.final.phase,
        commands: recording.steps.length,
        ms,
        findings: recording.findings.length,
      });
      done++;
      process.stderr.write(
        `\r${done}/${plan.length} matches, ${findings.length} findings, ${((Date.now() - started) / 1000).toFixed(0)}s`
      );
    }
  };
  await Promise.all(Array.from({ length: options.concurrency }, worker));
  process.stderr.write("\n");

  const groups = new Map<
    string,
    {
      kind: FindingKind;
      count: number;
      matches: Set<number>;
      example: (typeof findings)[number];
    }
  >();
  for (const finding of findings) {
    const group = groups.get(finding.key) ?? {
      kind: finding.kind,
      count: 0,
      matches: new Set(),
      example: finding,
    };
    group.count++;
    group.matches.add(finding.seed);
    groups.set(finding.key, group);
  }
  const grouped = [...groups.entries()]
    .map(([key, g]) => ({
      key,
      kind: g.kind,
      blocking: BLOCKING.has(g.kind),
      count: g.count,
      matches: g.matches.size,
      example: {
        file: g.example.file,
        step: g.example.step,
        phase: g.example.phase,
        turn: g.example.turn,
        message: g.example.message,
      },
    }))
    .sort(
      (a, b) => Number(b.blocking) - Number(a.blocking) || b.matches - a.matches
    );

  const completed = matches.filter((m) => m.phase === "GAME_OVER").length;
  const touchdowns = matches.reduce(
    (sum, m) => sum + m.score[0] + m.score[1],
    0
  );
  const summary = {
    options: { ...options, rosters: options.rosters.length },
    matches: matches.length,
    completed,
    touchdowns,
    averageCommands: Math.round(
      matches.reduce((s, m) => s + m.commands, 0) / Math.max(1, matches.length)
    ),
    averageMs: Math.round(
      matches.reduce((s, m) => s + m.ms, 0) / Math.max(1, matches.length)
    ),
    commandCoverage: commandCounts,
    jev: jevStats.length ? jevStats : undefined,
    findings: grouped,
    perMatch: matches.sort((a, b) => a.seed - b.seed),
  };
  if (options.html) {
    fs.writeFileSync(
      path.join(options.out, "index.html"),
      renderIndexHtml({
        title: `Simulation: ${options.home} vs ${options.away}, ${options.games} matches from seed ${options.seed}`,
        coaches: [options.home, options.away],
        matches: matches.flatMap((m) =>
          m.file
            ? [
                {
                  ...m,
                  page: path.basename(m.file).replace(/\.json$/, ".html"),
                },
              ]
            : []
        ),
        commandCoverage: commandCounts,
        findings: grouped,
      })
    );
  }
  fs.writeFileSync(
    path.join(options.out, "summary.json"),
    JSON.stringify(summary, null, 2)
  );
  printSummary(summary, grouped, options);

  const blocking = grouped.some(
    (g) => g.blocking || (options.strict && g.kind === "rejected-candidate")
  );
  return blocking ? 1 : 0;
}

/** The runner itself threw: report it like any other finding. */
function runnerThrew(
  error: unknown,
  seed: number
): Finding & { file: null; seed: number } {
  return {
    kind: "engine-error",
    key: "engine-error:runner-threw",
    message:
      error instanceof Error ? (error.stack ?? error.message) : String(error),
    step: -1,
    phase: "?",
    turn: "?",
    file: null,
    seed,
  };
}

/** Write the recording, and its playback page, if the run keeps it. */
async function keepRecording(
  options: RunOptions,
  seed: number,
  rosters: [RosterName, RosterName],
  recording: MatchRecording
): Promise<string | null> {
  const keep =
    options.record === "all" ||
    (options.record === "failures" && recording.findings.length > 0);
  if (!keep) return null;
  const file = path.join(
    options.out,
    `${seed}-${slug(rosters[0])}-vs-${slug(rosters[1])}.json`
  );
  fs.writeFileSync(file, JSON.stringify(recording));
  if (options.html) {
    fs.writeFileSync(
      file.replace(/\.json$/, ".html"),
      renderMatchHtml(await buildMatchDump(recording))
    );
  }
  return file;
}

function countCommands(
  counts: Record<string, number>,
  recording: MatchRecording
): void {
  for (const step of recording.steps) {
    if (step.ok)
      counts[step.command.type] = (counts[step.command.type] ?? 0) + 1;
  }
}

function printSummary(
  summary: {
    matches: number;
    completed: number;
    touchdowns: number;
    averageCommands: number;
    averageMs: number;
    commandCoverage: Record<string, number>;
    jev?: JevStats[];
  },
  grouped: {
    key: string;
    blocking: boolean;
    count: number;
    matches: number;
    example: { file: string | null; step: number; message: string };
  }[],
  options: RunOptions
): void {
  const lines = [
    `${summary.completed}/${summary.matches} matches reached full time, ${summary.touchdowns} touchdowns, ` +
      `${summary.averageCommands} commands and ${summary.averageMs} ms per match on average.`,
    `Commands exercised: ${Object.entries(summary.commandCoverage)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${v}`)
      .join(", ")}`,
  ];
  for (const stats of summary.jev ?? []) {
    lines.push(
      `Jev: ${stats.calls} calls, ${stats.failures} failed, ${stats.calls ? Math.round(stats.totalMs / stats.calls) : 0} ms average, ` +
        `${stats.inputTokens} input and ${stats.outputTokens} output tokens.`
    );
  }
  lines.push(
    "",
    grouped.length ? "Findings (blocking first):" : "No findings."
  );
  for (const g of grouped) {
    lines.push(
      `  ${g.blocking ? "FAIL" : "warn"} ${g.key}: ${g.count}x in ${g.matches} matches`
    );
    lines.push(`       ${g.example.message}`);
    if (g.example.file)
      lines.push(
        `       pnpm sim:replay ${g.example.file} --step ${g.example.step}`
      );
  }
  lines.push("", `Summary: ${path.join(options.out, "summary.json")}`);
  process.stdout.write(`${lines.join("\n")}\n`);
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z]+/g, "-");
