import { type ReactNode } from "react";
import { type Team, calculateTeamValue } from "../../../types/Team";
import { draftListPlayers } from "../../../game/rules/teamPricing";
import { HudButton } from "../componentWarehouse/HudKit";
import { formatGold } from "../TeamManagement/TeamStatsOverview";

interface Props {
  team: Team;
  postMatch: boolean;

  completion: string;
  saving: boolean;
  saveError: string;
  waitingForDevelopment: boolean;
  pendingMistakes: boolean;

  incomplete: boolean;
  hasNextTeam: boolean;

  returnsToLeague: boolean;
  onBack: () => void;
  onSave: () => void;
}

function saveButtonLabel({
  postMatch,
  completion,
  saving,
  saveError,
  pendingMistakes,
  incomplete,
  hasNextTeam,
  returnsToLeague,
}: Props): ReactNode {
  if (saving) return "Saving team...";
  if (saveError) return "Retry saving team";
  if (completion) {
    if (hasNextTeam) return "Manage next team";
    return returnsToLeague ? "Back to the league" : "Back to Teams";
  }
  if (postMatch || pendingMistakes) return "Finish post-match";
  return <>Save Team {incomplete && "(saved as incomplete draft)"}</>;
}

export function TeamBuilderActionBar(props: Props) {
  const {
    team,
    postMatch,
    completion,
    saving,
    waitingForDevelopment,
    returnsToLeague,
    onBack,
    onSave,
  } = props;
  return (
    <>
      {!postMatch && !completion && (
        <HudButton variant="ghost" onClick={onBack} disabled={saving}>
          {returnsToLeague ? "Back to the league" : "Cancel"}
        </HudButton>
      )}
      <div className="flex items-baseline gap-5 font-hud-label font-bold uppercase tracking-[0.06em]">
        <span>
          <span className="font-hud-display text-hud-xl text-hud-bone">
            {draftListPlayers(team).length}/11
          </span>{" "}
          <span className="hud-label">Players</span>
        </span>
        <span>
          <span className="hud-label">TV</span>{" "}
          <span className="font-hud-display text-hud-xl text-hud-gold">
            {formatGold(calculateTeamValue(team))}
          </span>
        </span>
      </div>
      <HudButton
        variant="primary"
        onClick={onSave}
        disabled={waitingForDevelopment || saving}
      >
        {saveButtonLabel(props)}
      </HudButton>
    </>
  );
}
