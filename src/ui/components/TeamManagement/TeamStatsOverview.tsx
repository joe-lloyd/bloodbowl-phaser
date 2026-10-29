import { Team, calculateTeamValue } from "../../../types/Team";
import { Stat } from "../componentWarehouse/HudKit";

/** Format a gold amount as a compact "Nk" string, e.g. 50000 -> "50k". */
export function formatGold(amount: number): string {
  return `${(amount / 1000).toFixed(0)}k`;
}

/** Format a numeric colour value as a CSS hex string, e.g. 0xff0000 -> "#ff0000". */
export function numToHex(num: number): string {
  return "#" + num.toString(16).padStart(6, "0");
}

/**
 * Per-team stats grid: Team Value, Treasury, Roster count, Record.
 *
 * Shown on both the Team Management overview cards and a team's own detail
 * page (team-management-layout: "Team overview cards show the per-team
 * stats summary") — the overview needs it for at-a-glance browsing, and the
 * detail page keeps it near the team's other stats.
 */
export function TeamStatsOverview({ team }: { team: Team }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      <Stat
        label="Team Value"
        value={formatGold(calculateTeamValue(team))}
        tone="gold"
      />
      <Stat label="Treasury" value={formatGold(team.treasury)} />
      <Stat label="Roster" value={`${team.players.length}/11`} />
      <Stat label="Record" value={`${team.wins}-${team.draws}-${team.losses}`} />
    </div>
  );
}
