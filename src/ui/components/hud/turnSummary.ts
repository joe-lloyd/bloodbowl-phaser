import { GameConfig } from "../../../config/GameConfig";
import { InjuryType, Player, PlayerStatus } from "../../../types/Player";
import { Team } from "../../../types/Team";

export type TurnIncident =
  | { kind: "player"; playerId: string }
  | { kind: "ball" };

export interface TurnSummary {
  players: string[];
  /** Where the ball is now; null when it is not on the pitch. */
  ball: string | null;
}

export function playerLabel(player: Player): string {
  return `${player.playerName.replace(/ #\d+$/, "")} #${player.number}`;
}

/** Only current match casualties belong here, not old permanent injuries. */
export function injuryLabel(player: Player): string | null {
  if (player.status === PlayerStatus.DEAD) return "Dead";
  if (player.status !== PlayerStatus.INJURED) return null;
  if (player.injuries.includes(InjuryType.MISS_NEXT_GAME))
    return "Seriously hurt";
  if (player.injuries.includes(InjuryType.BADLY_HURT)) return "Badly hurt";
  return "Casualty";
}

function statusLabel(player: Player): string {
  switch (player.status) {
    case PlayerStatus.PRONE:
      return "Knocked down";
    case PlayerStatus.STUNNED:
      return "Stunned";
    case PlayerStatus.KO:
      return "Knocked out";
    case PlayerStatus.INJURED:
      return injuryLabel(player) ?? "Casualty";
    case PlayerStatus.DEAD:
      return "Dead";
    case PlayerStatus.REMOVED:
      return "Sent off";
    case PlayerStatus.RESERVE:
      return "Back in reserves";
    case PlayerStatus.ACTIVE:
      return "Knocked down, back on their feet";
  }
}

export function describeBall(
  players: readonly Player[],
  position: { x: number; y: number } | null
): string | null {
  if (!position) return null;
  const carrier = players.find(
    (p) =>
      p.status === PlayerStatus.ACTIVE &&
      p.gridPosition?.x === position.x &&
      p.gridPosition.y === position.y
  );
  if (carrier) return `Ball held by ${playerLabel(carrier)}`;
  const { x, y } = position;
  const location =
    y <= 1
      ? "near the top sideline"
      : y >= GameConfig.PITCH_HEIGHT - 2
        ? "near the bottom sideline"
        : x <= 1
          ? "near the left end zone"
          : x >= GameConfig.PITCH_WIDTH - 2
            ? "near the right end zone"
            : "in midfield";
  return `Ball loose ${location} at ${x},${y}`;
}

/** Reads final player state after the opponent's entire resolution has settled. */
export function summarizeTurn(
  incidents: readonly TurnIncident[],
  teamId: string,
  players: readonly Player[],
  ball: { x: number; y: number } | null
): TurnSummary | null {
  const affected = new Set<string>();
  let ballChanged = false;
  for (const incident of incidents) {
    switch (incident.kind) {
      case "player":
        affected.add(incident.playerId);
        break;
      case "ball":
        ballChanged = true;
        break;
    }
  }
  const changes = players
    .filter((p) => p.teamId === teamId && affected.has(p.id))
    .map((p) => `${playerLabel(p)}: ${statusLabel(p)}`);
  if (!changes.length && !ballChanged) return null;
  return { players: changes, ball: describeBall(players, ball) };
}

export interface KoRecovery {
  playerId: string;
  recovered: boolean;
}

export interface HalfTimeSummary {
  score: string;
  kicker: string;
  rerolls: string[];
  recovery: string[];
  out: string[];
}

/** Everything a coach needs to read at half time, from the settled state. */
export function summarizeHalfTime(
  teams: readonly [Team, Team],
  score: Readonly<Record<string, number>>,
  rerollsLeft: (team: Team) => number,
  recoveries: readonly KoRecovery[],
  kickerId: string | null
): HalfTimeSummary {
  const [home, away] = teams;
  const players = teams.flatMap((team) => team.players);
  const label = (playerId: string) => {
    const player = players.find((p) => p.id === playerId);
    return player ? playerLabel(player) : null;
  };
  return {
    score: `${home.name} ${score[home.id] ?? 0} : ${score[away.id] ?? 0} ${away.name}`,
    kicker: `${teams.find((t) => t.id === kickerId)?.name ?? "Next team"} kick next`,
    rerolls: teams.map((team) => {
      const count = rerollsLeft(team);
      return `${team.name}: ${count} ${count === 1 ? "re-roll" : "re-rolls"}`;
    }),
    recovery: recoveries.flatMap((result) => {
      const name = label(result.playerId);
      return name
        ? [`${name}: ${result.recovered ? "Recovered" : "Still knocked out"}`]
        : [];
    }),
    out: players.flatMap((player) => {
      const out =
        injuryLabel(player) ??
        (player.status === PlayerStatus.REMOVED ? "Sent off" : null);
      return out ? [`${playerLabel(player)}: ${out}`] : [];
    }),
  };
}
