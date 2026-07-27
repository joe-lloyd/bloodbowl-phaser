import { useEffect, useMemo, useState } from "react";
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
import { createMatchedPlayPackage } from "../../../game/progression/advancementModes";
import {
  fetchAllCoachTeams,
  OwnedTeam,
} from "../../../firebase/cloudTeamRepository";
import { loadTeams, saveTeam } from "../../../game/managers/TeamManager";
import { validateRosterLegality } from "../../../game/rules/rosterLegality";
import { validateInsignificant } from "../../../game/rules/insignificant";
import { getRosterByRosterName } from "../../../data/RosterTemplates";
import { Team, TeamAdvancementMode } from "../../../types/Team";
import { useAuth } from "../../hooks/useAuth";
import { Button, SecondaryButton } from "../componentWarehouse/Button";
import ContentContainer from "../componentWarehouse/ContentContainer";
import MinHeightContainer from "../componentWarehouse/MinHeightContainer";
import Parchment from "../componentWarehouse/Parchment";
import { SectionTitle, Title } from "../componentWarehouse/Titles";

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
  const localTeams = useMemo(() => loadTeams(), []);

  const profile: RosterRuleProfile | undefined = useProfile
    ? createRosterRuleProfile({
        advancementMode,
        draftBudget,
        matchedPlayPackage:
          advancementMode === "matched-play"
            ? createMatchedPlayPackage()
            : undefined,
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
    <MinHeightContainer className="!justify-start">
      <Parchment $intensity="low" />
      <ContentContainer>
        <Title>Create {type}</Title>
        <div className="max-w-3xl space-y-6">
          <label className="block font-heading text-xl">
            Name
            <input
              value={name}
              maxLength={60}
              onChange={(event) => setName(event.target.value)}
              className="block mt-2 w-full bg-bb-warm-paper border-2
                border-bb-dark-gold rounded-lg px-4 py-3 font-body"
            />
          </label>

          {type === "tournament" && (
            <label className="block font-heading text-xl">
              Format
              <select
                value={format}
                onChange={(event) =>
                  setFormat(event.target.value as TournamentFormat)
                }
                className="block mt-2 w-full bg-bb-warm-paper border-2
                  border-bb-dark-gold rounded-lg px-4 py-3 font-body"
              >
                <option value="single-elimination">Single elimination</option>
                <option value="round-robin">Round robin</option>
              </select>
            </label>
          )}

          <section>
            <SectionTitle>Roster rule profile</SectionTitle>
            <label className="flex items-center gap-2 font-body mb-3">
              <input
                type="checkbox"
                checked={useProfile}
                onChange={(event) => setUseProfile(event.target.checked)}
              />
              Require an advancement mode, draft budget, and roster rules for
              entrants (leave unchecked for an unrestricted legacy
              competition)
            </label>
            {useProfile && (
              <div className="flex flex-wrap gap-4 mb-3">
                <label className="font-heading text-sm">
                  Advancement mode
                  <select
                    value={advancementMode}
                    onChange={(event) =>
                      setAdvancementModeChoice(
                        event.target.value as TeamAdvancementMode
                      )
                    }
                    className="block mt-1 bg-bb-warm-paper border-2 border-bb-dark-gold rounded-lg px-3 py-2 font-body"
                  >
                    <option value="advanced-league">Advanced League</option>
                    <option value="matched-play">Matched Play</option>
                    <option value="sevens-skill-selection">
                      Sevens Skill Selection
                    </option>
                  </select>
                </label>
                <label className="font-heading text-sm">
                  Draft budget (gold)
                  <input
                    type="number"
                    step={10000}
                    value={draftBudget}
                    onChange={(event) =>
                      setDraftBudget(Number(event.target.value) || 0)
                    }
                    className="block mt-1 bg-bb-warm-paper border-2 border-bb-dark-gold rounded-lg px-3 py-2 font-body w-40"
                  />
                </label>
              </div>
            )}
          </section>

          <section>
            <SectionTitle>Entrants and seeding</SectionTitle>
            <p className="font-body text-sm text-bb-muted-text mb-3">
              Selection order becomes seed order. Entrants reference live
              rosters, so advancement gained between fixtures carries into
              the next one.
            </p>
            <div className="grid md:grid-cols-2 gap-3">
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
                    title={
                      committed
                        ? "Already entered in an active competition"
                        : undefined
                    }
                    className={`text-left border-2 rounded-lg p-3 font-body disabled:opacity-40 disabled:cursor-not-allowed ${
                      seed
                        ? "bg-bb-ink-blue text-white border-bb-gold"
                        : compatibility.compatible
                          ? "bg-bb-warm-paper border-bb-divider"
                          : "bg-bb-warm-paper border-bb-deep-crimson opacity-70"
                    }`}
                  >
                    {seed ? `Seed ${seed}: ` : ""}
                    {candidate.label}
                    {committed ? " (already entered elsewhere)" : ""}
                    {!compatibility.compatible && (
                      <span className="block text-xs text-bb-deep-crimson mt-1">
                        {compatibility.reasons.join(" ")}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {error && <p className="font-body text-bb-deep-crimson">{error}</p>}
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void create()}>Generate competition</Button>
            <SecondaryButton onClick={() => navigate(-1)}>
              Cancel
            </SecondaryButton>
          </div>
        </div>
      </ContentContainer>
    </MinHeightContainer>
  );
}
