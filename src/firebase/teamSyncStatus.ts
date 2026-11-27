export interface TeamConflict {
  readonly id: string;
  readonly name: string;
  readonly deletedElsewhere: boolean;
}

export interface TeamSyncStatus {
  readonly waiting: number;
  readonly conflicts: readonly TeamConflict[];
  readonly syncing: boolean;
  readonly offline: boolean;
  readonly syncedAt: number | null;
}

const listeners = new Set<() => void>();
const current: { status: TeamSyncStatus | null } = { status: null };

export function getTeamSyncStatus(): TeamSyncStatus | null {
  return current.status;
}

export function publishTeamSyncStatus(status: TeamSyncStatus | null): void {
  current.status = status;
  for (const listener of listeners) listener();
}

export function subscribeTeamSyncStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
