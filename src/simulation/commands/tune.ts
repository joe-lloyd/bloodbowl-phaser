import * as fs from "node:fs";
import * as path from "node:path";
import { ChildProcess, fork } from "node:child_process";
import { RosterName } from "../../types/Team";
import { type Coach } from "../coach";
import { heuristicCoach } from "../coaches/heuristic";
import { createPlannerCoach } from "../ai/planner";
import { DEFAULT_WEIGHTS, type Weights, parseWeights } from "../ai/weights";
import { mutate, pointShare, standardsShare } from "../tune";
import { createCoachRng } from "../rng";
import {
  type BenchGame,
  type BenchJob,
  benchJobs,
  playBenchGame,
  rosterReport,
} from "../bench";
import { fail } from "./shared";

export interface TuneOptions {
  generations: number;
  mutants: number;
  games: number;
  confirmGames: number;
  seed: number;
  workers: number;
  rosters: RosterName[];
  out: string;
  from?: string;
  objective: "self-play" | "standards";
}

const STANDARDS_MARGIN = 0.015;

interface TuneJob {
  job: BenchJob;
  candidate: Weights;
  baseline: Weights | "heuristic";
  rerolls: number;
}

export async function tuneWorker(): Promise<number> {
  const coaches = new Map<string, Coach>();
  const coach = (weights: Weights) => {
    const key = JSON.stringify(weights);
    let found = coaches.get(key);
    if (!found) coaches.set(key, (found = createPlannerCoach({ weights })));
    return found;
  };
  await new Promise<void>((resolve) => {
    process.on("message", (message: { work?: TuneJob; done?: true }) => {
      if (!message.work) {
        resolve();
        return;
      }
      const { job, candidate, baseline, rerolls } = message.work;
      const opponent =
        baseline === "heuristic" ? heuristicCoach : coach(baseline);
      playBenchGame(job, coach(candidate), opponent, rerolls).then(
        (game) => process.send!({ game }),
        (error) =>
          process.send!({
            error: error instanceof Error ? error.message : String(error),
          })
      );
    });
    process.send!({ ready: true });
  });
  return 0;
}

export async function runTune(options: TuneOptions): Promise<number> {
  const rng = createCoachRng(options.seed);
  let best: Weights = options.from
    ? parseWeights(JSON.parse(fs.readFileSync(options.from, "utf8")))
    : DEFAULT_WEIGHTS;
  let nextSeed = options.seed * 1000;

  const queue: {
    work: TuneJob;
    done: (game: BenchGame | null) => void;
  }[] = [];
  const idle: ChildProcess[] = [];
  const feed = () => {
    while (idle.length && queue.length) {
      const child = idle.pop()!;
      const next = queue.shift()!;
      running.set(child, next.done);
      child.send({ work: next.work });
    }
  };
  const running = new Map<ChildProcess, (game: BenchGame | null) => void>();
  const children = Array.from({ length: options.workers }, () => {
    const child = fork(process.argv[1] ?? fail("no script to fork"), ["tune-worker"], {
      execArgv: process.execArgv,
    });
    child.on("message", (message: { game?: BenchGame; error?: string }) => {
      running.get(child)?.(message.game ?? null);
      running.delete(child);
      idle.push(child);
      feed();
    });

    child.on("exit", (code) => {
      if (code !== 0) fail(`a tune worker exited with code ${String(code)}`);
    });
    return child;
  });

  const say = (line: string) => process.stdout.write(`${line}\n`);

  const play = async (
    a: Weights,
    b: Weights | "heuristic",
    games: number,
    seed: number
  ) => {
    const pick = createCoachRng(seed);
    let pair = 0;
    const jobs = benchJobs(games / 2, seed, () => [
      b === "heuristic"
        ? (options.rosters[pair++ % options.rosters.length] ?? fail("no rosters"))
        : pick.pick(options.rosters),
      pick.pick(options.rosters),
    ]);
    const broken = new Set<number>();
    const played = await Promise.all(
      jobs.map(
        (job) =>
          new Promise<BenchGame | null>((resolve) => {
            queue.push({
              work: {
                job,
                candidate: a,
                baseline: b,
                rerolls: b === "heuristic" ? 3 : job.seed % 4,
              },
              done(game) {
                if (!game?.completed || game.blockingFindings > 0) {
                  broken.add(job.seed);
                  say(
                    `  left out seed ${String(job.seed)} (side ${String(job.candidateSide)}): ` +
                      (game?.findingKeys[0] ?? "did not finish")
                  );
                  resolve(null);
                  return;
                }
                resolve(game);
              },
            });
            feed();
          })
      )
    );
    return {
      games: played.filter((game): game is BenchGame => game !== null),
      broken,
    };
  };

  const common = (batches: Awaited<ReturnType<typeof play>>[]) => {
    const broken = new Set(batches.flatMap((batch) => [...batch.broken]));
    return batches.map((batch) =>
      batch.games.filter((game) => !broken.has(game.seed))
    );
  };

  fs.mkdirSync(path.dirname(options.out), { recursive: true });

  const saveWeights = (weights: Weights) => {
    const temporary = `${options.out}.${String(process.pid)}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(weights, null, 2));
    fs.renameSync(temporary, options.out);
  };
  const standards = options.objective === "standards";
  for (let generation = 1; generation <= options.generations; generation++) {
    const seed = nextSeed;
    nextSeed += options.games;
    const mutants = Array.from({ length: options.mutants }, () =>
      mutate(best, rng)
    );
    const screened = common(
      await Promise.all(
        mutants.map((m) =>
          play(m, standards ? "heuristic" : best, options.games, seed)
        )
      )
    );
    const shares = screened.map(standards ? standardsShare : pointShare);
    const top = shares.indexOf(Math.max(...shares));
    const topMutant = mutants[top];
    const topShare = shares[top];
    if (topMutant === undefined || topShare === undefined)
      fail("no mutant to confirm");
    let share: number;
    let bar: number;
    let judged = true;
    if (standards) {
      const [mutant = [], current = []] = common(
        await Promise.all(
          [topMutant, best].map((m) =>
            play(m, "heuristic", options.confirmGames, nextSeed)
          )
        )
      );
      share = standardsShare(mutant);
      bar = standardsShare(current) + STANDARDS_MARGIN;

      judged = rosterReport(mutant).length === options.rosters.length;
    } else {
      [share = 0] = common([
        await play(topMutant, best, options.confirmGames, nextSeed),
      ]).map(pointShare);

      bar = 0.5 + 0.75 / Math.sqrt(options.confirmGames);
    }
    nextSeed += options.confirmGames;
    const promoted = judged && share >= bar;
    say(
      `generation ${String(generation)}: best mutant ${topShare.toFixed(3)}, ` +
        `confirmed ${share.toFixed(3)} (needs ${bar.toFixed(3)})` +
        (judged ? "" : ", but not on every roster") +
        (promoted ? ", promoted" : "")
    );
    if (promoted) {
      const changed = (Object.keys(best) as (keyof Weights)[]).filter(
        (name) => best[name] !== topMutant[name]
      );
      say(
        `  ${changed.map((n) => `${n} ${best[n].toFixed(2)} -> ${topMutant[n].toFixed(2)}`).join(", ")}`
      );
      best = topMutant;
      saveWeights(best);
    }
  }
  saveWeights(best);
  children.forEach((child) => child.send({ done: true }));
  say(`Best weights: ${options.out}`);
  return 0;
}
