import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getCompetition } from "../../../competition/repository";
import {
  recordCompetitionFixture,
  withdrawFromCompetition,
} from "../../../competition/resultRecording";
import {
  fetchEntrantTeam,
  refreshEntrantDisplays,
} from "../../../competition/teamRefs";
import { getTeamById } from "../../../game/managers/TeamManager";
import {
  CompetitionContext,
  CompetitionDoc,
  CompetitionFixture,
  CompetitionType,
} from "../../../competition/types";
import { useAuth } from "../../hooks/useAuth";
import { BracketFixtureContext, TournamentBracket } from "./TournamentBracket";
import {
  Chip,
  cx,
  HudButton,
  Notice,
  PageHeader,
  PageShell,
  Panel,
  Section,
} from "../componentWarehouse/HudKit";
import {
  clearMatchSave,
  readMatchSave,
} from "../../../game/persistence/MatchSaveRepository";
import { hasBlockingPendingDevelopment, Team } from "../../../types/Team";

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
      <PageShell width="wide">
        <PageHeader
          back={{ label: "Back", onClick: () => navigate(-1) }}
          title="Competition"
        />
        {error ? (
          <Notice tone="bad" role="alert">
            {error}
          </Notice>
        ) : (
          <p className="font-hud-body text-hud-lg text-hud-dim">
            Loading competition…
          </p>
        )}
      </PageShell>
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

  /** Match launch is refused when the profile requires development to be
   *  resolved and either entrant's live roster still has pending work (see
   *  team-advancement-modes: "Team development is completed from Manage
   *  Team"). Legacy competitions (no profile) never block. */
  const blockingDevelopment = (
    home: Team,
    homeName: string,
    away: Team,
    awayName: string
  ): string | null => {
    if (!competition.rosterProfile?.requireDevelopmentComplete) return null;
    if (hasBlockingPendingDevelopment(home)) {
      return `${homeName} has unresolved development — resolve it from Manage Team before this fixture.`;
    }
    if (hasBlockingPendingDevelopment(away)) {
      return `${awayName} has unresolved development — resolve it from Manage Team before this fixture.`;
    }
    return null;
  };

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
      const blocked = blockingDevelopment(team1, home.name, team2, away.name);
      if (blocked) {
        setError(blocked);
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
      const blocked = blockingDevelopment(
        homeTeam,
        home.name,
        awayTeam,
        away.name
      );
      if (blocked) {
        setError(blocked);
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
          <HudButton
            variant="primary"
            size="sm"
            disabled={launching}
            onClick={() => void launchLocal(fixture)}
          >
            Play local
          </HudButton>
          <HudButton
            size="sm"
            disabled={!onlineAvailable || !user || launching}
            onClick={() => void launchHosted(fixture)}
          >
            Host online
          </HudButton>
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
              className="hud-field w-16 text-center"
            />
            <span className="text-hud-mute">–</span>
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
              className="hud-field w-16 text-center"
            />
            <HudButton
              variant="ghost"
              size="sm"
              onClick={() => void report(fixture)}
            >
              Record result
            </HudButton>
          </div>
        )}
      </>
    );
  };

  const renderRoundList = () => (
    <div className="grid lg:grid-cols-2 gap-6">
      {rounds.map((round) => (
        <div key={round}>
          <h3 className="hud-label mb-2 text-hud-gold">Round {round}</h3>
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
                    className="rounded-hud border border-white/10 bg-black/30 p-4 font-hud-body text-hud-base text-hud-bone"
                  >
                    <div className="flex justify-between gap-3">
                      <span className={cx(!home && "italic text-hud-mute")}>
                        {home?.name ?? "TBD"}
                      </span>
                      <strong className="tabular-nums">
                        {fixture.result?.homeScore ?? "—"}
                      </strong>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className={cx(!away && "italic text-hud-mute")}>
                        {away?.name ?? (fixture.result?.bye ? "BYE" : "TBD")}
                      </span>
                      <strong className="tabular-nums">
                        {fixture.result?.awayScore ?? "—"}
                      </strong>
                    </div>
                    {ready && (
                      <div className="mt-3 border-t border-white/10 pt-3">
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
    <PageShell width="wide">
      <PageHeader
        back={{
          label: `All ${competition.type}s`,
          onClick: () => navigate(-1),
        }}
        eyebrow={
          competition.type === "tournament"
            ? competition.format.replace("-", " ")
            : "round-robin season"
        }
        title={competition.name}
        actions={<Chip>{competition.status}</Chip>}
      />

      {champion && (
        <Panel accent="gold" className="mb-6 px-5 py-4">
          <span className="font-hud-display text-hud-2xl uppercase tracking-[0.03em] text-hud-gold">
            Champion: {champion.name}
          </span>
        </Panel>
      )}

      {competition.status === "active" && (
        <Section title="Entrants">
          <div className="flex flex-wrap gap-2">
            {competition.entrants.map((candidate) => {
              const owned = !!getTeamById(candidate.teamId);
              return (
                <div
                  key={candidate.id}
                  className={cx(
                    "flex items-center gap-3 rounded-hud border px-3 py-2 font-hud-body text-hud-sm",
                    candidate.withdrawn
                      ? "border-white/5 text-hud-mute line-through"
                      : "border-white/15 bg-black/30 text-hud-bone"
                  )}
                >
                  <span>{candidate.name}</span>
                  {owned && !candidate.withdrawn && (
                    <button
                      onClick={() => void withdraw(candidate.id)}
                      className="font-hud-label text-hud-xs font-bold uppercase tracking-[0.08em] text-hud-bad underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-gold"
                    >
                      Withdraw
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {(competition.type === "league" ||
        competition.format === "round-robin") && (
        <Section title="Standings" bodyClassName="overflow-x-auto p-0">
          <table className="hud-table">
            <thead>
              <tr>
                <th>Team</th>
                {["P", "W", "D", "L", "For", "Against", "+/-", "Pts"].map(
                  (heading) => (
                    <th key={heading} className="num">
                      {heading}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {competition.standings.map((standing) => (
                <tr key={standing.entrantId}>
                  <td className="font-bold">
                    {entrant(standing.entrantId)?.name}
                  </td>
                  <td className="num">{standing.played}</td>
                  <td className="num">{standing.wins}</td>
                  <td className="num">{standing.draws}</td>
                  <td className="num">{standing.losses}</td>
                  <td className="num">{standing.scoreFor}</td>
                  <td className="num">{standing.scoreAgainst}</td>
                  <td className="num">{standing.scoreDifference}</td>
                  <td className="num font-bold text-hud-gold">
                    {standing.points}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      <Section title={isBracket ? "Bracket" : "Schedule"}>
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
      </Section>
      {error && (
        <Notice tone="bad" role="alert">
          {error}
        </Notice>
      )}
    </PageShell>
  );
}
