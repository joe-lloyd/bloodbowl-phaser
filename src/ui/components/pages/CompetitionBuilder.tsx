import { type ReactNode, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createCompetition } from "../../../competition/create";
import { getComputerTeamTemplates } from "../../../competition/computerTeamTemplates";
import { pickComputerTemplates } from "../../../competition/computerFill";
import { RosterProfileSection } from "../competition/RosterProfileSection";
import {
  DEFAULT_PROFILE_CHOICE,
  profileFrom,
} from "../competition/profileChoice";
import { OnlineCompetitionBuilder } from "../competition/OnlineCompetitionBuilder";
import { BuilderModeSwitch, type BuilderMode } from "../competition/BuilderModeSwitch";
import { DifficultyPicker } from "../competition/DifficultyPicker";
import { type ComputerTeamTemplate } from "../../../data/computerTeamCatalogue";
import {
  competitionPath,
  type CompetitionType,
  type TournamentFormat,
} from "../../../competition/types";
import {
  checkTeamCompatibility,
} from "../../../competition/rosterRules";
import { useTeamLibrary } from "../../hooks/useTeamLibrary";
import { type Difficulty } from "../../../simulation/ai/difficulty";
import { type Team } from "../../../types/Team";
import { useAuth } from "../../hooks/useAuth";
import {
  DEFAULT_SEVENS_RULESET,
  NAF_SEVENS_RULESET,
  type SevensRuleset,
} from "../../../game/rules/sevensRuleset";
import { SevensRulesetSelector } from "../common/SevensRulesetSelector";
import { GameTypeSelector } from "../common/GameTypeSelector";
import {
  DEFAULT_GAME_TYPE,
  type GameType,
  isGameType,
} from "../../../game/variants/gameTypes";
import { draftRulesFor } from "../../../game/rules/draftRules";
import {
  cx,
  Field,
  HudButton,
  hudChoiceClass,
  Notice,
  PageHeader,
  PageShell,
  Section,
} from "../componentWarehouse/HudKit";

interface Candidate {
  id: string;
  label: string;
  team: Team;
  ownerUid?: string | undefined;
}

interface ComputerRow {
  id: number;
  template: ComputerTeamTemplate;
}

