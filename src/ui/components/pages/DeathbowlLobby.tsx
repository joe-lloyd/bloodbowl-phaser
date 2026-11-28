import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { type Team } from "../../../types/Team";
import { getRosterByRosterName } from "../../../data/RosterTemplates";
import { type EntryProblem } from "../../../game/deathbowl/entry";
import { deathbowlSaveSlot } from "../../../game/persistence/MatchSaveRepository";
import { type Difficulty } from "../../../simulation/ai/difficulty";
import { useTeamLibrary } from "../../hooks/useTeamLibrary";
import { DifficultyPicker } from "../competition/DifficultyPicker";
import { Title } from "../componentWarehouse/HudTitle";
import {
  Chip,
  cx,
  EmptyState,
  HudButton,
  hudChoiceClass,
  Notice,
  PageHeader,
  PageShell,
  Section,
  TeamSwatch,
} from "../componentWarehouse/HudKit";
import { numToHex } from "../TeamManagement/TeamStatsOverview";
import {
  checkEntry,
  computerSeats,
  type DeathbowlEntryCheck,
  deathbowlTeams,
} from "./deathbowlSeats";

const COMPUTER_SEATS = ["East", "South", "West"] as const;

function TeamChoice({
  team,
  picked,
  onPick,
}: {
  team: Team;
  picked: boolean;
  onPick: (team: Team) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={picked}
      className={cx(hudChoiceClass(picked), "flex w-full items-center gap-2.5 px-3 py-2")}
      onClick={() => {
        onPick(team);
      }}
    >
      <TeamSwatch color={numToHex(team.colors.primary)} className="h-4 w-4" />
      <Title level="row" as="span" className="min-w-0 flex-1 truncate">
        {team.name}
      </Title>
      <span className="shrink-0 text-hud-sm text-hud-dim">{team.rosterName}</span>
    </button>
  );
}

function ProblemList({ problems }: { problems: readonly EntryProblem[] }) {
  return (
    <ul className="mt-2 flex flex-col gap-1.5">
      {problems.map(({ rule, message }) => (
        <li key={`${rule}:${message}`} className="flex items-start gap-2">
          <Chip tone="blood">{rule}</Chip>
          <span>{message}</span>
        </li>
      ))}
    </ul>
  );
}

function EntryReport({ check }: { check: DeathbowlEntryCheck }) {
  return (
    <div data-testid="deathbowl-entry" className="mt-4 flex flex-col gap-3">
      {check.blocks.length > 0 ? (
        <Notice tone="bad" role="alert" title="This team cannot enter">
          <ProblemList problems={check.blocks} />
        </Notice>
      ) : (
        <Notice tone="good" role="status" title="Ready to enter" />
      )}
      {check.notices.length > 0 && (
        <Notice tone="warn" title="These stay home">
          <ProblemList problems={check.notices} />
        </Notice>
      )}
    </div>
  );
}

function Opponents({ teams }: { teams: readonly Team[] }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-3">
      {teams.map((team, index) => (
        <li key={team.id} className="hud-slab flex items-center gap-2.5 px-3 py-2">
          <TeamSwatch color={numToHex(team.colors.primary)} className="h-4 w-4" />
          <span className="min-w-0 flex-1">
            <Title level="row" as="span" className="block truncate">
              {team.name}
            </Title>
            <span className="text-hud-sm text-hud-dim">
              {COMPUTER_SEATS[index]} · {team.rosterName}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function YourTeam({
  teams,
  picked,
  onPick,
}: {
  teams: readonly Team[];
  picked: Team | null;
  onPick: (team: Team) => void;
}) {
  if (teams.length === 0)
    return <EmptyState title="No saved teams yet">Build one in Team Builder first.</EmptyState>;
  return (
    <div className="hud-scroll flex max-h-[40dvh] flex-col gap-1.5 overflow-y-auto p-1">
      {teams.map((team) => (
        <TeamChoice key={team.id} team={team} picked={picked?.id === team.id} onPick={onPick} />
      ))}
    </div>
  );
}

const replacesSave = () =>
  deathbowlSaveSlot.read() !== null &&
  !confirm("Starting a new Deathbowl match will replace your saved one. Continue?");

export function DeathbowlLobby() {
  const [library] = useTeamLibrary();
  const navigate = useNavigate();
  const [picked, setPicked] = useState<Team | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("standard");
  const computers = useMemo(() => (picked ? computerSeats(picked) : null), [picked]);
  const check = picked ? checkEntry(picked, getRosterByRosterName(picked.rosterName)) : null;
  const canStart = picked !== null && computers !== null && check?.blocks.length === 0;

  const start = () => {
    if (!picked || !computers || !canStart || replacesSave()) return;
    deathbowlSaveSlot.clear();
    const teams = deathbowlTeams(picked, computers);
    void navigate("/deathbowl/play", {
      state: { teams, humanTeamId: teams[0].id, difficulty },
    });
  };

  return (
    <PageShell
      actionBar={
        <>
          <HudButton variant="ghost" onClick={() => void navigate("/")}>
            ← Back to Menu
          </HudButton>
          <HudButton variant="primary" size="lg" onClick={start} disabled={!canStart}>
            Start Match →
          </HudButton>
        </>
      }
    >
      <PageHeader
        title="DEATHBOWL SEVENS"
        subtitle="Four teams and two balls on the plus-shaped arena. Your team takes the North seat and the computer coaches the other three."
      />
      <Section title="Your team · North">
        <YourTeam teams={library.filter((team) => !team.computerCoached)} picked={picked} onPick={setPicked} />
        {check && <EntryReport check={check} />}
      </Section>
      {computers && (
        <Section title="Computer teams" className="mt-6">
          <Opponents teams={computers} />
        </Section>
      )}
      <DifficultyPicker value={difficulty} onChange={setDifficulty} />
    </PageShell>
  );
}
