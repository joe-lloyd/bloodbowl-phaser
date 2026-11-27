import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  type HomeLeague,
  type PlayOffFinish,
  type SeasonRecord,
  type Team,
  hasBlockingPendingDevelopment,
} from "../../../types/Team";
import {
  homeLeagueOf,
  SEASON_GAME_TYPES,
  type SeasonPhase,
  seasonPhase,
  startSeason,
} from "../../../competition/homeLeague";
import {
  finishSeason,
  PLAY_OFF_CLUBS,
  PLAY_OFF_PRIZES,
  startPlayOffs,
} from "../../../competition/seasonEnd";
import { thousands } from "../../../game/rules/club";
import type { CompetitionDoc, LeagueDoc } from "../../../competition/types";
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
import { PostGameSteps } from "./PostGameSteps";
import { RedraftStep } from "./RedraftStep";
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

function ActionStep({
  title,
  text,
  label,
  blocked = false,
  run,
}: {
  title: string;
  text: string;
  label: string;
  blocked?: boolean;
  run: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const act = async () => {
    setBusy(true);
    try {
      await run();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Notice tone="gold" title={title} className="mb-4">
        {text}
      </Notice>
      {error && (
        <Notice tone="bad" role="alert" className="mb-4">
          {error}
        </Notice>
      )}
      <HudButton
        variant="primary"
        className="mb-4"
        disabled={busy || blocked}
        onClick={() => void act()}
      >
        {label}
      </HudButton>
    </>
  );
}

function qualifies(club: Team, regular: LeagueDoc): boolean {
  const entrant = regular.entrants.find((each) => each.teamId === club.id);
  return regular.standings
    .slice(0, PLAY_OFF_CLUBS)
    .some((standing) => standing.entrantId === entrant?.id);
}

interface PhaseProps {
  club: Team;
  regular: LeagueDoc;
  playOffs: CompetitionDoc | null;
  onFinished: (record: SeasonRecord) => void;
  reload: () => void;
}

function PlayOffsDue({ club, regular, reload }: PhaseProps) {
  const { user } = useAuth();
  const waiting = qualifies(club, regular) && hasBlockingPendingDevelopment(club);
  return (
    <>
      <ActionStep
        title="The regular season is over"
        text={`The top four play semi-finals, a final and a third-place game, all with extra time and penalties. The champion wins ${thousands(PLAY_OFF_PRIZES.champion)} and holds the trophy re-roll for a season, the runner-up wins ${thousands(PLAY_OFF_PRIZES["runner-up"])} and third place ${thousands(PLAY_OFF_PRIZES.third)}.`}
        label="Start the play-offs"
        blocked={waiting}
        run={async () => {
          await startPlayOffs(club.id, user?.uid ?? null);
          reload();
        }}
      />
      {waiting && <PostGameSteps club={club} />}
    </>
  );
}

function SeasonPhaseView({ phase, ...props }: PhaseProps & { phase: SeasonPhase }) {
  const navigate = useNavigate();
  const { club, regular, playOffs, onFinished, reload } = props;
  switch (phase) {
    case "redraft":
    case "ready":
      return null;
    case "playing":
      return (
        <ActionStep
          title="Season under way"
          text="Play your fixtures and simulate the computer games from the league page. Come back here when the last game is done."
          label="Open the league"
          run={() => void navigate(`/leagues/${regular.id}`)}
        />
      );
    case "play-offs-due":
      return <PlayOffsDue {...props} />;
    case "play-offs":
      return (
        <ActionStep
          title="Play-offs under way"
          text="Play or simulate the semi-finals, the final and the third-place game from the play-offs page."
          label="Open the play-offs"
          run={() => void navigate(`/tournaments/${playOffs?.id ?? ""}`)}
        />
      );
    case "finished":
      return (
        <ActionStep
          title="The play-offs are over"
          text="Finish the season to pay the prizes, pass on the trophy and see who comes back next season."
          label="Finish season"
          run={async () => {
            onFinished(await finishSeason(club.id));
            reload();
          }}
        />
      );
  }
}

const PLAY_OFF_LABELS: Record<PlayOffFinish, string> = {
  champion: "Champion",
  "runner-up": "Runner-up",
  third: "Third",
  fourth: "Fourth",
};

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
            <th>Play-offs</th>
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
              <td>{record.playOff ? PLAY_OFF_LABELS[record.playOff] : "Out"}</td>
              <td>{record.champion}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function playOffText(finish: PlayOffFinish | undefined): string {
  if (!finish) return "out of the play-offs";
  return finish === "champion"
    ? "champion of the play-offs"
    : `${PLAY_OFF_LABELS[finish].toLowerCase()} in the play-offs`;
}

function FinishedNotice({ record }: { record: SeasonRecord | null }) {
  if (!record) return null;
  return (
    <Notice tone="good" role="status" className="mb-4">
      Season {record.season} is in the books: {placing(record.position)} of{" "}
      {SEASON_RIVALS + 1} in the table, {record.wins}-{record.draws}-
      {record.losses}, {playOffText(record.playOff)}. {record.champion} took the
      title.
    </Notice>
  );
}

function SeasonBody({ club, reload }: { club: Team; reload: () => void }) {
  const navigate = useNavigate();
  const league = homeLeagueOf(club);
  const regular = useCompetitionDoc("league", league.leagueId).competition;
  const playOffs = useCompetitionDoc("tournament", league.playOffsId).competition;
  const [finished, setFinished] = useState<SeasonRecord | null>(null);
  const current = regular?.type === "league" ? regular : null;
  const phase = seasonPhase(league, current, playOffs);
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
      {phase === "redraft" && <RedraftStep club={club} onDone={reload} />}
      {phase === "ready" && (
        <>
          <Rivals league={league} />
          <StartSeason club={club} onStarted={reload} />
        </>
      )}
      {phase !== "ready" && current && (
        <>
          <SeasonPhaseView
            phase={phase}
            club={club}
            regular={current}
            playOffs={playOffs}
            onFinished={setFinished}
            reload={reload}
          />
          <StandingsTable competition={current} />
        </>
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
