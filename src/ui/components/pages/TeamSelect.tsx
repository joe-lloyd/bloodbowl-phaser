import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Team } from "../../../types/Team";
import { useTeamLibrary } from "../../hooks/useTeamLibrary";
import { validateRosterLegality } from "../../../game/rules/rosterLegality";
import { validateInsignificant } from "../../../game/rules/insignificant";
import { mustAdvance } from "../../../game/progression/progression";
import { getRosterByRosterName } from "../../../data/RosterTemplates";
import {
  Chip,
  cx,
  EmptyState,
  HudButton,
  hudChoiceClass,
  Notice,
  PageHeader,
  PageShell,
  Panel,
  PanelHeader,
  Section,
  TeamSwatch,
} from "../componentWarehouse/HudKit";
import { numToHex } from "../TeamManagement/TeamStatsOverview";
import { PitchThemePicker } from "../common/PitchThemePicker";
import {
  DEFAULT_PITCH_THEME_ID,
  PitchThemeId,
} from "../../../game/presentation/pitchThemes";
import {
  clearMatchSave,
  readMatchSave,
} from "../../../game/persistence/MatchSaveRepository";

interface TeamSelectProps {
  mode?: "sandbox" | "standard" | "play";
}

/**
 * Team Selection Component
 * Select teams for Player 1 and Player 2 before starting a game
 */
