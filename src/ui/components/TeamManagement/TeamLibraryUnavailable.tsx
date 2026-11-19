import { type ReactNode } from "react";
import { retryTeamLibrary } from "../../../game/managers/TeamManager";
import { EmptyState, HudButton } from "../componentWarehouse/HudKit";

export function TeamLibraryUnavailable({ action }: { action?: ReactNode }) {
  return (
    <EmptyState
      title="Couldn't load your teams"
      titleAs="h2"
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <HudButton variant="primary" onClick={retryTeamLibrary}>
            Retry
          </HudButton>
          {action}
        </div>
      }
    >
      Your teams are saved in your account and could not be loaded. Check your
      connection and try again. Nothing has been changed.
    </EmptyState>
  );
}
