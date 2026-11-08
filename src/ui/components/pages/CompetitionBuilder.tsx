import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createCompetition } from "../../../competition/create";
import {
  computerTeamName,
  createComputerTeam,
} from "../../../competition/computerTeams";
import {
  competitionPath,
  CompetitionType,
  TournamentFormat,
} from "../../../competition/types";
import {
  checkTeamCompatibility,
  createRosterRuleProfile,
  RosterRuleProfile,
} from "../../../competition/rosterRules";
import {
  fetchAllCoachTeams,
  OwnedTeam,
} from "../../../firebase/cloudTeamRepository";
import { useTeamLibrary } from "../../hooks/useTeamLibrary";
import { DIFFICULTIES, Difficulty } from "../../../simulation/ai/difficulty";
import { RosterName, Team, TeamAdvancementMode } from "../../../types/Team";
import { useAuth } from "../../hooks/useAuth";
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

type Candidate = {
  id: string;
  label: string;
  team: Team;
  ownerUid?: string;
};

/** A computer team to build when the competition is generated. */
type ComputerRow = { key: string; name: string; rosterName: RosterName };

const ROSTERS = Object.values(RosterName);
const KIT_COLOURS = [
  0xb22222, 0x1f4e9c, 0x2e8b57, 0xd4a017, 0x6a0dad, 0xff7f00, 0x008b8b,
  0x8b4513, 0x708090, 0xc71585, 0x556b2f, 0x4682b4,
];

/**
 * Every coach's team is added to a competition the same way — as a
 * reference to a live team, whether it is the organizer's own or another
 * coach's (shared-team-library: "no distinction between a 'shared' and a
 * 'local' entrant source"). There is no publish/shared-copy step; other
 * coaches' teams are read directly. Computer teams are built here and kept
 * in the organizer's library.
 */
