import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
import {
  getTeamById,
  onTeamRepositoryChanged,
} from "../../../game/managers/TeamManager";
import {
  earnsWinnings,
  isValidPrize,
  tournamentPrizeKey,
} from "../../../game/rules/winnings";
import {
  CompetitionContext,
  CompetitionDoc,
  CompetitionEntrant,
  CompetitionFixture,
  CompetitionType,
} from "../../../competition/types";
import { useAuth } from "../../hooks/useAuth";
import {
  BracketFixtureContext,
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
import { hasBlockingPendingDevelopment, Team } from "../../../types/Team";

type DraftScore = {
  home: string;
  away: string;
  /** Roll-offs each side won in a Penalty Shoot-out. */
  penaltiesHome?: string;
  penaltiesAway?: string;
};
type DraftScores = Record<string, DraftScore>;

/** A simulated game, as the page lists it. */
type SimulatedResult = {
  fixtureId: string;
  round: number;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  penalties?: { home: number; away: number };
  /** "Grim #4 (Nuln Hammers): Dead" */
  casualties: string[];
};

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
  /** The game being simulated, while the computer plays it. */
  const [simulating, setSimulating] = useState<string | null>(null);
  const [simulated, setSimulated] = useState<SimulatedResult[]>([]);
  /**
   * Bumped when the team library is swapped: a signed-in coach's cloud
   * library can arrive after this page loads, and only then can the page
   * reach their teams (to pay a champion's prize, say). Load again then.
   */
  const [library, setLibrary] = useState(0);
  useEffect(
    () => onTeamRepositoryChanged(() => setLibrary((version) => version + 1)),
    []
  );

  /**
   * The competition the route shows. The page stays mounted when the route
   * moves to another competition, so what it shows starts again from
   * nothing (React's reset-on-prop-change pattern), and work started for the
   * previous competition may not update it.
   */
  const routeKey = `${type}:${id ?? ""}`;
  const [shownKey, setShownKey] = useState(routeKey);
  if (shownKey !== routeKey) {
    setShownKey(routeKey);
    setCompetition(null);
    setScores({});
    setError(null);
    setLaunching(false);
    setSimulating(null);
    setSimulated([]);
  }
  const shownRoute = useRef(routeKey);
  useLayoutEffect(() => {
    shownRoute.current = routeKey;
  }, [routeKey]);

  /**
   * The one guard for work that finishes later: capture it when the work
   * starts, and the work may update the page only while the route still
   * shows the competition it started on.
   */
  const onShownRoute = () => {
    const startedOn = shownRoute.current;
    return () => startedOn === shownRoute.current;
  };
  /**
   * Bumped by every load and by every change this page makes. A load that
   * finishes after a newer load, or after a change (a recorded result, a
   * withdrawal, a simulated game), read an older competition and must not
   * replace what the page shows.
   */
  const loadGeneration = useRef(0);
  /** A change starts: loads still running read the competition before it. */
  const startChange = () => {
    loadGeneration.current += 1;
    return onShownRoute();
  };
  /** Show what a change on this page left, over any load still running. */
  const showChange = (changed: CompetitionDoc) => {
    loadGeneration.current += 1;
    setCompetition(changed);
  };

  useEffect(() => {
    if (!id) return;
    const generation = ++loadGeneration.current;
    const onRoute = onShownRoute();
    const current = () => onRoute() && generation === loadGeneration.current;
    void getCompetition(type, id)
      // Games owed as walkovers by a team that withdrew before they were
      // closed on withdrawal
      .then((loaded) => (loaded ? closeWalkovers(loaded) : loaded))
      .then((loaded) => {
        if (!current()) return;
        if (!loaded) return setCompetition(loaded);
        // The computer makes its teams' development choices, including
        // any left by a game a person played against one.
        // A failure here must not keep the competition from showing.
        try {
          manageComputerTeams(loaded, new RNGService(Date.now() % 2 ** 31));
        } catch (reason) {
          setError(
            `The computer could not manage its teams: ${reason instanceof Error ? reason.message : String(reason)}`
          );
        }
        // Cached display names (team renames) refresh for whatever this
        // reader can currently see; the refreshed copy is what renders.
        const refreshed = refreshEntrantDisplays(loaded);
        setCompetition(refreshed);
      })
      .catch((reason: unknown) => {
        if (current())
          setError(reason instanceof Error ? reason.message : String(reason));
      });
  }, [id, type, library]);

  // A link, not a step back: after a match the results screen pushes this
  // page on top of /play, so a history step would reopen the match.
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
  // The computer's teams are in the organizer's library
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
  const prize =
    competition.type === "tournament" && isValidPrize(competition.prize)
      ? competition.prize
      : 0;
  const prizeGold = `${prize.toLocaleString("en-US")} gp`;
  /** What became of the prize, once there is a champion to pay. */
  const prizeOutcome = (() => {
    if (!champion || prize <= 0) return null;
    // Only the champion's coach can see, and pay, their team
    const team = getTeamById(champion.teamId);
    if (team?.recordedFixtureIds?.includes(tournamentPrizeKey(competition.id)))
      return `+${prizeGold} prize paid into the Treasury`;
    if (team && !earnsWinnings(team))
      return "No prize paid: Matched Play keeps no Treasury";
    return `The ${prizeGold} prize goes into ${champion.name}'s Treasury`;
  })();

  const contextFor = (fixture: CompetitionFixture): CompetitionContext => ({
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
    const stillShown = startChange();
    try {
      const updated = await withdrawFromCompetition(
        { competitionType: type, competitionId: competition.id },
        entrantId
      );
      if (!stillShown()) return;
      showChange(updated);
      setError(null);
    } catch (reason) {
      if (stillShown())
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
    // A knockout game left level was decided on Penalties
    const penalties =
      isBracket && home === away
        ? {
            home: Number(draft?.penaltiesHome),
            away: Number(draft?.penaltiesAway),
          }
        : undefined;
    const stillShown = startChange();
    try {
      const updated = await recordCompetitionFixture(
        contextFor(fixture),
        home,
        away,
        undefined,
        penalties
      );
      if (!stillShown()) return;
      showChange(updated);
      setError(null);
    } catch (reason) {
      if (stillShown())
        setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  /**
   * Load both rosters and, when they may play, start the match. A local
   * match replaces the saved one, so it asks first.
   */
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
    const stillShown = onShownRoute();
    try {
      const [homeTeam, awayTeam] = await Promise.all([
        fetchEntrantTeam(home),
        fetchEntrantTeam(away),
      ]);
      // The coach moved on to another competition: start nothing
      if (!stillShown()) return;
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
      if (stillShown()) setLaunching(false);
    }
  };

  const launchLocal = (fixture: CompetitionFixture) =>
    launch(fixture, true, (team1, team2) =>
      navigate("/play", {
        state: {
          team1,
          team2,
          competitionContext: contextFor(fixture),
          // A league or tournament game counts: SPP and development
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

  /** A person coaches one side and the computer the other. */
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

  /**
   * Simulate games one after another, each picked from the competition as
   * the last left it, until `next` finds none.
   */
  const simulate = async (
    next: (latest: CompetitionDoc) => CompetitionFixture | undefined
  ) => {
    let latest = competition;
    const results: SimulatedResult[] = [];
    setError(null);
    const stillShown = startChange();
    try {
      // Simulating stops when the page moves to another competition
      for (
        let fixture = next(latest);
        fixture && stillShown();
        fixture = next(latest)
      ) {
        const name = (entrantId: string | null) =>
          latest.entrants.find((candidate) => candidate.id === entrantId)
            ?.name ?? "TBD";
        setSimulating(
          `${name(fixture.homeEntrantId)} v ${name(fixture.awayEntrantId)}`
        );
        // Let the page show which game is on before the match runs
        await new Promise((resolve) => setTimeout(resolve, 0));
        const outcome = await simulateFixture(latest, fixture.id);
        if (!stillShown()) return;
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
        showChange(latest);
        setSimulated((shown) => [
          ...results,
          ...shown.filter(
            (earlier) =>
              !results.some((result) => result.fixtureId === earlier.fixtureId)
          ),
        ]);
      }
    } catch (reason) {
      if (stillShown())
        setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (stillShown()) setSimulating(null);
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
    if (!canReport(fixture)) return null;
    const busy = launching || simulating !== null;
    if (home && away && computerCoached(home) && computerCoached(away)) {
      return (
        <div className="flex flex-wrap gap-2">
          {/* The current round only, as for the round's button */}
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
        {isBracket && draft.home !== "" && draft.home === draft.away && (
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="hud-label">Penalties</span>
            {(["penaltiesHome", "penaltiesAway"] as const).map((side) => (
              <input
                key={side}
                aria-label={`${side === "penaltiesHome" ? home?.name : away?.name} penalties`}
                type="number"
                min="0"
                max="5"
                value={draft[side] ?? ""}
                onChange={(event) =>
                  setScores((current) => ({
                    ...current,
                    [fixture.id]: { ...draft, [side]: event.target.value },
                  }))
                }
                className="hud-field w-16 text-center"
              />
            ))}
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
                        {walkoverLine(
                          competition.entrants,
                          fixture.result.walkover
                        )}
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
        back={allCompetitions}
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
          {prizeOutcome && (
            <p
              data-testid="tournament-prize-outcome"
              className="mt-2 font-hud-label text-hud-lg font-bold text-hud-bone"
            >
              {prizeOutcome}
            </p>
          )}
        </Panel>
      )}

      {prize > 0 && (
        <p
          data-testid="tournament-prize"
          className="mb-6 font-hud-body text-hud-lg text-hud-dim"
        >
          Champion&apos;s prize:{" "}
          <span className="font-bold text-hud-gold">{prizeGold}</span>, paid
          into the champion&apos;s Treasury when the tournament ends.
        </p>
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
                  {candidate.computerCoached && (
                    <span className="font-hud-label text-hud-xs font-bold uppercase tracking-[0.08em] text-hud-mute">
                      Computer
                    </span>
                  )}
                  {/* A computer team withdrawn would leave its games unplayed */}
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

      {simulated.length > 0 && (
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
      )}

      <Section title={isBracket ? "Bracket" : "Schedule"}>
        {/* In the body, where the buttons can wrap on a phone */}
        {(toSimulate.length > 0 || simulating) && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {simulating ? (
              <span
                role="status"
                className="font-hud-body text-hud-sm text-hud-dim"
              >
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
        )}
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
