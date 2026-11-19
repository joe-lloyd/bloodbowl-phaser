import {
  DEFAULT_SEVENS_RULESET,
  SEVENS_RULESET_LABELS,
} from "../../../game/rules/sevensRuleset";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getCompetition } from "../../../competition/repository";
import {
  closeWalkovers,
  recordCompetitionFixture,
  withdrawFromCompetition,
} from "../../../competition/resultRecording";
import {
  fetchEntrantTeam,
  refreshEntrantDisplays,
} from "../../../competition/teamRefs";
import { manageComputerTeams } from "../../../competition/computerTeams";
import {
  currentRound,
  simulatableFixtures,
  simulateFixture,
} from "../../../competition/simulateFixture";
import { RNGService } from "../../../services/rng/RNGService";
import { injuryLabel, playerLabel } from "../hud/turnSummary";
import { getTeamById } from "../../../game/managers/TeamManager";
import {
  type CompetitionContext,
  type CompetitionDoc,
  type CompetitionEntrant,
  type CompetitionFixture,
  type CompetitionType,
} from "../../../competition/types";
import { useAuth } from "../../hooks/useAuth";
import {
  type BracketFixtureContext,
  TournamentBracket,
  walkoverLine,
} from "./TournamentBracket";
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
import { hasBlockingPendingDevelopment, type Team } from "../../../types/Team";
import { LeagueRounds } from "./LeagueRounds";
import { LeagueTeamProgress } from "./LeagueTeamProgress";

interface DraftScore {
  home: string;
  away: string;

  penaltiesHome?: string;
  penaltiesAway?: string;
}
type DraftScores = Record<string, DraftScore>;

interface SimulatedResult {
  fixtureId: string;
  round: number;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  penalties?: { home: number; away: number };

  casualties: string[];
}

const computerCoached = (entrant?: CompetitionEntrant) =>
  !!entrant?.computerCoached;

