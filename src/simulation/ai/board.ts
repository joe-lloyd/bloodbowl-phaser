import { HeadlessGame } from "../../headless/HeadlessGame";
import { GameConfig } from "../../config/GameConfig";
import { isStandableSquare } from "../../game/rules/pitchSquares";
import { type Player, PlayerStatus, hasTackleZone } from "../../types/Player";
import { GameService } from "../../services/GameService";
import { type Weather } from "../../game/rules/weather";
import { teamRerollsLeft } from "../../game/teamRerolls";
import { isLeagueMode } from "../../types/Team";
import { SkillType, hasSkill } from "../../types/Skills";
import type { BallId, BallSlot } from "../../game/rules/balls";
import type { Frame } from "../../game/rules/frames";
import { type Seat, rivalsOf, seatOf } from "../../game/seating";
import { PITCH_LAYOUTS, type Square } from "../../game/variants/pitchLayouts";

export type { Square } from "../../game/variants/pitchLayouts";

export type FieldPlayer = Player & { gridPosition: Square };

export function onField(player: Player): player is FieldPlayer {
  return player.gridPosition !== undefined;
}

export const pitchWidth = () => GameConfig.PITCH_WIDTH;
export const pitchHeight = () => GameConfig.PITCH_HEIGHT;
export const middleRow = () => Math.floor(pitchHeight() / 2);

export const key = (s: Square) => s.y * pitchWidth() + s.x;
export const onPitch = (s: Square) => isStandableSquare(s);
export const distance = (a: Square, b: Square) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export function neighbours(s: Square): Square[] {
  const out: Square[] = [];
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++) {
      const n = { x: s.x + dx, y: s.y + dy };
      if ((dx || dy) && onPitch(n)) out.push(n);
    }
  return out;
}

export type BallView =
  | {
      readonly id: BallId;
      readonly kind: "carried";
      readonly at: Square;
      readonly carrier: FieldPlayer;
    }
  | { readonly id: BallId; readonly kind: "loose"; readonly at: Square }
  | { readonly id: BallId; readonly kind: "none" };

type BallViews = readonly [BallView, ...BallView[]];

export interface Board {
  gs: GameService;
  us: string;
  seat: Seat;
  rivals: readonly Seat[];
  ours: FieldPlayer[];
  theirs: FieldPlayer[];

  everyone: FieldPlayer[];
  balls: BallViews;
  weather: Weather;

  rerolls: number;

  turnsLeft: number;

  opponentTurnsLeft: number;
  persistentInjuries: boolean;
  half2: boolean;

  lead: number;

  goalScale: number;

  marks: DataView;

  occupant: (FieldPlayer | undefined)[];
}

const FITTED_GOAL_SCALE = PITCH_LAYOUTS.stadium.cols - 1;
export const POINTS_PER_TOUCHDOWN = 10;

function ballOn(
  { id, at: position }: BallSlot,
  occupant: (FieldPlayer | undefined)[]
): BallView {
  if (!position) return { id, kind: "none" };
  const at = { ...position };
  const holder = occupant[key(at)];
  return holder?.status === PlayerStatus.ACTIVE
    ? { id, kind: "carried", at, carrier: holder }
    : { id, kind: "loose", at };
}

export function mapBalls(
  board: Board,
  change: (ball: BallView) => BallView
): BallViews {
  const [first, ...rest] = board.balls;
  return [change(first), ...rest.map((ball) => change(ball))];
}

export const firstBall = (board: Board): BallView => board.balls[0];

export function focusBall(board: Board, id: BallId): Board {
  const focused = board.balls.find((ball) => ball.id === id);
  if (!focused || focused === board.balls[0]) return board;
  return {
    ...board,
    balls: [focused, ...board.balls.filter((ball) => ball.id !== id)],
  };
}

export const ballFocuses = (board: Board): Board[] =>
  board.balls.map(({ id }) => focusBall(board, id));

export function otherBallKeys(board: Board): ReadonlySet<number> {
  const [, ...others] = board.balls;
  return new Set(
    others.flatMap((ball) => (ball.kind === "loose" ? [key(ball.at)] : []))
  );
}

export function carriedBy(board: Board, player: FieldPlayer): BallView | undefined {
  return board.balls.find(
    (ball) => ball.kind === "carried" && ball.carrier.id === player.id
  );
}

export function looseBallKey(board: Board): number {
  const ball = firstBall(board);
  return ball.kind === "loose" ? key(ball.at) : -1;
}

function turnsLeftOf(gs: GameService, teamId: string): number {
  return Math.max(0, GameConfig.TURNS_PER_HALF - gs.getTurnNumber(teamId));
}

