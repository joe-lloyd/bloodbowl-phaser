import type { ReactNode } from "react";
import { useTeamSaving } from "../../hooks/teamSaveLock";

export function TeamSaveFieldset({ children }: { children: ReactNode }) {
  return (
    <fieldset disabled={useTeamSaving()} className="contents">
      {children}
    </fieldset>
  );
}