export function TeamSelect({ mode = "play" }: TeamSelectProps) {
  const [teams] = useTeamLibrary();
  const [selectedTeam1, setSelectedTeam1] = useState<Team | null>(null);
  const [selectedTeam2, setSelectedTeam2] = useState<Team | null>(null);
  const [filter1, setFilter1] = useState("");
  const [filter2, setFilter2] = useState("");
  const [progressionEnabled, setProgressionEnabled] = useState(false);
  const [pitchThemeId, setPitchThemeId] = useState<PitchThemeId>(
    DEFAULT_PITCH_THEME_ID
  );
  const navigate = useNavigate();

  /**
   * Shared roster legality — a team may not be selected for a match until it
   * is legal (team-lifecycle-modes: "Illegal draft tries to play"). Returns
   * every violation found; empty means the team is legal.
   */
  const legalityIssues = (team: Team): string[] => {
    const issues: string[] = [];
    const insignificantError = validateInsignificant(team.players);
    if (insignificantError) issues.push(insignificantError);
    try {
      const roster = getRosterByRosterName(team.rosterName);
      issues.push(...validateRosterLegality(team, roster).map((v) => v.detail));
    } catch {
      issues.push(`Unknown roster ${team.rosterName}`);
    }
    return issues;
  };

  /** Case-insensitive substring match on team name or roster name, so a
   *  coach with many saved teams can narrow either column's list down. */
  const matchesFilter = (team: Team, filter: string): boolean => {
    const query = filter.trim().toLowerCase();
    if (!query) return true;
    return (
      team.name.toLowerCase().includes(query) ||
      team.rosterName.toLowerCase().includes(query)
    );
  };

  const teams1 = teams.filter((team) => matchesFilter(team, filter1));
  const teams2 = teams.filter((team) => matchesFilter(team, filter2));

  const pendingDevelopment = (team: Team) => team.players.filter(mustAdvance);

  const handleSelectTeam1 = (team: Team) => {
    if (legalityIssues(team).length > 0) return;
    setSelectedTeam1(team);
  };

  const handleSelectTeam2 = (team: Team) => {
    if (legalityIssues(team).length > 0) return;
    setSelectedTeam2(team);
  };

  const blockingDevelopment = [selectedTeam1, selectedTeam2]
    .filter((team): team is Team => !!team)
    .flatMap((team) => pendingDevelopment(team));

  const handleStartGame = () => {
    if (
      !selectedTeam1 ||
      !selectedTeam2 ||
      selectedTeam1.id === selectedTeam2.id ||
      blockingDevelopment.length > 0
    ) {
      return;
    }
    if (
      mode !== "sandbox" &&
      readMatchSave() &&
      !window.confirm(
        "Starting a new local match will replace your saved match. Continue?"
      )
    ) {
      return;
    }
    if (mode !== "sandbox") {
      clearMatchSave();
    }
    const targetRoute = mode === "sandbox" ? "/sand-box" : "/play";
    navigate(targetRoute, {
      state: {
        team1: selectedTeam1,
        team2: selectedTeam2,
        progressionEnabled,
        pitchThemeId,
      },
    });
  };

  const handleBack = () => {
    navigate("/");
  };

  const canStart =
    selectedTeam1 !== null &&
    selectedTeam2 !== null &&
    selectedTeam1.id !== selectedTeam2.id &&
    blockingDevelopment.length === 0;

  if (teams.length < 2) {
    return (
      <PageShell width="medium">
        <PageHeader
          eyebrow="Friendly Sevens Match"
          title="TEAM SELECTION"
          back={{ label: "← Back to Menu", onClick: handleBack }}
        />
        <EmptyState
          title="You need at least 2 teams to play!"
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <HudButton onClick={handleBack}>← Back to Menu</HudButton>
              <HudButton
                variant="primary"
                onClick={() => navigate("/build-team")}
              >
                Build Team
              </HudButton>
            </div>
          }
        >
          Go to Build Team to create teams first.
        </EmptyState>
      </PageShell>
    );
  }

  const renderColumn = (
    player: 1 | 2,
    filter: string,
    setFilter: (filter: string) => void,
    columnTeams: Team[],
    selected: Team | null,
    onSelect: (team: Team) => void
  ) => (
    <Panel
      as="section"
      accent={
        selected ? { color: numToHex(selected.colors.primary) } : "neutral"
      }
      data-testid={`team-column-${player}`}
    >
      <PanelHeader
        as="h2"
        title={`Player ${player}`}
        aside={`${columnTeams.length} teams`}
        className="px-4"
      />
      <div className="p-3">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search team or roster..."
          aria-label={`Filter Player ${player} teams`}
          className="hud-field"
        />
        <div className="hud-scroll mt-2 flex h-[clamp(200px,calc(100vh_-_400px),620px)] flex-col gap-1.5 overflow-y-auto p-1">
          {columnTeams.length === 0 ? (
            <p className="py-6 text-center text-hud-sm text-hud-mute">
              No teams match &quot;{filter}&quot;.
            </p>
          ) : (
            columnTeams.map((team) => {
              const issues = legalityIssues(team);
              const isSelected = selected?.id === team.id;
              return (
                <button
                  key={team.id}
                  type="button"
                  disabled={issues.length > 0}
                  title={issues.length > 0 ? issues.join("; ") : undefined}
                  aria-pressed={isSelected}
                  className={cx(
                    hudChoiceClass(isSelected),
                    "flex w-full shrink-0 items-center gap-2.5 px-3 py-2"
                  )}
                  onClick={() => onSelect(team)}
                >
                  <TeamSwatch
                    color={numToHex(team.colors.primary)}
                    className="h-4 w-4"
                  />
                  <span className="min-w-0 flex-1 truncate font-hud-label text-hud-base font-bold uppercase tracking-[0.04em] text-hud-bone">
                    {team.name}
                  </span>
                  <span className="shrink-0 text-hud-sm text-hud-dim">
                    {team.rosterName}
                  </span>
                  {issues.length > 0 && <Chip tone="blood">Illegal</Chip>}
                </button>
              );
            })
          )}
        </div>
      </div>
    </Panel>
  );

  return (
    <PageShell
      actionBar={
        <>
          <HudButton variant="ghost" onClick={handleBack}>
            ← Back to Menu
          </HudButton>
          <Matchup team1={selectedTeam1} team2={selectedTeam2} />
          <HudButton
            variant="primary"
            size="lg"
            onClick={handleStartGame}
            disabled={!canStart}
          >
            Start Game →
          </HudButton>
        </>
      }
    >
      <PageHeader eyebrow="Friendly Sevens Match" title="TEAM SELECTION" />

      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-5">
        {renderColumn(
          1,
          filter1,
          setFilter1,
          teams1,
          selectedTeam1,
          handleSelectTeam1
        )}
        <span
          aria-hidden
          className="font-hud-display text-hud-3xl uppercase text-hud-gold"
        >
          VS
        </span>
        {renderColumn(
          2,
          filter2,
          setFilter2,
          teams2,
          selectedTeam2,
          handleSelectTeam2
        )}
      </div>

      {blockingDevelopment.length > 0 && (
        <Notice tone="blood" role="alert" className="mt-4">
          {blockingDevelopment.length} player
          {blockingDevelopment.length === 1 ? "" : "s"} must advance in Manage
          Team before this match can start.
        </Notice>
      )}

      <Section title="Choose the pitch" className="mt-6">
        <p className="mb-4 text-hud-sm text-hud-dim">
          Presentation only—the same 20×11 field is used for every theme.
        </p>
        <div className="max-w-2xl">
          <PitchThemePicker value={pitchThemeId} onChange={setPitchThemeId} />
        </div>
      </Section>

      {mode !== "sandbox" && (
        <Panel className="p-4">
          <label className="flex cursor-pointer items-center gap-3 text-hud-base text-hud-bone">
            <input
              type="checkbox"
              className="hud-check"
              checked={progressionEnabled}
              onChange={(event) => setProgressionEnabled(event.target.checked)}
            />
            League fixture — award SPP and enable player advancement
          </label>
        </Panel>
      )}
    </PageShell>
  );
}

/** The action bar's readout of who plays whom. */
function Matchup({ team1, team2 }: { team1: Team | null; team2: Team | null }) {
  if (!team1 && !team2) {
    return <span className="hud-label text-hud-mute">Pick two teams</span>;
  }
  const side = (team: Team | null) =>
    team ? (
      <span className="flex min-w-0 items-center gap-2">
        <TeamSwatch color={numToHex(team.colors.primary)} />
        <span className="truncate font-hud-label text-hud-lg font-bold uppercase tracking-[0.04em] text-hud-bone">
          {team.name}
        </span>
      </span>
    ) : (
      <span className="hud-label shrink-0 text-hud-mute">Pick a team</span>
    );
  return (
    <div className="flex min-w-0 flex-1 items-center justify-center gap-3">
      {side(team1)}
      <span className="shrink-0 font-hud-display text-hud-lg text-hud-gold">
        VS
      </span>
      {side(team2)}
    </div>
  );
}