export function readBoard(game: HeadlessGame, us: string): Board {
  const gs = game.ctx.gameService;
  const state = gs.getState();
  const seating = gs.getSeating();
  const seat = seatOf(seating, us);
  const rivals = rivalsOf(seating, us);
  const playersOnField = (teamId: string) =>
    (gs.getTeam(teamId)?.players ?? []).filter(onField);
  const ours = playersOnField(us);
  const theirs = rivals.flatMap(({ team }) => playersOnField(team.id));
  const everyone = [...ours, ...theirs];

  const { marks, occupant } = fieldMaps(theirs, everyone);

  const [firstSlot, ...otherSlots] = state.balls;
  const balls: BallViews = [
    ballOn(firstSlot, occupant),
    ...otherSlots.map((slot) => ballOn(slot, occupant)),
  ];

  const turn = state.turn;
  const ourTeam = gs.getTeam(us);
  const ourTurn = turn.teamId === us;
  const score = state.score;
  return {
    gs,
    us,
    seat,
    rivals,
    ours,
    theirs,
    everyone,
    balls,
    weather: state.weather,
    rerolls: ourTeam ? teamRerollsLeft(state, ourTeam) : 0,
    turnsLeft: ourTurn
      ? Math.max(0, GameConfig.TURNS_PER_HALF - turn.turnNumber)
      : 0,
    opponentTurnsLeft: Math.max(
      ...rivals.map(({ team }) => turnsLeftOf(gs, team.id))
    ),
    persistentInjuries:
      game.ctx.matchStats.progressionEnabled ||
      isLeagueMode(ourTeam?.advancementMode),
    half2: turn.isHalf2,
    lead:
      seating.kind === "pair"
        ? leadOf(score, us, rivals)
        : leadOf(state.points ?? {}, us, rivals) / POINTS_PER_TOUCHDOWN,
    goalScale:
      seating.kind === "pair" ? FITTED_GOAL_SCALE : seat.frame.arm.length - 1,
    marks,
    occupant,
  };
}

function leadOf(tally: Readonly<Record<string, number>>, us: string, rivals: readonly Seat[]): number {
  return (tally[us] ?? 0) - Math.max(...rivals.map(({ team }) => tally[team.id] ?? 0));
}

export function frameOf(board: Board, team: string): Frame {
  if (team === board.us) return board.seat.frame;
  const rival = board.rivals.find((seat) => seat.team.id === team);
  if (!rival) throw new Error(`No team ${team} sits at this match.`);
  return rival.frame;
}

export function stepsToScore(frame: Frame, s: Square): number {
  const last = frame.arm.length - 1;
  switch (frame.heading) {
    case "+x":
      return last - s.x;
    case "-x":
      return s.x;
    case "+y":
      return last - s.y;
    case "-y":
      return s.y;
  }
}

interface Offset {
  along: number;
  across: number;
}

export function stepFrom(frame: Frame, s: Square, by: Offset): Square {
  switch (frame.heading) {
    case "+x":
      return { x: s.x + by.along, y: s.y + by.across };
    case "-x":
      return { x: s.x - by.along, y: s.y + by.across };
    case "+y":
      return { x: s.x + by.across, y: s.y + by.along };
    case "-y":
      return { x: s.x + by.across, y: s.y - by.along };
  }
}

export const pitchCentre = (): Square => ({
  x: (pitchWidth() - 1) / 2,
  y: (pitchHeight() - 1) / 2,
});

const NEAR_EDGE = 2;

function ringOffPitch(at: Square, radius: number): boolean {
  for (let dx = -radius; dx <= radius; dx++)
    for (let dy = -radius; dy <= radius; dy++) {
      const edge = Math.abs(dx) === radius || Math.abs(dy) === radius;
      if (edge && !onPitch({ x: at.x + dx, y: at.y + dy })) return true;
    }
  return false;
}

export function sidelineGap(board: Board, at: Square): number {
  if (board.rivals.length === 1) return Math.min(at.y, pitchHeight() - 1 - at.y);
  for (let gap = 0; gap < NEAR_EDGE; gap++) if (ringOffPitch(at, gap + 1)) return gap;
  return NEAR_EDGE;
}

export function acrossGap(board: Board, a: Square, b: Square): number {
  const { heading } = board.seat.frame;
  const axis = heading === "+x" || heading === "-x" ? "y" : "x";
  return Math.abs(a[axis] - b[axis]);
}

export const forwardOf = (board: Board, s: Square, by: Offset): Square =>
  stepFrom(board.seat.frame, s, by);

export function toGoal(board: Board, s: Square, team = board.us): number {
  return stepsToScore(frameOf(board, team), s);
}

export const standing = (p: Player) => p.status === PlayerStatus.ACTIVE;

export const canCarry = (p: Player) => !hasSkill(p.skills, SkillType.NO_BALL);

export function carrierOf(board: Board): FieldPlayer | undefined {
  const ball = firstBall(board);
  return ball.kind === "carried" ? ball.carrier : undefined;
}

function fieldMaps(theirs: FieldPlayer[], everyone: FieldPlayer[]) {
  const marks = new DataView(new ArrayBuffer(pitchWidth() * pitchHeight()));
  for (const o of theirs) {
    if (!hasTackleZone(o)) continue;
    for (const n of neighbours(o.gridPosition))
      marks.setUint8(key(n), marks.getUint8(key(n)) + 1);
  }
  const occupant: (FieldPlayer | undefined)[] = Array.from(
    { length: pitchWidth() * pitchHeight() },
    () => undefined
  );
  for (const p of everyone) occupant[key(p.gridPosition)] = p;

  return { marks, occupant };
}

export interface BoardMove {
  player: FieldPlayer;
  at: Square;
}

export function projectBoard(board: Board, moves: readonly BoardMove[]): Board {
  const occupant = [...board.occupant];
  const moved = new Map<string, FieldPlayer>();
  for (const { player } of moves)
    occupant[key(player.gridPosition)] = undefined;
  for (const { player, at } of moves) {
    const next = { ...player, gridPosition: at };
    moved.set(player.id, next);
    occupant[key(at)] = next;
  }
  const replace = (p: FieldPlayer) => moved.get(p.id) ?? p;
  return {
    ...board,
    ours: board.ours.map((element) => replace(element)),
    theirs: board.theirs.map((element) => replace(element)),
    everyone: board.everyone.map((element) => replace(element)),
    occupant,
  };
}
