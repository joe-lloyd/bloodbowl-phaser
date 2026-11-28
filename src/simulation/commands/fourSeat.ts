import * as fs from "node:fs";
import path from "node:path";
import { RosterName } from "../../types/Team";
import { scoringCoach } from "../coaches/scoring";
import { type FourRosters, type FourSeatRun, runFourSeatMatch } from "../fourSeat";
import { createCoachRng } from "../rng";
import { BLOCKING } from "./run";

export interface FourSeatOptions {
  games: number;
  seed: number;
  out: string;
}

const ROSTERS = Object.values(RosterName);

export function rostersFor(seed: number): FourRosters {
  const at = (seat: number) => ROSTERS[(seed * 4 + seat) % ROSTERS.length] ?? RosterName.HUMAN;
  return [at(0), at(1), at(2), at(3)];
}

const saveStep = (seed: number) => createCoachRng(seed ^ 0x5a_5e).int(400);

const blocking = (run: FourSeatRun) =>
  run.findings.filter((finding) => BLOCKING.has(finding.kind));

function line(run: FourSeatRun): string {
  const resumed = run.resume ? `save@${String(run.resume.step)} ${run.resume.hash === run.resume.resumedHash ? "same" : "DIFFERS"}` : "no save";
  const refused = run.findings.length - blocking(run).length;
  const replayed = run.replayHash === run.final.hash ? "replay same" : "replay DIFFERS";
  return `seed ${String(run.seed)}: ${run.final.phase} after ${String(run.steps)} commands, points ${run.points.join("/")}, places ${run.places.join("/")}, touchdowns ${run.touchdowns.join("/")}, ${resumed}, ${replayed}, ${String(blocking(run).length)} blocking findings, ${String(refused)} refused candidates`;
}

export async function runFourSeat(options: FourSeatOptions): Promise<number> {
  const runs: FourSeatRun[] = [];
  for (let i = 0; i < options.games; i++) {
    const seed = options.seed + i;
    const run = await runFourSeatMatch({
      seed,
      rosters: rostersFor(seed),
      coaches: [scoringCoach, scoringCoach, scoringCoach, scoringCoach],
      saveAt: saveStep(seed),
    });
    runs.push(run);
    process.stdout.write(`${line(run)}\n`);
  }
  fs.mkdirSync(path.dirname(options.out), { recursive: true });
  fs.writeFileSync(options.out, `${JSON.stringify(runs, null, 2)}\n`);
  const failed = runs.filter((run) => blocking(run).length > 0 || !run.resume);
  const perSeat = (count: (run: FourSeatRun, seat: number) => number) =>
    [0, 1, 2, 3].map((seat) => runs.reduce((sum, run) => sum + count(run, seat), 0)).join(" / ");
  process.stdout.write(`Touchdowns per seat (N/E/S/W): ${perSeat((run, seat) => run.touchdowns[seat] ?? 0)}.\n`);
  process.stdout.write(`Points per seat (N/E/S/W): ${perSeat((run, seat) => run.points[seat] ?? 0)}.\n`);
  process.stdout.write(`First places per seat (N/E/S/W): ${perSeat((run, seat) => (run.places[seat] === 1 ? 1 : 0))}.\n`);
  process.stdout.write(
    `${String(runs.length - failed.length)} of ${String(runs.length)} four-seat matches reached full time with no blocking findings, resumed to the same hash and replayed to the same hash.\n`
  );
  return failed.length === 0 ? 0 : 1;
}
