import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { RosterName, type Team } from "../../../types/Team";
import { useTeamLibrary } from "../../hooks/useTeamLibrary";
import { validateRosterLegality } from "../../../game/rules/rosterLegality";
import { validateInsignificant } from "../../../game/rules/insignificant";
import { mustAdvance } from "../../../game/progression/progression";
import {
  getAvailableRosterNames,
  getRosterByRosterName,
} from "../../../data/RosterTemplates";
import { saveTeam } from "../../../game/managers/TeamManager";
import {
  getComputerTeamTemplates,
  createComputerTeamFromTemplate,
} from "../../../competition/computerTeamTemplates";
import { createReadyMadeTeam } from "../../../simulation/lineups";
import {
  Chip,
  cx,
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
import {
  DIFFICULTIES,
  type Difficulty,
} from "../../../simulation/ai/difficulty";
import {
  clearMatchSave,
  readMatchSave,
} from "../../../game/persistence/MatchSaveRepository";

interface TeamSelectProps {
  mode?: "sandbox" | "standard" | "play";
}

const READY_MADE_COLORS = [0x8e1b1b, 0x1e3a5f, 0x556b2f, 0xd6b25e];

function ReadyMadeTeamPicker({
  teams,
  onAdded,
}: {
  teams: Team[];
  onAdded: () => void;
}) {
  const [roster, setRoster] = useState<RosterName>(RosterName.HUMAN);
  const add = () => {
    const color = READY_MADE_COLORS[teams.length % READY_MADE_COLORS.length];
    if (color === undefined) return;
    const taken = new Set(teams.map((team) => team.name));
    const base = `Ready-made ${roster}`;
    let name = base;
    for (let n = 2; taken.has(name); n++) name = `${base} ${String(n)}`;
    saveTeam(
      createReadyMadeTeam(roster, name, color)
    );
    onAdded();
  };
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <select
        aria-label="Roster for a ready-made team"
        value={roster}
        onChange={(event) => {
          setRoster(
            getAvailableRosterNames().find(
              (name) => name === event.target.value
            ) ?? roster
          );
        }}
        className="hud-field w-auto min-w-[180px]"
      >
        {getAvailableRosterNames().map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <HudButton onClick={add}>Add ready-made team</HudButton>
    </div>
  );
}

export function TeamSelect({ mode = "play" }: TeamSelectProps) {
  const [library, reloadTeams] = useTeamLibrary();
  const [searchParams] = useSearchParams();
  const computerTeams = useMemo(
    () =>
      getComputerTeamTemplates().map((template) =>
        createComputerTeamFromTemplate(template.id)
      ),
    []
  );
  const initialComputer = computerTeams.find(
    (team) =>
      mode === "play" &&
      team.computerTemplateId === searchParams.get("computer")
  );

  const teams = library.filter((team) => !team.computerCoached);
  const [selectedTeam1, setSelectedTeam1] = useState<Team | null>(null);
  const [selectedTeam2, setSelectedTeam2] = useState<Team | null>(
    initialComputer ?? null
  );
  const [filter1, setFilter1] = useState("");
  const [filter2, setFilter2] = useState("");
  const [progressionEnabled, setProgressionEnabled] = useState(false);

  const [opponent, setOpponent] = useState<"human" | "computer">(
    initialComputer ? "computer" : "human"
  );
  const vsComputer = mode === "play" && opponent === "computer";
  const [difficulty, setDifficulty] = useState<Difficulty>("standard");
  const navigate = useNavigate();

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

  const matchesFilter = (team: Team, filter: string): boolean => {
    const query = filter.trim().toLowerCase();
    if (!query) return true;
    return (
      team.name.toLowerCase().includes(query) ||
      team.rosterName.toLowerCase().includes(query)
    );
  };

  const teams1 = teams.filter((team) => matchesFilter(team, filter1));
  const teams2 = (vsComputer ? computerTeams : teams).filter((team) =>
    matchesFilter(team, filter2)
  );

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
        "Starting a new match will replace your saved match. Continue?"
      )
    ) {
      return;
    }
    if (mode !== "sandbox") {
      clearMatchSave();
    }
    if (vsComputer) {
      if (!selectedTeam2.computerTemplateId) return;
      const computerTeam = createComputerTeamFromTemplate(
        selectedTeam2.computerTemplateId
      );
      navigate("/play/computer", {
        state: {
          team1: selectedTeam1,
          team2: computerTeam,
          computerTeamId: computerTeam.id,
          difficulty,
        },
      });
      return;
    }
    const targetRoute = mode === "sandbox" ? "/sand-box" : "/play";
    navigate(targetRoute, {
      state: {
        team1: selectedTeam1,
        team2: selectedTeam2,
        progressionEnabled,
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
      data-testid={`team-column-${String(player)}`}
    >
      <PanelHeader
        as="h2"
        title={
          player === 2 && vsComputer ? "Computer" : `Player ${String(player)}`
        }
        aside={`${String(columnTeams.length)} teams`}
        className="px-4"
      />
      <div className="p-3">
        <input
          type="text"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
          }}
          placeholder="Search team or roster..."
          aria-label={`Filter Player ${String(player)} teams`}
          className="hud-field"
        />
        <div className="hud-scroll mt-2 flex h-[clamp(200px,calc(100vh_-_400px),620px)] flex-col gap-1.5 overflow-y-auto p-1">
          {columnTeams.length === 0 ? (
            <p className="py-6 text-center text-hud-sm text-hud-mute">
              {filter
                ? `No teams match "${filter}".`
                : "No saved teams yet. Add a ready-made team below."}
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
                  onClick={() => {
                    onSelect(team);
                  }}
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

      {mode === "play" && (
        <Section title="Player 2" className="mt-6">
          <div
            role="radiogroup"
            aria-label="Who coaches Player 2"
            className="grid max-w-2xl grid-cols-2 gap-2"
          >
            {(
              [
                ["human", "Coach", "Another coach at this screen"],
                [
                  "computer",
                  "Versus computer",
                  "The computer coaches Player 2",
                ],
              ] as const
            ).map(([value, label, detail]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={opponent === value}
                className={cx(
                  hudChoiceClass(opponent === value),
                  "px-4 py-3 text-left"
                )}
                onClick={() => {
                  if (value !== opponent) {
                    setOpponent(value);
                    setSelectedTeam2(null);
                  }
                }}
              >
                <span className="block font-hud-label text-hud-base font-bold uppercase tracking-[0.04em] text-hud-bone">
                  {label}
                </span>
                <span className="block text-hud-sm text-hud-dim">{detail}</span>
              </button>
            ))}
          </div>
          {vsComputer && (
            <div
              role="radiogroup"
              aria-label="How hard the computer plays"
              className="mt-3 grid max-w-2xl grid-cols-3 gap-2"
            >
              {DIFFICULTIES.map(({ id, label, detail }) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={difficulty === id}
                  className={cx(
                    hudChoiceClass(difficulty === id),
                    "px-4 py-3 text-left"
                  )}
                  onClick={() => {
                    setDifficulty(id);
                  }}
                >
                  <span className="block font-hud-label text-hud-base font-bold uppercase tracking-[0.04em] text-hud-bone">
                    {label}
                  </span>
                  <span className="block text-hud-sm text-hud-dim">
                    {detail}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Section>
      )}

      <div className="grid grid-cols-1 items-center gap-5 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
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
          className="justify-self-center font-hud-display text-hud-3xl uppercase text-hud-gold"
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

      <Section title="Ready-made teams" className="mt-6">
        <ReadyMadeTeamPicker teams={teams} onAdded={reloadTeams} />
      </Section>

      {mode !== "sandbox" && !vsComputer && (
        <Panel className="p-4">
          <label className="flex cursor-pointer items-center gap-3 text-hud-base text-hud-bone">
            <input
              type="checkbox"
              className="hud-check"
              checked={progressionEnabled}
              onChange={(event) => {
                setProgressionEnabled(event.target.checked);
              }}
            />
            League fixture — award SPP and enable player advancement
          </label>
        </Panel>
      )}
    </PageShell>
  );
}

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
