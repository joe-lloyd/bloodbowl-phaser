import { type Team } from "../../../types/Team";
import { type GameState, type MatchResult } from "../../../types/GameState";
import { type MatchStatsSummary } from "../../../game/progression/MatchStats";
import { earnsWinnings } from "../../../game/rules/winnings";
import { hudButtonClass } from "../componentWarehouse/HudKit";
import { injuryLabel, playerLabel } from "./turnSummary";

export interface MatchWinnings {
  gold: Record<string, number>;
  fanFactors: Record<string, number>;
}

function endedEarlyLabel(teams: Team[], result: MatchResult): string {
  const conceding = teams.find((team) => team.id === result.concedingTeamId);
  const verb = result.reason === "concession" ? "conceded" : "forfeited";
  return conceding ? `${conceding.name} ${verb}` : `Match ${verb}`;
}

function penaltiesLabel(
  a: Team,
  b: Team,
  penalties: Record<string, number>
): string {
  const [wonA, wonB] = [penalties[a.id] ?? 0, penalties[b.id] ?? 0];
  return `${wonA > wonB ? a.name : b.name} win on Penalties, ${String(Math.max(wonA, wonB))}–${String(Math.min(wonA, wonB))}`;
}

function outcomeLabel(
  teams: Team[],
  score: Record<string, number>,
  result?: MatchResult
): string {
  if (result?.reason === "concession" || result?.reason === "forfeit") {
    return endedEarlyLabel(teams, result);
  }
  const [a, b] = teams;
  if (!a || !b) return "";
  const scoreA = score[a.id] ?? 0;
  const scoreB = score[b.id] ?? 0;
  if (scoreA !== scoreB) return `${scoreA > scoreB ? a.name : b.name} win`;
  return result?.penalties ? penaltiesLabel(a, b, result.penalties) : "Draw";
}

export function ResultHeader({
  teams,
  score,
  result,
  competitionRecorded,
  winnings,
}: {
  teams: Team[];
  score: GameState["score"];
  result?: MatchResult;
  competitionRecorded: boolean;
  winnings: MatchWinnings | null;
}) {
  return (
    <>
      <h1 className="font-hud-display text-hud-4xl uppercase tracking-[0.03em] text-hud-bone">
        Full Time
      </h1>
      <ResultScoreline teams={teams} score={score} />
      <p className="mt-3 font-hud-label text-hud-xl font-bold uppercase tracking-[0.06em] text-hud-gold">
        {outcomeLabel(teams, score, result)}
      </p>
      {competitionRecorded && (
        <p className="mt-2 text-hud-sm text-hud-good">
          ✓ Competition fixture result recorded.
        </p>
      )}
      {winnings && <WinningsPanel teams={teams} winnings={winnings} />}
    </>
  );
}

function WinningsPanel({
  teams,
  winnings,
}: {
  teams: Team[];
  winnings: MatchWinnings;
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
              `${team.name} Fan Factor ${String(winnings.fanFactors[team.id] ?? 0)}`
          )
          .join(", ")}
        ). Each team earns half the Fan Attendance plus its own touchdowns, plus
        1 if none of its players was Stalling, times 10,000 gp.
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

export function StatsTables({
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

interface LeaveProps {
  canExit: boolean;
  savingTeams: boolean;
  error: string;
  confirmed: boolean;
  paysWinnings: boolean;
  leaveTo: string;
  recordingPending: boolean;
  recordingError: string;
  onLeave: () => void;
  onRetryRecording: () => void;
}

function leaveLabel({
  savingTeams,
  error,
  confirmed,
  paysWinnings,
  leaveTo,
}: LeaveProps): string {
  if (savingTeams) return "Saving team...";
  if (error && confirmed) return "Retry saving team";
  if (paysWinnings) return "Manage team";
  return leaveTo === "/" ? "Continue to Main Menu" : "Back to the competition";
}

export function LeaveControls(props: LeaveProps) {
  const {
    canExit,
    error,
    recordingPending,
    recordingError,
    onLeave,
    onRetryRecording,
  } = props;
  return (
    <>
      <button
        onClick={onLeave}
        disabled={!canExit}
        title={
          canExit
            ? undefined
            : "Confirm MVP nomination and SPP for both teams before leaving"
        }
        className={`${hudButtonClass("primary", "lg")} mt-6`}
      >
        {leaveLabel(props)}
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
            onClick={onRetryRecording}
          >
            Retry saving result
          </button>
        </div>
      )}

      {error && <p className="mt-4 text-hud-bad-soft">{error}</p>}
    </>
  );
}

function ResultScoreline({
  teams,
  score,
}: {
  teams: Team[];
  score: GameState["score"];
}) {
  const [a, b] = teams;
  if (!a || !b) return null;
  return (
    <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-y border-hud-gold/30 bg-black/40 px-5 py-4">
      <span className="truncate font-hud-label text-hud-2xl font-bold uppercase tracking-[0.03em]">
        {a.name}
      </span>
      <span className="-skew-x-12 bg-hud-blood px-5 py-1 font-hud-display text-hud-3xl text-white">
        <span className="block skew-x-12">
          {score[a.id] ?? 0} : {score[b.id] ?? 0}
        </span>
      </span>
      <span className="truncate text-right font-hud-label text-hud-2xl font-bold uppercase tracking-[0.03em]">
        {b.name}
      </span>
    </div>
  );
}
