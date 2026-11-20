import { teamPlaysGameType } from "../../../game/rules/rosterLegality";
import { GAME_TYPE_LABELS, type GameType } from "../../../game/variants/gameTypes";
import {
  type TeamValueRange,
  teamValueText,
  withinTeamValue,
} from "../../../social/teamValueRange";
import { calculateTeamValue, type Team } from "../../../types/Team";
import { Notice } from "../componentWarehouse/HudKit";

function unfit(team: Team, gameType: GameType, teamValue: TeamValueRange | undefined): string | null {
  if (!teamPlaysGameType(team, gameType))
    return `does not meet the ${GAME_TYPE_LABELS[gameType]} draft rules`;
  if (!withinTeamValue(team, teamValue))
    return `is outside the team value range, ${teamValueText(teamValue)}`;
  return null;
}

export function TeamChoice({
  chosen,
  myTeams,
  gameType,
  teamValue,
  onPick,
}: {
  chosen: Team | null;
  myTeams: Team[];
  gameType: GameType;
  teamValue: TeamValueRange | undefined;
  onPick: (team: Team) => void;
}) {
  const chosenProblem = chosen && unfit(chosen, gameType, teamValue);
  return (
    <>
      <select
        value={chosen?.id ?? ""}
        onChange={(e) => {
          const team = myTeams.find((t: Team) => t.id === e.target.value);
          if (team) onPick(team);
        }}
        aria-label="Your team"
        className="hud-field"
      >
        <option value="" disabled>
          Pick a team…
        </option>
        {myTeams.map((team: Team) => {
          const problem = unfit(team, gameType, teamValue);
          return (
            <option key={team.id} value={team.id} disabled={problem !== null}>
              {team.name} ({team.rosterName}, {calculateTeamValue(team) / 1000}k)
              {problem === null ? "" : ` · ${problem}`}
            </option>
          );
        })}
      </select>
      {chosen && chosenProblem && (
        <Notice tone="warn" className="mt-3">
          {chosen.name} {chosenProblem}. Pick another team.
        </Notice>
      )}
    </>
  );
}
