import { useSyncExternalStore } from "react";
import {
  type TeamConflict,
  type TeamSyncStatus,
  getTeamSyncStatus,
  subscribeTeamSyncStatus,
} from "../../../firebase/teamSyncStatus";
import {
  keepThisDeviceTeam,
  syncTeamsNow,
  takeOtherDeviceTeam,
} from "../../../firebase/cloudTeamRepository";
import { HudButton, Notice } from "../componentWarehouse/HudKit";

function changes(count: number): string {
  return count === 1 ? "1 team change" : `${String(count)} team changes`;
}

function summary(status: TeamSyncStatus): string {
  if (status.syncing) return "Syncing your teams…";
  if (status.waiting > 0) {
    return status.offline
      ? `${changes(status.waiting)} saved on this device. They upload when you are back online.`
      : `${changes(status.waiting)} saved on this device, waiting to upload.`;
  }
  if (status.offline) return "Offline. Your teams are saved on this device.";
  if (status.syncedAt === null) return "Your teams are saved to your account.";
  const time = new Date(status.syncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `Teams synced with your account at ${time}.`;
}

function ConflictNotice({ conflict }: { conflict: TeamConflict }) {
  const { id, name, deletedElsewhere } = conflict;
  return (
    <Notice tone="gold" role="alert" title={name}>
      <p>
        {deletedElsewhere
          ? "This team was deleted on another device while this one had changes to upload."
          : "This team changed on another device while this one had changes to upload."}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <HudButton
          onClick={() => {
            void keepThisDeviceTeam(id);
          }}
        >
          {deletedElsewhere ? "Keep the team" : "Keep this device's version"}
        </HudButton>
        <HudButton
          variant="ghost"
          onClick={() => {
            takeOtherDeviceTeam(id);
          }}
        >
          {deletedElsewhere ? "Delete it here too" : "Use the other device's version"}
        </HudButton>
      </div>
    </Notice>
  );
}

export function TeamSyncPanel() {
  const status = useSyncExternalStore(subscribeTeamSyncStatus, getTeamSyncStatus);
  if (!status) return null;
  return (
    <section aria-label="Team sync" className="mb-6 flex max-w-3xl flex-col gap-3" data-testid="team-sync">
      <div className="flex flex-wrap items-center gap-3 text-hud-sm text-hud-dim">
        <span role="status">{summary(status)}</span>
        <HudButton
          variant="ghost"
          disabled={status.syncing}
          onClick={() => {
            void syncTeamsNow();
          }}
        >
          Sync now
        </HudButton>
      </div>
      {status.conflicts.map((conflict) => (
        <ConflictNotice key={conflict.id} conflict={conflict} />
      ))}
    </section>
  );
}
