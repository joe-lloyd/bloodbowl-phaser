import type { CompetitionDoc } from "../../../competition/types";
import { coachLabel } from "./labels";
import { Section } from "../componentWarehouse/HudKit";

const COLUMNS = ["P", "W", "D", "L", "For", "Against", "+/-", "Pts"];

export function StandingsTable({
  competition,
}: {
  competition: CompetitionDoc;
}) {
  const entrant = (id: string) =>
    competition.entrants.find((candidate) => candidate.id === id);
  return (
    <Section title="Standings" bodyClassName="overflow-x-auto p-0">
      <table className="hud-table">
        <thead>
          <tr>
            <th>Team</th>
            <th>Coach</th>
            {COLUMNS.map((heading) => (
              <th key={heading} className="num">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {competition.standings.map((standing) => (
            <tr key={standing.entrantId}>
              <td className="font-bold">{entrant(standing.entrantId)?.name}</td>
              <td className="text-hud-dim">
                {coachLabel(entrant(standing.entrantId))}
              </td>
              <td className="num">{standing.played}</td>
              <td className="num">{standing.wins}</td>
              <td className="num">{standing.draws}</td>
              <td className="num">{standing.losses}</td>
              <td className="num">{standing.scoreFor}</td>
              <td className="num">{standing.scoreAgainst}</td>
              <td className="num">{standing.scoreDifference}</td>
              <td className="num font-bold text-hud-gold">{standing.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}
