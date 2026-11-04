/**
 * One read of the engine per decision, in the shape the planner asks
 * questions in. Nothing else in the planner touches GameService.
 */

import { HeadlessGame } from "../../headless/HeadlessGame";
import { GridPosition } from "../../headless/protocol";
import { GameConfig } from "../../config/GameConfig";
import { Player, PlayerStatus, hasTackleZone } from "../../types/Player";
import { GameService } from "../../services/GameService";
import { Weather } from "../../game/rules/weather";

export type Square = GridPosition;

export const WIDTH = GameConfig.PITCH_WIDTH;
export const HEIGHT = GameConfig.PITCH_HEIGHT;

/** On this square a Push goes off the pitch. */
export const edge = ({ x, y }: { x: number; y: number }) =>
  x === 0 || y === 0 || x === WIDTH - 1 || y === HEIGHT - 1;
const TURNS_PER_HALF = 6;

export const key = (s: Square) => s.y * WIDTH + s.x;
export const onPitch = (s: Square) =>
  s.x >= 0 && s.x < WIDTH && s.y >= 0 && s.y < HEIGHT;
export const distance = (a: Square, b: Square) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const same = (a: Square | null | undefined, b: Square | null) =>
  !!a && !!b && a.x === b.x && a.y === b.y;

export function neighbours(s: Square): Square[] {
  const out: Square[] = [];
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++) {
      const n = { x: s.x + dx, y: s.y + dy };
      if ((dx || dy) && onPitch(n)) out.push(n);
    }
  return out;
}

export type Ball =
  | { kind: "carried"; at: Square; carrier: Player }
  | { kind: "loose"; at: Square }
  | { kind: "none" };

export interface Board {
  gs: GameService;
  us: string;
  them: string;
  ours: Player[];
  theirs: Player[];
  /** Everyone on the pitch, both teams. */
  everyone: Player[];
  ball: Ball;
  weather: Weather;
  /** Team re-rolls we have left this half. */
  rerolls: number;
  /** Our turns left in this half after this one; 0 on our last turn. */
  turnsLeft: number;
  half2: boolean;
  /** Our score minus theirs. */
  lead: number;
  /** +1 when we score at the right-hand end (x = 19), -1 at x = 0. */
  dir: 1 | -1;
  /** Opponents with a tackle zone on each square, indexed by `key`. */
  marks: Uint8Array;
  /** Who stands on each square, indexed by `key`. */
  occupant: (Player | undefined)[];
}

export function readBoard(game: HeadlessGame, us: string): Board {
  const gs = game.ctx.gameService;
  const state = gs.getState();
  const team1 = game.ctx.team1.id;
  const them = us === team1 ? game.ctx.team2.id : team1;
  const onField = (teamId: string) =>
    (gs.getTeam(teamId)?.players ?? []).filter((p) => p.gridPosition);
  const ours = onField(us);
  const theirs = onField(them);
  const everyone = [...ours, ...theirs];

  const marks = new Uint8Array(WIDTH * HEIGHT);
  for (const o of theirs) {
    if (!hasTackleZone(o)) continue;
    for (const n of neighbours(o.gridPosition!)) marks[key(n)]++;
  }
  const occupant: (Player | undefined)[] = new Array(WIDTH * HEIGHT);
  for (const p of everyone) occupant[key(p.gridPosition!)] = p;

  const at = state.ballPosition ? { ...state.ballPosition } : null;
  const holder = at ? occupant[key(at)] : undefined;
  const ball: Ball = !at
    ? { kind: "none" }
    : holder && holder.status === PlayerStatus.ACTIVE
      ? { kind: "carried", at, carrier: holder }
      : { kind: "loose", at };

  const turn = state.turn;
  const ourTurn = turn.teamId === us;
  const score = state.score ?? {};
  return {
    gs,
    us,
    them,
    ours,
    theirs,
    everyone,
    ball,
    weather: state.weather,
    rerolls: gs.getTeam(us)?.rerolls ?? 0,
    turnsLeft: ourTurn ? Math.max(0, TURNS_PER_HALF - turn.turnNumber) : 0,
    half2: !!turn.isHalf2,
    lead: (score[us] ?? 0) - (score[them] ?? 0),
    dir: us === team1 ? 1 : -1,
    marks,
    occupant,
  };
}

/** Squares from `s` to the end zone `team` scores in. */
export function toGoal(board: Board, s: Square, team = board.us): number {
  const dir = team === board.us ? board.dir : -board.dir;
  return dir === 1 ? WIDTH - 1 - s.x : s.x;
}

export const standing = (p: Player) => p.status === PlayerStatus.ACTIVE;

export const carrierOf = (board: Board) =>
  board.ball.kind === "carried" ? board.ball.carrier : undefined;
