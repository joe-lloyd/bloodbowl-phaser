import { type Team } from "../../types/Team";
import { staysOnRoster } from "./leagueRoster";

export const ROSTER_SLOTS = 11;

export function rosterSlotsFor(team: Pick<Team, "club">): number {
  return team.club ? ROSTER_SLOTS + 1 : ROSTER_SLOTS;
}

export function freeRosterNumber(team: Team): number | null {
  const used = new Set(
    team.players
      .filter((player) => staysOnRoster(team, player))
      .map((player) => player.number)
  );
  for (let number = 1; number <= rosterSlotsFor(team); number++)
    if (!used.has(number)) return number;
  return null;
}

function clubHeldIds(team: Pick<Team, "club">): string[] {
  const club = team.club;
  if (!club) return [];
  return [
    ...(club.matchHome ?? []),
    ...Object.values(club.squads ?? {}).flat(),
  ];
}

export function uniquePlayerId(
  team: Pick<Team, "players" | "club">,
  preferred: string
): string {
  const taken = new Set([
    ...team.players.map((player) => player.id),
    ...clubHeldIds(team),
  ]);
  if (!taken.has(preferred)) return preferred;
  let serial = 2;
  while (taken.has(`${preferred}-${String(serial)}`)) serial++;
  return `${preferred}-${String(serial)}`;
}
