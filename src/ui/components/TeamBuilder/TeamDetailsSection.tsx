import { type FavouredOfRule, League, type Team } from "../../../types/Team";
import {
  favouredOfChoices,
  leagueChoices,
  teamFavouredOf,
  teamLeague,
  teamSpecialRules,
} from "../../../game/rules/teamAllegiance";
import { cx, Field, Section } from "../componentWarehouse/HudKit";
import {
  TeamStatsOverview,
  numToHex,
} from "../TeamManagement/TeamStatsOverview";

const TEAM_COLORS = [
  0x8e1b1b, 0x1e3a5f, 0x556b2f, 0xd6b25e, 0x2a1f1a, 0xb32020, 0xe8ddc4,
  0x6b5e54, 0xffffff, 0x000000,
];

interface Props {
  team: Team;
  active: boolean;
  selectedColor: number;
  onChange: (team: Team) => void;
  onColorChange: (color: number) => void;
  onChooseLeague: (league: League) => void;
  onChooseFavouredOf: (alignment: FavouredOfRule) => void;
}

export function TeamDetailsSection({
  team,
  active,
  selectedColor,
  onChange,
  onColorChange,
  onChooseLeague,
  onChooseFavouredOf,
}: Props) {
  return (
    <Section
      title="Team details"
      accent={{ color: numToHex(team.colors.primary) }}
    >
      <div className="mb-5 max-w-xl">
        <TeamStatsOverview team={team} />
      </div>
      <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Team Name">
          <input
            type="text"
            className="hud-field font-hud-label text-base font-bold uppercase tracking-[0.03em]"
            value={team.name}
            onChange={(e) => {
              onChange({ ...team, name: e.target.value });
            }}
            placeholder="Enter Team Name"
          />
        </Field>
        <Field
          label="League"
          hint={
            leagueChoices(team.rosterName).length > 1 && !active
              ? "Chosen when drafting; fixed once the team has played."
              : undefined
          }
        >
          <select
            data-testid="team-league"
            className="hud-field cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            value={teamLeague(team)}
            disabled={active || leagueChoices(team.rosterName).length < 2}
            onChange={(e) => {
              onChooseLeague(e.target.value as League);
            }}
          >
            {leagueChoices(team.rosterName).map((league) => (
              <option key={league} value={league}>
                {league}
              </option>
            ))}
          </select>
        </Field>
        {favouredOfChoices(team.rosterName).length > 0 && (
          <Field
            label="Favoured of"
            hint={
              active
                ? undefined
                : "Chosen when drafting; it cannot change later."
            }
          >
            <select
              data-testid="team-favoured-of"
              className="hud-field cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              value={teamFavouredOf(team)}
              disabled={active}
              onChange={(e) => {
                onChooseFavouredOf(e.target.value as FavouredOfRule);
              }}
            >
              {favouredOfChoices(team.rosterName).map((alignment) => (
                <option key={alignment} value={alignment}>
                  {alignment.replace("Favoured of ", "")}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="hud-label">Special rules</span>
          <span
            data-testid="team-special-rules"
            className="flex min-h-11 items-center text-hud-sm text-hud-bone"
          >
            {teamSpecialRules(team).join(", ") || "None"}
          </span>
        </div>
        <Field label="Coach">
          <input
            type="text"
            className="hud-field"
            value={team.coachName || ""}
            onChange={(e) => {
              onChange({ ...team, coachName: e.target.value });
            }}
            placeholder="Coach Name"
          />
        </Field>
        <Field label="Starting Treasury">
          <input
            type="number"
            step="10000"
            className="hud-field disabled:cursor-not-allowed disabled:opacity-50"
            value={team.startingTreasury}
            disabled={active || team.players.length > 0}
            onChange={(e) => {
              const newVal = parseInt(e.target.value) || 0;
              onChange({
                ...team,
                startingTreasury: newVal,
                treasury: newVal,
              });
            }}
          />
        </Field>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="hud-label">Team Colors</span>
          <div className="flex flex-wrap gap-2">
            {TEAM_COLORS.map((color) => (
              <button
                key={color}
                aria-pressed={selectedColor === color}
                className={cx(
                  "h-7 w-7 -skew-x-12 rounded-[2px] border transition-[transform,box-shadow] duration-150 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-gold focus-visible:ring-offset-2 focus-visible:ring-offset-hud-ink",
                  selectedColor === color
                    ? "scale-110 border-hud-gold shadow-hud-glow"
                    : "border-white/30"
                )}
                style={{ backgroundColor: numToHex(color) }}
                onClick={() => {
                  onColorChange(color);
                }}
                title={numToHex(color)}
              />
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}
