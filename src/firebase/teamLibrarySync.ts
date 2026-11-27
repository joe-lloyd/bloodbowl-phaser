import { firebaseDocument } from "../boundary/firebaseJson";
import { readCloudTeam } from "../boundary/firebaseTeam";
import { type TeamMirror } from "../boundary/teamMirror";
import { dehydrateTeam, readStoredTeam } from "../data/persistence/teamPersistence";
import { canonical, fnv1a } from "../headless/checksum";
import { type Team } from "../types/Team";

export interface LibraryState {
  readonly teams: readonly Team[];
  readonly synced: ReadonlyMap<string, string>;
  readonly pending: ReadonlySet<string>;
  readonly conflicts: ReadonlyMap<string, Team | null>;
  readonly syncedAt: number | null;
}

export function cloudDocument(team: Team): Record<string, unknown> {
  return firebaseDocument(dehydrateTeam(team));
}

export function teamText(team: Team): string {
  const asStored = readCloudTeam(cloudDocument(team)).team;
  const text = canonical(cloudDocument(asStored));
  return `${fnv1a(text)}-${text.length.toString(36)}`;
}

export function syncedLibrary(teams: readonly Team[], syncedAt: number): LibraryState {
  return {
    teams: [...teams],
    synced: new Map(teams.map((team) => [team.id, teamText(team)])),
    pending: new Set(),
    conflicts: new Map(),
    syncedAt,
  };
}

function hydrate(raw: unknown): Team {
  return readStoredTeam(raw).team;
}

export function libraryFromMirror(mirror: TeamMirror): LibraryState {
  return {
    teams: mirror.teams.map((raw) => hydrate(raw)),
    synced: new Map(Object.entries(mirror.synced)),
    pending: new Set(mirror.pending),
    conflicts: new Map(
      Object.entries(mirror.conflicts).map(([id, raw]) => [id, raw === null ? null : hydrate(raw)])
    ),
    syncedAt: mirror.syncedAt,
  };
}

export function mirrorFromLibrary(state: LibraryState): TeamMirror {
  return {
    teams: state.teams.map((team) => dehydrateTeam(team)),
    synced: Object.fromEntries(state.synced),
    pending: [...state.pending],
    conflicts: Object.fromEntries(
      [...state.conflicts].map(([id, team]) => [id, team === null ? null : dehydrateTeam(team)])
    ),
    syncedAt: state.syncedAt,
  };
}

function textOf(team: Team | null | undefined): string | undefined {
  return team ? teamText(team) : undefined;
}

export function isUnsynced(state: LibraryState, id: string): boolean {
  return textOf(state.teams.find((team) => team.id === id)) !== state.synced.get(id);
}

export function withTeams(state: LibraryState, teams: readonly Team[]): LibraryState {
  const ids = new Set([...state.teams, ...teams].map(({ id }) => id));
  const next = { ...state, teams: [...teams] };
  const pending = new Set(state.pending);
  for (const id of ids) {
    if (isUnsynced(next, id)) pending.add(id);
  }
  return { ...next, pending };
}

export function putTeam(teams: readonly Team[], id: string, team: Team | null | undefined): Team[] {
  if (!team) return teams.filter((entry) => entry.id !== id);
  return teams.some((entry) => entry.id === id)
    ? teams.map((entry) => (entry.id === id ? team : entry))
    : [...teams, team];
}

export function settleTeam(state: LibraryState, id: string, cloud: Team | null | undefined): LibraryState {
  const synced = new Map(state.synced);
  const text = textOf(cloud);
  if (text === undefined) synced.delete(id);
  else synced.set(id, text);
  const pending = new Set(state.pending);
  pending.delete(id);
  const conflicts = new Map(state.conflicts);
  conflicts.delete(id);
  return { ...state, teams: putTeam(state.teams, id, cloud), synced, pending, conflicts };
}

export function markConflict(state: LibraryState, id: string, cloud: Team | null): LibraryState {
  return { ...state, conflicts: new Map(state.conflicts).set(id, cloud) };
}

function mergeTeam(state: LibraryState, id: string, cloud: Team | undefined): LibraryState {
  const cloudText = textOf(cloud);
  const mine = state.teams.find((team) => team.id === id);
  if (textOf(mine) === cloudText) return settleTeam(state, id, mine);
  if (!state.pending.has(id)) return settleTeam(state, id, cloud);
  if (cloudText === state.synced.get(id)) {
    const conflicts = new Map(state.conflicts);
    conflicts.delete(id);
    return { ...state, conflicts };
  }
  return markConflict(state, id, cloud ?? null);
}

export function mergeCloud(state: LibraryState, cloud: readonly Team[]): LibraryState {
  const byId = new Map(cloud.map((team) => [team.id, team]));
  const ids = new Set([...state.teams.map(({ id }) => id), ...byId.keys(), ...state.pending]);
  let next = state;
  for (const id of ids) next = mergeTeam(next, id, byId.get(id));
  return next;
}

export function keepLocalVersion(state: LibraryState, id: string): LibraryState {
  if (!state.conflicts.has(id)) return state;
  const synced = new Map(state.synced);
  const cloudText = textOf(state.conflicts.get(id));
  if (cloudText === undefined) synced.delete(id);
  else synced.set(id, cloudText);
  const conflicts = new Map(state.conflicts);
  conflicts.delete(id);
  return { ...state, synced, conflicts };
}

export function takeCloudVersion(state: LibraryState, id: string): LibraryState {
  if (!state.conflicts.has(id)) return state;
  return settleTeam(state, id, state.conflicts.get(id));
}