export function CompetitionBuilder({ type }: { type: CompetitionType }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [format, setFormat] = useState<TournamentFormat>("single-elimination");
  const [selected, setSelected] = useState<string[]>([]);
  const [otherTeams, setOtherTeams] = useState<OwnedTeam[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [useProfile, setUseProfile] = useState(false);
  const [advancementMode, setAdvancementModeChoice] =
    useState<TeamAdvancementMode>("advanced-league");
  const [draftBudget, setDraftBudget] = useState(1_200_000);
  const [computerRows, setComputerRows] = useState<ComputerRow[]>([]);
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
      .then((owned) =>
        setOtherTeams(owned.filter((entry) => entry.ownerUid !== user.uid))
      )
      .catch(() => setOtherTeams([]));
  }, [user]);

  const candidates: Candidate[] = [
    ...localTeams.map((team) => ({
      id: `own:${team.id}`,
      label: `${team.name} (${team.rosterName}) — ${team.computerCoached ? "computer team" : "your team"}`,
      team,
      ownerUid: user?.uid,
    })),
    ...otherTeams
      // Another coach's computer team plays from their library, not this one
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

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((candidate) => candidate !== id)
        : [...current, id]
    );

  const addComputerTeam = () =>
    setComputerRows((rows) => {
      const used = new Set(rows.map((row) => row.rosterName));
      const fresh = ROSTERS.filter((roster) => !used.has(roster));
      const pool = fresh.length > 0 ? fresh : ROSTERS;
      const taken = new Set([
        ...rows.map((row) => row.name),
        ...localTeams.map((team) => team.name),
      ]);
      return [
        ...rows,
        {
          key: `${Date.now()}-${rows.length}`,
          name: computerTeamName(taken),
          rosterName: pool[Math.floor(Math.random() * pool.length)],
        },
      ];
    });

  const computerEntrants =
    computerRows.length +
    selected.filter(
      (id) =>
        candidates.find((candidate) => candidate.id === id)?.team
          .computerCoached
    ).length;

  const create = async () => {
    setError(null);
    const chosen = selected
      .map((id) => candidates.find((candidate) => candidate.id === id))
      .filter((candidate): candidate is Candidate => Boolean(candidate));
    try {
      const built = computerRows.map((row, index) =>
        createComputerTeam(
          row.rosterName,
          row.name,
          KIT_COLOURS[index % KIT_COLOURS.length],
          profile?.advancementMode ?? "advanced-league"
        )
      );
      const competition = await createCompetition({
        type,
        name,
        format,
        organizerUid: user?.uid ?? null,
        entrants: [
          ...chosen.map((candidate) => ({
            team: candidate.team,
            ownerUid: candidate.ownerUid ?? null,
          })),
          ...built.map((team) => ({ team, ownerUid: user?.uid ?? null })),
        ],
        profile,
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
          {/* In the pinned bar so the reason is visible next to the button. */}
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
              onChange={(event) => setName(event.target.value)}
              className="hud-field"
            />
          </Field>

          {type === "tournament" && (
            <Field label="Format">
              <select
                value={format}
                onChange={(event) =>
                  setFormat(event.target.value as TournamentFormat)
                }
                className="hud-field"
              >
                <option value="single-elimination">Single elimination</option>
                <option value="round-robin">Round robin</option>
              </select>
            </Field>
          )}
        </div>
      </Section>

      <Section title="Roster rule profile">
        <label className="flex items-start gap-3 font-hud-body text-hud-base text-hud-bone">
          <input
            type="checkbox"
            checked={useProfile}
            onChange={(event) => setUseProfile(event.target.checked)}
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
                onChange={(event) =>
                  setAdvancementModeChoice(
                    event.target.value as TeamAdvancementMode
                  )
                }
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
                onChange={(event) =>
                  setDraftBudget(Number(event.target.value) || 0)
                }
                className="hud-field"
              />
            </Field>
          </div>
        )}
      </Section>

      <Section title="Computer teams">
        <p className="mb-4 font-hud-body text-hud-sm text-hud-dim">
          The computer coaches these teams. You play your own games against
          them, or take one over for a game. A game between two computer teams
          is played out in seconds, injuries and all. They join your team
          library, so they can play next season too.
        </p>
        {computerRows.length > 0 && (
          <ul className="mb-4 space-y-2">
            {computerRows.map((row, index) => (
              <li
                key={row.key}
                className="flex flex-wrap items-center gap-2 font-hud-body text-hud-base text-hud-bone"
              >
                <span className="min-w-[12rem] flex-1">
                  <span className="font-hud-label font-bold uppercase tracking-[0.06em] text-hud-gold">
                    Seed {selected.length + index + 1}:{" "}
                  </span>
                  {row.name}
                </span>
                <select
                  aria-label={`${row.name} roster`}
                  value={row.rosterName}
                  onChange={(event) =>
                    setComputerRows((rows) =>
                      rows.map((candidate) =>
                        candidate.key === row.key
                          ? {
                              ...candidate,
                              rosterName: event.target.value as RosterName,
                            }
                          : candidate
                      )
                    )
                  }
                  className="hud-field w-auto"
                >
                  {ROSTERS.map((roster) => (
                    <option key={roster} value={roster}>
                      {roster}
                    </option>
                  ))}
                </select>
                <HudButton
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${row.name}`}
                  onClick={() =>
                    setComputerRows((rows) =>
                      rows.filter((candidate) => candidate.key !== row.key)
                    )
                  }
                >
                  Remove
                </HudButton>
              </li>
            ))}
          </ul>
        )}
        <HudButton onClick={addComputerTeam}>+ Add computer team</HudButton>
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
                onClick={() => setDifficulty(id)}
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

      <Section title="Entrants and seeding">
        <p className="mb-4 font-hud-body text-hud-sm text-hud-dim">
          Selection order becomes seed order. Entrants reference live rosters,
          so advancement gained between fixtures carries into the next one.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {candidates.map((candidate) => {
            const seed = selected.indexOf(candidate.id) + 1;
            // A team already in an active competition cannot be entered
            // into another (design.md decision 4). Every candidate here
            // carries a live team object, own or another coach's, so
            // this is enforceable uniformly rather than owned-only.
            const committed = !!candidate.team.activeCompetitionId;
            const compatibility = checkTeamCompatibility(
              candidate.team,
              profile
            );
            return (
              <button
                key={candidate.id}
                disabled={committed}
                onClick={() => toggle(candidate.id)}
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
    </PageShell>
  );
}
