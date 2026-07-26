import { GameEventNames } from "../types/events";
import { GamePhase, SubPhase } from "../types/GameState";
import { RosterName } from "../types/Team";
import {
  KICKOFF_EVENT_MEANING,
  KICKOFF_TABLE,
  INTERACTIVE_KICKOFF_EVENTS,
  KickoffEvent,
} from "../game/kickoff/kickoffEvents";
import { RuleConfig, RuleOutcome, ScriptResult } from "../game/rules-lab";

export const KICKOFF_TOPIC = "Kickoff Table";

const team1Placements = Array.from({ length: 7 }, (_, playerIndex) => ({
  playerIndex,
  x: 5,
  y: playerIndex + 2,
}));

const team2Placements = Array.from({ length: 7 }, (_, playerIndex) => ({
  playerIndex,
  x: 14,
  y: playerIndex + 2,
}));

function resultEvent(result: ScriptResult): KickoffEvent | undefined {
  const event = result.events.find(
    (record) => record.name === GameEventNames.KickoffResult
  );
  return (event?.data as { event?: KickoffEvent } | undefined)?.event;
}

/** Curated examples keep the common testing path instant and reproducible. */
export const KICKOFF_EXAMPLE_SEEDS: Record<KickoffEvent, number> = {
  [KickoffEvent.GET_THE_REF]: 13,
  [KickoffEvent.TIME_OUT]: 4,
  [KickoffEvent.SOLID_DEFENCE]: 3,
  [KickoffEvent.HIGH_KICK]: 17,
  [KickoffEvent.CHEERING_FANS]: 2,
  [KickoffEvent.BRILLIANT_COACHING]: 8,
  [KickoffEvent.CHANGING_WEATHER]: 11,
  [KickoffEvent.QUICK_SNAP]: 25,
  [KickoffEvent.CHARGE]: 1,
  [KickoffEvent.DODGY_SNACK]: 7,
  [KickoffEvent.PITCH_INVASION]: 156,
};

const EVENT_OUTCOMES: RuleOutcome[] = Object.entries(KICKOFF_TABLE).map(
  ([roll, event]) => ({
    id: event
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, ""),
    name: `${roll} — ${event}`,
    description: KICKOFF_EVENT_MEANING[event],
    exampleSeed: KICKOFF_EXAMPLE_SEEDS[event],
    matches: (result) =>
      resultEvent(result) === event &&
      (!INTERACTIVE_KICKOFF_EVENTS.has(event) ||
        result.decisions.some(
          (decision) =>
            decision.type === "kickoff-event" && decision.event === event
        )),
  })
);

function kickoffConfig(
  id: string,
  name: string,
  description: string,
  turn: number
): RuleConfig {
  return {
    id,
    name,
    description,
    setup: {
      team1Placements,
      team2Placements,
      activeTeam: "team1",
      turn,
      phase: GamePhase.KICKOFF,
      subPhase: SubPhase.ROLL_KICKOFF,
      team1Roster: RosterName.HUMAN,
      team2Roster: RosterName.HUMAN,
    },
    script: [
      {
        type: "kick-ball",
        playerId: "team1:0",
        x: 14,
        y: 5,
      },
    ],
    seedSearch: { from: 1, limit: 800 },
    outcomes: EVENT_OUTCOMES.map((outcome) => ({ ...outcome })),
  };
}

/**
 * Browser-friendly kickoff setups. Both use the same legal seven-player
 * formations and deterministic kick target; the late-half variant makes the
 * Time-Out result demonstrate its turn-marker-backwards branch.
 */
export const KICKOFF_SCENARIOS: RuleConfig[] = [
  kickoffConfig(
    "kickoff-table-standard",
    "Standard Kickoff (Turn 2)",
    "Team 1 kicks to Team 2 from a legal seven-player formation. Time-Out moves both turn markers forward.",
    2
  ),
  kickoffConfig(
    "kickoff-table-late-half",
    "Late-Half Kickoff (Turn 5)",
    "The same kickoff on turn 5. Time-Out moves both turn markers back, exercising its alternate branch.",
    5
  ),
];

export function findKickoffConfig(configId: string): RuleConfig | undefined {
  return KICKOFF_SCENARIOS.find((config) => config.id === configId);
}
