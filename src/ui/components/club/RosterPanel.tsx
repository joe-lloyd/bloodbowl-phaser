import { useState } from "react";
import type { Team } from "../../../types/Team";
import { TeamRoster, type TeamRosterProps } from "../TeamBuilder/TeamRoster";
import { HudButton } from "../componentWarehouse/HudKit";
import { SquadGrid } from "./SquadGrid";

type View = "players" | "squads";

const VIEWS: readonly { id: View; label: string }[] = [
  { id: "players", label: "Players" },
  { id: "squads", label: "Squads" },
];

export function RosterPanel({
  onSquadsChange,
  ...roster
}: TeamRosterProps & { onSquadsChange: (team: Team) => void }) {
  const [view, setView] = useState<View>("players");
  if (!roster.team.club) return <TeamRoster {...roster} />;
  return (
    <>
      <div role="tablist" aria-label="Club roster view" className="mb-3 flex gap-2">
        {VIEWS.map((choice) => (
          <HudButton
            key={choice.id}
            role="tab"
            size="sm"
            aria-selected={view === choice.id}
            variant={view === choice.id ? "selected" : "secondary"}
            onClick={() => {
              setView(choice.id);
            }}
          >
            {choice.label}
          </HudButton>
        ))}
      </div>
      {view === "players" ? (
        <TeamRoster {...roster} />
      ) : (
        <SquadGrid team={roster.team} onChange={onSquadsChange} />
      )}
    </>
  );
}
