import { useId, useMemo, useState } from "react";
import { Title } from "../componentWarehouse/HudTitle";
import {
  roundFixtures,
  roundGameType,
  roundPlan,
} from "../../../competition/roundPlan";
import {
  type CompetitionDoc,
  type CompetitionEntrant,
  type CompetitionFixture,
} from "../../../competition/types";
import { type TeamColors } from "../../../types/Team";
import { loadTeams } from "../../../game/managers/TeamManager";
import { TeamCrest } from "../common/TeamCrest";
import { GameTypeName } from "../common/GameTypeBadge";
import { cx, Section } from "../componentWarehouse/HudKit";
import { coachLabel, PLAYED_VIA } from "../competition/labels";
import {
  type BracketFixtureContext,
  FixtureActions,
  walkoverLine,
} from "./TournamentBracket";

type Kits = (entrant?: CompetitionEntrant) => TeamColors | undefined;

function RoundGameType({
  fixtures,
  round,
  drawnLater = false,
}: {
  fixtures: readonly CompetitionFixture[];
  round: number;
  drawnLater?: boolean;
}) {
  const gameType = roundGameType(fixtures, round);
  if (gameType)
    return <GameTypeName gameType={gameType} className="hud-label text-hud-dim" />;
  return drawnLater ? (
    <span className="hud-label text-hud-mute">Game type drawn when the round comes up</span>
  ) : null;
}

interface LeagueRoundsProps {
  competition: CompetitionDoc;

  renderActions: (context: BracketFixtureContext) => React.ReactNode;

  renderCompactFixture: (fixture: CompetitionFixture) => React.ReactNode;

  nextRoundTools?: React.ReactNode;
}

export function LeagueRounds({
  competition,
  renderActions,
  renderCompactFixture,
  nextRoundTools,
}: LeagueRoundsProps) {
  const plan = roundPlan(competition.fixtures);
  const entrant = (entrantId: string | null) =>
    competition.entrants.find((candidate) => candidate.id === entrantId);

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
      {plan.next === undefined ? (
        nextRoundTools && <div className="mb-6">{nextRoundTools}</div>
      ) : (
        <NextRound
          round={plan.next}
          fixtures={roundFixtures(competition.fixtures, plan.next)}
          entrants={competition.entrants}
          entrant={entrant}
          kits={kits}
          renderActions={renderActions}
          tools={nextRoundTools}
        />
      )}

      {plan.upcoming.length > 0 && (
        <Section title="Upcoming rounds">
          <div className="grid lg:grid-cols-2 gap-6">
            {plan.upcoming.map((round) => (
              <div key={round}>
                <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Title level="row" as="h3">Round {round}</Title>
                  <RoundGameType
                    fixtures={competition.fixtures}
                    round={round}
                    drawnLater={competition.gameTypePool !== undefined}
                  />
                </div>
                <div className="space-y-3">
                  {roundFixtures(competition.fixtures, round).map(
                    (element) => renderCompactFixture(element)
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
              <CompletedRound
                key={round}
                round={round}
                gameType={<RoundGameType fixtures={competition.fixtures} round={round} />}
              >
                {roundFixtures(competition.fixtures, round).map(
                  (element) => renderCompactFixture(element)
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
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Title level="card" as="h3">
            Round {round}
          </Title>
          <RoundGameType fixtures={fixtures} round={round} />
        </span>
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
  home?: CompetitionEntrant | undefined;
  away?: CompetitionEntrant | undefined;
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
      <FixtureActions
        className="mt-4 border-t border-white/10 pt-4"
        context={{ fixture, home, away, ready }}
        renderActions={renderActions}
      />
    </article>
  );
}

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
          : `${String(result?.homeScore ?? "—")}–${String(result?.awayScore ?? "—")}`}
      </strong>
    </div>
  );
}

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
      {result?.playedVia && (
        <p className="mt-2 text-center text-hud-sm text-hud-mute">
          {PLAYED_VIA[result.playedVia]}
        </p>
      )}
    </>
  );
}

function FixtureSide({
  entrant,
  colors,
  label,
  away = false,
}: {
  entrant?: CompetitionEntrant | undefined;
  colors?: TeamColors | undefined;
  label: string;
  away?: boolean;
}) {
  const name = entrant?.name;
  return (
    <div
      className={cx(
        "flex min-w-0 flex-col items-center gap-2 text-center",
        away ? "sm:flex-row-reverse sm:text-right" : "sm:flex-row sm:text-left"
      )}
    >
      <TeamCrest
        {...(name === undefined ? {} : { name })}
        {...(colors === undefined ? {} : { colors })}
        size="lg"
      />
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
        {entrant && (
          <span className="block text-hud-sm text-hud-mute">
            {coachLabel(entrant)}
          </span>
        )}
      </div>
    </div>
  );
}

function CompletedRound({
  round,
  gameType,
  children,
}: {
  round: number;
  gameType: React.ReactNode;
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
          onClick={() => {
            setOpen((shown) => !shown);
          }}
          className="flex min-h-[44px] w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-gold"
        >
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Title level="row" as="span">Round {round}</Title>
            {gameType}
          </span>
          <span aria-hidden className="flex items-center gap-2 text-hud-dim">
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
        <div className="grid gap-3 border-t border-white/10 p-4 md:grid-cols-2">
          {children}
        </div>
      </div>
    </div>
  );
}
