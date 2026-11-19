import { GameEventNames } from "../../types/events";
import { PlayerStatus } from "../../types/Player";
import { RosterName } from "../../types/Team";
import {
  type ExpectedCheckpoint,
  type ScenarioCase,
  step,
} from "../scenarioCase/types";
import {
  checkpointAssert,
  endsWithStatus,
  exactlyOneTurnover,
  noTurnover,
  playSetup,
  playerIn,
} from "./helpers";

const crowdRolledOnce: ExpectedCheckpoint = {
  id: "crowd-rolled-once",
  description: "the crowd rolls once, and the carrier is recorded as Stalling",
  assert(observed) {
    const rolls = observed.events.filter(
      (event) =>
        event.name === GameEventNames.DiceRoll &&
        (event.data as { description?: string }).description?.startsWith(
          "Crowd Takes Action"
        )
    );
    checkpointAssert(
      rolls.length === 1,
      `expected one Crowd Takes Action roll, saw ${String(rolls.length)}`
    );
    const carrier = playerIn(observed, "team1:0");
    checkpointAssert(
      !!observed.snapshot.stallingPlayerIds?.includes(carrier.id),
      "the carrier should be recorded as Stalling"
    );
  },
};

const crowdTakesAction: ScenarioCase = {
  id: "stalling-crowd-takes-action",
  name: "Stalling: the Crowd Takes Action",
  description:
    "A Human Lineman holds the ball four empty squares from the End Zone on " +
    "Turn 5 and could score without rolling a die. Ending the activation " +
    "there is Stalling: the crowd hits on a D6 of 5 or more, the Turn " +
    "number, Knocking the carrier Down for a Turnover.",
  capability: "stalling",
  interactions: [
    "protocol-command:declare-action",
    "protocol-command:end-activation",
  ],
  setup: playSetup({
    turn: 5,
    team1Placements: [
      { playerIndex: 0, x: 15, y: 5, hasBall: true },
      { playerIndex: 1, x: 14, y: 5 },
      { playerIndex: 2, x: 2, y: 9 },
    ],
    team2Placements: [{ playerIndex: 0, x: 2, y: 1 }],
  }),
  fixture: {
    team1: { roster: RosterName.HUMAN },
    team2: { roster: RosterName.HUMAN },
  },
  steps: [
    step(
      { type: "declare-action", playerId: "team1:0", action: "move" },
      "the carrier declares a Move"
    ),
    step(
      { type: "end-activation", playerId: "team1:0" },
      "and ends the activation without scoring"
    ),
  ],
  layers: ["engine", "browser"],
  interactive: true,
  variants: [
    {
      id: "crowd-hits",
      name: "The crowd hits",
      seed: 2,
      expectedOutcome:
        "the crowd rolls a 5: the carrier is Knocked Down and the turn turns over",
      checkpoints: [
        endsWithStatus("team1:0", PlayerStatus.PRONE),
        exactlyOneTurnover(),
      ],
    },
    {
      id: "crowd-misses",
      name: "The crowd misses",
      seed: 1,
      expectedOutcome:
        "the crowd rolls a 4: the carrier stays on their feet holding the ball",
      checkpoints: [
        endsWithStatus("team1:0", PlayerStatus.ACTIVE),
        noTurnover(),
      ],
    },
  ],
  checkpoints: [crowdRolledOnce],
};

const fumblerooski: ScenarioCase = {
  id: "stalling-fumblerooski",
  name: "Stalling: Fumblerooski still counts",
  description:
    "An Elf Union Lineman could score without a die, steps aside and puts " +
    "the ball down with Fumblerooski. The FAQ rules that this is still " +
    "Stalling, and on Turn 1 the crowd always hits.",
  capability: "stalling",
  interactions: [
    "protocol-command:move",
    "protocol-command:fumblerooski",
    "protocol-command:end-activation",
  ],
  setup: playSetup({
    turn: 1,
    team1Roster: RosterName.ELVEN_UNION,
    team1Placements: [
      { playerIndex: 0, x: 15, y: 5, hasBall: true },
      { playerIndex: 2, x: 2, y: 9 },
    ],
    team2Placements: [{ playerIndex: 0, x: 2, y: 1 }],
  }),
  fixture: {
    team1: { roster: RosterName.ELVEN_UNION },
    team2: { roster: RosterName.HUMAN },
  },
  steps: [
    step(
      { type: "declare-action", playerId: "team1:0", action: "move" },
      "the carrier declares a Move"
    ),
    step(
      { type: "move", playerId: "team1:0", path: [{ x: 15, y: 4 }] },
      "steps off the ball's line"
    ),
    step(
      { type: "fumblerooski", playerId: "team1:0", x: 15, y: 5 },
      "and leaves the ball behind"
    ),
    step(
      { type: "end-activation", playerId: "team1:0" },
      "then ends the activation"
    ),
  ],
  layers: ["engine"],
  interactive: true,
  variants: [
    {
      id: "crowd-hits",
      name: "The crowd hits",
      seed: 1,
      expectedOutcome:
        "Turn 1: any roll hits, so the Lineman is Knocked Down for a Turnover",
      checkpoints: [
        endsWithStatus("team1:0", PlayerStatus.PRONE),
        exactlyOneTurnover(),
      ],
    },
  ],
  checkpoints: [crowdRolledOnce],
};

export const STALLING_CASES: ScenarioCase[] = [crowdTakesAction, fumblerooski];
