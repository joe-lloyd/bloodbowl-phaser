import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  type HomeLeague,
  type SeasonRecord,
  type Team,
  hasBlockingPendingDevelopment,
} from "../../../types/Team";
import {
  finishSeason,
  homeLeagueOf,
  SEASON_GAME_TYPES,
  seasonPhase,
  startSeason,
} from "../../../competition/homeLeague";
import type { LeagueDoc } from "../../../competition/types";
import { SEASON_RIVALS } from "../../../game/rules/homeLeague";
import { getTeamById } from "../../../game/managers/TeamManager";
import {
  GAME_TYPE_LABELS,
  type GameType,
} from "../../../game/variants/gameTypes";
import type { Difficulty } from "../../../simulation/ai/difficulty";
import { useTeamLibrary } from "../../hooks/useTeamLibrary";
import { useAuth } from "../../hooks/useAuth";
import { errorText } from "../../errorText";
import { useCompetitionDoc } from "../competition/useCompetitionDoc";
import { StandingsTable } from "../competition/StandingsTable";
import { DifficultyPicker } from "../competition/DifficultyPicker";
import {
  EmptyState,
  HudButton,
  Notice,
  PageHeader,
  PageShell,
  Section,
} from "../componentWarehouse/HudKit";

function placing(position: number): string {
  const teen = position % 100 >= 11 && position % 100 <= 13;
  const suffix = teen ? "th" : (["th", "st", "nd", "rd"][position % 10] ?? "th");
  return `${String(position)}${suffix}`;
}

function newcomerText(newcomers: number): string {
  if (newcomers === SEASON_RIVALS)
    return "Seven new computer clubs join when the season starts.";
  const clubs = newcomers === 1 ? "club joins" : "clubs join";
  return `${String(newcomers)} new computer ${clubs} when the season starts.`;
}

function Rivals({ league }: { league: HomeLeague }) {
  const known = league.rivalIds.flatMap((id) => getTeamById(id) ?? []);
  const newcomers = SEASON_RIVALS - known.length;
  return (
    <Section title={`Rivals in season ${String(league.season)}`}>
      <ul className="flex flex-col gap-1 font-hud-body text-hud-base text-hud-bone">
        {known.map((rival) => (
          <li key={rival.id}>
            {rival.name}{" "}
            <span className="text-hud-dim">· {rival.rosterName}</span>
          </li>
        ))}
      </ul>
      {newcomers > 0 && (
        <p className="mt-2 font-hud-body text-hud-sm text-hud-dim">
          {newcomerText(newcomers)}
        </p>
      )}
    </Section>
  );
}

function GameTypeChoice({
  value,
  onChange,
}: {
  value: GameType;
  onChange: (gameType: GameType) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Game type">
      {SEASON_GAME_TYPES.map((gameType) => (
        <HudButton
          key={gameType}
          role="radio"
          aria-checked={gameType === value}
          variant={gameType === value ? "selected" : "secondary"}
          onClick={() => {
            onChange(gameType);
          }}
        >
          {GAME_TYPE_LABELS[gameType]}
        </HudButton>
      ))}
    </div>
  );
}

function PostGameSteps({ club }: { club: Team }) {
  const navigate = useNavigate();
  if (!hasBlockingPendingDevelopment(club)) return null;
  return (
    <Notice tone="warn" title="Post-game steps are waiting" className="mb-4">
      <p>
        Finish {club.name}&apos;s post-game steps on its team sheet, such as
        advancements and Expensive Mistakes, before the next season starts.
      </p>
      <HudButton
        size="sm"
        className="mt-3"
        onClick={() => void navigate(`/clubs/${club.id}`)}
      >
        Open the team sheet
      </HudButton>
    </Notice>
  );
}

