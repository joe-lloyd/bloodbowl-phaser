import { fixtureValue } from "../fixtureValue";
import { GamePhase, SubPhase } from "../../types/GameState";
import { type ScenarioSetup } from "../../types/Scenario";
import { GameEventNames } from "../../types/events";
import { type PlayerSnapshot } from "../../headless/serialization";
import {
  type ExpectedCheckpoint,
  type ExecutionLayer,
  type ObservedRun,
  type PlayerRef,
  type SemanticStep,
  type SquareRef,
  step,
} from "../scenarioCase/types";
import { parsePlayerRef } from "../../game/rules-lab/references";

export function playSetup(
  setup: Omit<ScenarioSetup, "phase" | "subPhase" | "activeTeam"> &
    Partial<Pick<ScenarioSetup, "activeTeam">>
): ScenarioSetup {
  return {
    activeTeam: "team1",
    ...setup,
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
  };
}

export function checkpointAssert(
  condition: boolean,
  message: string
): asserts condition {
  if (!condition) throw new Error(message);
}

export function playerIn(
  observed: ObservedRun,
  ref: PlayerRef
): PlayerSnapshot {
  const parsed = parsePlayerRef(ref);
  if (!parsed) throw new Error(`'${ref}' is not a player reference`);
  const team = observed.snapshot.teams[parsed.team === "team1" ? 0 : 1];
  const player = team?.players[parsed.index];
  if (!player) throw new Error(`no player for ref '${ref}' in the snapshot`);
  return player;
}

function sawEventNamed(observed: ObservedRun, name: string): boolean {
  return observed.events.some((event) => event.name === name);
}

export function endsAt(
  ref: PlayerRef,
  square: SquareRef,
  layers?: ExecutionLayer[]
): ExpectedCheckpoint {
  return {
    id: `${ref}-ends-at-${String(square.x)}-${String(square.y)}`,
    description: `${ref} finishes on (${String(square.x)},${String(square.y)})`,
    ...(layers && { layers }),
    assert(observed) {
      const player = playerIn(observed, ref);
      checkpointAssert(
        player.position?.x === square.x && player.position?.y === square.y,
        `${ref} should finish on (${String(square.x)},${String(square.y)}) but is at ` +
          (player.position
            ? `(${String(player.position.x)},${String(player.position.y)})`
            : "off-pitch")
      );
    },
  };
}

export function ballEndsAt(
  square: SquareRef,
  layers?: ExecutionLayer[]
): ExpectedCheckpoint {
  return {
    id: `ball-ends-at-${String(square.x)}-${String(square.y)}`,
    description: `the ball comes to rest on (${String(square.x)},${String(square.y)})`,
    ...(layers && { layers }),
    assert(observed) {
      const ball = observed.snapshot.ballPosition;
      checkpointAssert(
        ball?.x === square.x && ball?.y === square.y,
        `the ball should end on (${String(square.x)},${String(square.y)}) but is at ` +
          (ball ? `(${String(ball.x)},${String(ball.y)})` : "nowhere")
      );
    },
  };
}

export function noTurnover(layers?: ExecutionLayer[]): ExpectedCheckpoint {
  return {
    id: "no-turnover",
    description: "the activation does not cause a turnover",
    ...(layers && { layers }),
    assert(observed) {
      checkpointAssert(
        !sawEventNamed(observed, GameEventNames.Turnover),
        "the run must not cause a turnover"
      );
    },
  };
}

export function exactlyOneTurnover(
  layers?: ExecutionLayer[]
): ExpectedCheckpoint {
  return {
    id: "exactly-one-turnover",
    description: "the mistake causes exactly one turnover",
    ...(layers && { layers }),
    assert(observed) {
      const count = observed.events.filter(
        (event) => event.name === GameEventNames.Turnover
      ).length;
      checkpointAssert(
        count === 1,
        `expected exactly one turnover, saw ${String(count)}`
      );
    },
  };
}

export function endsWithStatus(
  ref: PlayerRef,
  status: string,
  layers?: ExecutionLayer[]
): ExpectedCheckpoint {
  return {
    id: `${ref}-ends-${status}`,
    description: `${ref} ends the run ${status}`,
    ...(layers && { layers }),
    assert(observed) {
      const player = playerIn(observed, ref);
      checkpointAssert(
        player.status === status,
        `${ref} should end ${status} but is ${player.status}`
      );
    },
  };
}

