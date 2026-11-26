import type { LobbyInvite } from "../../../boundary/social";
import { fixtureInOpenRound } from "../../../competition/schedule";
import type {
  CompetitionDoc,
  CompetitionEntrant,
  CompetitionFixture,
} from "../../../competition/types";
import { HudButton } from "../componentWarehouse/HudKit";
import { ReportResultForm } from "./ReportResultForm";

export interface FixtureHandlers {
  busy: boolean;
  uid: string | undefined;
  mayReport: (fixture: CompetitionFixture) => boolean;
  organizer: boolean;
  maySimulate: (fixture: CompetitionFixture) => boolean;
  joinInvite: (fixture: CompetitionFixture) => LobbyInvite | undefined;
  onJoin: (invite: LobbyInvite) => void;
  onSimulate: (fixture: CompetitionFixture) => void;
  onLocal: (fixture: CompetitionFixture) => void;
  onHost: (fixture: CompetitionFixture) => void;
  onComputer: (fixture: CompetitionFixture, humanEntrantId: string) => void;
  onRecorded: (competition: CompetitionDoc) => void;
  onError: (error: string | null) => void;
}

interface FixtureProps {
  competition: CompetitionDoc;
  fixture: CompetitionFixture;
  home: CompetitionEntrant;
  away: CompetitionEntrant;
  handlers: FixtureHandlers;
}

const isComputer = (entrant: CompetitionEntrant) => !!entrant.computerCoached;

function plays(competition: CompetitionDoc, entrant: CompetitionEntrant, uid: string | undefined) {
  return !competition.online || entrant.ownerUid === uid;
}

function ComputerGame({ competition, fixture, home, away, handlers }: FixtureProps) {
  const offerPlay =
    !competition.online ||
    (competition.online.computerGames === "play" && handlers.organizer);
  return (
    <div className="flex flex-wrap gap-2">
      {handlers.maySimulate(fixture) && (
        <HudButton variant="primary" size="sm" disabled={handlers.busy} onClick={() => { handlers.onSimulate(fixture); }}>
          Simulate
        </HudButton>
      )}
      {offerPlay &&
        [home, away].map((side) => (
          <HudButton key={side.id} size="sm" disabled={handlers.busy} onClick={() => { handlers.onComputer(fixture, side.id); }}>
            Play as {side.name}
          </HudButton>
        ))}
    </div>
  );
}

function ResultEntry({ competition, fixture, home, away, handlers }: FixtureProps) {
  return (
    <ReportResultForm
      competition={competition}
      fixture={fixture}
      home={home}
      away={away}
      onRecorded={handlers.onRecorded}
      onError={handlers.onError}
    />
  );
}

function ComputerOpponent(props: FixtureProps) {
  const { competition, fixture, home, away, handlers } = props;
  const human = isComputer(home) ? away : home;
  return (
    <>
      {plays(competition, human, handlers.uid) && (
        <HudButton variant="primary" size="sm" disabled={handlers.busy} onClick={() => { handlers.onComputer(fixture, human.id); }}>
          Play vs computer
        </HudButton>
      )}
      <ResultEntry {...props} />
    </>
  );
}

function HumanGame({ competition, fixture, home, away, handlers }: FixtureProps) {
  const invite = handlers.joinInvite(fixture);
  const playsIn = plays(competition, home, handlers.uid) || plays(competition, away, handlers.uid);
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {invite && (
          <HudButton variant="primary" size="sm" disabled={handlers.busy} onClick={() => { handlers.onJoin(invite); }}>
            Join match
          </HudButton>
        )}
        {playsIn && (
          <>
            <HudButton variant={invite ? "secondary" : "primary"} size="sm" disabled={handlers.busy} onClick={() => { handlers.onLocal(fixture); }}>
              Play local
            </HudButton>
            <HudButton size="sm" disabled={handlers.busy || !handlers.uid} onClick={() => { handlers.onHost(fixture); }}>
              Host online
            </HudButton>
          </>
        )}
      </div>
      <ResultEntry competition={competition} fixture={fixture} home={home} away={away} handlers={handlers} />
    </>
  );
}

function waitingForRound(competition: CompetitionDoc, fixture: CompetitionFixture) {
  return fixture.round > 1
    ? `Opens once every game in round ${String(fixture.round - 1)} is finished.`
    : `Opens when ${competition.name} starts.`;
}

export function FixtureButtons(props: Omit<FixtureProps, "home" | "away"> & {
  home: CompetitionEntrant | undefined;
  away: CompetitionEntrant | undefined;
}) {
  const { competition, fixture, home, away, handlers } = props;
  if (!home || !away || !handlers.mayReport(fixture)) return null;
  if (!fixtureInOpenRound(competition, fixture))
    return <p className="font-hud-body text-hud-sm text-hud-mute">{waitingForRound(competition, fixture)}</p>;
  const sides = { competition, fixture, home, away, handlers };
  if (isComputer(home) && isComputer(away)) return <ComputerGame {...sides} />;
  if (isComputer(home) || isComputer(away)) return <ComputerOpponent {...sides} />;
  return <HumanGame {...sides} />;
}
