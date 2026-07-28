import { Team, calculateTeamValue } from "../../../types/Team";

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
 * Lives on a team's detail page (team-management-layout: "Detailed team
 * stats live on the team detail page, not the overview") rather than the
 * Team Management overview cards.
 */
export function TeamStatsOverview({ team }: { team: Team }) {
  return (
    <div className="grid grid-cols-2 gap-y-6 gap-x-4 mb-8 bg-black/20 p-6 rounded-lg border border-bb-dark-gold/30">
      <div>
        <span className="block text-xs uppercase font-bold text-bb-dark-gold mb-1 tracking-wider">
          Team Value
        </span>
        <span className="font-heading text-2xl text-bb-parchment">
          {formatGold(calculateTeamValue(team))}
        </span>
      </div>
      <div>
        <span className="block text-xs uppercase font-bold text-bb-dark-gold mb-1 tracking-wider">
          Treasury
        </span>
        <span className="font-heading text-2xl text-white">
          {formatGold(team.treasury)}
        </span>
      </div>
      <div>
        <span className="block text-xs uppercase font-bold text-bb-dark-gold mb-1 tracking-wider">
          Roster
        </span>
        <span className="font-heading text-2xl text-white">
          {team.players.length}/11
        </span>
      </div>
      <div>
        <span className="block text-xs uppercase font-bold text-bb-dark-gold mb-1 tracking-wider">
          Record
        </span>
        <span className="font-heading text-2xl text-white">
          {team.wins}-{team.draws}-{team.losses}
        </span>
      </div>
    </div>
  );
}
