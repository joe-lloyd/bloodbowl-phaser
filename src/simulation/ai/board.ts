import { HeadlessGame } from "../../headless/HeadlessGame";
import { type GridPosition } from "../../headless/protocol";
import { GameConfig } from "../../config/GameConfig";
import { isStandableSquare } from "../../game/rules/pitchSquares";
import { type Player, PlayerStatus, hasTackleZone } from "../../types/Player";
import { GameService } from "../../services/GameService";
import { type Weather } from "../../game/rules/weather";
import { teamRerollsLeft } from "../../game/teamRerolls";
import { isLeagueMode } from "../../types/Team";
import { SkillType, hasSkill } from "../../types/Skills";

export type Square = GridPosition;

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

type Ball =
  | { kind: "carried"; at: Square; carrier: FieldPlayer }
  | { kind: "loose"; at: Square }
  | { kind: "none" };

export interface Board {
  gs: GameService;
  us: string;
  them: string;
  ours: FieldPlayer[];
  theirs: FieldPlayer[];

  everyone: FieldPlayer[];
  ball: Ball;
  weather: Weather;

  rerolls: number;

  turnsLeft: number;

  opponentTurnsLeft: number;
  persistentInjuries: boolean;
  half2: boolean;

  lead: number;

  dir: 1 | -1;

  marks: DataView;

  occupant: (FieldPlayer | undefined)[];
}

function ballOn(
  position: Square | null,
  occupant: (FieldPlayer | undefined)[]
): Ball {
  if (!position) return { kind: "none" };
  const at = { ...position };
  const holder = occupant[key(at)];
  return holder?.status === PlayerStatus.ACTIVE
    ? { kind: "carried", at, carrier: holder }
    : { kind: "loose", at };
}

export function readBoard(game: HeadlessGame, us: string): Board {
  const gs = game.ctx.gameService;
  const state = gs.getState();
  const team1 = game.ctx.team1.id;
  const them = us === team1 ? game.ctx.team2.id : team1;
  const playersOnField = (teamId: string) =>
    (gs.getTeam(teamId)?.players ?? []).filter(onField);
  const ours = playersOnField(us);
  const theirs = playersOnField(them);
  const everyone = [...ours, ...theirs];

  const { marks, occupant } = fieldMaps(theirs, everyone);

  const ball = ballOn(state.ballPosition, occupant);

  const turn = state.turn;
  const ourTeam = gs.getTeam(us);
  const ourTurn = turn.teamId === us;
  const score = state.score;
  return {
    gs,
    us,
    them,
    ours,
    theirs,
    everyone,
    ball,
    weather: state.weather,
    rerolls: ourTeam ? teamRerollsLeft(state, ourTeam) : 0,
    turnsLeft: ourTurn
      ? Math.max(0, GameConfig.TURNS_PER_HALF - turn.turnNumber)
      : 0,
    opponentTurnsLeft: Math.max(
      0,
      GameConfig.TURNS_PER_HALF - gs.getTurnNumber(them)
    ),
    persistentInjuries:
      game.ctx.matchStats.progressionEnabled ||
      isLeagueMode(ourTeam?.advancementMode),
    half2: turn.isHalf2,
    lead: (score[us] ?? 0) - (score[them] ?? 0),
    dir: us === team1 ? 1 : -1,
    marks,
    occupant,
  };
}

export function toGoal(board: Board, s: Square, team = board.us): number {
  const dir = team === board.us ? board.dir : -board.dir;
  return dir === 1 ? pitchWidth() - 1 - s.x : s.x;
}

export const standing = (p: Player) => p.status === PlayerStatus.ACTIVE;

export const canCarry = (p: Player) => !hasSkill(p.skills, SkillType.NO_BALL);

export const carrierOf = (board: Board) =>
  board.ball.kind === "carried" ? board.ball.carrier : undefined;

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
    ours: board.ours.map(replace),
    theirs: board.theirs.map(replace),
    everyone: board.everyone.map(replace),
    occupant,
  };
}
