import { fixtureValue } from "../fixtureValue";
import { type ScenarioCase, step } from "../scenarioCase/types";
import { playSetup, endsAt, noTurnover, checkpointAssert } from "./helpers";
import { GameEventNames } from "../../types/events";
import { SkillType } from "../../types/Skills";

export const SECURE_BALL_CASES: ScenarioCase[] = [
  {
    id: "secure-ball-move-to-ball",
    name: "Move to secure the ball",
    description:
      "Secure the Ball is a single movement action ending in a 2+ Secure the Ball roll, rather than an ordinary pickup or a separate Secure step.",
    capability: "movement",
    interactions: ["declare-action:secureBall", "move:normal"],
    setup: playSetup({
      team1Placements: [
        {
          playerIndex: 0,
          x: 5,
          y: 5,
          stats: { AG: 5 },
          skills: [SkillType.SURE_HANDS],
        },
        { playerIndex: 1, x: 1, y: 9 },
      ],
      team2Placements: [{ playerIndex: 0, x: 18, y: 1 }],
      ballPosition: { x: 7, y: 5 },
    }),
    steps: [
      step({
        type: "declare-action",
        playerId: "team1:0",
        action: "secureBall",
      }),
      step({
        type: "move",
        playerId: "team1:0",
        path: [
          { x: 6, y: 5 },
          { x: 7, y: 5 },
        ],
      }),
    ],
    layers: ["engine", "browser"],
    interactive: true,
    regression: {
      id: "BUG-2026-11-16-secure-ball-flow",
      summary:
        "The UI offered Move and Secure as separate steps and previewed an ordinary pickup instead of the declared Secure the Ball roll.",
      reportedAt: "2026-11-16",
      uiBoundary: true,
    },
    variants: [
      {
        id: "secure-on-two",
        name: "An AG 5+ player secures on 2+",
        seed: 9,
        expectedOutcome:
          "The player secures the ball on 2+ and their activation ends.",
      },
    ],
    checkpoints: [
      endsAt("team1:0", { x: 7, y: 5 }),
      noTurnover(),
      {
        id: "secure-roll-and-end-activation",
        description:
          "The actual roll is Secure the Ball 2+ and ends the activation",
        assert(observed) {
          const rolls = observed.events
            .filter((e) => e.name === GameEventNames.DiceRoll)
            .map((e) => (e.data as { description: string }).description);
          checkpointAssert(
            rolls.length === 1 &&
              rolls[0] === "Secure the Ball (Human Lineman #1): 2, needs 2+",
            `Unexpected rolls: ${rolls.join(", ")}`
          );
          checkpointAssert(
            observed.snapshot.turn.activatedPlayerIds.includes(
              fixtureValue(fixtureValue(observed.snapshot.teams[0]).players[0]).id
            ),
            "Securing the ball must end the player's activation"
          );
        },
      },
    ],
  },
];
