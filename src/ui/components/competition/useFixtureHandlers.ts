import { useNavigate } from "react-router-dom";
import type { Invite, LobbyInvite } from "../../../boundary/social";
import {
  currentRound,
  simulatableFixtures,
} from "../../../competition/simulateFixture";
import type {
  CompetitionDoc,
  CompetitionFixture,
} from "../../../competition/types";
import { acceptLobbyInvite } from "../../../firebase/invites";
import { errorText } from "../../errorText";
import { useInvites } from "../../hooks/useSocial";
import type { FixtureHandlers } from "./FixtureButtons";
import { useFixtureLaunch } from "./useFixtureLaunch";
import { useSimulation } from "./useSimulation";

function fixtureInviteFor(
  invites: readonly Invite[],
  competition: CompetitionDoc,
  fixture: CompetitionFixture
): LobbyInvite | undefined {
  return invites.find(
    (invite): invite is Extract<Invite, { kind: "fixture" }> =>
      invite.kind === "fixture" &&
      invite.competitionId === competition.id &&
      invite.fixtureId === fixture.id
  );
}

function mayReportFor(competition: CompetitionDoc, uid: string | undefined) {
  return (fixture: CompetitionFixture) =>
    !competition.organizerUid ||
    competition.organizerUid === uid ||
    competition.entrants.some(
      (entrant) =>
        !!uid &&
        entrant.ownerUid === uid &&
        [fixture.homeEntrantId, fixture.awayEntrantId].includes(entrant.id)
    );
}

interface HandlerInputs {
  competition: CompetitionDoc;
  uid: string | undefined;
  organizer: boolean;
  invites: readonly Invite[];
  roundToSimulate: number | undefined;
  busy: boolean;
  launch: ReturnType<typeof useFixtureLaunch>;
  simulate: ReturnType<typeof useSimulation>["simulate"];
  onJoined: (code: string) => void;
  setCompetition: (competition: CompetitionDoc) => void;
  setError: (error: string | null) => void;
}

function buildHandlers(inputs: HandlerInputs): FixtureHandlers {
  const { competition, uid, organizer, launch, setError } = inputs;
  return {
    busy: inputs.busy,
    uid,
    organizer,
    mayReport: mayReportFor(competition, uid),
    maySimulate: (fixture) => organizer && fixture.round === inputs.roundToSimulate,
    joinInvite: (fixture) => fixtureInviteFor(inputs.invites, competition, fixture),
    onJoin: (invite) => {
      acceptLobbyInvite(invite)
        .then(inputs.onJoined)
        .catch((reason: unknown) => {
          setError(errorText(reason));
        });
    },
    onSimulate: (fixture) => {
      void inputs.simulate(competition, (latest) =>
        simulatableFixtures(latest).find((candidate) => candidate.id === fixture.id)
      );
    },
    onLocal: (fixture) => void launch.launchLocal(fixture),
    onHost: (fixture) => void launch.launchHosted(fixture),
    onComputer: (fixture, humanEntrantId) => void launch.launchComputer(fixture, humanEntrantId),
    onRecorded: inputs.setCompetition,
    onError: setError,
  };
}

export function useFixtureHandlers({
  competition,
  setCompetition,
  setError,
  uid,
}: {
  competition: CompetitionDoc;
  setCompetition: (competition: CompetitionDoc) => void;
  setError: (error: string | null) => void;
  uid: string | undefined;
}) {
  const navigate = useNavigate();
  const organizer = !competition.organizerUid || competition.organizerUid === uid;
  const launch = useFixtureLaunch({ competition, uid, onError: setError });
  const simulation = useSimulation({
    competition,
    setCompetition,
    onError: setError,
    auto:
      organizer &&
      competition.status === "active" &&
      competition.online?.computerGames === "simulate",
  });
  const invites = useInvites(uid ?? null).map((row) => row.invite);
  const roundToSimulate = currentRound(competition);

  const handlers = buildHandlers({
    competition,
    uid,
    organizer,
    invites,
    roundToSimulate,
    busy: launch.launching || simulation.simulating !== null,
    launch,
    simulate: simulation.simulate,
    onJoined: (code) => void navigate(`/online/lobby/${code}`),
    setCompetition,
    setError,
  });

  const simulateRound = () => {
    void simulation.simulate(competition, (latest) =>
      simulatableFixtures(latest).find((fixture) => fixture.round === roundToSimulate)
    );
  };

  return {
    handlers,
    simulation,
    roundToSimulate:
      organizer &&
      simulatableFixtures(competition).some((fixture) => fixture.round === roundToSimulate)
        ? roundToSimulate
        : undefined,
    simulateRound,
  };
}
