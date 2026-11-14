import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { Team } from "../../../types/Team";
import { MatchResult } from "../../../types/GameState";
import {
  MatchStatsSummary,
  sppValuesFor,
} from "../../../game/progression/MatchStats";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { GameEventNames } from "../../../types/events";
import { clearMatchSave } from "../../../game/persistence/MatchSaveRepository";
import { getCurrentUser } from "../../../firebase/auth";
import { clearActiveMatchCode } from "../../../firebase/lobby";
import { getTeamById, saveTeam } from "../../../game/managers/TeamManager";
import { recordPendingDevelopment } from "../../../game/progression/postMatch";
import { foldMatchSummaryIntoCareers } from "../../../game/progression/careerStats";
import {
  playedGameFor,
  withPlayedGame,
} from "../../../game/progression/matchHistory";
import {
  keepRecordedResult,
  recordCompetitionFixture,
} from "../../../competition/resultRecording";
import { earnsWinnings, stalledSides } from "../../../game/rules/winnings";
import { hudButtonClass, Panel } from "../componentWarehouse/HudKit";
import { injuryLabel, playerLabel } from "./turnSummary";
import { CompetitionContext } from "../../../competition/types";

interface Props {
  visible: boolean;
  /** Where Leave goes; a competition game returns to its competition. */
  leaveTo?: string;
  fixtureContext?: CompetitionContext;
}

/**
 * The coach is done with this match: drop the local save and, online, the
 * home screen's pointer to it. The lobby stays as it is, so the other coach
 * can finish their own post-match steps.
 */
function finishWithMatch(): void {
  clearMatchSave();
  const user = getCurrentUser();
  if (getActiveOnlineMatch()?.kind === "online" && user) {
    void clearActiveMatchCode(user.uid).catch(() => {});
  }
}

function ownedTeams(teams: Team[]): Team[] {
  const online = getActiveOnlineMatch();
  return online ? teams.filter((team) => team.id === online.myTeamId) : teams;
}

/**
 * The teams this page saves. Against the computer, every team in this
 * coach's library: in a competition the computer's team is the organizer's.
 */
function savedTeams(teams: Team[]): Team[] {
  return getActiveOnlineMatch()?.kind === "computer"
    ? teams.filter((team) => !!getTeamById(team.id))
    : ownedTeams(teams);
}

/**
 * The played score and the termination reason are kept as separate facts
 * (see `MatchResult`): a concession/forfeit never invents a touchdown or
 * rewrites the scoreline, it only changes how the outcome is labelled.
 */
function outcomeLabel(
  teams: Team[],
  score: Record<string, number>,
  result?: MatchResult
): string {
  if (result?.reason === "concession" || result?.reason === "forfeit") {
    const conceding = teams.find((team) => team.id === result.concedingTeamId);
    const verb = result.reason === "concession" ? "conceded" : "forfeited";
    return conceding ? `${conceding.name} ${verb}` : `Match ${verb}`;
  }
  if (teams.length < 2) return "";
  const [a, b] = teams;
  const scoreA = score[a.id] ?? 0;
  const scoreB = score[b.id] ?? 0;
  const penalties = result?.penalties;
  if (scoreA === scoreB && penalties) {
    const [wonA, wonB] = [penalties[a.id] ?? 0, penalties[b.id] ?? 0];
    return `${wonA > wonB ? a.name : b.name} win on Penalties, ${Math.max(wonA, wonB)}–${Math.min(wonA, wonB)}`;
  }
  if (scoreA === scoreB) return "Draw";
  return `${scoreA > scoreB ? a.name : b.name} win`;
}