export function stepRejected(
  stepIndex: number,
  reasonFragment: string
): ExpectedCheckpoint {
  return {
    id: `step-${String(stepIndex)}-rejected`,
    description: `step ${String(stepIndex + 1)} is refused with '${reasonFragment}'`,
    layers: ["engine"],
    assert(observed) {
      const response = observed.responses[stepIndex];
      checkpointAssert(
        !!response,
        `step ${String(stepIndex + 1)} never ran (only ${String(observed.responses.length)} responses)`
      );
      checkpointAssert(
        !response.ok,
        `step ${String(stepIndex + 1)} should have been refused but was accepted`
      );
      checkpointAssert(
        (response.reason ?? "").includes(reasonFragment),
        `step ${String(stepIndex + 1)} was refused as '${String(response.reason)}', ` +
          `expected a reason containing '${reasonFragment}'`
      );
    },
  };
}

export function stepAccepted(stepIndex: number): ExpectedCheckpoint {
  return {
    id: `step-${String(stepIndex)}-accepted`,
    description: `step ${String(stepIndex + 1)} is accepted`,
    layers: ["engine"],
    assert(observed) {
      const response = observed.responses[stepIndex];
      checkpointAssert(!!response, `step ${String(stepIndex + 1)} never ran`);
      checkpointAssert(
        response.ok,
        `step ${String(stepIndex + 1)} was refused: ${String(response.reason)}`
      );
    },
  };
}

export function endsInPhase(
  phase: string,
  layers?: ExecutionLayer[]
): ExpectedCheckpoint {
  return {
    id: `ends-in-${phase}`,
    description: `the run ends in ${phase}`,
    ...(layers && { layers }),
    assert(observed) {
      checkpointAssert(
        observed.snapshot.phase === phase,
        `expected to end in ${phase}, but the game is in ${observed.snapshot.phase}`
      );
    },
  };
}

export function notEmitted(
  name: string,
  layers?: ExecutionLayer[]
): ExpectedCheckpoint {
  return {
    id: `not-emitted-${name}`,
    description: `the run does not emit ${name}`,
    ...(layers && { layers }),
    assert(observed) {
      checkpointAssert(
        !sawEventNamed(observed, name),
        `the run must not emit '${name}', but it did`
      );
    },
  };
}

export function raisedDecision(
  type: string,
  layers?: ExecutionLayer[]
): ExpectedCheckpoint {
  return {
    id: `decision-${type}`,
    description: `the run pauses on a '${type}' decision`,
    ...(layers && { layers }),
    assert(observed) {
      checkpointAssert(
        observed.decisions.some((decision) => decision.type === type),
        `expected a '${type}' decision; saw ` +
          (observed.decisions.map((d) => d.type).join(", ") || "none")
      );
    },
  };
}

export function emitted(
  name: string,
  layers?: ExecutionLayer[]
): ExpectedCheckpoint {
  return {
    id: `emitted-${name}`,
    description: `the run emits ${name}`,
    ...(layers && { layers }),
    assert(observed) {
      checkpointAssert(
        sawEventNamed(observed, name),
        `expected a '${name}' event; saw ${
          [...new Set(observed.events.map((e) => e.name))].join(", ") || "none"
        }`
      );
    },
  };
}

export function setupSquares(
  team: "team1" | "team2"
): { x: number; y: number }[] {
  const lineX = team === "team1" ? 6 : 13;
  const back = (n: number) => (team === "team1" ? lineX - n : lineX + n);
  return [
    { x: lineX, y: 4 },
    { x: lineX, y: 5 },
    { x: lineX, y: 6 },
    { x: back(1), y: 3 },
    { x: back(1), y: 7 },
    { x: back(2), y: 5 },
    { x: back(3), y: 5 },
  ];
}

export function placeSeven(team: "team1" | "team2"): SemanticStep[] {
  return setupSquares(team).map((square, index) =>
    step(
      {
        type: "place-player",
        playerId: `${team}:${String(index)}`,
        x: square.x,
        y: square.y,
      },
      `place ${team}:${String(index)} on (${String(square.x)},${String(square.y)})`
    )
  );
}

export function teamIsSetUp(
  team: "team1" | "team2",
  expectedCount = 7
): ExpectedCheckpoint {
  return {
    id: `${team}-is-set-up`,
    description: `${team} has ${String(expectedCount)} players placed in its own half`,
    layers: ["engine"],
    assert(observed) {
      const index = team === "team1" ? 0 : 1;
      const placed = fixtureValue(observed.snapshot.teams[index]).players.filter(
        (player) => player.position
      );
      checkpointAssert(
        placed.length === expectedCount,
        `${team} should have ${String(expectedCount)} players on the pitch, has ${String(placed.length)}`
      );
      for (const player of placed) {
        const inOwnHalf =
          team === "team1" ? fixtureValue(player.position).x <= 6 : fixtureValue(player.position).x >= 13;
        checkpointAssert(
          inOwnHalf,
          `${player.name} is set up at ` +
            `(${String(fixtureValue(player.position).x)},${String(fixtureValue(player.position).y)}), outside ${team}'s half`
        );
      }
    },
  };
}
