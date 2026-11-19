import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createCompetition } from "../../../competition/create";
import { getComputerTeamTemplates } from "../../../competition/computerTeamTemplates";
import { type ComputerTeamTemplate } from "../../../data/computerTeamCatalogue";
import {
  competitionPath,
  type CompetitionType,
  type TournamentFormat,
} from "../../../competition/types";
import {
  checkTeamCompatibility,
  createRosterRuleProfile,
  type RosterRuleProfile,
} from "../../../competition/rosterRules";
import {
  fetchAllCoachTeams,
  type OwnedTeam,
} from "../../../firebase/cloudTeamRepository";
import { useTeamLibrary } from "../../hooks/useTeamLibrary";
import {
  DIFFICULTIES,
  type Difficulty,
} from "../../../simulation/ai/difficulty";
import {
  RosterName,
  type Team,
  type TeamAdvancementMode,
} from "../../../types/Team";
import { useAuth } from "../../hooks/useAuth";
import {
  DEFAULT_SEVENS_RULESET,
  NAF_SEVENS_RULESET,
  type SevensRuleset,
} from "../../../game/rules/sevensRuleset";
import { SevensRulesetSelector } from "../common/SevensRulesetSelector";
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
  ownerUid?: string;
}

interface ComputerRow {
  id: number;
  template: ComputerTeamTemplate;
}

export function CompetitionBuilder({ type }: { type: CompetitionType }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextComputerId = useRef(1);
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [format, setFormat] = useState<TournamentFormat>("single-elimination");
  const [selected, setSelected] = useState<string[]>([]);
  const [otherTeams, setOtherTeams] = useState<OwnedTeam[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [useProfile, setUseProfile] = useState(false);
  const [ruleset, setRuleset] = useState<SevensRuleset>(
    searchParams.get("ruleset") === NAF_SEVENS_RULESET
      ? NAF_SEVENS_RULESET
      : DEFAULT_SEVENS_RULESET
  );
  const templates = useMemo(() => getComputerTeamTemplates(ruleset), [ruleset]);
  const rosters = [
    ...new Set(templates.map((template) => template.rosterName)),
  ];
  const [advancementMode, setAdvancementModeChoice] =
    useState<TeamAdvancementMode>("advanced-league");
  const [draftBudget, setDraftBudget] = useState(600_000);
  const [computerRows, setComputerRows] = useState<ComputerRow[]>(() => {
    const template = templates.find(
      (candidate) => candidate.id === searchParams.get("computer")
    );
    return template ? [{ id: 0, template }] : [];
  });
  const [leagueSize, setLeagueSize] = useState(16);
  const [difficulty, setDifficulty] = useState<Difficulty>("standard");
  const [localTeams] = useTeamLibrary();

  const profile: RosterRuleProfile | undefined = useProfile
    ? createRosterRuleProfile({
        advancementMode,
        draftBudget,
      })
    : undefined;

  useEffect(() => {
    if (!user) return;
    void fetchAllCoachTeams()
      .then((owned) => {
        setOtherTeams(owned.filter((entry) => entry.ownerUid !== user.uid));
      })
      .catch(() => {
        setOtherTeams([]);
      });
  }, [user]);

  const candidates: Candidate[] = [
    ...localTeams
      .filter((team) => !team.computerCoached)
      .map((team) => ({
        id: `own:${team.id}`,
        label: `${team.name} (${team.rosterName}) · your team`,
        team,
        ownerUid: user?.uid,
      })),
    ...otherTeams

      .filter(
        (owned) =>
          !owned.team.computerCoached &&
          !localTeams.some((team) => team.id === owned.team.id)
      )
      .map((owned) => ({
        id: `coach:${owned.ownerUid}:${owned.team.id}`,
        label: `${owned.team.name} (${owned.team.coachName || "Unnamed"}) — other coach`,
        team: owned.team,
        ownerUid: owned.ownerUid,
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
    setComputerRows((rows) => {
      const next = [...rows];
      const chosen = candidates.filter((candidate) =>
        selected.includes(candidate.id)
      );
      const rosterCounts = new Map<RosterName, number>();
      for (const roster of [
        ...chosen.map((candidate) => candidate.team.rosterName),
        ...rows.map((row) => row.template.rosterName),
      ]) {
        rosterCounts.set(roster, (rosterCounts.get(roster) ?? 0) + 1);
      }
      for (const id of ids) {
        const fewest = Math.min(
          ...rosters.map((roster) => rosterCounts.get(roster) ?? 0)
        );
        const pool = rosters.filter(
          (roster) => (rosterCounts.get(roster) ?? 0) === fewest
        );
        const roster = pool[Math.floor(Math.random() * pool.length)];
        const variants = templates.filter(
          (template) => template.rosterName === roster
        );
        const unused = variants.filter(
          (template) => !next.some((row) => row.template.id === template.id)
        );
        const choices = unused.length > 0 ? unused : variants;
        const template = choices[Math.floor(Math.random() * choices.length)];
        next.push({ id, template });
        rosterCounts.set(roster, (rosterCounts.get(roster) ?? 0) + 1);
      }
      return next;
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
        <SevensRulesetSelector value={ruleset} onChange={setRuleset} />
        <p className="mt-3 font-hud-body text-hud-sm text-hud-dim">
          This choice applies to the whole tournament or league season.
        </p>
      </Section>

      <Section title="Roster rule profile">
        <label className="flex items-start gap-3 font-hud-body text-hud-base text-hud-bone">
          <input
            type="checkbox"
            checked={useProfile}
            onChange={(event) => {
              setUseProfile(event.target.checked);
            }}
            className="hud-check mt-0.5"
          />
          Require an advancement mode, draft budget, and roster rules for
          entrants (leave unchecked for an unrestricted legacy competition)
        </label>
        {useProfile && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Advancement mode">
              <select
                value={advancementMode}
                onChange={(event) => {
                  setAdvancementModeChoice(
                    event.target.value as TeamAdvancementMode
                  );
                }}
                className="hud-field"
              >
                <option value="advanced-league">Advanced League</option>
                <option value="matched-play">Matched Play</option>
                <option value="sevens-skill-selection">
                  Sevens Skill Selection
                </option>
              </select>
            </Field>
            <Field label="Draft budget (gold)">
              <input
                type="number"
                step={10000}
                value={draftBudget}
                onChange={(event) => {
                  setDraftBudget(Number(event.target.value) || 0);
                }}
                className="hud-field"
              />
            </Field>
          </div>
        )}
      </Section>

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
              ruleset
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
                  <span className="mt-1 text-[13px] leading-snug text-hud-bad">
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
                  {!templates.some(
                    (template) => template.id === row.template.id
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
                {!templates.some(
                  (template) => template.id === row.template.id
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
          <p className="hud-label mb-2 mt-5">How hard the computer plays</p>
        )}
        {computerEntrants > 0 && (
          <div
            role="radiogroup"
            aria-label="How hard the computer plays"
            className="grid max-w-2xl grid-cols-3 gap-2"
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
                <span className="block text-hud-sm text-hud-dim">{detail}</span>
              </button>
            ))}
          </div>
        )}
      </Section>
    </PageShell>
  );
}
