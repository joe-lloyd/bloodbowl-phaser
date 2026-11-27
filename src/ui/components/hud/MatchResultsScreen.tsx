import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { type Team } from "../../../types/Team";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { GameEventNames } from "../../../types/events";
import { clearMatchSave } from "../../../game/persistence/MatchSaveRepository";
import { getCurrentUser } from "../../../firebase/auth";
import { clearActiveMatchCode } from "../../../firebase/lobby";
import { getTeamById, saveTeam } from "../../../game/managers/TeamManager";
import { isHouseBotBrowser } from "../../../firebase/houseBot";
import { recordPendingDevelopment } from "../../../game/progression/postMatch";
import { foldMatchSummaryIntoCareers } from "../../../game/progression/careerStats";
import {
  type PlayedGame,
  playedGameFor,
  withPlayedGame,
} from "../../../game/progression/matchHistory";
import {
  keepRecordedResult,
  recordCompetitionFixture,
} from "../../../competition/resultRecording";
import { earnsWinnings, stalledSides } from "../../../game/rules/winnings";
import { carriesInjuries } from "../../../game/rules/injuryRules";
import {
  keepPreMatchInjuries,
  keepPreMatchSquad,
} from "../../../game/rules/leagueRoster";
import { careerCounts } from "../../../game/rules/club";
import { hudButtonClass, Panel } from "../componentWarehouse/HudKit";
import {
  LeaveControls,
  type MatchWinnings,
  ResultHeader,
  StatsTables,
} from "./MatchResultsSections";
import { MvpAwardCard } from "./MvpAwardCard";
import {
  type CompetitionContext,
  type CompetitionDoc,
  type CompetitionFixture,
} from "../../../competition/types";
import { byCodeUnit } from "../../../game/core/order";

interface Props {
  visible: boolean;

  leaveTo?: string;
  fixtureContext?: CompetitionContext;
}

function finishWithMatch(): void {
  clearMatchSave();
  const user = getCurrentUser();
  if (getActiveOnlineMatch()?.kind === "online" && user) {
    void clearActiveMatchCode(user.uid).catch(() => {});
  }
}

function matchKey(
  container: ServiceContainer | null,
  teamIds: string[],
  fixtureContext?: CompetitionContext
): string {
  if (fixtureContext)
    return `${fixtureContext.competitionId}:${fixtureContext.fixtureId}`;
  const online = getActiveOnlineMatch();
  if (online?.kind === "online") return `online:${online.code}`;
  const seed = container?.rngService.getInitialSeed() ?? 0;
  return `match:${String(seed)}:${[...teamIds].sort(byCodeUnit).join(":")}`;
}

function ownedTeams(teams: Team[]): Team[] {
  const online = getActiveOnlineMatch();
  return online ? teams.filter((team) => team.id === online.myTeamId) : teams;
}

interface DevelopmentRecord {
  key: string;
  friendly: boolean;
  raisedDead: Record<string, string> | undefined;
  leagueFixture: boolean;
}

function recordTeamDevelopment(
  team: Team,
  match: DevelopmentRecord,
  playedIds: ReadonlySet<string>
): void {
  recordPendingDevelopment(
    team,
    match.key,
    match.friendly ? undefined : match.raisedDead?.[team.id],
    { leagueFixture: match.leagueFixture, playedIds }
  );
  keepRecordedResult(team);
  const before = getTeamById(team.id);
  if (!carriesInjuries(team, !match.friendly))
    keepPreMatchInjuries(team, before);
  if (match.friendly) keepPreMatchSquad(team, before);
}

function savedTeams(teams: Team[]): Team[] {
  return getActiveOnlineMatch()?.kind === "computer" || isHouseBotBrowser()
    ? teams.filter((team) => !!getTeamById(team.id))
    : ownedTeams(teams);
}

function fixtureSides(
  competition: CompetitionDoc,
  fixture: CompetitionFixture | undefined,
  [gameHome, gameAway]: [string, string]
): { home: string; away: string } {
  const fixtureHome = competition.entrants.find(
    (entrant) => entrant.id === fixture?.homeEntrantId
  )?.teamId;
  return fixtureHome === gameAway
    ? { home: gameAway, away: gameHome }
    : { home: gameHome, away: gameAway };
}

