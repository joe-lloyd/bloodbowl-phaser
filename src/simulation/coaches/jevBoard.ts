import { PlayerStatus } from "../../types/Player";
import type {
  PlayerSnapshot,
  TeamSnapshot,
} from "../../headless/serialization";
import type { CoachContext } from "../coach";
import { type Frame, squareAt } from "../../game/rules/frames";
import { ballsFromWire } from "../../game/rules/balls";
import { type Seat, rivalsOf, seatOf } from "../../game/seating";
import type { Square } from "../ai/board";

type PositionedPlayer = PlayerSnapshot & {
  position: NonNullable<PlayerSnapshot["position"]>;
};

const sameSquare = (a: Square, b: Square) => a.x === b.x && a.y === b.y;

function describePlayer(
  player: PositionedPlayer,
  snapshot: CoachContext["snapshot"]
) {
  const balls = ballsFromWire(snapshot).flatMap(({ at }) => (at ? [at] : []));
  return {
    player: `${player.positionName} #${String(player.number)}`,
    square: `(${String(player.position.x)},${String(player.position.y)})`,
    status:
      player.status === PlayerStatus.ACTIVE
        ? "standing"
        : player.status.toLowerCase(),
    has_ball: balls.some((at) => sameSquare(at, player.position)),
    already_acted: snapshot.turn.activatedPlayerIds.includes(player.id),
    MA: player.stats.MA,
    ST: player.stats.ST,
    AG: `${String(player.stats.AG)}+`,
    skills: player.skills,
  };
}

function goalLine(frame: Frame): string {
  const goal = squareAt(frame, frame.arm.length - 1, 0);
  return frame.heading.endsWith("x")
    ? `x = ${String(goal.x)}`
    : `y = ${String(goal.y)}`;
}

function describeTeam(
  team: TeamSnapshot,
  frame: Frame,
  snapshot: CoachContext["snapshot"]
) {
  return {
    name: team.name,
    scores_at: goalLine(frame),
    score: snapshot.score[team.id] ?? 0,
    team_rerolls: team.rerolls,
    players: team.players.flatMap((player) =>
      player.position
        ? [describePlayer({ ...player, position: player.position }, snapshot)]
        : []
    ),
  };
}

const squareName = (at: Square | null) =>
  at ? `(${String(at.x)},${String(at.y)})` : "off the pitch";

export function describeBoard({ game, snapshot, point }: CoachContext) {
  const seating = game.ctx.gameService.getSeating();
  const describe = ({ team: { id }, frame }: Seat) => {
    const team = snapshot.teams.find((candidate) => candidate.id === id);
    if (!team) throw new Error(`The snapshot has no team ${id}.`);
    return describeTeam(team, frame, snapshot);
  };
  const mine = describe(seatOf(seating, point.teamId));
  return {
    coaching: mine.name,
    turn: `${snapshot.turn.isHalf2 ? "second" : "first"} half, turn ${String(snapshot.turn.turnNumber)} of 6`,
    balls: ballsFromWire(snapshot).map(({ at }) => squareName(at)),
    blitz_used_this_turn: snapshot.turn.hasBlitzed,
    pass_used_this_turn: snapshot.turn.hasPassed,
    my_team: mine,
    opponents: rivalsOf(seating, point.teamId).map((seat) => describe(seat)),
  };
}
