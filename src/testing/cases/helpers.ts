/**
 * Authoring helpers for scenario cases, so a case reads as its intent rather
 * than as boilerplate. Checkpoints throw with a message that names the case
 * and what was expected — the same convention the rules-lab verifiers use.
 */

import { GamePhase, SubPhase } from "../../types/GameState";
import { ScenarioSetup } from "../../types/Scenario";
import { GameEventNames } from "../../types/events";
import { PlayerSnapshot } from "../../headless/serialization";
import {
  ExpectedCheckpoint,
  ExecutionLayer,
  ObservedRun,
  PlayerRef,
  SquareRef,
} from "../scenarioCase/types";
import { parsePlayerRef } from "../../game/rules-lab/references";

/** Fill the phase boilerplate a mid-turn case shares. */
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

/** The snapshot entry for a stable player reference. */
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

/** Was an event with this name emitted during the run? */
export function sawEventNamed(observed: ObservedRun, name: string): boolean {
  return observed.events.some((event) => event.name === name);
}

// ----- Common checkpoints -----

/** The player ends the run standing on this square. */
export function endsAt(
  ref: PlayerRef,
  square: SquareRef,
  layers?: ExecutionLayer[]
): ExpectedCheckpoint {
  return {
    id: `${ref}-ends-at-${square.x}-${square.y}`,
    description: `${ref} finishes on (${square.x},${square.y})`,
    ...(layers ? { layers } : {}),
    assert(observed) {
      const player = playerIn(observed, ref);
      checkpointAssert(
        player.position?.x === square.x && player.position?.y === square.y,
        `${ref} should finish on (${square.x},${square.y}) but is at ` +
          `${player.position ? `(${player.position.x},${player.position.y})` : "off-pitch"}`
      );
    },
  };
}

/** The ball ends the run on this square. */
export function ballEndsAt(
  square: SquareRef,
  layers?: ExecutionLayer[]
): ExpectedCheckpoint {
  return {
    id: `ball-ends-at-${square.x}-${square.y}`,
    description: `the ball comes to rest on (${square.x},${square.y})`,
    ...(layers ? { layers } : {}),
    assert(observed) {
      const ball = observed.snapshot.ballPosition;
      checkpointAssert(
        ball?.x === square.x && ball?.y === square.y,
        `the ball should end on (${square.x},${square.y}) but is at ` +
          `${ball ? `(${ball.x},${ball.y})` : "nowhere"}`
      );
    },
  };
}

/** The run does not hand the turn over. */
export function noTurnover(layers?: ExecutionLayer[]): ExpectedCheckpoint {
  return {
    id: "no-turnover",
    description: "the activation does not cause a turnover",
    ...(layers ? { layers } : {}),
    assert(observed) {
      checkpointAssert(
        !sawEventNamed(observed, GameEventNames.Turnover),
        "the run must not cause a turnover"
      );
    },
  };
}

/** Exactly one turnover happens (never two for one mistake). */
export function exactlyOneTurnover(
  layers?: ExecutionLayer[]
): ExpectedCheckpoint {
  return {
    id: "exactly-one-turnover",
    description: "the mistake causes exactly one turnover",
    ...(layers ? { layers } : {}),
    assert(observed) {
      const count = observed.events.filter(
        (event) => event.name === GameEventNames.Turnover
      ).length;
      checkpointAssert(
        count === 1,
        `expected exactly one turnover, saw ${count}`
      );
    },
  };
}

/** The player has this status at the end of the run. */
export function endsWithStatus(
  ref: PlayerRef,
  status: string,
  layers?: ExecutionLayer[]
): ExpectedCheckpoint {
  return {
    id: `${ref}-ends-${status}`,
    description: `${ref} ends the run ${status}`,
    ...(layers ? { layers } : {}),
    assert(observed) {
      const player = playerIn(observed, ref);
      checkpointAssert(
        player.status === status,
        `${ref} should end ${status} but is ${player.status}`
      );
    },
  };
}

