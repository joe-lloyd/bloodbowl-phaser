import { useId, useMemo, useState } from "react";
import { roundFixtures, roundPlan } from "../../../competition/roundPlan";
import {
  CompetitionDoc,
  CompetitionEntrant,
  CompetitionFixture,
} from "../../../competition/types";
import { TeamColors } from "../../../types/Team";
import { loadTeams } from "../../../game/managers/TeamManager";
import { TeamCrest } from "../common/TeamCrest";
import { cx, Section } from "../componentWarehouse/HudKit";
import { BracketFixtureContext, walkoverLine } from "./TournamentBracket";

/** A team's kit colours, when this browser's library has the team. */
type Kits = (entrant?: CompetitionEntrant) => TeamColors | undefined;

interface LeagueRoundsProps {
  competition: CompetitionDoc;
  /** A fixture's match actions; the same ones the round list shows. */
  renderActions: (context: BracketFixtureContext) => React.ReactNode;
  /** A fixture in the compact card the schedule has always used. */
  renderCompactFixture: (fixture: CompetitionFixture) => React.ReactNode;
  /** Round-wide tools (Simulate round) shown with the next round. */
  nextRoundTools?: React.ReactNode;
}

/**
 * A league's schedule, ordered for the coach: the round to play next first
 * and in full, the rest of the season after it, and the rounds already
 * played folded away as history. Called with the page's render functions
 * rather than mounting them, so score inputs keep focus while typing.
 */
