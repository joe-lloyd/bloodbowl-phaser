import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  computeStandings,
  generateRoundRobin,
  generateSingleElimination,
  seedEntrants,
} from "../../../competition/logic";
import { saveCompetition } from "../../../competition/repository";
import {
  CompetitionEntrant,
  CompetitionType,
  DEFAULT_LEAGUE_POINTS,
  SharedTeam,
  TournamentFormat,
} from "../../../competition/types";
import {
  assertEntrantsCompatible,
  checkTeamCompatibility,
  createRosterRuleProfile,
  RosterRuleProfile,
} from "../../../competition/rosterRules";
import { createMatchedPlayPackage } from "../../../game/progression/advancementModes";
import { fetchSharedTeams } from "../../../firebase/sharedTeamRepository";
import { loadTeams } from "../../../game/managers/TeamManager";
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
  source: "local" | "shared";
  shared?: SharedTeam;
};

export function CompetitionBuilder({ type }: { type: CompetitionType }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [format, setFormat] = useState<TournamentFormat>("single-elimination");
  const [selected, setSelected] = useState<string[]>([]);
  const [sharedTeams, setSharedTeams] = useState<SharedTeam[]>([]);
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
    void fetchSharedTeams()
      .then(setSharedTeams)
      .catch(() => setSharedTeams([]));
  }, [user]);

  const candidates: Candidate[] = [
    ...localTeams.map((team) => ({
      id: `local:${team.id}`,
      label: `${team.name} (${team.rosterName}) — local`,
      team,
      source: "local" as const,
    })),
    ...sharedTeams
      .filter((shared) => !localTeams.some((team) => team.id === shared.teamId))
      .map((shared) => ({
        id: `shared:${shared.id}`,
        label: `${shared.team.name} (${shared.ownerName}) — shared`,
        team: shared.team,
        source: "shared" as const,
        shared,
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

    try {
      assertEntrantsCompatible(
        chosen.map((candidate) => candidate.team),
        profile
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return;
    }

    const entrants = seedEntrants(
      chosen.map((candidate) => ({
        id: candidate.id,
        teamId: candidate.team.id,
        name: candidate.team.name,
        coachName:
          candidate.shared?.ownerName ?? candidate.team.coachName ?? undefined,
        rosterName: candidate.team.rosterName,
        source: candidate.source,
        sharedTeamId: candidate.shared?.id,
        ownerUid: candidate.shared?.ownerUid,
        team: structuredClone(candidate.team),
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
              Selection order becomes seed order. Published teams are captured
              as snapshots, so later roster edits do not rewrite a season.
            </p>
            <div className="grid md:grid-cols-2 gap-3">
              {candidates.map((candidate) => {
                const seed = selected.indexOf(candidate.id) + 1;
                const compatibility = checkTeamCompatibility(
                  candidate.team,
                  profile
                );
                return (
                  <button
                    key={candidate.id}
                    onClick={() => toggle(candidate.id)}
                    className={`text-left border-2 rounded-lg p-3 font-body ${
                      seed
                        ? "bg-bb-ink-blue text-white border-bb-gold"
                        : compatibility.compatible
                          ? "bg-bb-warm-paper border-bb-divider"
                          : "bg-bb-warm-paper border-bb-deep-crimson opacity-70"
                    }`}
                  >
                    {seed ? `Seed ${seed}: ` : ""}
                    {candidate.label}
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
