import type { Player } from "@/types/Player";
import type { Team } from "@/types/Team";
import type { Frame } from "./rules/frames";
import {
  type PitchLayout,
  type Square,
  twoTeamFrames,
} from "./variants/pitchLayouts";

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

function refuseRepeatedTeams(teams: readonly Team[]): void {
  const ids = new Set(teams.map((team) => team.id));
  if (ids.size === teams.length) return;
  throw new Error(
    `Every seat needs its own team, but the ids were ${teams.map((team) => team.id).join(", ")}.`
  );
}

export function seatTeams(teams: readonly Team[], layout: PitchLayout): Seating {
  const [home, away] = twoTeamFrames(layout);
  const [first, second] = teams;
  if (teams.length !== layout.frames.length || !first || !second) {
    throw new Error(
      `The ${layout.label} seats ${String(layout.frames.length)} teams, not ${String(teams.length)}.`
    );
  }
  refuseRepeatedTeams(teams);
  return {
    kind: "pair",
    seats: [
      { index: 0, team: first, frame: home },
      { index: 1, team: second, frame: away },
    ],
  };
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
