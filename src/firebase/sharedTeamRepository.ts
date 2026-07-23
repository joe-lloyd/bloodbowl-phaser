import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
} from "firebase/firestore";
import { SharedTeam } from "../competition/types";
import { Team } from "../types/Team";
import { getDb } from "./config";

function sharedTeamsCollection() {
  return collection(getDb(), "shared-teams");
}

export function sharedTeamId(ownerUid: string, teamId: string): string {
  return `${ownerUid}_${teamId}`;
}

function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/** Publish or refresh an opt-in, immutable-for-readers team snapshot. */
export async function publishTeam(
  ownerUid: string,
  ownerName: string,
  team: Team
): Promise<SharedTeam> {
  const id = sharedTeamId(ownerUid, team.id);
  const now = Date.now();
  const existing = (await fetchSharedTeams()).find(
    (shared) => shared.id === id
  );
  const shared: SharedTeam = {
    id,
    ownerUid,
    ownerName,
    teamId: team.id,
    team: structuredClone(team),
    publishedAt: existing?.publishedAt ?? now,
    updatedAt: now,
  };
  await setDoc(doc(sharedTeamsCollection(), id), plain(shared));
  return shared;
}

export async function unpublishTeam(
  ownerUid: string,
  teamId: string
): Promise<void> {
  await deleteDoc(doc(sharedTeamsCollection(), sharedTeamId(ownerUid, teamId)));
}

export async function fetchSharedTeams(): Promise<SharedTeam[]> {
  const snapshot = await getDocs(sharedTeamsCollection());
  return snapshot.docs
    .map((item) => item.data() as SharedTeam)
    .sort(
      (a, b) =>
        a.team.name.localeCompare(b.team.name) ||
        a.ownerName.localeCompare(b.ownerName)
    );
}

export async function fetchPublishedTeamIds(
  ownerUid: string
): Promise<Set<string>> {
  const teams = await fetchSharedTeams();
  return new Set(
    teams
      .filter((shared) => shared.ownerUid === ownerUid)
      .map((shared) => shared.teamId)
  );
}
