/**
 * Match-flow cases: the phases a drive passes through, and the commands that
 * only exist there.
 *
 * Most rule cases start mid-turn in PLAY, because that is where rules live.
 * That leaves the whole opening — coin flip, setup, kickoff — and the whole
 * ending — touchdown, drive reset — proved by nothing. These cases walk
 * those transitions with fixed scripts on committed seeds.
 *
 * Note that a scenario-loaded SETUP is already *past* the coin flip: the
 * loader assigns the drive from the setup's `activeTeam`, so `coin-flip` is
 * refused here with `coin-flip-only-before-first-drive`. The flip is proved
 * instead by the bot-driven full match (`e2e/engine/full-match.e2e.ts`),
 * which starts a real match from scratch. What these cases own is everything
 * after it.
 */

import { GamePhase, SubPhase } from "../../types/GameState";
import { PlayerStatus } from "../../types/Player";
import { GameEventNames } from "../../types/events";
import { ScenarioCase, SemanticStep, step } from "../scenarioCase/types";
import {
  playSetup,
  checkpointAssert,
  endsInPhase,
  raisedDecision,
  emitted,
  stepAccepted,
  ballEndsAt,
  playerIn,
} from "./helpers";

/**
 * Setup squares for a team, walking back from its line of scrimmage.
 * `team1` sets up on the left (0-6) and faces right; `team2` mirrors it.
 */