function homeAndAway(
  values: Record<string, number>,
  homeId: string,
  awayId: string
): { home: number; away: number } {
  return { home: values[homeId] ?? 0, away: values[awayId] ?? 0 };
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

  const [winnings, setWinnings] = useState<MatchWinnings | null>(null);
  const [, refresh] = useState(0);
  const [error, setError] = useState("");
  const computerMvpRolled = useRef(new Set<string>());

  const [computerMvpFailed, setComputerMvpFailed] = useState<string[]>([]);
  const [recordingAttempt, setRecordingAttempt] = useState(0);
  const [recordingError, setRecordingError] = useState("");
  const [savingTeams, setSavingTeams] = useState(false);
  const savingTeamsRef = useRef(false);
  const developmentRecorded = useRef(false);

  const playedGames = useRef<Map<string, PlayedGame> | null>(null);

  useEffect(() => {
    if (!visible || !fixtureContext || !container || teamIds.length < 2) return;
    setCompetitionRecorded(false);
    setRecordingError("");
    const game = container.gameService;
    const state = game.getState();
    const [homeId, awayId] = teamIds;
    if (homeId === undefined || awayId === undefined) return;
    const home = game.getTeam(homeId);
    const away = game.getTeam(awayId);
    if (!home || !away) return;
    let cancelled = false;
    void recordCompetitionFixture({
      context: fixtureContext,
      homeScore: state.score[homeId] ?? 0,
      awayScore: state.score[awayId] ?? 0,
      progressedTeams: { home, away },
      ...(state.result?.penalties && { penalties: homeAndAway(state.result.penalties, homeId, awayId) }),
      options: {
        ...(state.fanFactors && { fanFactors: homeAndAway(state.fanFactors, homeId, awayId) }),
        stalled: stalledSides(state.stallingPlayerIds, home, away),
      },
    })
      .then((competition) => {
        if (cancelled) return;
        const fixture = competition.fixtures.find(
          (entry) => entry.id === fixtureContext.fixtureId
        );
        setCompetitionRecorded(true);
        const saved = fixture?.result?.winnings;
        const sides = fixtureSides(competition, fixture, [homeId, awayId]);
        const recorded = {
          fixtureId: fixtureContext.fixtureId,
          ...(saved && {
            winnings: { [sides.home]: saved.home, [sides.away]: saved.away },
            fanFactors: {
              [sides.home]: saved.fanFactor.home,
              [sides.away]: saved.fanFactor.away,
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

  useEffect(() => {
    if (!container || !tracker) return;
    if (tracker.applied) setConfirmed(true);
    const summary = tracker.summary();
    const seeded: Record<string, { playerId: string; roll: number }> = {};
    for (const stats of summary.players) {
      if (stats.mvps > 0)
        seeded[stats.teamId] = { playerId: stats.playerId, roll: -1 };
    }
    if (Object.keys(seeded).length > 0) {
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
    const onTouchdown = () => {
      refresh((value) => value + 1);
    };
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

  useEffect(() => {
    if (!visible || !tracker?.progressionEnabled || tracker.applied) return;
    const online = getActiveOnlineMatch();
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
      statsSummary.players.every(
        (stats) => !(stats.teamId === team.id && stats.mvps > 0)
      )
  );
  const recordingPending = !!fixtureContext && !competitionRecorded;
  const busy = recordingPending || savingTeams;
  const canExit = (!progressionEnabled || confirmed) && !busy;

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
    const friendly = !state.competition;
    const managed = savedTeams(teams).filter((team) =>
      careerCounts(team, !friendly || progressionEnabled)
    );
    if (!developmentRecorded.current) {
      const match = {
        key: matchKey(container, teamIds, fixtureContext),
        friendly,
        raisedDead: gameState?.raisedDead,
        leagueFixture: !!gameState?.paysWinnings,
      };
      for (const team of managed) {
        recordTeamDevelopment(
          team,
          match,
          new Set(tracker.getEligibleMvpPlayers(team.id))
        );
      }
      developmentRecorded.current = true;
    }
    for (const team of managed) await saveTeam(team);
  };

  const playedGameEntries = (): Map<string, PlayedGame> => {
    if (playedGames.current) return playedGames.current;
    const entries = new Map<string, PlayedGame>();
    if (tracker && teams.length >= 2) {
      const stats = tracker.summary().players;
      const id = matchKey(container, teamIds, fixtureContext);
      const kind = getActiveOnlineMatch()?.kind ?? "local";
      for (const team of savedTeams(teams)) {
        const opponent = teams.find((other) => other.id !== team.id);
        if (!opponent) continue;
        entries.set(
          team.id,
          playedGameFor(
            team,
            opponent,
            {
              score: state.score,
              ...(state.result !== undefined && { result: state.result }),
            },
            stats,
            {
              id,
              playedAt: Date.now(),
              kind,
              ...(fixtureContext && { fixture: id }),
            }
          )
        );
      }
    }
    playedGames.current = entries;
    return entries;
  };

  const notePlayedGames = () => {
    for (const team of savedTeams(teams)) {
      const game = playedGameEntries().get(team.id);
      if (!game) continue;
      const played = withPlayedGame(team, game).playedGames;
      if (played) team.playedGames = played;
      else delete team.playedGames;
    }
  };

  const recordPlayedGames = () => {
    notePlayedGames();
    for (const team of savedTeams(teams)) {
      const stored = getTeamById(team.id);
      const game = playedGameEntries().get(team.id);
      if (!stored || !game) continue;
      const updated = withPlayedGame(stored, game);
      if (updated !== stored)
        void saveTeam(updated).catch((cause) => {
          console.warn("[MatchResults] played game not saved:", cause);
        });
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
    for (const team of next) {
      params.append("nextTeam", team.id);
    }
    for (const team of managed) {
      const gold = winnings?.gold[team.id];
      if (gold !== undefined) params.set(`winnings-${team.id}`, String(gold));
    }
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
      notePlayedGames();
      await recordDevelopment();
      recordPlayedGames();
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
    recordPlayedGames();
    if (managePostMatchTeam()) {
      return;
    }

    finishWithMatch();
    navigate(leaveTo);
  };

  return (
    <div className="hud-scroll absolute inset-0 z-[250] overflow-auto bg-hud-ink/95 p-6 font-hud-body text-hud-bone pointer-events-auto backdrop-blur-sm">
      <Panel
        accent="blood"
        data-testid="match-results"
        className="mx-auto max-w-6xl p-6 animate-hud-pop"
      >
        <ResultHeader
          teams={teams}
          score={state.score}
          {...(result === undefined ? {} : { result: result })}
          competitionRecorded={competitionRecorded}
          winnings={winnings}
        />

        <StatsTables
          teams={teams}
          summary={statsSummary}
          showSpp={progressionEnabled}
        />
        {progressionEnabled ? confirmed ? (
          <p className="mt-6 rounded-hud border border-white/10 bg-black/30 p-4 text-hud-lg">
            MVP and SPP are confirmed. Any player now eligible to advance is
            saved as pending development — finish it any time from{" "}
            <strong>Manage Team</strong>.
          </p>
        ) : (
          <>
            <div className="mt-6 grid gap-5 md:grid-cols-2">
              {mvpTeams.map((team) => (
                <MvpAwardCard
                  key={team.id}
                  team={team}
                  eligibleIds={tracker.getEligibleMvpPlayers(team.id)}
                  nominees={nomineesFor(team)}
                  mvpResult={mvpResults[team.id]}
                  touchdownRecipient={touchdownRecipients[team.id]}
                  onToggleNominee={(playerId) => {
                    toggleNominee(team, playerId);
                  }}
                  onRollMvp={() => void rollMvp(team)}
                  onChooseTouchdownRecipient={(playerId) => {
                    setTouchdownRecipients((previous) => ({
                      ...previous,
                      [team.id]: playerId,
                    }));
                  }}
                  onAssignTouchdown={() => void assignAwardedTouchdown(team)}
                />
              ))}
            </div>
            <button
              onClick={() => void confirmSpp()}
              disabled={pendingMvpTeams.length > 0 || busy}
              className={`${hudButtonClass("primary", "lg")} mt-5`}
            >
              Confirm and assign SPP
            </button>
          </>
        ) : (
          <p className="mt-3 text-hud-sm italic text-hud-dim">
            This match does not award SPP or MVP recognition.
          </p>
        )}

        <LeaveControls
          canExit={canExit}
          savingTeams={savingTeams}
          error={error}
          confirmed={confirmed}
          paysWinnings={!!state.paysWinnings}
          leaveTo={leaveTo}
          recordingPending={recordingPending}
          recordingError={recordingError}
          onLeave={leave}
          onRetryRecording={() => {
            setRecordingAttempt((attempt) => attempt + 1);
          }}
        />
      </Panel>
    </div>
  );
}
