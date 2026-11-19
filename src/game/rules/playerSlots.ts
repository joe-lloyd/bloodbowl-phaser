import { type Team } from "../../types/Team";
import { staysOnRoster } from "./leagueRoster";

export const ROSTER_SLOTS = 11;

export function freeRosterNumber(team: Team): number | null {
  const used = new Set(
    team.players
      .filter((player) => staysOnRoster(team, player))
      .map((player) => player.number)
  );
  for (let number = 1; number <= ROSTER_SLOTS; number++)
    if (!used.has(number)) return number;
  return null;
}

export function uniquePlayerId(
  team: Pick<Team, "players">,
  preferred: string
): string {
  const taken = new Set(team.players.map((player) => player.id));
  if (!taken.has(preferred)) return preferred;
  let serial = 2;
  while (taken.has(`${preferred}-${String(serial)}`)) serial++;
  return `${preferred}-${String(serial)}`;
}
