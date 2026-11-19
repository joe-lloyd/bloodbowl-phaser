import { type Team, calculateTeamValue } from "../../../types/Team";
import { Stat } from "../componentWarehouse/HudKit";

export function formatGold(amount: number): string {
  return `${(amount / 1000).toFixed(0)}k`;
}

export function numToHex(num: number): string {
  return "#" + num.toString(16).padStart(6, "0");
}

export function TeamStatsOverview({ team }: { team: Team }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      <Stat
        label="Team Value"
        value={formatGold(calculateTeamValue(team))}
        tone="gold"
      />
      <Stat label="Treasury" value={formatGold(team.treasury)} />
      <Stat label="Roster" value={`${String(team.players.length)}/11`} />
      <Stat
        label="Record"
        value={`${String(team.wins)}-${String(team.draws)}-${String(team.losses)}`}
      />
    </div>
  );
}
