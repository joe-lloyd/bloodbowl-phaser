/** Finding the match's teams and players. */

import { Player } from "@/types/Player";
import { Team } from "@/types/Team";
import type { GameParts } from "./parts";

type Teams = Pick<GameParts, "team1" | "team2">;

export function playerById(
  { team1, team2 }: Teams,
  playerId: string
): Player | undefined {
  return (
    team1.players.find((p) => p.id === playerId) ||
    team2.players.find((p) => p.id === playerId)
  );
}

/** The player standing on a square, if any. */
export function playerAt(
  { team1, team2 }: Teams,
  x: number,
  y: number
): Player | undefined {
  return (
    team1.players.find(
      (p) => p.gridPosition && p.gridPosition.x === x && p.gridPosition.y === y
    ) ||
    team2.players.find(
      (p) => p.gridPosition && p.gridPosition.x === x && p.gridPosition.y === y
    )
  );
}

export function opponentsOf({ team1, team2 }: Teams, teamId: string): Player[] {
  return teamId === team1.id ? team2.players : team1.players;
}

/** A player's team-mates on the pitch. */
export function teammatesOf(parts: GameParts, playerId: string): Player[] {
  const player = parts.game.getPlayerById(playerId);
  if (!player) return [];
  const { team1, team2 } = parts;
  const team = player.teamId === team1.id ? team1 : team2;
  return team.players.filter((p) => p.id !== playerId && p.gridPosition);
}

export function teamById(
  { team1, team2 }: Teams,
  teamId: string
): Team | undefined {
  if (team1.id === teamId) return team1;
  if (team2.id === teamId) return team2;
  return undefined;
}
