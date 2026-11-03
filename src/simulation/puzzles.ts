/**
 * Coaching puzzles: one-turn positions with a known right answer, played by
 * a coach over many seeds. Each puzzle is a rules-lab scenario where team1
 * (all Human Linemen, MA 6, ST 3, AG 3, scoring at x = 19) has the turn.
 *
 * The match benchmark says whether a coach wins; the puzzles say why. A
 * coach that scores in games but cannot blitz a lone carrier is lucky, not
 * good.
 */

import { HeadlessGame } from "../headless/HeadlessGame";
import { GameSnapshot } from "../headless/serialization";
import { playSetup } from "../game/rules-lab/factories";
import { GamePhase } from "../types/GameState";
import { PlayerStatus } from "../types/Player";
import { ScenarioSetup } from "../types/Scenario";
import { GameEventNames } from "../types/events";
import { enumerateDecision } from "./candidates";
import { Coach } from "./coach";
import { heuristicCoach } from "./coaches/heuristic";
import { createCoachRng } from "./rng";

export interface PuzzleResult {
  /** team1's touchdowns this turn. */
  scored: boolean;
  turnover: boolean;
  /** The state when team1's turn ended (or when it scored). */
  end: GameSnapshot;
}

export interface Puzzle {
  id: string;
  /** What the right answer is, in a sentence. */
  goal: string;
  setup: ScenarioSetup;
  rerolls: number;
  solved(result: PuzzleResult): boolean;
}

type Square = { x: number; y: number };
const lineman = (playerIndex: number, x: number, y: number) => ({
  playerIndex,
  x,
  y,
});

/** The standing player on `square`, if any, with the side they play for. */
function standingAt(end: GameSnapshot, square: Square) {
  return end.teams
    .flatMap((t, i) =>
      t.players.map((p) => ({
        ...p,
        side: i === 0 ? ("team1" as const) : ("team2" as const),
      }))
    )
    .find(
      (p) =>
        p.status === PlayerStatus.ACTIVE &&
        p.position?.x === square.x &&
        p.position?.y === square.y
    );
}

/** The side whose standing player holds the ball, or null if it is loose. */
function holder(end: GameSnapshot): "team1" | "team2" | null {
  return end.ballPosition
    ? (standingAt(end, end.ballPosition)?.side ?? null)
    : null;
}

export const PUZZLES: readonly Puzzle[] = [
  {
    id: "score-this-turn",
    goal: "Walk the carrier round the marker and score without a dodge.",
    setup: playSetup({
      team1Placements: [
        { ...lineman(0, 14, 5), hasBall: true },
        lineman(1, 10, 5),
        lineman(2, 9, 2),
      ],
      team2Placements: [
        lineman(0, 16, 6),
        lineman(1, 13, 8),
        lineman(2, 18, 9),
      ],
    }),
    rerolls: 1,
    solved: (r) => r.scored,
  },
  {
    id: "blitz-the-carrier",
    goal: "Blitz the lone carrier and knock the ball loose.",
    setup: playSetup({
      team1Placements: [lineman(0, 6, 5), lineman(1, 5, 8), lineman(2, 7, 2)],
      team2Placements: [
        { ...lineman(0, 10, 5), hasBall: true },
        lineman(1, 13, 7),
        lineman(2, 14, 3),
      ],
    }),
    rerolls: 1,
    solved: (r) => holder(r.end) !== "team2",
  },
  {
    id: "cage-up",
    goal: "Put three or four team-mates on the carrier's corners.",
    setup: playSetup({
      team1Placements: [
        { ...lineman(0, 8, 5), hasBall: true },
        lineman(1, 6, 3),
        lineman(2, 6, 7),
        lineman(3, 5, 5),
        lineman(4, 7, 1),
        lineman(5, 7, 9),
      ],
      team2Placements: [
        lineman(0, 15, 2),
        lineman(1, 15, 8),
        lineman(2, 16, 5),
      ],
    }),
    rerolls: 1,
    solved: (r) => {
      if (r.turnover || holder(r.end) !== "team1" || !r.end.ballPosition)
        return false;
      const ball = r.end.ballPosition;
      const corners = [-1, 1].flatMap((dx) =>
        [-1, 1].map((dy) => ({ x: ball.x + dx, y: ball.y + dy }))
      );
      return (
        corners.filter((c) => standingAt(r.end, c)?.side === "team1").length >=
        3
      );
    },
  },
  {
    id: "break-the-cage",
    goal: "Knock the carrier of a four-corner cage down, or take the ball.",
    setup: playSetup({
      team1Placements: [
        lineman(0, 9, 3),
        lineman(1, 9, 7),
        lineman(2, 8, 5),
        lineman(3, 10, 2),
        lineman(4, 10, 8),
        lineman(5, 7, 4),
        lineman(6, 7, 6),
      ],
      team2Placements: [
        { ...lineman(0, 12, 5), hasBall: true },
        lineman(1, 11, 4),
        lineman(2, 11, 6),
        lineman(3, 13, 4),
        lineman(4, 13, 6),
      ],
    }),
    rerolls: 1,
    solved: (r) => holder(r.end) !== "team2",
  },
  {
    id: "stall",
    goal: "On turn 5, keep the ball safe within reach of the end zone and score next turn.",
    setup: playSetup({
      turn: 5,
      team1Placements: [
        { ...lineman(0, 15, 5), hasBall: true },
        lineman(1, 13, 4),
        lineman(2, 13, 6),
      ],
      team2Placements: [lineman(0, 6, 2), lineman(1, 6, 8), lineman(2, 5, 5)],
    }),
    rerolls: 1,
    solved: (r) => {
      if (r.scored || r.turnover || holder(r.end) !== "team1") return false;
      return 19 - (r.end.ballPosition?.x ?? 0) <= 4;
    },
  },
];

