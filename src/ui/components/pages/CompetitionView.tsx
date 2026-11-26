import { CompetitionRulesLine } from "../common/CompetitionRulesLine";
import { Title } from "../componentWarehouse/HudTitle";
import { useParams } from "react-router-dom";
import type {
  CompetitionDoc,
  CompetitionFixture,
  CompetitionType,
} from "../../../competition/types";
import { useAuth } from "../../hooks/useAuth";
import { useNow } from "../../hooks/useSocial";
import {
  type BracketFixtureContext,
  TournamentBracket,
} from "./TournamentBracket";
import {
  Chip,
  Notice,
  PageHeader,
  PageShell,
  Panel,
  Section,
} from "../componentWarehouse/HudKit";
import { LeagueRounds } from "./LeagueRounds";
import { LeagueTeamProgress } from "./LeagueTeamProgress";
import { useCompetitionDoc } from "../competition/useCompetitionDoc";
import { useFixtureHandlers } from "../competition/useFixtureHandlers";
import { FixtureButtons } from "../competition/FixtureButtons";
import { FixtureCard } from "../competition/FixtureCard";
import { EntrantsSection } from "../competition/EntrantsSection";
import { StandingsTable } from "../competition/StandingsTable";
import { RoundStatus } from "../competition/RoundStatus";
import { SignupPanel } from "../competition/SignupPanel";
import {
  SimulatedResults,
  SimulateRoundTools,
} from "../competition/SimulationPanels";

interface CompetitionProps {
  competition: CompetitionDoc;
  setCompetition: (competition: CompetitionDoc) => void;
  setError: (error: string | null) => void;
  uid: string | undefined;
}

const STATUS_LABEL: Record<CompetitionDoc["status"], string> = {
  draft: "sign-ups open",
  active: "active",
  complete: "complete",
};

function allCompetitionsLink(type: CompetitionType) {
  return {
    label: type === "league" ? "All leagues" : "All tournaments",
    to: type === "league" ? "/leagues" : "/tournaments",
  };
}

function ThirdPlaceGame({
  competition,
  renderCard,
}: {
  competition: CompetitionDoc;
  renderCard: (fixture: CompetitionFixture) => React.ReactNode;
}) {
  const fixture = competition.fixtures.find((candidate) => candidate.thirdPlace);
  if (!fixture) return null;
  return (
    <div className="mt-6">
      <h3 className="hud-label mb-2">Third-place game</h3>
      {renderCard(fixture)}
    </div>
  );
}

function isBracket(competition: CompetitionDoc): boolean {
  return (
    competition.type === "tournament" &&
    competition.format === "single-elimination"
  );
}

function RoundList({
  competition,
  renderCard,
}: {
  competition: CompetitionDoc;
  renderCard: (fixture: CompetitionFixture) => React.ReactNode;
}) {
  const rounds = [...new Set(competition.fixtures.map((fixture) => fixture.round))];
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {rounds.map((round) => (
        <div key={round}>
          <Title level="row" as="h3" className="mb-2">Round {round}</Title>
          <div className="space-y-3">
            {competition.fixtures
              .filter((fixture) => fixture.round === round)
              .map((element) => renderCard(element))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Season({ competition, setCompetition, setError, uid }: CompetitionProps) {
  const now = useNow(60_000);
  const fixtures = useFixtureHandlers({ competition, setCompetition, setError, uid });
  const renderActions = ({ fixture, home, away }: BracketFixtureContext) => (
    <FixtureButtons competition={competition} fixture={fixture} home={home} away={away} handlers={fixtures.handlers} />
  );
  const renderCard = (fixture: CompetitionFixture) => (
    <FixtureCard key={fixture.id} competition={competition} fixture={fixture} renderActions={renderActions} />
  );
  const simulateTools = (
    <SimulateRoundTools
      round={fixtures.roundToSimulate}
      simulating={fixtures.simulation.simulating}
      disabled={fixtures.handlers.busy}
      onSimulate={fixtures.simulateRound}
    />
  );
  const roundRobin = competition.type === "league" || competition.format === "round-robin";
  return (
    <>
      <RoundStatus competition={competition} now={now} />
      {competition.status === "active" && (
        <EntrantsSection
          competition={competition}
          organizer={!!uid && competition.organizerUid === uid}
          now={now}
          onChange={setCompetition}
          onError={setError}
        />
      )}
      {roundRobin && <StandingsTable competition={competition} />}
      {competition.type === "league" ? (
        <LeagueRounds competition={competition} renderActions={renderActions} renderCompactFixture={renderCard} nextRoundTools={simulateTools} />
      ) : (
        <Section title={isBracket(competition) ? "Bracket" : "Schedule"}>
          {simulateTools}
          {isBracket(competition) ? (
            <>
              <TournamentBracket
                fixtures={competition.fixtures.filter((fixture) => !fixture.thirdPlace)}
                entrants={competition.entrants}
                championEntrantId={competition.championEntrantId}
                renderActions={renderActions}
                fallback={<RoundList competition={competition} renderCard={renderCard} />}
              />
              <ThirdPlaceGame competition={competition} renderCard={renderCard} />
            </>
          ) : (
            <RoundList competition={competition} renderCard={renderCard} />
          )}
        </Section>
      )}
      <SimulatedResults results={fixtures.simulation.simulated} />
    </>
  );
}

function CompetitionPage(props: CompetitionProps & { error: string | null }) {
  const { competition, error } = props;
  const champion =
    competition.type === "tournament"
      ? competition.entrants.find((entrant) => entrant.id === competition.championEntrantId)
      : undefined;
  return (
    <PageShell width="wide">
      <PageHeader
        back={allCompetitionsLink(competition.type)}
        eyebrow={
          competition.type === "tournament"
            ? competition.format.replace("-", " ")
            : undefined
        }
        title={competition.name}
        actions={<Chip>{STATUS_LABEL[competition.status]}</Chip>}
      />
      <CompetitionRulesLine competition={competition} />
      {champion && (
        <Panel accent="gold" className="mb-6 px-5 py-4">
          <span className="font-hud-display text-hud-2xl uppercase tracking-[0.03em] text-hud-gold">
            Champion: {champion.name}
          </span>
        </Panel>
      )}
      <LeagueTeamProgress competition={competition} />
      {competition.status === "draft" && competition.online ? (
        <SignupPanel competition={competition} uid={props.uid ?? null} onChange={props.setCompetition} onError={props.setError} />
      ) : (
        <Season {...props} />
      )}
      {error && (
        <Notice tone="bad" role="alert">
          {error}
        </Notice>
      )}
    </PageShell>
  );
}

export function CompetitionView({ type }: { type: CompetitionType }) {
  const { id } = useParams();
  return <LoadedCompetition key={`${type}:${id ?? ""}`} type={type} id={id} />;
}

function LoadedCompetition({ type, id }: { type: CompetitionType; id: string | undefined }) {
  const { user } = useAuth();
  const { competition, setCompetition, error, setError } = useCompetitionDoc(type, id);

  if (!competition) {
    return (
      <PageShell width="wide">
        <PageHeader back={allCompetitionsLink(type)} title="Competition" />
        {error ? (
          <Notice tone="bad" role="alert">
            {error}
          </Notice>
        ) : (
          <p className="font-hud-body text-hud-lg text-hud-dim">Loading competition…</p>
        )}
      </PageShell>
    );
  }
  return (
    <CompetitionPage
      competition={competition}
      setCompetition={setCompetition}
      error={error}
      setError={setError}
      uid={user?.uid}
    />
  );
}
