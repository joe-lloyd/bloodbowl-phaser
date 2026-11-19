import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { GameEventNames } from "../../../src/types/events";
import { openTrace } from "../catalogue-study/replay";
import { annotateRun, isEntry } from "./lab";

interface Score {
  side: 0 | 1;
  half: 1 | 2;
  turn: number;
  step: number;
}

export interface Drama {
  game: string;
  rosters: [string, string];
  candidateSide: number;
  final: [number, number];
  scores: Score[];
  leadChanges: number;

  comeback: boolean;

  lateScores: number;

  lastGasp: boolean;
  casualties: number;
  throws: number;

  drama: number;
}

async function dramaOfTrace(file: string, id: string, side: number) {
  const { recording, game } = openTrace(file);
  const sides = new Map([
    [game.ctx.team1.id, 0 as const],
    [game.ctx.team2.id, 1 as const],
  ]);
  const scores: Score[] = [];
  let casualties = 0;
  let step = 0;
  game.ctx.eventBus.on(GameEventNames.Touchdown, ({ teamId }) => {
    const turn = game.ctx.gameService.getState().turn;
    scores.push({
      side: sides.get(teamId)!,
      half: turn.isHalf2 ? 2 : 1,
      turn: turn.turnNumber,
      step,
    });
  });
  game.ctx.eventBus.on(GameEventNames.PlayerCasualtyInflicted, () => {
    casualties++;
  });
  let throws = 0;
  for (const [index, s] of recording.steps.entries()) {
    step = index;
    if (s.command.type === "throw-teammate") throws++;
    await game.execute(s.command);
  }
  return {
    game: id,
    rosters: [game.ctx.team1.rosterName, game.ctx.team2.rosterName],
    candidateSide: side,
    scores,
    casualties,
    throws,
    ...closeness(scores, casualties, throws),
  } satisfies Drama;
}

const leaderOf = (t: [number, number]) =>
  t[0] === t[1] ? -1 : t[0] > t[1] ? 0 : 1;

function leads(scores: Score[]) {
  const final: [number, number] = [0, 0];
  let leader = -1;
  let leadChanges = 0;
  const trailed: [boolean, boolean] = [false, false];
  for (const s of scores) {
    final[s.side]++;
    const now = leaderOf(final);
    if (now === -1) continue;
    if (leader !== -1 && now !== leader) leadChanges++;
    trailed[now === 0 ? 1 : 0] = true;
    leader = now;
  }
  return { final, leadChanges, trailed };
}

function closeness(scores: Score[], casualties: number, throws: number) {
  const { final, leadChanges, trailed } = leads(scores);
  const margin = Math.abs(final[0] - final[1]);
  const winner = leaderOf(final);
  const last = scores.at(-1);
  const lastGasp = last?.half === 2 && last.turn === 6 && margin <= 1;
  const comeback = winner !== -1 && trailed[winner];
  const lateScores = scores.filter((s) => s.turn >= 5).length;
  const closeFinish = margin === 0 ? 3 : margin === 1 ? 2 : 0;
  const drama =
    closeFinish +
    leadChanges * 3 +
    (comeback ? 3 : 0) +
    (lastGasp ? 4 : 0) +
    lateScores +
    Math.min(scores.length, 6) * 0.5 +
    Math.min(casualties, 6) * 0.3 +
    throws;
  return { final, leadChanges, comeback, lateScores, lastGasp, drama };
}

async function main() {
  const lab = await annotateRun({
    entry: fileURLToPath(import.meta.url),
    folder: "drama",
    workers: 10,
    annotate: (file, job) => dramaOfTrace(file, job.id, job.candidateSide),
  });
  if (!lab) return;
  const { run, out } = lab;
  const rows = readdirSync(out)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(out, f), "utf8")) as Drama)
    .sort((a, b) => b.drama - a.drama || a.game.localeCompare(b.game));
  writeFileSync(join(run, "drama.json"), JSON.stringify(rows));
  console.log(JSON.stringify(rows.slice(0, 5)));
}
if (isEntry(import.meta.url)) await main();