/**
 * Play team1's turn of a puzzle with `coach`. Team2 only ever answers
 * decisions (block dice it picks, its own re-rolls), and the heuristic
 * coach answers those.
 */
export async function playPuzzle(
  puzzle: Puzzle,
  coach: Coach,
  seed: number
): Promise<PuzzleResult> {
  const game = new HeadlessGame({
    scenario: {
      id: `puzzle-${puzzle.id}`,
      name: puzzle.id,
      description: puzzle.goal,
      setup: puzzle.setup,
    },
    seed,
  });
  if (puzzle.setup.turn !== undefined)
    game.ctx.gameService.seedTurnCounts(puzzle.setup.turn);
  game.ctx.team1.rerolls = puzzle.rerolls;
  const team1 = game.ctx.team1.id;
  const rng = createCoachRng(seed);
  let scored = false;
  let turnover = false;

  for (let guard = 0; guard < 300; guard++) {
    const snapshot = game.snapshot();
    const pending = game.pendingDecision();
    if (
      scored ||
      snapshot.phase !== GamePhase.PLAY ||
      (!pending && snapshot.activeTeamId !== team1)
    )
      break;
    const point = await enumerateDecision(game, null);
    if (point.candidates.length === 0) break;
    const who = point.teamId === team1 ? coach : heuristicCoach;
    const { index } = await who.choose({ game, snapshot, point, rng });
    const candidate = point.candidates[index] ?? point.candidates[0];
    for (const command of candidate.commands) {
      const response = await game.execute(command);
      for (const event of response.events) {
        const data = event.data as { teamId?: string } | undefined;
        if (event.name === GameEventNames.Touchdown && data?.teamId === team1)
          scored = true;
        if (event.name === GameEventNames.Turnover && data?.teamId === team1)
          turnover = true;
      }
      if (!response.ok) break;
    }
  }
  return { scored, turnover, end: game.snapshot() };
}

/** How often `coach` solves each puzzle over `seeds` seeds from 1. */
export async function solveRates(
  coach: Coach,
  seeds: number
): Promise<{ id: string; goal: string; solved: number; of: number }[]> {
  const out = [];
  for (const puzzle of PUZZLES) {
    let solved = 0;
    for (let seed = 1; seed <= seeds; seed++)
      if (puzzle.solved(await playPuzzle(puzzle, coach, seed))) solved++;
    out.push({ id: puzzle.id, goal: puzzle.goal, solved, of: seeds });
  }
  return out;
}
