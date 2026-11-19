import { PlayerStatus } from "../../types/Player";
import type {
  PlayerSnapshot,
  TeamSnapshot,
} from "../../headless/serialization";
import type { CoachContext } from "../coach";

type PositionedPlayer = PlayerSnapshot & {
  position: NonNullable<PlayerSnapshot["position"]>;
};

function describePlayer(
  player: PositionedPlayer,
  snapshot: CoachContext["snapshot"]
) {
  const ball = snapshot.ballPosition;
  return {
    player: `${player.positionName} #${String(player.number)}`,
    square: `(${String(player.position.x)},${String(player.position.y)})`,
    status:
      player.status === PlayerStatus.ACTIVE
        ? "standing"
        : player.status.toLowerCase(),
    has_ball: ball?.x === player.position.x && ball.y === player.position.y,
    already_acted: snapshot.turn.activatedPlayerIds.includes(player.id),
    MA: player.stats.MA,
    ST: player.stats.ST,
    AG: `${String(player.stats.AG)}+`,
    skills: player.skills,
  };
}

function describeTeam(
  team: TeamSnapshot,
  index: number,
  snapshot: CoachContext["snapshot"]
) {
  return {
    name: team.name,
    scores_at_x: index === 0 ? 19 : 0,
    score: snapshot.score[team.id] ?? 0,
    team_rerolls: team.rerolls,
    players: team.players.flatMap((player) =>
      player.position
        ? [describePlayer({ ...player, position: player.position }, snapshot)]
        : []
    ),
  };
}

export function describeBoard({ snapshot, point }: CoachContext) {
  const teams = snapshot.teams.map((team, index) => ({
    id: team.id,
    description: describeTeam(team, index, snapshot),
  }));
  const mine = teams.find((team) => team.id === point.teamId);
  const opponent = teams.find((team) => team.id !== point.teamId);
  if (!mine || !opponent) throw new Error("Coach context requires both teams");
  const ball = snapshot.ballPosition;
  return {
    coaching: mine.description.name,
    turn: `${snapshot.turn.isHalf2 ? "second" : "first"} half, turn ${String(snapshot.turn.turnNumber)} of 6`,
    ball: ball ? `(${String(ball.x)},${String(ball.y)})` : "off the pitch",
    blitz_used_this_turn: snapshot.turn.hasBlitzed,
    pass_used_this_turn: snapshot.turn.hasPassed,
    my_team: mine.description,
    opponents: opponent.description,
  };
}
