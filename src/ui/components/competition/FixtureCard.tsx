import type {
  CompetitionDoc,
  CompetitionFixture,
} from "../../../competition/types";
import { cx } from "../componentWarehouse/HudKit";
import {
  type BracketFixtureContext,
  FixtureActions,
  walkoverLine,
} from "../pages/TournamentBracket";
import { coachLabel, PLAYED_VIA } from "./labels";

function Side({
  competition,
  entrantId,
  score,
  fallback,
}: {
  competition: CompetitionDoc;
  entrantId: string | null;
  score: number | string;
  fallback: string;
}) {
  const entrant = competition.entrants.find((candidate) => candidate.id === entrantId);
  return (
    <div className="flex justify-between gap-3">
      <span className={cx(!entrant && "italic text-hud-mute")}>
        {entrant?.name ?? fallback}
        {entrant && (
          <span className="ml-2 text-hud-sm text-hud-mute">{coachLabel(entrant)}</span>
        )}
      </span>
      <strong className="tabular-nums">{score}</strong>
    </div>
  );
}

function shownScore(fixture: CompetitionFixture, side: "homeScore" | "awayScore") {
  if (fixture.result?.walkover) return "—";
  return fixture.result?.[side] ?? "—";
}

function ResultNotes({
  competition,
  fixture: { result },
}: {
  competition: CompetitionDoc;
  fixture: CompetitionFixture;
}) {
  if (!result) return null;
  return (
    <>
      {result.walkover && (
        <p className="mt-1 text-hud-sm text-hud-mute">{walkoverLine(competition.entrants, result.walkover)}</p>
      )}
      {result.penalties && (
        <p className="mt-1 text-hud-sm tabular-nums text-hud-mute">
          Penalties {result.penalties.home}–{result.penalties.away}
        </p>
      )}
      {result.playedVia && (
        <p className="mt-1 text-hud-sm text-hud-mute">{PLAYED_VIA[result.playedVia]}</p>
      )}
    </>
  );
}

export function FixtureCard({
  competition,
  fixture,
  renderActions,
}: {
  competition: CompetitionDoc;
  fixture: CompetitionFixture;
  renderActions: (context: BracketFixtureContext) => React.ReactNode;
}) {
  const entrant = (id: string | null) =>
    competition.entrants.find((candidate) => candidate.id === id);
  const home = entrant(fixture.homeEntrantId);
  const away = entrant(fixture.awayEntrantId);
  const { result } = fixture;
  return (
    <article className="rounded-hud border border-white/10 bg-black/30 p-4 font-hud-body text-hud-base text-hud-bone">
      <Side competition={competition} entrantId={fixture.homeEntrantId} score={shownScore(fixture, "homeScore")} fallback="TBD" />
      <Side competition={competition} entrantId={fixture.awayEntrantId} score={shownScore(fixture, "awayScore")} fallback={result?.bye ? "BYE" : "TBD"} />
      <ResultNotes competition={competition} fixture={fixture} />
      <FixtureActions
        className="mt-3 border-t border-white/10 pt-3"
        context={{ fixture, home, away, ready: fixture.status === "ready" && Boolean(home && away) }}
        renderActions={renderActions}
      />
    </article>
  );
}
