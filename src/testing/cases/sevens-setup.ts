/**
 * Setup scenario cases, mirroring `__tests__/headless/sevens-setup.test.ts`:
 * placements can be edited before confirming, and a whole team can be placed
 * in one formation command.
 */

import { GamePhase, SubPhase } from "../../types/GameState";
import { ScenarioCase, step } from "../scenarioCase/types";
import {
  stepAccepted,
  checkpointAssert,
  setupSquares,
  placeSeven,
  teamIsSetUp,
} from "./helpers";

/**
 * Setup is editable until it is confirmed: a coach places, swaps two
 * players, removes one, and places again.
 */
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
    // Swap two placed players: both keep a square, but not their own.
    step(
      { type: "swap-players", player1Id: "team1:0", player2Id: "team1:6" },
      "swap the front and back players"
    ),
    // Remove one and put them somewhere else.
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
        const players = observed.snapshot.teams[0].players;
        const first = players[0].position;
        const last = players[6].position;
        checkpointAssert(
          first?.x === squares[6].x && first?.y === squares[6].y,
          `team1:0 should have taken team1:6's square (${squares[6].x},${squares[6].y}), ` +
            `but is at ${first ? `(${first.x},${first.y})` : "nowhere"}`
        );
        checkpointAssert(
          last?.x === squares[0].x && last?.y === squares[0].y,
          `team1:6 should have taken team1:0's square (${squares[0].x},${squares[0].y}), ` +
            `but is at ${last ? `(${last.x},${last.y})` : "nowhere"}`
        );
      },
    },
    {
      id: "replacement-took-effect",
      description: "the removed player was re-placed on the new square",
      layers: ["engine"],
      assert(observed) {
        const player = observed.snapshot.teams[0].players[3];
        checkpointAssert(
          player.position?.x === 4 && player.position?.y === 8,
          `team1:3 should have been re-placed on (4,8), but is at ` +
            `${player.position ? `(${player.position.x},${player.position.y})` : "nowhere"}`
        );
      },
    },
  ],
};

/**
 * A whole team placed in one command, then confirmed. `apply-formation` is
 * what the UI's formation presets use, so it is a real coach action rather
 * than a shortcut.
 */
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
          playerId: `team1:${index}`,
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

export const SEVENS_SETUP_CASES: ScenarioCase[] = [
  setupAdjustments,
  applyFormation,
];
