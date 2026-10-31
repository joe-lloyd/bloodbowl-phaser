import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { calculateTeamValue, Team } from "../../../types/Team";
import { MatchResult } from "../../../types/GameState";
import { MatchStatsSummary } from "../../../game/progression/MatchStats";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { GameEventNames } from "../../../types/events";
import { clearMatchSave } from "../../../game/persistence/MatchSaveRepository";
import { saveTeam } from "../../../game/managers/TeamManager";
import { mustAdvance } from "../../../game/progression/progression";
import {
  createPendingSkillSelection,
  eligibleSkillSelectionPlayers,
} from "../../../game/progression/advancementModes";
import { stampFirstCompletedMatch } from "../../../game/rules/teamLifecycle";
import { foldMatchSummaryIntoCareers } from "../../../game/progression/careerStats";
import { hudButtonClass, Panel } from "../componentWarehouse/HudKit";
import { injuryLabel, playerLabel } from "./turnSummary";

interface Props {
  visible: boolean;
}

function ownedTeams(teams: Team[]): Team[] {
  const online = getActiveOnlineMatch();
  return online ? teams.filter((team) => team.id === online.myTeamId) : teams;
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
  if (scoreA === scoreB) return "Draw";
  return `${scoreA > scoreB ? a.name : b.name} win`;
}

export function MatchResultsScreen({ visible }: Props) {
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
  const [, refresh] = useState(0);
  const [error, setError] = useState("");

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
    const onCompetitionRecorded = () => setCompetitionRecorded(true);
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
  }, [container]);

  if (!visible || !container || !tracker) return null;

  const state = container.gameService.getState();
  const result = state.result;
  const own = ownedTeams(teams);
  const statsSummary = tracker.summary(teams.flatMap((team) => team.players));
  const pendingMvpTeams = teams.filter(
    (team) =>
      !statsSummary.players.some(
        (stats) => stats.teamId === team.id && stats.mvps > 0
      )
  );
  const canExit = !progressionEnabled || confirmed;

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

  /**
   * Records mode-specific pending development but does NOT resolve it here:
   * per team-advancement-modes, "the results screen SHALL NOT require
   * direct skill assignment" — Advanced League advancements and Sevens
   * Skill Selection awards are completed later from Manage Team.
   */
  const recordPendingDevelopment = (matchId: string) => {
    ownedTeams(teams).forEach((team) => {
      if (team.advancementMode === "sevens-skill-selection") {
        const eligible = eligibleSkillSelectionPlayers(team);
        if (eligible.length > 0) {
          createPendingSkillSelection(team, matchId, eligible);
        }
      } else if (
        !team.advancementMode ||
        team.advancementMode === "advanced-league"
      ) {
        team.players.filter(mustAdvance).forEach((player) => {
          team.pendingDevelopment ??= [];
          const already = team.pendingDevelopment.some(
            (entry) =>
              entry.kind === "advanced-league-advancement" &&
              entry.playerId === player.id
          );
          if (!already) {
            team.pendingDevelopment.push({
              id: `pending-${matchId}-${player.id}`,
              kind: "advanced-league-advancement",
              playerId: player.id,
              createdAt: Date.now(),
            });
          }
        });
      }
      team.teamValue = calculateTeamValue(team);
      // A confirmed post-match result is this team's completed match —
      // stamp it active (idempotent; see teamLifecycle.ts). Abandoning
      // before this point never reaches here, so it never activates.
      stampFirstCompletedMatch(team);
      saveTeam(team);
    });
  };

  const confirmSpp = () => {
    try {
      const concedingTeamId =
        result?.reason === "concession" ? result.concedingTeamId : undefined;
      const finalSummary = tracker.applySpp(teams, concedingTeamId);
      foldMatchSummaryIntoCareers(teams, finalSummary);
      recordPendingDevelopment(`match-${Date.now()}`);
      setConfirmed(true);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const leave = () => {
    if (!canExit) return;
    clearMatchSave();
    navigate("/");
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
              {own.map((team) => {
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
                            className={`min-h-[40px] rounded-hud border px-3 py-2 text-left font-hud-label text-[15px] font-bold transition-colors disabled:cursor-default ${
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
                        assign its 3 SPP here. Repeat for each awarded
                        touchdown.
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
              onClick={confirmSpp}
              disabled={pendingMvpTeams.length > 0}
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
          Continue to Main Menu
        </button>
        {!canExit && (
          <p className="mt-2 text-hud-sm italic text-hud-dim">
            Confirm MVP nomination and SPP for both teams before leaving.
          </p>
        )}

        {error && <p className="mt-4 text-hud-bad-soft">{error}</p>}
      </Panel>
    </div>
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