export function CompetitionView({ type }: { type: CompetitionType }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, onlineAvailable } = useAuth();
  const [competition, setCompetition] = useState<CompetitionDoc | null>(null);
  const [scores, setScores] = useState<DraftScores>({});
  const [error, setError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);

  const [simulating, setSimulating] = useState<string | null>(null);
  const [simulated, setSimulated] = useState<SimulatedResult[]>([]);

  useEffect(() => {
    if (!id) return;
    void getCompetition(type, id)
      .then((loaded) => (loaded ? closeWalkovers(loaded) : loaded))
      .then((loaded) => {
        if (!loaded) {
          setCompetition(loaded);
          return;
        }

        try {
          manageComputerTeams(loaded, new RNGService(Date.now() % 2 ** 31));
        } catch (reason) {
          setError(
            `The computer could not manage its teams: ${reason instanceof Error ? reason.message : String(reason)}`
          );
        }

        const refreshed = refreshEntrantDisplays(loaded);
        setCompetition(refreshed);
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : String(reason));
      });
  }, [id, type]);

  const allCompetitions = {
    label: type === "league" ? "All leagues" : "All tournaments",
    to: type === "league" ? "/leagues" : "/tournaments",
  };

  if (!competition) {
    return (
      <PageShell width="wide">
        <PageHeader back={allCompetitions} title="Competition" />
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
  const canReport = (fixture: CompetitionFixture) =>
    !competition.organizerUid ||
    competition.organizerUid === user?.uid ||
    [fixture.homeEntrantId, fixture.awayEntrantId].some(
      (id) => !!user && entrant(id)?.ownerUid === user.uid
    );

  const canSimulate =
    !competition.organizerUid || competition.organizerUid === user?.uid;
  const roundToSimulate = currentRound(competition);
  const toSimulate = canSimulate
    ? simulatableFixtures(competition).filter(
        (fixture) => fixture.round === roundToSimulate
      )
    : [];
  const champion =
    competition.type === "tournament"
      ? entrant(competition.championEntrantId ?? null)
      : undefined;
  const rounds = [
    ...new Set(competition.fixtures.map((fixture) => fixture.round)),
  ];

  const contextFor = (fixture: CompetitionFixture): CompetitionContext => ({
    ruleset: competition.ruleset ?? DEFAULT_SEVENS_RULESET,
    competitionType: competition.type,
    competitionId: competition.id,
    fixtureId: fixture.id,
    ...(competition.type === "tournament" &&
    competition.format === "single-elimination"
      ? { knockout: true }
      : {}),
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

    const penalties =
      isBracket && home === away
        ? {
            home: Number(draft?.penaltiesHome),
            away: Number(draft?.penaltiesAway),
          }
        : undefined;
    try {
      const updated = await recordCompetitionFixture(
        {
          context: contextFor(fixture),
          homeScore: home,
          awayScore: away,
          ...(penalties ? { penalties } : {}),
        }
      );
      setCompetition(updated);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const launch = async (
    fixture: CompetitionFixture,
    local: boolean,
    start: (homeTeam: Team, awayTeam: Team) => void
  ) => {
    const home = entrant(fixture.homeEntrantId);
    const away = entrant(fixture.awayEntrantId);
    if (!home || !away) return;
    if (
      local &&
      readMatchSave() &&
      !window.confirm(
        "Starting this fixture will replace your saved local match. Continue?"
      )
    ) {
      return;
    }
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
      if (local) clearMatchSave();
      start(homeTeam, awayTeam);
    } finally {
      setLaunching(false);
    }
  };

  const launchLocal = (fixture: CompetitionFixture) =>
    launch(fixture, true, (team1, team2) =>
      navigate("/play", {
        state: {
          team1,
          team2,
          competitionContext: contextFor(fixture),

          progressionEnabled: true,
        },
      })
    );

  const launchHosted = (fixture: CompetitionFixture) =>
    launch(fixture, false, (homeTeam, awayTeam) =>
      navigate("/online/host", {
        state: {
          competitionFixture: {
            context: contextFor(fixture),
            homeTeam,
            awayTeam,
          },
        },
      })
    );

  const launchComputer = (
    fixture: CompetitionFixture,
    humanEntrantId: string
  ) =>
    launch(fixture, true, (team1, team2) =>
      navigate("/play/computer", {
        state: {
          team1,
          team2,
          computerTeamId:
            humanEntrantId === fixture.homeEntrantId ? team2.id : team1.id,
          difficulty: competition.computerDifficulty,
          progressionEnabled: true,
          competitionContext: contextFor(fixture),
        },
      })
    );

  const simulate = async (
    next: (latest: CompetitionDoc) => CompetitionFixture | undefined
  ) => {
    let latest = competition;
    const results: SimulatedResult[] = [];
    setError(null);
    try {
      for (let fixture = next(latest); fixture; fixture = next(latest)) {
        const name = (entrantId: string | null) =>
          latest.entrants.find((candidate) => candidate.id === entrantId)
            ?.name ?? "TBD";
        setSimulating(
          `${name(fixture.homeEntrantId)} v ${name(fixture.awayEntrantId)}`
        );

        await new Promise((resolve) => setTimeout(resolve, 0));
        const outcome = await simulateFixture(latest, fixture.id);
        latest = refreshEntrantDisplays(outcome.competition);
        const result = outcome.fixture.result!;
        results.unshift({
          fixtureId: fixture.id,
          round: fixture.round,
          home: name(fixture.homeEntrantId),
          away: name(fixture.awayEntrantId),
          homeScore: result.homeScore,
          awayScore: result.awayScore,
          ...(result.penalties ? { penalties: result.penalties } : {}),
          casualties: outcome.casualties.map(
            ({ team, player }) =>
              `${playerLabel(player)} (${team.name}): ${injuryLabel(player) ?? "Casualty"}`
          ),
        });
        setCompetition(latest);
        setSimulated((shown) => [
          ...results,
          ...shown.filter(
            (earlier) =>
              !results.some((result) => result.fixtureId === earlier.fixtureId)
          ),
        ]);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSimulating(null);
    }
  };

  const isBracket =
    competition.type === "tournament" &&
    competition.format === "single-elimination";

  const fixtureActions = ({ fixture, home, away }: BracketFixtureContext) => {
    if (!canReport(fixture)) return null;
    const busy = launching || simulating !== null;
    if (home && away && computerCoached(home) && computerCoached(away)) {
      return (
        <div className="flex flex-wrap gap-2">
          {canSimulate && fixture.round === roundToSimulate && (
            <HudButton
              variant="primary"
              size="sm"
              disabled={busy}
              onClick={() =>
                void simulate((latest) =>
                  simulatableFixtures(latest).find(
                    (candidate) => candidate.id === fixture.id
                  )
                )
              }
            >
              Simulate
            </HudButton>
          )}
          {[home, away].map((side) => (
            <HudButton
              key={side.id}
              size="sm"
              disabled={busy}
              onClick={() => void launchComputer(fixture, side.id)}
            >
              Play as {side.name}
            </HudButton>
          ))}
        </div>
      );
    }
    if (home && away && (computerCoached(home) || computerCoached(away))) {
      return (
        <HudButton
          variant="primary"
          size="sm"
          disabled={busy}
          onClick={() =>
            void launchComputer(
              fixture,
              computerCoached(home) ? away.id : home.id
            )
          }
        >
          Play vs computer
        </HudButton>
      );
    }
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
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <input
            aria-label={`${String(home?.name)} score`}
            type="number"
            min="0"
            value={draft.home}
            onChange={(event) => {
              setScores((current) => ({
                ...current,
                [fixture.id]: { ...draft, home: event.target.value },
              }));
            }}
            className="hud-field w-16 text-center"
          />
          <span className="text-hud-mute">–</span>
          <input
            aria-label={`${String(away?.name)} score`}
            type="number"
            min="0"
            value={draft.away}
            onChange={(event) => {
              setScores((current) => ({
                ...current,
                [fixture.id]: { ...draft, away: event.target.value },
              }));
            }}
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
        {isBracket && draft.home !== "" && draft.home === draft.away && (
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="hud-label">Penalties</span>
            {(["penaltiesHome", "penaltiesAway"] as const).map((side) => (
              <input
                key={side}
                aria-label={`${String(side === "penaltiesHome" ? home?.name : away?.name)} penalties`}
                type="number"
                min="0"
                max="5"
                value={draft[side] ?? ""}
                onChange={(event) => {
                  setScores((current) => ({
                    ...current,
                    [fixture.id]: { ...draft, [side]: event.target.value },
                  }));
                }}
                className="hud-field w-16 text-center"
              />
            ))}
          </div>
        )}
      </>
    );
  };

  const renderFixtureCard = (fixture: CompetitionFixture) => {
    const home = entrant(fixture.homeEntrantId);
    const away = entrant(fixture.awayEntrantId);
    const ready = fixture.status === "ready" && Boolean(home && away);
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
            {fixture.result?.walkover
              ? "—"
              : (fixture.result?.homeScore ?? "—")}
          </strong>
        </div>
        <div className="flex justify-between gap-3">
          <span className={cx(!away && "italic text-hud-mute")}>
            {away?.name ?? (fixture.result?.bye ? "BYE" : "TBD")}
          </span>
          <strong className="tabular-nums">
            {fixture.result?.walkover
              ? "—"
              : (fixture.result?.awayScore ?? "—")}
          </strong>
        </div>
        {fixture.result?.walkover && (
          <p className="mt-1 text-hud-sm text-hud-mute">
            {walkoverLine(competition.entrants, fixture.result.walkover)}
          </p>
        )}
        {fixture.result?.penalties && (
          <p className="mt-1 text-hud-sm text-hud-mute tabular-nums">
            Penalties {fixture.result.penalties.home}–
            {fixture.result.penalties.away}
          </p>
        )}
        {ready && (
          <div className="mt-3 border-t border-white/10 pt-3">
            {fixtureActions({ fixture, ...(home === undefined ? {} : { home: home }), ...(away === undefined ? {} : { away: away }), ready })}
          </div>
        )}
      </article>
    );
  };

  const simulatedResults = simulated.length > 0 && (
    <Section title="Simulated results">
      <ul className="space-y-3 font-hud-body text-hud-base text-hud-bone">
        {simulated.map((result) => (
          <li key={result.fixtureId}>
            <span className="hud-label mr-2 text-hud-gold">
              Round {result.round}
            </span>
            {result.home}{" "}
            <strong className="tabular-nums">
              {result.homeScore}–{result.awayScore}
            </strong>{" "}
            {result.away}
            {result.penalties && (
              <span className="text-hud-mute tabular-nums">
                {" "}
                (Penalties {result.penalties.home}–{result.penalties.away})
              </span>
            )}
            {result.casualties.length > 0 && (
              <ul className="mt-1 text-hud-sm text-hud-dim">
                {result.casualties.map((casualty) => (
                  <li key={casualty}>{casualty}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );

  const renderRoundList = () => (
    <div className="grid lg:grid-cols-2 gap-6">
      {rounds.map((round) => (
        <div key={round}>
          <h3 className="hud-label mb-2 text-hud-gold">Round {round}</h3>
          <div className="space-y-3">
            {competition.fixtures
              .filter((fixture) => fixture.round === round)
              .map(renderFixtureCard)}
          </div>
        </div>
      ))}
    </div>
  );

  const simulateTools = (toSimulate.length > 0 || simulating) && (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {simulating ? (
        <span role="status" className="font-hud-body text-hud-sm text-hud-dim">
          Simulating {simulating}…
        </span>
      ) : (
        <HudButton
          variant="primary"
          size="sm"
          disabled={launching}
          onClick={() =>
            void simulate((latest) =>
              simulatableFixtures(latest).find(
                (fixture) => fixture.round === roundToSimulate
              )
            )
          }
        >
          Simulate round {roundToSimulate}
        </HudButton>
      )}
    </div>
  );

  return (
    <PageShell width="wide">
      <PageHeader
        back={allCompetitions}
        eyebrow={
          competition.type === "tournament"
            ? competition.format.replace("-", " ")
            : "round-robin season"
        }
        title={competition.name}
        actions={<Chip>{competition.status}</Chip>}
      />

      <p className="mb-6 font-hud-body text-hud-sm text-hud-dim">
        {SEVENS_RULESET_LABELS[competition.ruleset ?? DEFAULT_SEVENS_RULESET]}
        {" · "}NAF clarifications apply. Swarming is enabled.
      </p>

      {champion && (
        <Panel accent="gold" className="mb-6 px-5 py-4">
          <span className="font-hud-display text-hud-2xl uppercase tracking-[0.03em] text-hud-gold">
            Champion: {champion.name}
          </span>
        </Panel>
      )}
      <LeagueTeamProgress competition={competition} />

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
                  {candidate.computerCoached && (
                    <span className="font-hud-label text-hud-xs font-bold uppercase tracking-[0.08em] text-hud-mute">
                      Computer
                    </span>
                  )}

                  {owned &&
                    !candidate.withdrawn &&
                    !candidate.computerCoached && (
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

      {competition.type !== "league" && simulatedResults}

      {competition.type === "league" ? (
        <>
          <LeagueRounds
            competition={competition}
            renderActions={fixtureActions}
            renderCompactFixture={renderFixtureCard}
            nextRoundTools={simulateTools}
          />
          {simulatedResults}
        </>
      ) : (
        <Section title={isBracket ? "Bracket" : "Schedule"}>
          {simulateTools}
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
      )}
      {error && (
        <Notice tone="bad" role="alert">
          {error}
        </Notice>
      )}
    </PageShell>
  );
}
