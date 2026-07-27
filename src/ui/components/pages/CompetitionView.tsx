import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getCompetition } from "../../../competition/repository";
import {
  recordCompetitionFixture,
  withdrawFromCompetition,
} from "../../../competition/resultRecording";
import { fetchEntrantTeam, refreshEntrantDisplays } from "../../../competition/teamRefs";
import { getTeamById } from "../../../game/managers/TeamManager";
import {
  CompetitionContext,
  CompetitionDoc,
  CompetitionFixture,
  CompetitionType,
} from "../../../competition/types";
import { useAuth } from "../../hooks/useAuth";
import { BracketFixtureContext, TournamentBracket } from "./TournamentBracket";
import { Button, SecondaryButton } from "../componentWarehouse/Button";
import ContentContainer from "../componentWarehouse/ContentContainer";
import MinHeightContainer from "../componentWarehouse/MinHeightContainer";
import Parchment from "../componentWarehouse/Parchment";
import { SectionTitle, Title } from "../componentWarehouse/Titles";
import {
  clearMatchSave,
  readMatchSave,
} from "../../../game/persistence/MatchSaveRepository";

type DraftScores = Record<string, { home: string; away: string }>;

export function CompetitionView({ type }: { type: CompetitionType }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, onlineAvailable } = useAuth();
  const [competition, setCompetition] = useState<CompetitionDoc | null>(null);
  const [scores, setScores] = useState<DraftScores>({});
  const [error, setError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    if (!id) return;
    void getCompetition(type, id)
      .then((loaded) => {
        if (!loaded) return setCompetition(loaded);
        // Cached display names (team renames) refresh for whatever this
        // reader can currently see; the refreshed copy is what renders.
        const refreshed = refreshEntrantDisplays(loaded);
        setCompetition(refreshed);
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : String(reason))
      );
  }, [id, type]);

  if (!competition) {
    return (
      <CompetitionShell>
        <p className="font-body text-xl">{error ?? "Loading competition…"}</p>
        <SecondaryButton onClick={() => navigate(-1)}>Back</SecondaryButton>
      </CompetitionShell>
    );
  }

  const entrant = (entrantId: string | null) =>
    competition.entrants.find((candidate) => candidate.id === entrantId);
  const canReport =
    !competition.organizerUid ||
    competition.organizerUid === user?.uid ||
    competition.participantUids.includes(user?.uid ?? "");
  const champion =
    competition.type === "tournament"
      ? entrant(competition.championEntrantId ?? null)
      : undefined;
  const rounds = [
    ...new Set(competition.fixtures.map((fixture) => fixture.round)),
  ];

  const contextFor = (fixture: CompetitionFixture): CompetitionContext => ({
    competitionType: competition.type,
    competitionId: competition.id,
    fixtureId: fixture.id,
  });

  const report = async (fixture: CompetitionFixture) => {
    const draft = scores[fixture.id];
    const home = Number(draft?.home);
    const away = Number(draft?.away);
    if (!Number.isInteger(home) || !Number.isInteger(away)) {
      setError("Enter both scores as whole numbers.");
      return;
    }
    try {
      const updated = await recordCompetitionFixture(
        contextFor(fixture),
        home,
        away
      );
      setCompetition(updated);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const withdraw = async (entrantId: string) => {
    if (!window.confirm("Withdraw this team from the competition?")) return;
    try {
      const updated = await withdrawFromCompetition(
        { competitionType: type, competitionId: competition.id },
        entrantId
      );
      setCompetition(updated);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const launchLocal = async (fixture: CompetitionFixture) => {
    const home = entrant(fixture.homeEntrantId);
    const away = entrant(fixture.awayEntrantId);
    if (!home || !away) return;
    if (
      readMatchSave() &&
      !window.confirm(
        "Starting this fixture will replace your saved local match. Continue?"
      )
    ) {
      return;
    }
    setLaunching(true);
    try {
      const [team1, team2] = await Promise.all([
        fetchEntrantTeam(home),
        fetchEntrantTeam(away),
      ]);
      if (!team1 || !team2) {
        setError("Could not load one of the entrants' rosters.");
        return;
      }
      clearMatchSave();
      navigate("/play", {
        state: {
          team1,
          team2,
          competitionContext: contextFor(fixture),
        },
      });
    } finally {
      setLaunching(false);
    }
  };

  const launchHosted = async (fixture: CompetitionFixture) => {
    const home = entrant(fixture.homeEntrantId);
    const away = entrant(fixture.awayEntrantId);
    if (!home || !away) return;
    setLaunching(true);
    try {
      const [homeTeam, awayTeam] = await Promise.all([
        fetchEntrantTeam(home),
        fetchEntrantTeam(away),
      ]);
      if (!homeTeam || !awayTeam) {
        setError("Could not load one of the entrants' rosters.");
        return;
      }
      navigate("/online/host", {
        state: {
          competitionFixture: {
            context: contextFor(fixture),
            homeTeam,
            awayTeam,
          },
        },
      });
    } finally {
      setLaunching(false);
    }
  };

  const isBracket =
    competition.type === "tournament" &&
    competition.format === "single-elimination";

  // Shared by the bracket cards and the round list so the two presentations
  // can never drift apart. Called as a plain function, never mounted as a
  // component — a component boundary here would remount the score inputs on
  // every keystroke and lose focus.
  const fixtureActions = ({ fixture, home, away }: BracketFixtureContext) => {
    const draft = scores[fixture.id] ?? { home: "", away: "" };
    return (
      <>
        <div className="flex flex-wrap gap-2">
          <Button
            className="!text-sm !px-3 !py-2 !my-0"
            disabled={launching}
            onClick={() => void launchLocal(fixture)}
          >
            Play local
          </Button>
          <Button
            className="!text-sm !px-3 !py-2 !my-0"
            disabled={!onlineAvailable || !user || launching}
            onClick={() => void launchHosted(fixture)}
          >
            Host online
          </Button>
        </div>
        {canReport && (
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <input
              aria-label={`${home?.name} score`}
              type="number"
              min="0"
              value={draft.home}
              onChange={(event) =>
                setScores((current) => ({
                  ...current,
                  [fixture.id]: { ...draft, home: event.target.value },
                }))
              }
              className="w-14 border border-bb-divider rounded p-1"
            />
            <span>–</span>
            <input
              aria-label={`${away?.name} score`}
              type="number"
              min="0"
              value={draft.away}
              onChange={(event) =>
                setScores((current) => ({
                  ...current,
                  [fixture.id]: { ...draft, away: event.target.value },
                }))
              }
              className="w-14 border border-bb-divider rounded p-1"
            />
            <button
              onClick={() => void report(fixture)}
              className="font-heading underline text-bb-blood-red text-sm"
            >
              Record result
            </button>
          </div>
        )}
      </>
    );
  };

  const renderRoundList = () => (
    <div className="grid lg:grid-cols-2 gap-6">
      {rounds.map((round) => (
        <div key={round}>
          <h3 className="font-heading text-xl mb-2">Round {round}</h3>
          <div className="space-y-3">
            {competition.fixtures
              .filter((fixture) => fixture.round === round)
              .map((fixture) => {
                const home = entrant(fixture.homeEntrantId);
                const away = entrant(fixture.awayEntrantId);
                const ready =
                  fixture.status === "ready" && Boolean(home && away);
                return (
                  <article
                    key={fixture.id}
                    className="bg-bb-warm-paper border-2 border-bb-dark-gold rounded-lg p-4"
                  >
                    <div className="font-body flex justify-between gap-3">
                      <span>{home?.name ?? "TBD"}</span>
                      <strong>{fixture.result?.homeScore ?? "—"}</strong>
                    </div>
                    <div className="font-body flex justify-between gap-3">
                      <span>
                        {away?.name ?? (fixture.result?.bye ? "BYE" : "TBD")}
                      </span>
                      <strong>{fixture.result?.awayScore ?? "—"}</strong>
                    </div>
                    {ready && (
                      <div className="mt-3">
                        {fixtureActions({ fixture, home, away, ready })}
                      </div>
                    )}
                  </article>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <CompetitionShell>
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <Title>{competition.name}</Title>
          <p className="font-heading uppercase text-bb-muted-text">
            {competition.type === "tournament"
              ? competition.format.replace("-", " ")
              : "round-robin season"}{" "}
            · {competition.status}
          </p>
        </div>
        <SecondaryButton onClick={() => navigate(-1)}>
          All {competition.type}s
        </SecondaryButton>
      </div>

      {champion && (
        <div className="my-6 bg-bb-ink-blue text-bb-gold border-2 border-bb-dark-gold rounded-lg p-5">
          <span className="font-heading text-2xl uppercase">
            Champion: {champion.name}
          </span>
        </div>
      )}

      {competition.status === "active" && (
        <section className="my-8">
          <SectionTitle>Entrants</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {competition.entrants.map((candidate) => {
              const owned =
                candidate.source === "local" &&
                !!getTeamById(candidate.teamId);
              return (
                <div
                  key={candidate.id}
                  className={`flex items-center gap-2 border-2 rounded-lg px-3 py-2 font-body ${
                    candidate.withdrawn
                      ? "opacity-50 line-through border-bb-divider"
                      : "border-bb-dark-gold bg-bb-warm-paper"
                  }`}
                >
                  <span>{candidate.name}</span>
                  {owned && !candidate.withdrawn && (
                    <button
                      onClick={() => void withdraw(candidate.id)}
                      className="font-heading text-xs underline text-bb-deep-crimson"
                    >
                      Withdraw
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {(competition.type === "league" ||
        competition.format === "round-robin") && (
        <section className="my-8 overflow-x-auto">
          <SectionTitle>Standings</SectionTitle>
          <table className="w-full bg-bb-warm-paper border-collapse font-body">
            <thead>
              <tr className="bg-bb-ink-blue text-white">
                <th className="p-2 text-left">Team</th>
                {["P", "W", "D", "L", "For", "Against", "+/-", "Pts"].map(
                  (heading) => (
                    <th key={heading} className="p-2 text-center">
                      {heading}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {competition.standings.map((standing) => (
                <tr
                  key={standing.entrantId}
                  className="border-b border-bb-divider"
                >
                  <td className="p-2 font-bold">
                    {entrant(standing.entrantId)?.name}
                  </td>
                  <td className="p-2 text-center">{standing.played}</td>
                  <td className="p-2 text-center">{standing.wins}</td>
                  <td className="p-2 text-center">{standing.draws}</td>
                  <td className="p-2 text-center">{standing.losses}</td>
                  <td className="p-2 text-center">{standing.scoreFor}</td>
                  <td className="p-2 text-center">{standing.scoreAgainst}</td>
                  <td className="p-2 text-center">
                    {standing.scoreDifference}
                  </td>
                  <td className="p-2 text-center font-bold">
                    {standing.points}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="my-8">
        <SectionTitle>{isBracket ? "Bracket" : "Schedule"}</SectionTitle>
        {isBracket ? (
          <TournamentBracket
            fixtures={competition.fixtures}
            entrants={competition.entrants}
            championEntrantId={
              competition.type === "tournament"
                ? competition.championEntrantId
                : undefined
            }
            renderActions={fixtureActions}
            fallback={renderRoundList()}
          />
        ) : (
          renderRoundList()
        )}
      </section>
      {error && <p className="font-body text-bb-deep-crimson">{error}</p>}
    </CompetitionShell>
  );
}

function CompetitionShell({ children }: { children: React.ReactNode }) {
  return (
    <MinHeightContainer className="!justify-start">
      <Parchment $intensity="low" />
      <ContentContainer>{children}</ContentContainer>
    </MinHeightContainer>
  );
}
