import type { Player } from "@/types/Player";
import type { Team } from "@/types/Team";
import type { Frame } from "./rules/frames";
import type { PitchLayout, Square } from "./variants/pitchLayouts";

type SeatIndex = 0 | 1 | 2 | 3;

export interface Seat {
  readonly index: SeatIndex;
  readonly team: Team;
  readonly frame: Frame;
}

export interface PairSeating {
  readonly kind: "pair";
  readonly seats: readonly [Seat, Seat];
}

export interface FourSeating {
  readonly kind: "four";
  readonly seats: readonly [Seat, Seat, Seat, Seat];
}

export type Seating = PairSeating | FourSeating;

export type Rotation = 1 | -1;

export type SeatedTeams =
  | readonly [Team, Team]
  | readonly [Team, Team, Team, Team];

export function seatedTeams(teams: readonly Team[]): SeatedTeams {
  const [first, second, third, fourth] = teams;
  if (first && second && teams.length === 2) return [first, second];
  if (first && second && third && fourth && teams.length === 4) {
    return [first, second, third, fourth];
  }
  throw new Error(
    `A match seats two or four teams, not ${String(teams.length)}.`
  );
}

const seat = (index: SeatIndex, team: Team, frame: Frame): Seat => ({
  index,
  team,
  frame,
});

function refuseRepeatedTeams(teams: readonly Team[]): void {
  const ids = new Set(teams.map((team) => team.id));
  if (ids.size === teams.length) return;
  throw new Error(
    `Every seat needs its own team, but the ids were ${teams.map((team) => team.id).join(", ")}.`
  );
}

export function seatTeams(teams: readonly Team[], layout: PitchLayout): Seating {
  if (teams.length !== layout.frames.length) {
    throw new Error(
      `The ${layout.label} seats ${String(layout.frames.length)} teams, not ${String(teams.length)}.`
    );
  }
  refuseRepeatedTeams(teams);
  const seated = seatedTeams(teams);
  const { frames } = layout;
  if (seated.length === 2 && frames.length === 2) {
    return {
      kind: "pair",
      seats: [seat(0, seated[0], frames[0]), seat(1, seated[1], frames[1])],
    };
  }
  if (seated.length === 4 && frames.length === 4) {
    return {
      kind: "four",
      seats: [
        seat(0, seated[0], frames[0]),
        seat(1, seated[1], frames[1]),
        seat(2, seated[2], frames[2]),
        seat(3, seated[3], frames[3]),
      ],
    };
  }
  throw new Error(`The ${layout.label} cannot seat these teams.`);
}

export function seatOf(seating: Seating, teamId: string): Seat {
  const seat = seating.seats.find((candidate) => candidate.team.id === teamId);
  if (!seat) throw new Error(`No team ${teamId} sits at this match.`);
  return seat;
}

export function teamOfPlayer(
  seating: Seating,
  playerId: string
): Team | undefined {
  return seating.seats.find(({ team }) =>
    team.players.some((player) => player.id === playerId)
  )?.team;
}

export function teamsOf(seating: Seating): Team[] {
  return seating.seats.map(({ team }) => team);
}

export function everyone(seating: Seating): Player[] {
  return seating.seats.flatMap(({ team }) => team.players);
}

function findPlayer(
  seating: Seating,
  test: (player: Player) => boolean
): Player | undefined {
  for (const { team } of seating.seats) {
    const player = team.players.find((candidate) => test(candidate));
    if (player) return player;
  }
  return undefined;
}

export function playerById(
  seating: Seating,
  playerId: string
): Player | undefined {
  return findPlayer(seating, (player) => player.id === playerId);
}

export function playerAt(seating: Seating, square: Square): Player | undefined {
  return findPlayer(
    seating,
    ({ gridPosition }) =>
      gridPosition?.x === square.x && gridPosition.y === square.y
  );
}

export function rivalsOf(seating: Seating, teamId: string): readonly Seat[] {
  const { index } = seatOf(seating, teamId);
  return [
    ...seating.seats.slice(index + 1),
    ...seating.seats.slice(0, index),
  ];
}

export function opponentsOf(seating: Seating, teamId: string): Player[] {
  return rivalsOf(seating, teamId).flatMap(({ team }) => team.players);
}

export function teammatesOf(seating: Seating, playerId: string): Player[] {
  const team = teamOfPlayer(seating, playerId);
  if (!team) return [];
  return team.players.filter(
    (player) => player.id !== playerId && player.gridPosition
  );
}

export function playOrderAfter(
  seating: Seating,
  current: string,
  rotation: Rotation
): readonly Team[] {
  const rivals = rivalsOf(seating, current);
  const ordered = rotation === 1 ? rivals : [...rivals].reverse();
  return [...ordered, seatOf(seating, current)].map(({ team }) => team);
}

export function pairSeating(seating: Seating): PairSeating {
  if (seating.kind !== "pair") {
    throw new Error("Only a two-team match has a home and an away team.");
  }
  return seating;
}

export function pairTeams(seating: PairSeating): readonly [Team, Team] {
  return [seating.seats[0].team, seating.seats[1].team];
}

export function pairIds(seating: Seating): readonly [string, string] {
  const [home, away] = pairTeams(pairSeating(seating));
  return [home.id, away.id];
}
