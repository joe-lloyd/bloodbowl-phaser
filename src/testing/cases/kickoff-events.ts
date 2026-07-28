/**
 * Kickoff scenario cases, mirroring `__tests__/headless/kickoff-events.test.ts`.
 *
 * Note that a scenario-loaded SETUP is already *past* the coin flip: the
 * loader assigns the drive from the setup's `activeTeam`, so `coin-flip` is
 * refused here with `coin-flip-only-before-first-drive`. The flip is proved
 * instead by the bot-driven full match (`e2e/engine/full-match.e2e.ts`),
 * which starts a real match from scratch. What these cases own is everything
 * after it: both setups, the kick, and what happens when it lands or misses.
 */

import { GamePhase, SubPhase } from "../../types/GameState";
import { GameEventNames } from "../../types/events";
import { ScenarioCase, step } from "../scenarioCase/types";
import {
  checkpointAssert,
  endsInPhase,
  placeSeven,
  raisedDecision,
  emitted,
  ballEndsAt,
  teamIsSetUp,
} from "./helpers";

/**
 * The whole opening: coin flip, both setups, the kick, and the kickoff event
 * the runner's decision policy skips.
 */
const opening: ScenarioCase = {
  id: "match-opening-to-kickoff",
  name: "Setup through kickoff",
  description:
    "A drive opens: both coaches set up in their own halves and confirm, the " +
    "kicking team nominates a kicker and kicks, and the kickoff event is " +
    "resolved.",
  capability: "phase-flow",
  interactions: [
    "protocol-command:place-player",
    "protocol-command:confirm-setup",
    "protocol-command:select-kicker",
    "protocol-command:kick-ball",
    "phase:SETUP",
    "phase:KICKOFF",
  ],
  // An empty SETUP board: nobody is placed, so the case really does drive
  // the opening rather than inheriting it. `activeTeam: team1` with
  // SETUP_KICKING makes team1 the kicking team, which sets up first.
  setup: {
    team1Placements: [],
    team2Placements: [],
    activeTeam: "team1",
    phase: GamePhase.SETUP,
    subPhase: SubPhase.SETUP_KICKING,
  },
  steps: [
    ...placeSeven("team1"),
    step({ type: "confirm-setup", teamId: "team1" }, "the kicking team confirms"),
    ...placeSeven("team2"),
    step({ type: "confirm-setup", teamId: "team2" }, "the receiving team confirms"),
    step({ type: "select-kicker", playerId: "team1:0" }, "nominate the kicker"),
    step(
      { type: "kick-ball", playerId: "team1:0", x: 15, y: 5 },
      "kick deep into team2's half"
    ),
  ],
  layers: ["engine"],
  interactive: true,
  tags: ["match-flow"],
  variants: [
    {
      id: "team1-kicks",
      name: "team1 kicks off",
      // This seed lands the kick on target; a kick that deviates out would
      // raise a touchback instead, which `match-touchback-award` owns.
      seed: 1,
      expectedOutcome:
        "both teams set up legally, team1 kicks on target, and the kickoff event resolves",
    },
  ],
  checkpoints: [
    teamIsSetUp("team1"),
    teamIsSetUp("team2"),
    raisedDecision("kickoff-event"),
    emitted(GameEventNames.DiceRoll),
    {
      id: "ball-is-in-play",
      description: "the kick puts a ball on the pitch",
      layers: ["engine"],
      assert(observed) {
        const ball = observed.snapshot.ballPosition;
        checkpointAssert(
          !!ball,
          "after the kick the ball should be somewhere on the pitch"
        );
      },
    },
    {
      id: "leaves-setup",
      description: "the match has left SETUP",
      layers: ["engine"],
      assert(observed) {
        checkpointAssert(
          observed.initialSnapshot.phase === GamePhase.SETUP,
          "this case must start in SETUP"
        );
        checkpointAssert(
          observed.snapshot.phase !== GamePhase.SETUP,
          "after the kick the match should have left SETUP"
        );
      },
    },
  ],
};

/**
 * A kick that leaves the pitch is a touchback: the receiving coach chooses
 * who picks the ball up, and play starts with them holding it.
 */
const touchback: ScenarioCase = {
  id: "match-touchback-award",
  name: "Touchback after a kick out of bounds",
  description:
    "A kick that never lands on the pitch awards a touchback; the receiving " +
    "coach hands the ball to a player of their choice and play begins.",
  capability: "phase-flow",
  interactions: [
    "protocol-command:kick-ball",
    "protocol-command:touchback",
    "decision:touchback",
    "phase:KICKOFF",
  ],
  // A full legal kickoff formation, mirroring the `touchback-test` sandbox
  // scenario: a sparse board changes the deviation maths, so this reuses the
  // arrangement whose seed is known to send the ball out.
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 6, y: 2 },
      { playerIndex: 1, x: 5, y: 3 },
      { playerIndex: 2, x: 4, y: 4 },
      { playerIndex: 3, x: 6, y: 5 },
      { playerIndex: 4, x: 5, y: 6 },
      { playerIndex: 5, x: 4, y: 7 },
      { playerIndex: 6, x: 6, y: 8 },
    ],
    team2Placements: [
      { playerIndex: 0, x: 13, y: 2 },
      { playerIndex: 1, x: 14, y: 3 },
      { playerIndex: 2, x: 15, y: 4 },
      { playerIndex: 3, x: 13, y: 5 },
      { playerIndex: 4, x: 14, y: 6 },
      { playerIndex: 5, x: 15, y: 7 },
      { playerIndex: 6, x: 13, y: 8 },
    ],
    activeTeam: "team1",
    phase: GamePhase.KICKOFF,
    subPhase: SubPhase.ROLL_KICKOFF,
  },
  // One step: the touchback reply is issued by the run's decision policy,
  // exactly as a coach's choice would be, and is recorded against the case
  // like any other executed command.
  steps: [
    step(
      // Aimed at the receiving corner, so the deviation carries it out.
      { type: "kick-ball", playerId: "team1:0", x: 18, y: 1 },
      "kick towards the receiving corner"
    ),
  ],
  layers: ["engine"],
  interactive: true,
  tags: ["match-flow"],
  variants: [
    {
      id: "awarded",
      name: "Touchback awarded",
      seed: 4,
      expectedOutcome:
        "the kick goes out, a touchback is awarded, and the chosen receiver holds the ball",
    },
  ],
  checkpoints: [
    raisedDecision("touchback"),
    emitted(GameEventNames.TouchbackAwarded),
    // The policy hands the ball to the receiving team's first standing
    // player, who is set up on (13,2).
    ballEndsAt({ x: 13, y: 2 }),
    endsInPhase(GamePhase.PLAY),
  ],
};

export const KICKOFF_EVENTS_CASES: ScenarioCase[] = [opening, touchback];
