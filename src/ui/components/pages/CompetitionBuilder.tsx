import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  computeStandings,
  generateRoundRobin,
  generateSingleElimination,
  seedEntrants,
} from "../../../competition/logic";
import {
  findCompetitionById,
  saveCompetition,
} from "../../../competition/repository";
import {
  CompetitionEntrant,
  CompetitionType,
  DEFAULT_LEAGUE_POINTS,
  TournamentFormat,
} from "../../../competition/types";
import {
  assertEntrantsCompatible,
  checkTeamCompatibility,
  createRosterRuleProfile,
  RosterRuleProfile,
} from "../../../competition/rosterRules";
import {
  fetchAllCoachTeams,
  OwnedTeam,
} from "../../../firebase/cloudTeamRepository";
import { saveTeam } from "../../../game/managers/TeamManager";
import { useTeamLibrary } from "../../hooks/useTeamLibrary";
import { validateRosterLegality } from "../../../game/rules/rosterLegality";
import { validateInsignificant } from "../../../game/rules/insignificant";
import { getRosterByRosterName } from "../../../data/RosterTemplates";
import { Team, TeamAdvancementMode } from "../../../types/Team";
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

/**
 * Every coach's team is added to a competition the same way — as a
 * reference to a live team, whether it is the organizer's own or another
 * coach's (shared-team-library: "no distinction between a 'shared' and a
 * 'local' entrant source"). There is no publish/shared-copy step; other
 * coaches' teams are read directly.
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
      label: `${team.name} (${team.rosterName}) — your team`,
      team,
      ownerUid: user?.uid,
    })),
    ...otherTeams
      .filter((owned) => !localTeams.some((team) => team.id === owned.team.id))
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

  const create = async () => {
    setError(null);
    const chosen = selected
      .map((id) => candidates.find((candidate) => candidate.id === id))
      .filter((candidate): candidate is Candidate => Boolean(candidate));
    if (!name.trim()) return setError("Give the competition a name.");
    if (chosen.length < 2) return setError("Select at least two teams.");

    // A team belongs to at most one active competition. Every candidate
    // here carries a live team object — the organizer's own (local) or
    // another coach's (read via fetchAllCoachTeams) — so this is
    // enforceable for every entrant, not only the organizer's own.
    for (const candidate of chosen) {
      const existingId = candidate.team.activeCompetitionId;
      if (!existingId) continue;
      const existing = await findCompetitionById(existingId);
      setError(
        `${candidate.team.name} is already entered in ` +
          `${existing?.name ?? "another active competition"}.`
      );
      return;
    }

    // Shared roster legality gates competition entry the same way it gates
    // finalization and match selection (team-lifecycle-modes).
    const illegal = chosen.filter((candidate) => {
      try {
        const teamRoster = getRosterByRosterName(candidate.team.rosterName);
        return (
          validateRosterLegality(candidate.team, teamRoster).length > 0 ||
          !!validateInsignificant(candidate.team.players)
        );
      } catch {
        return true;
      }
    });
    if (illegal.length > 0) {
      return setError(
        `These teams are not legal for competition entry: ${illegal
          .map((candidate) => candidate.team.name)
          .join(", ")}`
      );
    }

    try {
      assertEntrantsCompatible(
        chosen.map((candidate) => candidate.team),
        profile
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return;
    }

    // A cloud write to another coach's team is refused by Firestore rules
    // (owner-only write) — only stamp `activeCompetitionId` on teams this
    // coach actually owns.
    const ownedChosen = chosen.filter(
      (candidate) => candidate.ownerUid === user?.uid
    );

    const entrants = seedEntrants(
      chosen.map((candidate) => ({
        id: candidate.id,
        teamId: candidate.team.id,
        ownerUid: candidate.ownerUid ?? null,
        name: candidate.team.name,
        coachName: candidate.team.coachName ?? undefined,
        coachUid: candidate.ownerUid ?? null,
        rosterName: candidate.team.rosterName,
      }))
    ) as CompetitionEntrant[];
    const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const participantUids = [
      ...new Set(entrants.flatMap((entrant) => entrant.ownerUid ?? [])),
    ];
    const fixtures =
      type === "league" || format === "round-robin"
        ? generateRoundRobin(entrants)
        : generateSingleElimination(entrants);
    const base = {
      id,
      name: name.trim(),
      organizerUid: user?.uid ?? null,
      participantUids,
      status: "active" as const,
      entrants,
      fixtures,
      standings: computeStandings(entrants, fixtures),
      createdAt: now,
      updatedAt: now,
      ...(profile ? { rosterProfile: profile } : {}),
    };
    const competition =
      type === "league"
        ? {
            ...base,
            type: "league" as const,
            points: DEFAULT_LEAGUE_POINTS,
          }
        : { ...base, type: "tournament" as const, format };
    try {
      await saveCompetition(competition);
      ownedChosen.forEach((candidate) => {
        candidate.team.activeCompetitionId = id;
        saveTeam(candidate.team);
      });
      const route = type === "league" ? "leagues" : "tournaments";
      navigate(`/${route}/${id}`);
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