export function MatchResultsScreen({
  visible,
  leaveTo = "/",
  fixtureContext,
}: Props) {
  const navigate = useNavigate();
  const container = ServiceContainer.isInitialized()
    ? ServiceContainer.getInstance()
    : null;
  const tracker = container?.matchStats;
  const teamIds = useMemo(
    () =>
      tracker
        ? [...new Set(tracker.summary().players.map((player) => player.teamId))]
        : [],
    [tracker, visible]
  );
  const teams = teamIds
    .map((id) => container?.gameService.getTeam(id))
    .filter((team): team is Team => !!team);
  const progressionEnabled = !!tracker?.progressionEnabled;

  const [nominations, setNominations] = useState<Record<string, string[]>>({});
  const [mvpResults, setMvpResults] = useState<
    Record<string, { playerId: string; roll: number }>
  >({});
  const [confirmed, setConfirmed] = useState(false);
  const [touchdownRecipients, setTouchdownRecipients] = useState<
    Record<string, string>
  >({});
  const [competitionRecorded, setCompetitionRecorded] = useState(false);
  /** League winnings the recorded fixture paid, by team id. */
  const [winnings, setWinnings] = useState<{
    gold: Record<string, number>;
    fanFactors: Record<string, number>;
  } | null>(null);
  const [, refresh] = useState(0);
  const [error, setError] = useState("");
  const computerMvpRolled = useRef(new Set<string>());
  /** Computer teams whose MVP did not roll by itself: the coach rolls it. */
  const [computerMvpFailed, setComputerMvpFailed] = useState<string[]>([]);
  const [recordingAttempt, setRecordingAttempt] = useState(0);
  const [recordingError, setRecordingError] = useState("");
  const [savingTeams, setSavingTeams] = useState(false);
  const savingTeamsRef = useRef(false);
  const developmentRecorded = useRef(false);
  const developmentMatchId = useRef(`match-${Date.now()}`);

  // The results screen owns recording and retry, including on resume.
  // A complete fixture alone does not mean this client's teams were saved.
  useEffect(() => {
    if (!visible || !fixtureContext || !container || teamIds.length < 2) return;
    let cancelled = false;
    setCompetitionRecorded(false);
    setRecordingError("");
    const game = container.gameService;
    const state = game.getState();
    const [homeId, awayId] = teamIds;
    const home = game.getTeam(homeId);
    const away = game.getTeam(awayId);
    if (!home || !away) return;
    void recordCompetitionFixture(
      fixtureContext,
      state.score[homeId] ?? 0,
      state.score[awayId] ?? 0,
      { home, away },
      state.result?.penalties && {
        home: state.result.penalties[homeId] ?? 0,
        away: state.result.penalties[awayId] ?? 0,
      },
      {
        fanFactors: state.fanFactors && {
          home: state.fanFactors[homeId] ?? 0,
          away: state.fanFactors[awayId] ?? 0,
        },
        stalled: stalledSides(state.stallingPlayerIds, home, away),
      }
    )
      .then((competition) => {
        if (cancelled) return;
        const fixture = competition.fixtures.find(
          (entry) => entry.id === fixtureContext.fixtureId
        );
        setCompetitionRecorded(true);
        const saved = fixture?.result?.winnings;
        const recorded = {
          fixtureId: fixtureContext.fixtureId,
          ...(saved && {
            winnings: { [homeId]: saved.home, [awayId]: saved.away },
            fanFactors: {
              [homeId]: saved.fanFactor.home,
              [awayId]: saved.fanFactor.away,
            },
          }),
        };
        if (recorded.winnings)
          setWinnings({
            gold: recorded.winnings,
            fanFactors: recorded.fanFactors ?? {},
          });
        container.eventBus.emit(
          GameEventNames.CompetitionResultRecorded,
          recorded
        );
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setRecordingError(
            cause instanceof Error ? cause.message : String(cause)
          );
      });
    return () => {
      cancelled = true;
    };
  }, [visible, fixtureContext, container, teamIds, recordingAttempt]);

  // Idempotency across rerender/resume/reconnect: seed from the tracker's
  // own persisted state instead of only from live events, so a remount never
  // re-offers a confirm/roll step that has already happened.
  useEffect(() => {
    if (!container || !tracker) return;
    if (tracker.applied) setConfirmed(true);
    const summary = tracker.summary();
    const seeded: Record<string, { playerId: string; roll: number }> = {};
    summary.players.forEach((stats) => {
      // -1 is a "already awarded, roll unknown" sentinel — the roll itself
      // isn't persisted, only that MVP was already assigned this match.
      if (stats.mvps > 0)
        seeded[stats.teamId] = { playerId: stats.playerId, roll: -1 };
    });
    if (Object.keys(seeded).length) {
      setMvpResults((previous) => ({ ...seeded, ...previous }));
    }
  }, [container, tracker]);

  useEffect(() => {
    if (!container) return;
    const onMvp = (result: {
      teamId: string;
      playerId: string;
      roll: number;
    }) => {
      setMvpResults((previous) => ({
        ...previous,
        [result.teamId]: result,
      }));
      refresh((value) => value + 1);
    };
    const onTouchdown = () => refresh((value) => value + 1);
    const onCompetitionRecorded = (recorded?: {
      winnings?: Record<string, number>;
      fanFactors?: Record<string, number>;
    }) => {
      if (fixtureContext) return;
      setCompetitionRecorded(true);
      if (recorded?.winnings)
        setWinnings({
          gold: recorded.winnings,
          fanFactors: recorded.fanFactors ?? {},
        });
    };
    container.eventBus.on(GameEventNames.MvpAwarded, onMvp);
    container.eventBus.on(GameEventNames.AwardedTouchdownAssigned, onTouchdown);
    container.eventBus.on(
      GameEventNames.CompetitionResultRecorded,
      onCompetitionRecorded
    );
    return () => {
      container.eventBus.off(GameEventNames.MvpAwarded, onMvp);
      container.eventBus.off(
        GameEventNames.AwardedTouchdownAssigned,
        onTouchdown
      );
      container.eventBus.off(
        GameEventNames.CompetitionResultRecorded,
        onCompetitionRecorded
      );
    };
  }, [container, fixtureContext]);

  // The computer names its own MVP nominees: the first six who took part.
  useEffect(() => {
    const online = getActiveOnlineMatch();
    if (!visible || !tracker?.progressionEnabled || tracker.applied) return;
    if (online?.kind !== "computer") return;
    const awarded = new Set(
      tracker
        .summary()
        .players.filter((stats) => stats.mvps > 0)
        .map((stats) => stats.teamId)
    );
    for (const teamId of teamIds) {
      if (teamId === online.myTeamId || awarded.has(teamId)) continue;
      if (computerMvpRolled.current.has(teamId)) continue;
      computerMvpRolled.current.add(teamId);
      void online
        .runProgressionCommand({
          type: "award-mvp",
          teamId,
          nominatedPlayerIds: tracker.getEligibleMvpPlayers(teamId).slice(0, 6),
        })
        .then((response) => {
          if (!response.ok) throw new Error(response.reason ?? "MVP rejected");
          refresh((value) => value + 1);
        })
        .catch((cause: unknown) => {
          setComputerMvpFailed((failed) => [...failed, teamId]);
          setError(cause instanceof Error ? cause.message : String(cause));
        });
    }
  }, [visible, tracker, teamIds]);

  if (!visible || !container || !tracker) return null;

  const state = container.gameService.getState();
  const result = state.result;
  const own = ownedTeams(teams);
  const mvpTeams = [
    ...own,
    ...teams.filter(
      (team) => computerMvpFailed.includes(team.id) && !own.includes(team)
    ),
  ];
  const statsSummary = tracker.summary(teams.flatMap((team) => team.players));
  const pendingMvpTeams = teams.filter(
    (team) =>
      !statsSummary.players.some(
        (stats) => stats.teamId === team.id && stats.mvps > 0
      )
  );
  const recordingPending = !!fixtureContext && !competitionRecorded;
  const canExit =
    (!progressionEnabled || confirmed) && !recordingPending && !savingTeams;

  const nomineesFor = (team: Team): string[] => {
    const existing = nominations[team.id];
    if (existing) return existing;
    return tracker.getEligibleMvpPlayers(team.id).slice(0, 6);
  };

  const toggleNominee = (team: Team, playerId: string) => {
    const current = nomineesFor(team);
    const next = current.includes(playerId)
      ? current.filter((id) => id !== playerId)
      : current.length < 6
        ? [...current, playerId]
        : current;
    setNominations((previous) => ({ ...previous, [team.id]: next }));
  };

  const rollMvp = async (team: Team) => {
    try {
      const nominees = nomineesFor(team);
      const online = getActiveOnlineMatch();
      if (online) {
        const response = await online.runProgressionCommand({
          type: "award-mvp",
          teamId: team.id,
          nominatedPlayerIds: nominees,
        });
        if (!response.ok) throw new Error(response.reason ?? "MVP rejected");
        const eventResult = response.events.find(
          (event) => event.name === GameEventNames.MvpAwarded
        )?.data as { playerId: string; roll: number } | undefined;
        if (eventResult) {
          setMvpResults((previous) => ({
            ...previous,
            [team.id]: {
              playerId: eventResult.playerId,
              roll: eventResult.roll,
            },
          }));
        }
      } else {
        const roll = container.rngService.rollDie(nominees.length);
        tracker.awardMvp(team.id, nominees, roll);
      }
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const assignAwardedTouchdown = async (team: Team) => {
    const playerId = touchdownRecipients[team.id];
    if (!playerId) return;
    try {
      const online = getActiveOnlineMatch();
      if (online) {
        const response = await online.runProgressionCommand({
          type: "assign-awarded-touchdown",
          playerId,
        });
        if (!response.ok) {
          throw new Error(response.reason ?? "Touchdown assignment rejected");
        }
      } else {
        tracker.assignAwardedTouchdown(playerId);
      }
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const recordDevelopment = async () => {
    const gameState = container?.gameService.getState();
    const managed = savedTeams(teams);
    if (!developmentRecorded.current) {
      managed.forEach((team) => {
        recordPendingDevelopment(
          team,
          fixtureContext
            ? `${fixtureContext.competitionId}:${fixtureContext.fixtureId}`
            : developmentMatchId.current,
          gameState?.raisedDead?.[team.id],
          {
            // A league fixture's Journeymen who played wait on a hiring decision
            leagueFixture: !!gameState?.paysWinnings,
            playedIds: new Set(tracker.getEligibleMvpPlayers(team.id)),
          }
        );
        keepRecordedResult(team);
      });
      developmentRecorded.current = true;
    }
    for (const team of managed) await saveTeam(team);
  };

  /** Each of this coach's teams keeps the game in its played games. */
  const recordPlayedGames = async () => {
    if (!tracker || teams.length < 2) return;
    const stats = tracker.summary().players;
    const id = fixtureContext
      ? `${fixtureContext.competitionId}:${fixtureContext.fixtureId}`
      : developmentMatchId.current;
    const kind = getActiveOnlineMatch()?.kind ?? "local";
    for (const team of savedTeams(teams)) {
      const stored = getTeamById(team.id);
      const opponent = teams.find((other) => other.id !== team.id);
      if (!stored || !opponent) continue;
      const game = playedGameFor(
        stored,
        opponent,
        { score: state.score, result: state.result },
        stats,
        {
          id,
          playedAt: Date.now(),
          kind,
          ...(fixtureContext ? { fixture: id } : {}),
        }
      );
      const updated = withPlayedGame(stored, game);
      // The history never holds the coach on this screen
      if (updated !== stored)
        await saveTeam(updated).catch((cause) =>
          console.warn("[MatchResults] played game not saved:", cause)
        );
    }
  };

  const managePostMatchTeam = (): boolean => {
    if (!state.paysWinnings) return false;
    const managed = own.filter(
      (team) =>
        !team.computerCoached && earnsWinnings(team) && !!getTeamById(team.id)
    );
    const [first, ...next] = managed;
    if (!first) return false;
    const params = new URLSearchParams({ postMatch: "1", returnTo: leaveTo });
    next.forEach((team) => params.append("nextTeam", team.id));
    managed.forEach((team) => {
      const gold = winnings?.gold[team.id];
      if (gold !== undefined) params.set(`winnings-${team.id}`, String(gold));
    });
    finishWithMatch();
    navigate(`/build-team/${first.id}?${params}`, { replace: true });
    return true;
  };

  const confirmSpp = async (openManagement = true): Promise<boolean> => {
    if (recordingPending || savingTeamsRef.current) return false;
    savingTeamsRef.current = true;
    setSavingTeams(true);
    try {
      if (!tracker.applied) {
        const concedingTeamId =
          result?.reason === "concession" ? result.concedingTeamId : undefined;
        const finalSummary = tracker.applySpp(teams, concedingTeamId);
        foldMatchSummaryIntoCareers(teams, finalSummary);
      }
      setConfirmed(true);
      await recordDevelopment();
      await recordPlayedGames();
      setError("");
      if (openManagement) managePostMatchTeam();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      savingTeamsRef.current = false;
      setSavingTeams(false);
    }
  };

  const leave = async () => {
    if (!canExit) return;
    if (progressionEnabled && !(await confirmSpp(false))) return;
    await recordPlayedGames();
    if (!managePostMatchTeam()) {
      finishWithMatch();
      navigate(leaveTo);
    }
  };

  return (
    <div className="hud-scroll absolute inset-0 z-[250] overflow-auto bg-hud-ink/95 p-6 font-hud-body text-hud-bone pointer-events-auto backdrop-blur-sm">
      <Panel
        accent="blood"
        data-testid="match-results"
        className="mx-auto max-w-6xl p-6 animate-hud-pop"
      >
        {/* ---- Result ---- */}
        <h1 className="font-hud-display text-hud-4xl uppercase tracking-[0.03em] text-hud-bone">
          Full Time
        </h1>
        {teams.length >= 2 && (
          <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-y border-hud-gold/30 bg-black/40 px-5 py-4">
            <span className="truncate font-hud-label text-hud-2xl font-bold uppercase tracking-[0.03em]">
              {teams[0].name}
            </span>
            <span className="-skew-x-12 bg-hud-blood px-5 py-1 font-hud-display text-hud-3xl text-white">
              <span className="block skew-x-12">
                {state.score[teams[0].id] ?? 0} :{" "}
                {state.score[teams[1].id] ?? 0}
              </span>
            </span>
            <span className="truncate text-right font-hud-label text-hud-2xl font-bold uppercase tracking-[0.03em]">
              {teams[1].name}
            </span>
          </div>
        )}
        <p className="mt-3 font-hud-label text-hud-xl font-bold uppercase tracking-[0.06em] text-hud-gold">
          {outcomeLabel(teams, state.score, result)}
        </p>
        {competitionRecorded && (
          <p className="mt-2 text-hud-sm text-hud-good">
            ✓ Competition fixture result recorded.
          </p>
        )}
        {winnings && <WinningsPanel teams={teams} winnings={winnings} />}

        {/* ---- Statistics ---- */}
        <StatsTables
          teams={teams}
          summary={statsSummary}
          showSpp={progressionEnabled}
        />
        {!progressionEnabled && (
          <p className="mt-3 text-hud-sm italic text-hud-dim">
            This match does not award SPP or MVP recognition.
          </p>
        )}

        {/* ---- Awards (eligible matches only) ---- */}
        {progressionEnabled && !confirmed && (
          <>
            <div className="mt-6 grid gap-5 md:grid-cols-2">
              {mvpTeams.map((team) => {
                const eligibleIds = tracker.getEligibleMvpPlayers(team.id);
                const nominees = nomineesFor(team);
                const mvpResult = mvpResults[team.id];
                return (
                  <section
                    key={team.id}
                    className="rounded-hud border border-white/10 bg-black/30 p-4"
                  >
                    <h2 className="font-hud-display text-hud-xl uppercase tracking-[0.03em] text-hud-gold">
                      {team.name} MVP
                    </h2>
                    <p className="mb-3 text-hud-sm text-hud-dim">
                      Nominate six players who took part. Their displayed order
                      is slots 1–6.
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {eligibleIds.map((playerId) => {
                        const player = team.players.find(
                          (candidate) => candidate.id === playerId
                        )!;
                        const slot = nominees.indexOf(playerId);
                        return (
                          <button
                            key={playerId}
                            disabled={!!mvpResult}
                            onClick={() => toggleNominee(team, playerId)}
                            className={`min-h-[40px] rounded-hud border px-3 py-2 text-left font-hud-label text-hud-base font-bold transition-colors disabled:cursor-default ${
                              slot >= 0
                                ? "border-hud-gold bg-hud-blood text-white"
                                : "border-white/10 bg-hud-raise text-hud-bone hover:border-hud-gold/60"
                            }`}
                          >
                            {slot >= 0 ? `${slot + 1}. ` : ""}#{player.number}{" "}
                            {player.playerName}
                          </button>
                        );
                      })}
                    </div>
                    {mvpResult ? (
                      <p className="mt-3 font-hud-label text-hud-xl font-bold uppercase text-hud-gold">
                        {mvpResult.roll >= 1
                          ? `Rolled ${mvpResult.roll}: `
                          : ""}
                        {
                          team.players.find(
                            (player) => player.id === mvpResult.playerId
                          )?.playerName
                        }{" "}
                        gains 4 SPP
                      </p>
                    ) : (
                      <button
                        onClick={() => void rollMvp(team)}
                        disabled={
                          nominees.length !== Math.min(6, eligibleIds.length)
                        }
                        className={`${hudButtonClass("primary", "lg")} mt-4`}
                      >
                        Roll MVP D6
                      </button>
                    )}
                    <div className="mt-5 border-t border-white/10 pt-4">
                      <p className="mb-2 text-hud-sm text-hud-dim">
                        If this team was awarded a touchdown after a concession,
                        assign its {sppValuesFor(team.rosterName).touchdown} SPP
                        here. Repeat for each awarded touchdown.
                      </p>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <select
                          aria-label={`${team.name} awarded touchdown recipient`}
                          value={touchdownRecipients[team.id] ?? ""}
                          onChange={(event) =>
                            setTouchdownRecipients((previous) => ({
                              ...previous,
                              [team.id]: event.target.value,
                            }))
                          }
                          className="hud-field min-w-0 flex-1"
                        >
                          <option value="">Choose a player</option>
                          {team.players
                            .filter((player) => player.playerKind !== "star")
                            .map((player) => (
                              <option key={player.id} value={player.id}>
                                #{player.number} {player.playerName}
                              </option>
                            ))}
                        </select>
                        <button
                          disabled={!touchdownRecipients[team.id]}
                          onClick={() => void assignAwardedTouchdown(team)}
                          className={hudButtonClass("secondary")}
                        >
                          Assign touchdown
                        </button>
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>
            <button
              onClick={() => void confirmSpp()}
              disabled={
                pendingMvpTeams.length > 0 || recordingPending || savingTeams
              }
              className={`${hudButtonClass("gold", "lg")} mt-5`}
            >
              Confirm and assign SPP
            </button>
          </>
        )}

        {progressionEnabled && confirmed && (
          <p className="mt-6 rounded-hud border border-white/10 bg-black/30 p-4 text-hud-lg">
            MVP and SPP are confirmed. Any player now eligible to advance is
            saved as pending development — finish it any time from{" "}
            <strong>Manage Team</strong>.
          </p>
        )}

        {/* ---- Exit ---- */}
        <button
          onClick={leave}
          disabled={!canExit}
          title={
            canExit
              ? undefined
              : "Confirm MVP nomination and SPP for both teams before leaving"
          }
          className={`${hudButtonClass("primary", "lg")} mt-6`}
        >
          {savingTeams
            ? "Saving team..."
            : error && confirmed
              ? "Retry saving team"
              : state.paysWinnings
                ? "Manage team"
                : leaveTo === "/"
                  ? "Continue to Main Menu"
                  : "Back to the competition"}
        </button>
        {!canExit && (
          <p className="mt-2 text-hud-sm italic text-hud-dim">
            {recordingPending
              ? "Saving the competition result and winnings..."
              : "Confirm MVP nomination and SPP for both teams before leaving."}
          </p>
        )}

        {recordingError && (
          <div className="mt-4">
            <p role="alert" className="text-hud-bad-soft">
              The competition result could not be saved. {recordingError}
            </p>
            <button
              className={`${hudButtonClass("primary")} mt-2`}
              onClick={() => setRecordingAttempt((attempt) => attempt + 1)}
            >
              Retry saving result
            </button>
          </div>
        )}

        {error && <p className="mt-4 text-hud-bad-soft">{error}</p>}
      </Panel>
    </div>
  );
}

/**
 * League winnings (Record Outcome and Winnings): half the Fan Attendance
 * plus the team's own touchdowns, times 10,000 gp, paid into the Treasury.
 */
function WinningsPanel({
  teams,
  winnings,
}: {
  teams: Team[];
  winnings: {
    gold: Record<string, number>;
    fanFactors: Record<string, number>;
  };
}) {
  const attendance = teams.reduce(
    (total, team) => total + (winnings.fanFactors[team.id] ?? 0),
    0
  );
  return (
    <section
      data-testid="match-winnings"
      className="mt-4 rounded-hud border border-hud-gold/30 bg-black/30 p-4"
    >
      <h2 className="font-hud-display text-hud-xl uppercase tracking-[0.03em] text-hud-gold">
        Winnings
      </h2>
      <p className="mt-1 text-hud-sm text-hud-dim">
        Fan Attendance {attendance} (
        {teams
          .map(
            (team) =>
              `${team.name} Fan Factor ${winnings.fanFactors[team.id] ?? 0}`
          )
          .join(", ")}
        ). Each team earns half the Fan Attendance plus its own touchdowns,
        plus 1 if none of its players was Stalling, times 10,000 gp.
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {teams.map((team) => (
          <li
            key={team.id}
            data-testid={`match-winnings-${team.id}`}
            className="font-hud-label text-hud-lg font-bold"
          >
            {team.name}:{" "}
            {earnsWinnings(team) ? (
              <span className="text-hud-gold">
                +{(winnings.gold[team.id] ?? 0).toLocaleString("en-US")} gp to
                the Treasury
              </span>
            ) : (
              <span className="text-hud-dim">
                no winnings (Matched Play keeps no Treasury)
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatsTables({
  teams,
  summary,
  showSpp,
}: {
  teams: Team[];
  summary: MatchStatsSummary;
  showSpp: boolean;
}) {
  return (
    <div className="mt-6 grid gap-5 xl:grid-cols-2">
      {teams.map((team) => (
        <section key={team.id} className="overflow-auto">
          <h2 className="mb-2 font-hud-display text-hud-xl uppercase tracking-[0.03em] text-hud-bone">
            {team.name}
          </h2>
          <table className="w-full text-hud-sm tabular-nums">
            <thead>
              <tr className="hud-label border-b border-hud-gold/30 text-left [&>th]:py-1.5 [&>th]:font-bold">
                <th>Player</th>
                <th>CMP</th>
                <th>TTM</th>
                <th>INT</th>
                <th>CAS</th>
                <th>TD</th>
                {showSpp && <th>MVP</th>}
                {showSpp && <th>SPP</th>}
              </tr>
            </thead>
            <tbody>
              {team.players.map((player) => {
                const stats = summary.players.find(
                  (entry) => entry.playerId === player.id
                );
                if (!stats?.participated) return null;
                return (
                  <tr
                    key={player.id}
                    className="border-t border-white/5 odd:bg-white/[0.02]"
                  >
                    <td className="py-1">{player.playerName}</td>
                    <td>{stats.completions}</td>
                    <td>{stats.superbThrows + stats.safeLandings}</td>
                    <td>{stats.interceptions}</td>
                    <td>{stats.casualties}</td>
                    <td>{stats.touchdowns}</td>
                    {showSpp && <td>{stats.mvps}</td>}
                    {showSpp && (
                      <td className="font-bold text-hud-gold">
                        +{stats.sppEarned}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div
            data-testid={`match-injuries-${team.id}`}
            className="mt-4 rounded-hud border border-hud-edge bg-black/20 p-3"
          >
            <h3 className="font-hud-display text-hud-lg text-hud-gold">
              Injuries
            </h3>
            {team.players.some((player) => injuryLabel(player)) ? (
              <ul className="mt-1 space-y-1 text-hud-sm text-hud-bone">
                {team.players.map((player) => {
                  const injury = injuryLabel(player);
                  return injury ? (
                    <li key={player.id}>
                      {playerLabel(player)}: {injury}
                    </li>
                  ) : null;
                })}
              </ul>
            ) : (
              <p className="text-hud-sm text-hud-dim">No injuries</p>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
