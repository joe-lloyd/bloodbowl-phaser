import { GamePhase, SubPhase } from "../../types/GameState";
import { GameEventNames } from "../../types/events";
import { type ScenarioCase, step } from "../scenarioCase/types";
import {
  checkpointAssert,
  endsInPhase,
  placeSeven,
  raisedDecision,
  emitted,
  ballEndsAt,
  teamIsSetUp,
} from "./helpers";

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

  setup: {
    team1Placements: [],
    team2Placements: [],
    activeTeam: "team1",
    phase: GamePhase.SETUP,
    subPhase: SubPhase.SETUP_KICKING,
  },
  steps: [
    ...placeSeven("team1"),
    step(
      { type: "confirm-setup", teamId: "team1" },
      "the kicking team confirms"
    ),
    ...placeSeven("team2"),
    step(
      { type: "confirm-setup", teamId: "team2" },
      "the receiving team confirms"
    ),
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

      seed: 2,
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

  steps: [
    step(
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

    ballEndsAt({ x: 13, y: 2 }),
    endsInPhase(GamePhase.PLAY),
  ],
};

export const KICKOFF_EVENTS_CASES: ScenarioCase[] = [opening, touchback];