function LocalCompetitionBuilder({
  type,
  modeSwitch,
}: {
  type: CompetitionType;
  modeSwitch: ReactNode;
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextComputerId = useRef(1);
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [format, setFormat] = useState<TournamentFormat>("single-elimination");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [profileChoice, setProfileChoice] = useState(DEFAULT_PROFILE_CHOICE);
  const [ruleset, setRuleset] = useState<SevensRuleset>(
    searchParams.get("ruleset") === NAF_SEVENS_RULESET
      ? NAF_SEVENS_RULESET
      : DEFAULT_SEVENS_RULESET
  );
  const gameTypeParam = searchParams.get("gameType");
  const [gameType, setGameType] = useState<GameType>(
    isGameType(gameTypeParam) ? gameTypeParam : DEFAULT_GAME_TYPE
  );
  const templates = useMemo(
    () => getComputerTeamTemplates({ ruleset, gameType }),
    [ruleset, gameType]
  );
  const rosters = [
    ...new Set(templates.map((template) => template.rosterName)),
  ];
  const [computerRows, setComputerRows] = useState<ComputerRow[]>(() => {
    const template = templates.find(
      (candidate) => candidate.id === searchParams.get("computer")
    );
    return template ? [{ id: 0, template }] : [];
  });
  const [leagueSize, setLeagueSize] = useState(16);
  const [difficulty, setDifficulty] = useState<Difficulty>("standard");
  const [localTeams] = useTeamLibrary();

  const profile = profileFrom(profileChoice);

  const candidates: Candidate[] = [
    ...localTeams
      .filter((team) => !team.computerCoached)
      .map((team) => ({
        id: `own:${team.id}`,
        label: `${team.name} (${team.rosterName}) · your team`,
        team,
        ownerUid: user?.uid,
      })),
  ];

  const toggle = (id: string) => {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((candidate) => candidate !== id)
        : [...current, id]
    );
  };

  const addComputerTeams = (count: number) => {
    const ids = Array.from({ length: count }, () => nextComputerId.current++);
    const chosen = candidates.filter((candidate) => selected.includes(candidate.id));
    setComputerRows((rows) => {
      const picks = pickComputerTemplates({
        templates,
        count,
        rosters: chosen.map((candidate) => candidate.team.rosterName),
        picked: rows.map((row) => row.template),
        random: Math.random,
      });
      return [
        ...rows,
        ...picks.map((template, index) => ({ id: ids[index] ?? -index, template })),
      ];
    });
  };

  const entrantCount = selected.length + computerRows.length;

  const computerEntrants = computerRows.length;

  const create = async () => {
    setError(null);
    const chosen = selected
      .map((id) => candidates.find((candidate) => candidate.id === id))
      .filter((candidate): candidate is Candidate => Boolean(candidate));
    try {
      const competition = await createCompetition({
        ruleset,
        gameType,
        type,
        name,
        format,
        organizerUid: user?.uid ?? null,
        entrants: [
          ...chosen.map((candidate) => ({
            team: candidate.team,
            ownerUid: candidate.ownerUid ?? null,
          })),
          ...computerRows.map((row) => ({
            computerTemplateId: row.template.id,
          })),
        ],
        ...(profile === undefined ? {} : { profile: profile }),
        computerDifficulty: difficulty,
      });
      navigate(
        competitionPath({
          competitionType: competition.type,
          competitionId: competition.id,
        })
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  return (
    <PageShell
      width="medium"
      actionBar={
        <>
          <HudButton variant="ghost" onClick={() => navigate(-1)}>
            Cancel
          </HudButton>

          {error && (
            <Notice
              tone="bad"
              role="alert"
              className="order-last w-full py-2 sm:order-none sm:w-auto sm:flex-1"
            >
              {error}
            </Notice>
          )}
          <HudButton variant="primary" onClick={() => void create()}>
            Generate competition
          </HudButton>
        </>
      }
    >
      <PageHeader title={`Create ${type}`} />
      {modeSwitch}

      <Section title="Details">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <input
              value={name}
              maxLength={60}
              onChange={(event) => {
                setName(event.target.value);
              }}
              className="hud-field"
            />
          </Field>

          {type === "tournament" && (
            <Field label="Format">
              <select
                value={format}
                onChange={(event) => {
                  setFormat(event.target.value as TournamentFormat);
                }}
                className="hud-field"
              >
                <option value="single-elimination">Single elimination</option>
                <option value="round-robin">Round robin</option>
              </select>
            </Field>
          )}
        </div>
      </Section>

      <Section title="Rules for this competition">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <GameTypeSelector
              label="Game type"
              value={gameType}
              onChange={(next) => {
                setGameType(next);
                setProfileChoice((choice) => ({
                  ...choice,
                  draftBudget: draftRulesFor(next).budget,
                }));
                setComputerRows([]);
              }}
            />
          </div>
          {gameType === DEFAULT_GAME_TYPE && (
            <SevensRulesetSelector value={ruleset} onChange={setRuleset} />
          )}
        </div>
        <p className="mt-3 font-hud-body text-hud-sm text-hud-dim">
          These choices apply to the whole tournament or league season. Every
          entrant must meet the game type&apos;s draft rules.
        </p>
      </Section>

      <RosterProfileSection value={profileChoice} onChange={setProfileChoice} />

      <Section title="Entrants and seeding">
        <p className="mb-4 font-hud-body text-hud-sm text-hud-dim">
          Selection order becomes seed order. Entrants reference live rosters,
          so advancement gained between fixtures carries into the next one.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {candidates.map((candidate) => {
            const seed = selected.indexOf(candidate.id) + 1;

            const committed = !!candidate.team.activeCompetitionId;
            const compatibility = checkTeamCompatibility(
              candidate.team,
              profile,
              { ruleset, gameType }
            );
            return (
              <button
                key={candidate.id}
                disabled={committed}
                onClick={() => {
                  toggle(candidate.id);
                }}
                aria-pressed={seed > 0}
                title={
                  committed
                    ? "Already entered in an active competition"
                    : undefined
                }
                className={cx(
                  hudChoiceClass(seed > 0),
                  "flex flex-col justify-start p-3 font-hud-body text-hud-sm text-hud-bone",
                  !seed &&
                    !compatibility.compatible &&
                    "ring-1 ring-inset ring-hud-bad/60"
                )}
              >
                <span>
                  {seed > 0 && (
                    <span className="font-hud-label font-bold uppercase tracking-[0.06em] text-hud-gold">
                      Seed {seed}:{" "}
                    </span>
                  )}
                  {candidate.label}
                  {committed ? " (already entered elsewhere)" : ""}
                </span>
                {!compatibility.compatible && (
                  <span className="mt-1 text-hud-sm leading-snug text-hud-bad">
                    {compatibility.reasons.join(" ")}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Computer teams">
        <p className="mb-4 font-hud-body text-hud-sm text-hud-dim">
          The computer coaches these teams. You play your own games against
          them, or take one over for a game. A game between two computer teams
          is played out in seconds, injuries and all. Each selected starting
          roster becomes a separate team for this competition and follows its
          advancement mode. Its template stays unchanged.
        </p>
        {type === "league" && (
          <div className="mb-5 space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="League size">
                <select
                  aria-label="League size"
                  className="hud-field"
                  value={leagueSize}
                  onChange={(event) => {
                    setLeagueSize(Number(event.target.value));
                  }}
                >
                  {[8, 16, 32].map((size) => (
                    <option key={size} value={size}>
                      {size} teams · {size - 1} matches per team
                    </option>
                  ))}
                </select>
              </Field>
              <HudButton
                variant="primary"
                disabled={entrantCount >= leagueSize}
                onClick={() => {
                  addComputerTeams(leagueSize - entrantCount);
                }}
              >
                Fill league with computer teams
              </HudButton>
            </div>
            <p className="font-hud-body text-hud-sm text-hud-dim" role="status">
              {entrantCount} of {leagueSize} places filled. Each team plays
              every opponent once.
              {entrantCount > leagueSize &&
                " Remove teams to use a smaller league."}
            </p>
          </div>
        )}
        {computerRows.length > 0 && (
          <ul className="mb-4 space-y-2">
            {computerRows.map((row, index) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-2 font-hud-body text-hud-base text-hud-bone"
              >
                <span className="min-w-[12rem] flex-1">
                  <span className="font-hud-label font-bold uppercase tracking-[0.06em] text-hud-gold">
                    Seed {selected.length + index + 1}:{" "}
                  </span>
                  {row.template.name}
                </span>
                <select
                  aria-label={`${row.template.name} roster`}
                  value={row.template.rosterName}
                  onChange={(event) => {
                    const template = templates.find(
                      (candidate) => candidate.rosterName === event.target.value
                    );
                    if (template)
                      setComputerRows((rows) =>
                        rows.map((candidate) =>
                          candidate.id === row.id
                            ? { ...candidate, template }
                            : candidate
                        )
                      );
                  }}
                  className="hud-field w-auto"
                >
                  {rosters.map((roster) => (
                    <option key={roster} value={roster}>
                      {roster}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={`${row.template.name} build`}
                  value={row.template.id}
                  className="hud-field w-auto max-w-full"
                  onChange={(event) => {
                    const template = templates.find(
                      (candidate) => candidate.id === event.target.value
                    );
                    if (template)
                      setComputerRows((rows) =>
                        rows.map((candidate) =>
                          candidate.id === row.id
                            ? { ...candidate, template }
                            : candidate
                        )
                      );
                  }}
                >
                  {templates.every(
                    (template) => template.id !== row.template.id
                  ) && (
                    <option value={row.template.id} disabled>
                      Choose a legal build
                    </option>
                  )}
                  {templates
                    .filter(
                      (template) =>
                        template.rosterName === row.template.rosterName
                    )
                    .map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} · {template.buildName}
                      </option>
                    ))}
                </select>
                {templates.every(
                  (template) => template.id !== row.template.id
                ) && (
                  <Notice tone="bad">
                    This starting roster is not legal under the selected rules.
                    Choose another build.
                  </Notice>
                )}
                <HudButton
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${row.template.name}`}
                  onClick={() => {
                    setComputerRows((rows) =>
                      rows.filter((candidate) => candidate.id !== row.id)
                    );
                  }}
                >
                  Remove
                </HudButton>
              </li>
            ))}
          </ul>
        )}
        <HudButton
          onClick={() => {
            addComputerTeams(1);
          }}
        >
          + Add computer team
        </HudButton>
        {computerEntrants > 0 && (
          <DifficultyPicker value={difficulty} onChange={setDifficulty} />
        )}
      </Section>
    </PageShell>
  );
}

export function CompetitionBuilder({ type }: { type: CompetitionType }) {
  const { user, onlineAvailable } = useAuth();
  const [mode, setMode] = useState<BuilderMode>("local");
  const modeSwitch =
    user && onlineAvailable ? (
      <BuilderModeSwitch type={type} mode={mode} onChange={setMode} />
    ) : null;
  return mode === "online" && user ? (
    <OnlineCompetitionBuilder type={type} uid={user.uid} modeSwitch={modeSwitch} />
  ) : (
    <LocalCompetitionBuilder type={type} modeSwitch={modeSwitch} />
  );
}