function setupSquares(team: "team1" | "team2"): { x: number; y: number }[] {
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

/** `place-player` for all seven of a team, in roster order. */
function placeSeven(team: "team1" | "team2"): SemanticStep[] {
  return setupSquares(team).map((square, index) =>
    step(
      {
        type: "place-player",
        playerId: `${team}:${index}`,
        x: square.x,
        y: square.y,
      },
      `place ${team}:${index} on (${square.x},${square.y})`
    )
  );
}

/** Every player of a team is on the pitch, inside its own half. */
function teamIsSetUp(
  team: "team1" | "team2",
  expectedCount = 7
): ScenarioCase["checkpoints"][number] {
  return {
    id: `${team}-is-set-up`,
    description: `${team} has ${expectedCount} players placed in its own half`,
    layers: ["engine"],
    assert(observed) {
      const index = team === "team1" ? 0 : 1;
      const placed = observed.snapshot.teams[index].players.filter(
        (player) => player.position
      );
      checkpointAssert(
        placed.length === expectedCount,
        `${team} should have ${expectedCount} players on the pitch, has ${placed.length}`
      );
      for (const player of placed) {
        const inOwnHalf =
          team === "team1" ? player.position!.x <= 6 : player.position!.x >= 13;
        checkpointAssert(
          inOwnHalf,
          `${player.name} is set up at ` +
            `(${player.position!.x},${player.position!.y}), outside ${team}'s half`
        );
      }
    },
  };
}

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

/**
 * A carrier walking into the end zone scores, and the drive resets: the
 * pitch clears and the next setup begins.
 */
const touchdown: ScenarioCase = {
  id: "match-touchdown-and-drive-reset",
  name: "Touchdown and drive reset",
  description:
    "A carrier who reaches the opposing end zone scores; the score updates, " +
    "the drive ends, and the match returns to SETUP for the next kickoff.",
  capability: "phase-flow",
  interactions: [
    "protocol-command:move",
    "phase:TOUCHDOWN",
    "phase:SETUP",
  ],
  setup: playSetup({
    team1Placements: [
      { playerIndex: 0, x: 17, y: 5 },
      { playerIndex: 1, x: 3, y: 3 },
    ],
    team2Placements: [{ playerIndex: 0, x: 13, y: 9 }],
    ballPosition: { x: 17, y: 5 },
  }),
  steps: [
    step({ type: "declare-action", playerId: "team1:0", action: "move" }),
    step(
      {
        type: "move",
        playerId: "team1:0",
        path: [
          { x: 18, y: 5 },
          { x: 19, y: 5 },
        ],
      },
      "walk the ball into the end zone"
    ),
  ],
  layers: ["engine"],
  interactive: true,
  tags: ["match-flow"],
  variants: [
    {
      id: "scored",
      name: "Touchdown scored",
      seed: 5,
      expectedOutcome:
        "the carrier scores, the score becomes 1-0, and the next drive's setup begins",
    },
  ],
  checkpoints: [
    stepAccepted(0),
    emitted(GameEventNames.Touchdown),
    {
      id: "score-updated",
      description: "the scoring team is one up",
      layers: ["engine"],
      assert(observed) {
        const teamId = observed.snapshot.teams[0].id;
        checkpointAssert(
          observed.snapshot.score[teamId] === 1,
          `team1 should have scored once, score is ${JSON.stringify(observed.snapshot.score)}`
        );
      },
    },
    {
      id: "drive-reset",
      description: "the pitch is cleared for the next drive",
      layers: ["engine"],
      assert(observed) {
        checkpointAssert(
          observed.snapshot.phase === GamePhase.SETUP,
          `after a touchdown the match should return to SETUP, got ${observed.snapshot.phase}`
        );
        const stillPlaced = observed.snapshot.teams
          .flatMap((team) => team.players)
          .filter((player) => player.position);
        checkpointAssert(
          stillPlaced.length === 0,
          `the drive reset should clear the pitch, but ${stillPlaced.length} player(s) remain`
        );
        checkpointAssert(
          observed.snapshot.ballPosition === null,
          "the drive reset should take the ball off the pitch"
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

/**
 * A declared action can be taken back until something has happened. This is
 * the "I misclicked" path, and it must leave no trace.
 */
const cancelAction: ScenarioCase = {
  id: "activation-cancel-declared-action",
  name: "Cancelling a declared action",
  description:
    "A player who has declared an action but not yet acted can cancel it, " +
    "freeing them to declare a different one.",
  capability: "activation",
  interactions: [
    "protocol-command:cancel-action",
    "protocol-command:declare-action",
  ],
  setup: playSetup({
    team1Placements: [
      { playerIndex: 0, x: 5, y: 5 },
      { playerIndex: 1, x: 2, y: 2 },
    ],
    team2Placements: [{ playerIndex: 0, x: 18, y: 9 }],
    ballPosition: { x: 1, y: 1 },
  }),
  steps: [
    step({ type: "declare-action", playerId: "team1:0", action: "move" }),
    step({ type: "cancel-action", playerId: "team1:0" }, "take it back"),
    step(
      { type: "declare-action", playerId: "team1:0", action: "pass" },
      "declare something else instead"
    ),
  ],
  layers: ["engine"],
  interactive: true,
  tags: ["match-flow"],
  variants: [
    {
      id: "cancelled",
      name: "Cancelled and re-declared",
      seed: 1,
      expectedOutcome:
        "the first declaration is taken back and a different one is accepted",
    },
  ],
  checkpoints: [
    stepAccepted(0),
    stepAccepted(1),
    stepAccepted(2),
    {
      id: "re-declared",
      description: "the player ends up on the second action, not the first",
      layers: ["engine"],
      assert(observed) {
        checkpointAssert(
          observed.snapshot.activePlayer?.action === "pass",
          `expected the re-declared 'pass' action, got ` +
            `${observed.snapshot.activePlayer?.action ?? "none"}`
        );
      },
    },
  ],
};

/**
 * Knocked-out players roll to recover when the drive ends.
 *
 * This is the one phase-flow rule that only fires *between* drives, so it
 * needs a drive to actually end: the carrier scores, and the reset rolls
 * recovery for everyone in the KO box.
 */
const koRecovery: ScenarioCase = {
  id: "match-ko-recovery-at-drive-end",
  name: "KO recovery when the drive ends",
  description:
    "A knocked-out player rolls D6 at the end of the drive: 4+ returns them " +
    "to Reserves, anything less leaves them in the KO box for the next one.",
  capability: "phase-flow",
  interactions: ["phase:TOUCHDOWN", "phase:SETUP"],
  setup: playSetup({
    team1Placements: [
      { playerIndex: 0, x: 17, y: 5 },
      { playerIndex: 1, x: 3, y: 3 },
      // Off the pitch in the KO box, waiting for the drive to end.
      { playerIndex: 2, x: 4, y: 4, status: PlayerStatus.KO },
    ],
    team2Placements: [{ playerIndex: 0, x: 13, y: 9 }],
    ballPosition: { x: 17, y: 5 },
  }),
  steps: [
    step({ type: "declare-action", playerId: "team1:0", action: "move" }),
    step(
      {
        type: "move",
        playerId: "team1:0",
        path: [
          { x: 18, y: 5 },
          { x: 19, y: 5 },
        ],
      },
      "score, ending the drive"
    ),
  ],
  layers: ["engine"],
  interactive: true,
  tags: ["match-flow"],
  variants: [
    {
      id: "rolled",
      name: "Recovery rolled",
      seed: 5,
      expectedOutcome:
        "the drive ends, the KO'd player is rolled for, and their status " +
        "matches the roll",
    },
  ],
  checkpoints: [
    emitted(GameEventNames.Touchdown),
    emitted(GameEventNames.KORecoveryRolled),
    {
      id: "status-agrees-with-the-roll",
      description: "the KO'd player's status matches what they rolled",
      layers: ["engine"],
      assert(observed) {
        const roll = observed.events.find(
          (event) => event.name === GameEventNames.KORecoveryRolled
        )?.data as { roll: number; recovered: boolean } | undefined;
        checkpointAssert(!!roll, "the drive end must roll KO recovery");
        checkpointAssert(
          roll!.recovered === roll!.roll >= 4,
          `a ${roll!.roll} should ${roll!.roll >= 4 ? "" : "not "}recover, ` +
            `but recovered=${roll!.recovered}`
        );

        const player = playerIn(observed, "team1:2");
        const expected = roll!.recovered
          ? PlayerStatus.RESERVE
          : PlayerStatus.KO;
        checkpointAssert(
          player.status === expected,
          `after rolling ${roll!.roll} the player should be ${expected}, ` +
            `but is ${player.status}`
        );
      },
    },
  ],
};

export const MATCH_FLOW_CASES: ScenarioCase[] = [
  opening,
  setupAdjustments,
  applyFormation,
  cancelAction,
  touchback,
  touchdown,
  koRecovery,
];