/**
 * The Nth step was rejected, with a reason containing `reasonFragment`.
 *
 * Negative cases are only meaningful if the refusal is the *right* refusal,
 * so the machine-readable reason is asserted rather than just `ok === false`.
 * Engine-only: the browser refuses illegal actions by not offering them.
 */
export function stepRejected(
  stepIndex: number,
  reasonFragment: string
): ExpectedCheckpoint {
  return {
    id: `step-${stepIndex}-rejected`,
    description: `step ${stepIndex + 1} is refused with '${reasonFragment}'`,
    layers: ["engine"],
    assert(observed) {
      const response = observed.responses[stepIndex];
      checkpointAssert(
        !!response,
        `step ${stepIndex + 1} never ran (only ${observed.responses.length} responses)`
      );
      checkpointAssert(
        !response.ok,
        `step ${stepIndex + 1} should have been refused but was accepted`
      );
      checkpointAssert(
        (response.reason ?? "").includes(reasonFragment),
        `step ${stepIndex + 1} was refused as '${response.reason}', ` +
          `expected a reason containing '${reasonFragment}'`
      );
    },
  };
}

/** The Nth step was accepted. */
export function stepAccepted(stepIndex: number): ExpectedCheckpoint {
  return {
    id: `step-${stepIndex}-accepted`,
    description: `step ${stepIndex + 1} is accepted`,
    layers: ["engine"],
    assert(observed) {
      const response = observed.responses[stepIndex];
      checkpointAssert(!!response, `step ${stepIndex + 1} never ran`);
      checkpointAssert(
        response.ok,
        `step ${stepIndex + 1} was refused: ${response.reason}`
      );
    },
  };
}

/** The active team at the end of the run. */
export function activeTeamIs(
  team: "team1" | "team2",
  layers?: ExecutionLayer[]
): ExpectedCheckpoint {
  return {
    id: `active-team-${team}`,
    description: `${team} is on the ball when the run ends`,
    ...(layers ? { layers } : {}),
    assert(observed) {
      const index = team === "team1" ? 0 : 1;
      const expected = observed.snapshot.teams[index].id;
      checkpointAssert(
        observed.snapshot.activeTeamId === expected,
        `expected ${team} to be active, but ${observed.snapshot.activeTeamId} is`
      );
    },
  };
}

/** The game is in this phase at the end of the run. */
export function endsInPhase(
  phase: string,
  layers?: ExecutionLayer[]
): ExpectedCheckpoint {
  return {
    id: `ends-in-${phase}`,
    description: `the run ends in ${phase}`,
    ...(layers ? { layers } : {}),
    assert(observed) {
      checkpointAssert(
        observed.snapshot.phase === phase,
        `expected to end in ${phase}, but the game is in ${observed.snapshot.phase}`
      );
    },
  };
}

/** No event with this name was emitted. */
export function notEmitted(
  name: string,
  layers?: ExecutionLayer[]
): ExpectedCheckpoint {
  return {
    id: `not-emitted-${name}`,
    description: `the run does not emit ${name}`,
    ...(layers ? { layers } : {}),
    assert(observed) {
      checkpointAssert(
        !sawEventNamed(observed, name),
        `the run must not emit '${name}', but it did`
      );
    },
  };
}

/** The run raised a decision of this type. */
export function raisedDecision(
  type: string,
  layers?: ExecutionLayer[]
): ExpectedCheckpoint {
  return {
    id: `decision-${type}`,
    description: `the run pauses on a '${type}' decision`,
    ...(layers ? { layers } : {}),
    assert(observed) {
      checkpointAssert(
        observed.decisions.some((decision) => decision.type === type),
        `expected a '${type}' decision; saw ` +
          `${observed.decisions.map((d) => d.type).join(", ") || "none"}`
      );
    },
  };
}

/** An event with this name was emitted. */
export function emitted(
  name: string,
  layers?: ExecutionLayer[]
): ExpectedCheckpoint {
  return {
    id: `emitted-${name}`,
    description: `the run emits ${name}`,
    ...(layers ? { layers } : {}),
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
