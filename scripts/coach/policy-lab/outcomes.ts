import { readFileSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { HeadlessGame } from "../../../src/headless/HeadlessGame";
import type { MatchSave } from "../../../src/headless/serialization";
import { snapshotHash } from "../../../src/simulation/runMatch";
import type { MatchRecording } from "../../../src/simulation/runMatch";
import { GameEventNames } from "../../../src/types/events";
import { processPool } from "../policy-study/pool";
import type { PolicyJob } from "../policy-study/schedule";

const empty = () => ({
  passes: 0,
  completions: 0,
  receiverTouchdowns: 0,
  lateTouchdowns: 0,
  lateLongRuns: 0,
});
type Outcomes = ReturnType<typeof empty>;
const eventId = (data: unknown, key: string): string | undefined => {
  if (!data || typeof data !== "object" || !(key in data)) return undefined;
  const value = Reflect.get(data, key);
  return typeof value === "string" ? value : undefined;
};

type Step = MatchRecording["steps"][number];
interface TurnContext {
  turn: string;
  late: boolean;
}
function outcomeTracker(game: HeadlessGame) {
  const totals: [Outcomes, Outcomes] = [empty(), empty()];
  const sides = new Map<string, 0 | 1>([
    [game.ctx.team1.id, 0],
    [game.ctx.team2.id, 1],
  ]);
  const starts = new Map<
    string,
    { turn: string; at: { x: number; y: number }; carrying: boolean }
  >();
  const moves = new Map<string, { x: number; y: number }>();
  const catches = new Map<string, string>();
  const throws = new Map<string, string>();
  const contextNow = (): TurnContext => {
    const state = game.ctx.gameService.getState();
    return {
      turn: `${String(state.turn.isHalf2)}/${String(state.turn.turnNumber)}/${String(state.activeTeamId)}`,
      late: state.turn.turnNumber >= 5,
    };
  };
  function transfer(step: Step, context: TurnContext) {
    if (step.ok && step.command.type === "pass") {
      totals[step.team].passes++;
      throws.set(step.command.playerId, context.turn);
    }
    if (step.ok && step.command.type === "handoff")
      throws.delete(step.command.playerId);
  }
  function before(step: Step): void {
    const state = game.ctx.gameService.getState();
    const context = contextNow();
    const { turn } = context;
    const command = step.command;
    if (command.type === "declare-action") {
      const player = game.ctx.gameService.getPlayerById(command.playerId);
      if (player?.gridPosition)
        starts.set(player.id, {
          turn,
          at: { ...player.gridPosition },
          carrying:
            state.ballPosition?.x === player.gridPosition.x &&
            state.ballPosition?.y === player.gridPosition.y,
        });
    }
    transfer(step, context);
  }
  function completion(data: unknown, context: TurnContext) {
    const passerId = eventId(data, "playerId") ?? "";

    if (throws.get(passerId) !== context.turn) return;
    const catcher = eventId(data, "catcherId");
    const passer = game.ctx.gameService.getPlayerById(passerId);
    const side = sides.get(passer?.teamId ?? "");
    if (catcher && side !== undefined) {
      catches.set(catcher, context.turn);
      totals[side].completions++;
    }
  }
  function touchdown(data: unknown, context: TurnContext) {
    const side = sides.get(eventId(data, "teamId") ?? "");
    if (side === undefined) throw new Error("Unknown scoring team");
    const scorer = eventId(data, "scorerId");
    if (!scorer) return;
    if (catches.get(scorer) === context.turn) totals[side].receiverTouchdowns++;
    if (context.late) totals[side].lateTouchdowns++;
    const start = starts.get(scorer),
      end = moves.get(scorer);
    if (
      context.late &&
      start?.turn === context.turn &&
      start.carrying &&
      end &&
      Math.abs(end.x - start.at.x) >= 6
    )
      totals[side].lateLongRuns++;
  }
  game.ctx.eventBus.on(GameEventNames.PlayerMoved, ({ playerId, to }) =>
    moves.set(playerId, to)
  );
  game.ctx.eventBus.on(GameEventNames.PassCompleted, (data) => {
    completion(data, contextNow());
  });
  game.ctx.eventBus.on(GameEventNames.Touchdown, (data) => {
    touchdown(data, contextNow());
  });
  return { totals, before };
}

export async function annotateTrace(file: string) {
  const trace = JSON.parse(gunzipSync(readFileSync(file)).toString()) as {
    initial: MatchSave;
    recording: MatchRecording;
  };
  const game = new HeadlessGame({ matchSave: trace.initial });
  const tracker = outcomeTracker(game);
  for (const [index, step] of trace.recording.steps.entries()) {
    tracker.before(step);
    const response = await game.execute(step.command);
    if (response.ok !== step.ok)
      throw new Error(`Replay diverged at ${String(index)}`);
  }
  const hash = snapshotHash(game.snapshot());
  if (hash !== trace.recording.final.hash)
    throw new Error("Outcome replay final hash differs");
  return { totals: tracker.totals, hash };
}

function argument(index: number): string {
  const value = process.argv[index];
  if (value === undefined)
    throw new Error(`Missing argument ${String(index - 1)}`);
  return value;
}

async function main() {
  const entry = fileURLToPath(import.meta.url);
  const run = resolve(argument(2));
  const out = join(run, "outcomes");
  mkdirSync(out, { recursive: true });
  if (process.argv.includes("--worker")) {
    process.on("message", async (job: PolicyJob | null) => {
      if (!job) {
        process.disconnect();
        return;
      }
      try {
        const result = await annotateTrace(
          join(run, "traces", job.id + ".json.gz")
        );
        writeFileSync(
          join(out, job.id + ".json"),
          JSON.stringify({
            id: job.id,
            candidateSide: job.candidateSide,
            ...result,
          })
        );
        process.send?.({ done: job.id });
      } catch (error) {
        process.send?.({ error: `${job.id}: ${String(error)}` });
      }
    });
    process.send?.({ ready: true });
    return;
  }
  const manifest = JSON.parse(
    readFileSync(join(run, "manifest.json"), "utf8")
  ) as { jobs: PolicyJob[]; revision: string };
  await processPool(entry, [run], manifest.jobs, 8);
  const summary = { candidate: empty(), frozen: empty() };
  const files = readdirSync(out).filter((name) => name.endsWith(".json"));
  if (files.length !== manifest.jobs.length)
    throw new Error("Incomplete or foreign outcome files");
  for (const file of files) {
    const result = JSON.parse(readFileSync(join(out, file), "utf8")) as {
      candidateSide: number;
      totals: [Outcomes, Outcomes];
    };
    for (const side of [0, 1] as const) {
      const own =
        side === result.candidateSide ? summary.candidate : summary.frozen;
      for (const key of Object.keys(own) as (keyof Outcomes)[])
        own[key] += result.totals[side][key];
    }
  }
  const receipt = {
    revision: manifest.revision,
    analyzerSha256: createHash("sha256")
      .update(readFileSync(entry))
      .digest("hex"),
    games: files.length,
    verified: true,
    summary,
    scope:
      "A receiver touchdown means that catcher scored in the same team turn as a completed pass. A long scoring run carried the ball at activation start and gained at least six columns in a turn-five/six scoring activation. This is sequence attribution, not a counterfactual skill-value estimate.",
  };
  writeFileSync(
    join(run, "outcome-summary.json"),
    JSON.stringify(receipt, null, 2)
  );
  console.log(JSON.stringify(receipt));
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
