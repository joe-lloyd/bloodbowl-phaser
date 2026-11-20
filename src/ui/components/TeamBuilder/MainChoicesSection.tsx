import { RosterName, type Team } from "../../../types/Team";
import { getAvailableRosterNames } from "../../../data/RosterTemplates";
import { Field, Section } from "../componentWarehouse/HudKit";
import { SevensRulesetSelector } from "../common/SevensRulesetSelector";
import { AdvancementModeSelector } from "./AdvancementModePanel";
import { GameTypeSelector } from "../common/GameTypeSelector";
import { withDraftGameType } from "../../../game/rules/gameTypeChange";
import { teamGameType } from "../../../game/rules/draftRules";

interface Props {
  team: Team;
  selectedRace: RosterName;
  active: boolean;
  saving: boolean;
  onRaceChange: (race: RosterName) => void;
  onChange: (team: Team) => void;
}

export function MainChoicesSection({
  team,
  selectedRace,
  active,
  saving,
  onRaceChange,
  onChange,
}: Props) {
  return (
    <Section title="Main choices">
      <div className="grid gap-x-6 gap-y-5 lg:grid-cols-2">
        <Field label="Roster">
          <select
            className="hud-field cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            value={selectedRace}
            disabled={active || saving}
            title={
              active ? "Active teams cannot change roster type" : undefined
            }
            onChange={(e) => {
              onRaceChange(e.target.value as RosterName);
            }}
          >
            {getAvailableRosterNames().map((race) => (
              <option key={race} value={race}>
                {race}
              </option>
            ))}
          </select>
        </Field>
        <FormatChoices
          team={team}
          locked={saving || active}
          onChange={onChange}
        />
        <div className="lg:col-span-2">
          <AdvancementModeSelector team={team} onChange={onChange} />
        </div>
      </div>
    </Section>
  );
}

function FormatChoices({
  team,
  locked,
  onChange,
}: {
  team: Team;
  locked: boolean;
  onChange: (team: Team) => void;
}) {
  const disabled = locked || !!team.activeCompetitionId;
  return (
    <>
      <GameTypeSelector
        {...(team.gameType === undefined ? {} : { value: team.gameType })}
        disabled={disabled}
        onChange={(gameType) => {
          onChange(withDraftGameType(team, gameType));
        }}
      />
      {teamGameType(team) === "sevens" && (
        <div>
          <SevensRulesetSelector
            {...(team.draftRuleset === undefined
              ? {}
              : { value: team.draftRuleset })}
            disabled={disabled}
            onChange={(draftRuleset) => {
              onChange({ ...team, draftRuleset });
            }}
          />
          <p className="mt-2 font-hud-body text-hud-sm text-hud-dim">
            Prepare a roster for these rules. Tournament and league entry use
            the competition&apos;s own choice. Friendly matches use GW rules.
          </p>
        </div>
      )}
    </>
  );
}
