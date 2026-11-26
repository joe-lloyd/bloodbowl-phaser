import { useCallback, useEffect, useRef, useState } from "react";
import { openRound } from "../../../competition/schedule";
import {
  type SimulatedFixture,
  simulatableFixtures,
  simulateFixture,
} from "../../../competition/simulateFixture";
import { refreshEntrantDisplays } from "../../../competition/teamRefs";
import type {
  CompetitionDoc,
  CompetitionFixture,
} from "../../../competition/types";
import { errorText } from "../../errorText";
import { injuryLabel, playerLabel } from "../hud/turnSummary";

export interface SimulatedResult {
  fixtureId: string;
  round: number;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  penalties?: { home: number; away: number };

  casualties: string[];
}

type NextFixture = (latest: CompetitionDoc) => CompetitionFixture | undefined;

function entrantName(competition: CompetitionDoc, entrantId: string | null) {
  return (
    competition.entrants.find((candidate) => candidate.id === entrantId)
      ?.name ?? "TBD"
  );
}

function simulatedRow(
  before: CompetitionDoc,
  outcome: SimulatedFixture
): SimulatedResult {
  const { fixture } = outcome;
  const result = fixture.result;
  return {
    fixtureId: fixture.id,
    round: fixture.round,
    home: entrantName(before, fixture.homeEntrantId),
    away: entrantName(before, fixture.awayEntrantId),
    homeScore: result?.homeScore ?? 0,
    awayScore: result?.awayScore ?? 0,
    ...(result?.penalties && { penalties: result.penalties }),
    casualties: outcome.casualties.map(
      ({ team, player }) =>
        `${playerLabel(player)} (${team.name}): ${injuryLabel(player) ?? "Casualty"}`
    ),
  };
}

function inOpenRound(latest: CompetitionDoc): CompetitionFixture | undefined {
  const round = openRound(latest)?.round;
  return simulatableFixtures(latest).find((fixture) => fixture.round === round);
}

export function useSimulation({
  competition,
  setCompetition,
  onError,
  auto,
}: {
  competition: CompetitionDoc;
  setCompetition: (competition: CompetitionDoc) => void;
  onError: (error: string | null) => void;
  auto: boolean;
}) {
  const [simulating, setSimulating] = useState<string | null>(null);
  const [simulated, setSimulated] = useState<SimulatedResult[]>([]);
  const running = useRef(false);
  const onPage = useRef(true);

  useEffect(() => {
    onPage.current = true;
    return () => {
      onPage.current = false;
    };
  }, []);

  const simulate = useCallback(
    async (start: CompetitionDoc, next: NextFixture) => {
      if (running.current) return;
      running.current = true;
      let latest = start;
      onError(null);
      try {
        for (let fixture = next(latest); fixture; fixture = next(latest)) {
          setSimulating(
            `${entrantName(latest, fixture.homeEntrantId)} v ${entrantName(latest, fixture.awayEntrantId)}`
          );
          await new Promise((resolve) => setTimeout(resolve, 0));
          if (!onPage.current) break;
          const outcome = await simulateFixture(latest, fixture.id);
          const row = simulatedRow(latest, outcome);
          latest = refreshEntrantDisplays(outcome.competition);
          setCompetition(latest);
          setSimulated((shown) => [row, ...shown.filter((earlier) => earlier.fixtureId !== row.fixtureId)]);
        }
      } catch (reason) {
        onError(errorText(reason));
      } finally {
        running.current = false;
        setSimulating(null);
      }
    },
    [onError, setCompetition]
  );

  useEffect(() => {
    if (!auto || !inOpenRound(competition)) return;
    const id = setTimeout(() => {
      void simulate(competition, inOpenRound);
    }, 0);
    return () => {
      clearTimeout(id);
    };
  }, [auto, competition, simulate]);

  return { simulating, simulated, simulate };
}
