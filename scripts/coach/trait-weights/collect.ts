import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { HeadlessGame } from "../../../src/headless/HeadlessGame";
import { stabilizeIds } from "../../../src/headless/createHeadlessGame";
import { GamePhase } from "../../../src/types/GameState";
import { type Coach } from "../../../src/simulation/coach";
import { runMatch } from "../../../src/simulation/runMatch";
import { type CoachRng, createCoachRng } from "../../../src/simulation/rng";
import { createPlannerCoach } from "../../../src/simulation/ai/planner";
import { matchTraits } from "./traits";
import { shiftWeights, SHIFTED } from "./weightShift";
import { readGameType } from "../../../src/game/variants/gameTypes";
import { gameTypeRules } from "../../../src/game/variants/gameTypeRules";
import { labInventory } from "../policy-lab/teams";

const [out = "", from = "0", count = "1", type = "sevens"] =
  process.argv.slice(2);
const file = path.resolve(out);
mkdirSync(path.dirname(file), { recursive: true });
const SPREAD = 0.4;
const gameType = readGameType(type);
const { venues } = gameTypeRules(gameType);
const variants = labInventory(gameType);

function gauss(rng: CoachRng): number {
  return (
    Math.sqrt(-2 * Math.log(1 - rng.next())) *
    Math.cos(2 * Math.PI * rng.next())
  );
}

interface Drive {
  side: 0 | 1;
  kicking: boolean;
  formation: string;
  before: [number, number];
}

interface Exploring {
  shifts: Record<string, number>;
  side: 0 | 1;
  rng: CoachRng;
  drives: Drive[];
}

function explorer({ shifts, side, rng, drives }: Exploring): Coach {
  const planner = createPlannerCoach({
    weights: shiftWeights(shifts),
    rosters: {},
  });
  return {
    name: "explorer",
    async choose(context) {
      const { point, game } = context;
      const setups = point.candidates.filter((c) => c.kind === "setup");
      if (point.phase !== GamePhase.SETUP || setups.length < 2)
        return planner.choose(context);
      const pick = rng.pick(setups);
      const state = game.ctx.gameService.getState();
      drives.push({
        side,
        kicking: state.setup?.kickingTeamId === point.teamId,
        formation: pick.label,
        before: scoreOf(game),
      });
      return { index: point.candidates.indexOf(pick) };
    },
  };
}

function scoreOf(game: HeadlessGame): [number, number] {
  const { score } = game.ctx.gameService.getState();
  return [score[game.ctx.teams[0].id] ?? 0, score[game.ctx.teams[1].id] ?? 0];
}

function driveResults(drives: Drive[], final: [number, number]) {
  return drives.map((drive, index) => {
    const next = drives.slice(index + 1).find((d) => d.side === drive.side);
    const after = next?.before ?? final;
    const gain = after[drive.side] - drive.before[drive.side];
    const other = drive.side === 0 ? 1 : 0;
    return {
      side: drive.side,
      kicking: drive.kicking,
      formation: drive.formation,
      result: gain - (after[other] - drive.before[other]),
    };
  });
}

for (let i = Number(from); i < Number(from) + Number(count); i++) {
  const rng = createCoachRng(70_000_000 + (i >> 1));
  const sides = [rng.pick(variants), rng.pick(variants)];
  const noise = sides.map(() => SHIFTED.map(() => SPREAD * gauss(rng)));
  const sign = i % 2 ? -1 : 1;
  const firstKicks = rng.next() < 0.5;
  const seed = 70_000_000 + i;
  const teams = sides.map((v, s) =>
    stabilizeIds(structuredClone(v.team), `team${String(s + 1)}`)
  );
  const [team1, team2] = teams;
  if (!team1 || !team2) throw new Error("No teams");
  const game = new HeadlessGame({
    seed,
    teams: [team1, team2],
    startingPhase: GamePhase.SETUP,
    progressionEnabled: false,
    format: {
      gameType,
      venue: venues[(i >> 1) % venues.length] ?? venues[0],
    },
  });
  const traits = [matchTraits(team1, team2), matchTraits(team2, team1)];
  const drives: Drive[] = [];
  const coach = (s: 0 | 1) =>
    explorer({
      shifts: Object.fromEntries(
        SHIFTED.map((name, n) => [name, sign * (noise[s]?.[n] ?? 0)])
      ),
      side: s,
      rng: createCoachRng(seed * 2 + s),
      drives,
    });
  const recording = await runMatch({
    seed,
    rosters: [team1.rosterName, team2.rosterName],
    coaches: [coach(0), coach(1)],
    game,
    inducements: false,
    kickingTeamId: firstKicks ? team1.id : team2.id,
  });
  const score = recording.final.score;
  appendFileSync(
    file,
    JSON.stringify({
      i,
      sign,
      rosters: recording.rosters,
      score,
      traits,
      noise: noise.map((side) => side.map((n) => Number(n.toFixed(4)))),
      drives: driveResults(drives, score),
      findings: recording.findings.length,
    }) + "\n"
  );
}