export function LeagueRounds({
  competition,
  renderActions,
  renderCompactFixture,
  nextRoundTools,
}: LeagueRoundsProps) {
  const plan = roundPlan(competition.fixtures);
  const entrant = (entrantId: string | null) =>
    competition.entrants.find((candidate) => candidate.id === entrantId);
  // The library is read once per entrant list, not once per crest: score
  // fields re-render the round on every keystroke.
  const { entrants } = competition;
  const kits = useMemo<Kits>(() => {
    const library = new Map(loadTeams().map((team) => [team.id, team.colors]));
    const byEntrant = new Map(
      entrants.map((candidate) => [candidate.id, library.get(candidate.teamId)])
    );
    return (candidate) => (candidate ? byEntrant.get(candidate.id) : undefined);
  }, [entrants]);

  return (
    <>
      {plan.next !== undefined ? (
        <NextRound
          round={plan.next}
          fixtures={roundFixtures(competition.fixtures, plan.next)}
          entrants={competition.entrants}
          entrant={entrant}
          kits={kits}
          renderActions={renderActions}
          tools={nextRoundTools}
        />
      ) : (
        nextRoundTools && <div className="mb-6">{nextRoundTools}</div>
      )}

      {plan.upcoming.length > 0 && (
        <Section title="Upcoming rounds">
          <div className="grid lg:grid-cols-2 gap-6">
            {plan.upcoming.map((round) => (
              <div key={round}>
                <h3 className="hud-label mb-2 text-hud-gold">Round {round}</h3>
                <div className="space-y-3">
                  {roundFixtures(competition.fixtures, round).map(
                    renderCompactFixture
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {plan.completed.length > 0 && (
        <Section title="Completed rounds">
          <div className="space-y-3">
            {plan.completed.map((round) => (
              <CompletedRound key={round} round={round}>
                {roundFixtures(competition.fixtures, round).map(
                  renderCompactFixture
                )}
              </CompletedRound>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

function NextRound({
  round,
  fixtures,
  entrants,
  entrant,
  kits,
  renderActions,
  tools,
}: {
  round: number;
  fixtures: CompetitionFixture[];
  entrants: CompetitionEntrant[];
  entrant: (entrantId: string | null) => CompetitionEntrant | undefined;
  kits: Kits;
  renderActions: (context: BracketFixtureContext) => React.ReactNode;
  tools?: React.ReactNode;
}) {
  const played = fixtures.filter(
    (fixture) => fixture.status === "complete"
  ).length;
  return (
    <Section title="Next round" accent="gold">
      <div
        data-testid="next-round"
        className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
      >
        <h3 className="font-hud-display text-hud-2xl uppercase tracking-[0.03em] text-hud-bone">
          Round {round}
        </h3>
        <span className="hud-label text-hud-dim">
          {played} of {fixtures.length}{" "}
          {fixtures.length === 1 ? "game" : "games"} played
        </span>
      </div>
      {tools}
      <div className="grid gap-4 lg:grid-cols-2">
        {fixtures.map((fixture) => (
          <FeaturedFixture
            key={fixture.id}
            fixture={fixture}
            home={entrant(fixture.homeEntrantId)}
            away={entrant(fixture.awayEntrantId)}
            entrants={entrants}
            kits={kits}
            renderActions={renderActions}
          />
        ))}
      </div>
    </Section>
  );
}

function FeaturedFixture({
  fixture,
  home,
  away,
  entrants,
  kits,
  renderActions,
}: {
  fixture: CompetitionFixture;
  home?: CompetitionEntrant;
  away?: CompetitionEntrant;
  entrants: CompetitionEntrant[];
  kits: Kits;
  renderActions: (context: BracketFixtureContext) => React.ReactNode;
}) {
  const ready = fixture.status === "ready" && Boolean(home && away);
  const played = fixture.status === "complete";
  const homeLabel = home?.name ?? "TBD";
  const awayLabel = away?.name ?? (fixture.result?.bye ? "BYE" : "TBD");
  return (
    <article
      data-testid="next-round-fixture"
      data-status={fixture.status}
      aria-label={`${homeLabel} v ${awayLabel}`}
      className={cx(
        "min-w-0 rounded-hud border p-4 font-hud-body text-hud-base text-hud-bone",
        played
          ? "border-white/10 bg-black/20"
          : "border-hud-gold/40 bg-black/40"
      )}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <FixtureSide entrant={home} colors={kits(home)} label={homeLabel} />
        <FixtureScore fixture={fixture} />
        <FixtureSide
          entrant={away}
          colors={kits(away)}
          label={awayLabel}
          away
        />
      </div>
      <ResultNotes fixture={fixture} entrants={entrants} />
      {ready && (
        <div className="mt-4 border-t border-white/10 pt-4">
          {renderActions({ fixture, home, away, ready })}
        </div>
      )}
    </article>
  );
}

/** The score once played ("—" for a walkover), "v" before. */
function FixtureScore({ fixture }: { fixture: CompetitionFixture }) {
  if (fixture.status !== "complete") {
    return <span className="hud-label text-center text-hud-dim">v</span>;
  }
  const result = fixture.result;
  return (
    <div className="text-center">
      <strong
        className={cx(
          "font-hud-display text-hud-2xl tabular-nums",
          result?.walkover ? "text-hud-mute" : "text-hud-gold"
        )}
      >
        {result?.walkover
          ? "—"
          : `${result?.homeScore ?? "—"}–${result?.awayScore ?? "—"}`}
      </strong>
      <span className="hud-label block text-hud-2xs text-hud-mute">Result</span>
    </div>
  );
}

/** A walkover's or a Penalty Shoot-out's line under the score. */
function ResultNotes({
  fixture: { result },
  entrants,
}: {
  fixture: CompetitionFixture;
  entrants: CompetitionEntrant[];
}) {
  return (
    <>
      {result?.walkover && (
        <p className="mt-2 text-center text-hud-sm text-hud-mute">
          {walkoverLine(entrants, result.walkover)}
        </p>
      )}
      {result?.penalties && (
        <p className="mt-2 text-center text-hud-sm text-hud-mute tabular-nums">
          Penalties {result.penalties.home}–{result.penalties.away}
        </p>
      )}
    </>
  );
}

/** One side of a featured fixture: crest and name, stacked on a phone. */
function FixtureSide({
  entrant,
  colors,
  label,
  away = false,
}: {
  entrant?: CompetitionEntrant;
  colors?: TeamColors;
  label: string;
  away?: boolean;
}) {
  return (
    <div
      className={cx(
        "flex min-w-0 flex-col items-center gap-2 text-center",
        away ? "sm:flex-row-reverse sm:text-right" : "sm:flex-row sm:text-left"
      )}
    >
      <TeamCrest name={entrant?.name} colors={colors} size="lg" />
      <div className="min-w-0">
        <span
          className={cx(
            "block break-words font-bold",
            !entrant && "italic text-hud-mute"
          )}
        >
          {label}
        </span>
        {entrant?.rosterName && (
          <span className="block text-hud-sm text-hud-dim">
            {entrant.rosterName}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * A played round, folded away until the coach opens it. A plain button
 * drives it, so Enter, Space and a tap all toggle it, and aria-expanded
 * says which way it is.
 */
function CompletedRound({
  round,
  children,
}: {
  round: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const toggleId = `${id}-toggle`;
  const panelId = `${id}-panel`;
  return (
    <div
      data-testid="completed-round"
      className="rounded-hud border border-white/10 bg-black/20"
    >
      <h3>
        <button
          type="button"
          id={toggleId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((shown) => !shown)}
          className="flex min-h-[44px] w-full items-center justify-between gap-3 px-4 py-3 text-left hud-label text-hud-gold hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-gold"
        >
          <span>Round {round}</span>
          <span aria-hidden className="flex items-center gap-2 text-hud-dim">
            {open ? "Hide results" : "Show results"}
            <svg
              viewBox="0 0 12 12"
              className={cx(
                "h-3 w-3 transition-transform",
                open && "rotate-90"
              )}
            >
              <path
                d="M4 2l4 4-4 4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
          </span>
        </button>
      </h3>
      <div id={panelId} role="region" aria-labelledby={toggleId} hidden={!open}>
        {/* The grid inside: a display utility on the region itself would
            override `hidden` and show a collapsed round. */}
        <div className="grid gap-3 border-t border-white/10 p-4 md:grid-cols-2">
          {children}
        </div>
      </div>
    </div>
  );
}