function StartSeason({ club, onStarted }: { club: Team; onStarted: () => void }) {
  const { user } = useAuth();
  const league = homeLeagueOf(club);
  const [gameType, setGameType] = useState<GameType>("sevens");
  const [difficulty, setDifficulty] = useState<Difficulty>("standard");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const start = async () => {
    setBusy(true);
    try {
      await startSeason(club.id, {
        gameType,
        difficulty,
        organizerUid: user?.uid ?? null,
      });
      onStarted();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title={`Start season ${String(league.season)}`}>
      <p className="mb-3 font-hud-body text-hud-sm text-hud-dim">
        Every club plays every other club once. Pick the game type the season
        is played in.
      </p>
      <PostGameSteps club={club} />
      <GameTypeChoice value={gameType} onChange={setGameType} />
      <DifficultyPicker value={difficulty} onChange={setDifficulty} />
      {error && (
        <Notice tone="bad" role="alert" className="mt-4">
          {error}
        </Notice>
      )}
      <HudButton
        variant="primary"
        className="mt-5"
        disabled={busy || hasBlockingPendingDevelopment(club)}
        onClick={() => void start()}
      >
        Start season {league.season}
      </HudButton>
    </Section>
  );
}

function SeasonUnderWay({
  competition,
  onOpen,
}: {
  competition: LeagueDoc;
  onOpen: () => void;
}) {
  return (
    <>
      <Notice tone="gold" title="Season under way" className="mb-4">
        Play your fixtures and simulate the computer games from the league
        page. Come back here when the last game is done.
      </Notice>
      <HudButton variant="primary" className="mb-4" onClick={onOpen}>
        Open the league
      </HudButton>
      <StandingsTable competition={competition} />
    </>
  );
}

function SeasonOver({
  club,
  competition,
  onFinished,
}: {
  club: Team;
  competition: LeagueDoc;
  onFinished: (record: SeasonRecord) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const finish = async () => {
    setBusy(true);
    try {
      onFinished(await finishSeason(club.id));
    } catch (cause) {
      setError(errorText(cause));
      setBusy(false);
    }
  };
  return (
    <>
      <Notice tone="gold" title="The last game is played" className="mb-4">
        Finish the season to record where {club.name} ended and to see who
        comes back next season.
      </Notice>
      {error && (
        <Notice tone="bad" role="alert" className="mb-4">
          {error}
        </Notice>
      )}
      <HudButton
        variant="primary"
        className="mb-4"
        disabled={busy}
        onClick={() => void finish()}
      >
        Finish season
      </HudButton>
      <StandingsTable competition={competition} />
    </>
  );
}

function History({ history }: { history: SeasonRecord[] }) {
  if (history.length === 0) return null;
  return (
    <Section title="Past seasons" bodyClassName="overflow-x-auto p-0">
      <table className="hud-table">
        <thead>
          <tr>
            <th>Season</th>
            <th>Game type</th>
            <th>Finish</th>
            <th>W-D-L</th>
            <th>Champion</th>
          </tr>
        </thead>
        <tbody>
          {[...history].reverse().map((record) => (
            <tr key={record.season} data-testid={`season-${String(record.season)}`}>
              <td>{record.season}</td>
              <td>{GAME_TYPE_LABELS[record.gameType]}</td>
              <td>{placing(record.position)}</td>
              <td>
                {record.wins}-{record.draws}-{record.losses}
              </td>
              <td>{record.champion}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function FinishedNotice({ record }: { record: SeasonRecord | null }) {
  if (!record) return null;
  return (
    <Notice tone="good" role="status" className="mb-4">
      Season {record.season} is in the books: {placing(record.position)} of{" "}
      {SEASON_RIVALS + 1}, {record.wins}-{record.draws}-{record.losses}.{" "}
      {record.champion} took the title.
    </Notice>
  );
}

function SeasonBody({ club, reload }: { club: Team; reload: () => void }) {
  const navigate = useNavigate();
  const league = homeLeagueOf(club);
  const { competition } = useCompetitionDoc("league", league.leagueId);
  const [finished, setFinished] = useState<SeasonRecord | null>(null);
  const current = competition?.type === "league" ? competition : null;
  const phase = seasonPhase(league, current);
  return (
    <PageShell width="wide">
      <PageHeader
        back={{
          label: "Back to the club",
          onClick: () => void navigate(`/clubs/${club.id}`),
        }}
        eyebrow={club.name}
        title={`Season ${String(league.season)}`}
        subtitle="Your club and seven computer clubs play one league season at a time. Some rivals return each season, some rest, and new clubs join."
      />
      <FinishedNotice record={finished} />
      {phase === "ready" && (
        <>
          <Rivals league={league} />
          <StartSeason club={club} onStarted={reload} />
        </>
      )}
      {phase === "playing" && current && (
        <SeasonUnderWay
          competition={current}
          onOpen={() => void navigate(`/leagues/${current.id}`)}
        />
      )}
      {phase === "finished" && current && (
        <SeasonOver
          club={club}
          competition={current}
          onFinished={(record) => {
            setFinished(record);
            reload();
          }}
        />
      )}
      <History history={league.history} />
    </PageShell>
  );
}

export function SeasonPage() {
  const navigate = useNavigate();
  const { teamId } = useParams();
  const [library, reload] = useTeamLibrary();
  const club = library.find((candidate) => candidate.id === teamId);
  if (!club?.club)
    return (
      <PageShell width="medium">
        <EmptyState
          title="This club could not be found."
          action={
            <HudButton onClick={() => void navigate("/clubs")}>
              Back to Clubs
            </HudButton>
          }
        />
      </PageShell>
    );
  return <SeasonBody club={club} reload={reload} />;
}
