import { fixtureValue } from "../fixtureValue";
import { GamePhase, SubPhase } from "../../types/GameState";
import { type ScenarioCase, step } from "../scenarioCase/types";
import { GameEventNames } from "../../types/events";
import {
  stepAccepted,
  stepRejected,
  checkpointAssert,
  setupSquares,
  placeSeven,
  teamIsSetUp,
} from "./helpers";

const setupAdjustments: ScenarioCase = {
  id: "match-setup-adjustments",
  name: "Adjusting a setup before confirming",
  description:
    "Placements can be swapped and removed while a setup is unconfirmed; the " +
    "board tracks each edit and the team can still confirm a legal seven.",
  capability: "phase-flow",
  interactions: [
    "protocol-command:swap-players",
    "protocol-command:remove-player",
    "phase:SETUP",
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
      { type: "swap-players", player1Id: "team1:0", player2Id: "team1:6" },
      "swap the front and back players"
    ),

    step({ type: "remove-player", playerId: "team1:3" }, "take one off again"),
    step(
      { type: "place-player", playerId: "team1:3", x: 4, y: 8 },
      "place them somewhere else"
    ),
    step({ type: "confirm-setup", teamId: "team1" }, "confirm the seven"),
  ],
  layers: ["engine"],
  interactive: true,
  tags: ["match-flow"],
  variants: [
    {
      id: "edited-then-confirmed",
      name: "Edited, then confirmed",
      seed: 11,
      expectedOutcome:
        "the swap and the re-placement both take effect and the setup confirms",
    },
  ],
  checkpoints: [
    teamIsSetUp("team1"),
    {
      id: "swap-took-effect",
      description: "the swapped players exchanged squares",
      layers: ["engine"],
      assert(observed) {
        const squares = setupSquares("team1");
        const players = fixtureValue(observed.snapshot.teams[0]).players;
        const first = fixtureValue(players[0]).position;
        const last = fixtureValue(players[6]).position;
        checkpointAssert(
          first?.x === fixtureValue(squares[6]).x && first?.y === fixtureValue(squares[6]).y,
          `team1:0 should have taken team1:6's square (${String(fixtureValue(squares[6]).x)},${String(fixtureValue(squares[6]).y)}), ` +
            `but is at ${first ? `(${String(first.x)},${String(first.y)})` : "nowhere"}`
        );
        checkpointAssert(
          last?.x === fixtureValue(squares[0]).x && last?.y === fixtureValue(squares[0]).y,
          `team1:6 should have taken team1:0's square (${String(fixtureValue(squares[0]).x)},${String(fixtureValue(squares[0]).y)}), ` +
            `but is at ${last ? `(${String(last.x)},${String(last.y)})` : "nowhere"}`
        );
      },
    },
    {
      id: "replacement-took-effect",
      description: "the removed player was re-placed on the new square",
      layers: ["engine"],
      assert(observed) {
        const player = fixtureValue(observed.snapshot.teams[0]).players[3];
        checkpointAssert(
          fixtureValue(player).position?.x === 4 && fixtureValue(player).position?.y === 8,
          `team1:3 should have been re-placed on (4,8), but is at ` +
            (fixtureValue(player).position
              ? `(${String(fixtureValue(fixtureValue(player).position).x)},${String(fixtureValue(fixtureValue(player).position).y)})`
              : "nowhere")
        );
      },
    },
  ],
};

const applyFormation: ScenarioCase = {
  id: "match-apply-formation",
  name: "Setting up from a formation",
  description:
    "A coach places their whole team with one formation command and confirms " +
    "it, instead of placing seven players by hand.",
  capability: "phase-flow",
  interactions: ["protocol-command:apply-formation", "phase:SETUP"],
  setup: {
    team1Placements: [],
    team2Placements: [],
    activeTeam: "team1",
    phase: GamePhase.SETUP,
    subPhase: SubPhase.SETUP_KICKING,
  },
  steps: [
    step(
      {
        type: "apply-formation",
        teamId: "team1",
        formation: setupSquares("team1").map((square, index) => ({
          playerId: `team1:${String(index)}`,
          x: square.x,
          y: square.y,
        })),
      },
      "apply a seven-player formation in one go"
    ),
    step({ type: "confirm-setup", teamId: "team1" }, "confirm it"),
  ],
  layers: ["engine"],
  interactive: true,
  tags: ["match-flow"],
  variants: [
    {
      id: "applied",
      name: "Formation applied",
      seed: 1,
      expectedOutcome: "all seven are placed by the formation and confirmed",
    },
  ],
  checkpoints: [stepAccepted(0), teamIsSetUp("team1")],
};

const weatherReadyUp: ScenarioCase = {
  id: "opening-weather-ready-up",
  name: "Both coaches ready up for the weather",
  description:
    "Before the coin toss each coach readies up for the weather. The 2D6 " +
    "are rolled once, when the second coach is ready.",
  capability: "phase-flow",
  interactions: ["protocol-command:ready-weather", "phase:SETUP"],
  setup: {
    team1Placements: [],
    team2Placements: [],
    activeTeam: "team1",
    phase: GamePhase.SETUP,
    subPhase: SubPhase.INTRO,
  },
  steps: [
    step({ type: "ready-weather", teamId: "team1" }, "the home coach readies"),
    step({ type: "ready-weather", teamId: "team1" }, "and again"),
    step({ type: "ready-weather", teamId: "team2" }, "the away coach readies"),
    step({ type: "ready-weather", teamId: "team2" }, "a ready after the roll"),
  ],
  layers: ["engine"],
  interactive: true,
  tags: ["match-flow"],
  variants: [
    {
      id: "rolled-once",
      name: "Rolled once both are ready",
      seed: 1,
      expectedOutcome: "one Weather roll, after the second coach readies",
    },
  ],
  checkpoints: [
    stepAccepted(0),
    stepAccepted(1),
    stepAccepted(2),
    stepRejected(3, "not-weather-time"),
    {
      id: "rolled-once",
      description: "the weather is rolled once, with both coaches ready",
      layers: ["engine"],
      assert(observed) {
        const rolls = observed.events.filter(
          (event) =>
            event.name === GameEventNames.DiceRoll &&
            (event.data as { rollType: string }).rollType === "Weather"
        );
        checkpointAssert(
          rolls.length === 1,
          `the weather must be rolled once, rolled ${String(rolls.length)} times`
        );
        checkpointAssert(
          observed.snapshot.weatherReady?.join(',') === "team1,team2",
          "both coaches must be recorded as ready"
        );
      },
    },
  ],
};

export const SEVENS_SETUP_CASES: ScenarioCase[] = [
  setupAdjustments,
  applyFormation,
  weatherReadyUp,
];
