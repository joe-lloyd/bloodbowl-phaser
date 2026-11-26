import {
  INTERACTIVE_KICKOFF_EVENTS,
  type KickoffEvent,
  kickoffEventOwner,
} from "../game/kickoff/kickoffEvents";
import { KICKOFF_TABLES } from "../game/kickoff/kickoffTables";
import { FormationManager } from "../game/managers/FormationManager";
import { isStandableSquare } from "../game/rules/pitchSquares";
import { SetupValidator } from "../game/validators/SetupValidator";
import { activeLayout, type MatchFormat } from "../game/variants/activeMatch";
import type { KickoffTableId } from "../game/variants/gameTypeRules";
import { GamePhase, SubPhase } from "../types/GameState";
import type { RosterName } from "../types/Team";
import type { PlayerPlacement, Scenario } from "../types/Scenario";

type Side = "team1" | "team2";

export interface PlaygroundEvent {
  id: string;
  event: KickoffEvent;
  label: string;
  group: string;
  coach: "kicking" | "receiving";
  format: MatchFormat;
}

export interface PlaygroundConfig {
  scene: PlaygroundEvent;
  kicking: Side;
  rosters: Record<Side, RosterName>;
  players: number | null;
}

const TABLES: Record<KickoffTableId, { group: string; format: MatchFormat }> = {
  sevens: {
    group: "Sevens",
    format: { gameType: "sevens", venue: "stadium" },
  },
  "street-bowl": {
    group: "Street Bowl",
    format: { gameType: "street-bowl", venue: "street" },
  },
  "beach-bowl": {
    group: "Beach Bowl",
    format: { gameType: "beach-bowl", venue: "beach" },
  },
  "gutter-street": {
    group: "Gutter Bowl, street",
    format: { gameType: "gutter-bowl", venue: "gutter-street" },
  },
  "gutter-sewer": {
    group: "Gutter Bowl, sewer",
    format: { gameType: "gutter-bowl", venue: "gutter-sewer" },
  },
};

const TABLE_IDS = [
  "sevens",
  "street-bowl",
  "beach-bowl",
  "gutter-street",
  "gutter-sewer",
] as const satisfies readonly KickoffTableId[];

const slug = (text: string) =>
  text
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");

export function playgroundEvent(
  table: KickoffTableId,
  event: KickoffEvent
): PlaygroundEvent {
  const { group, format } = TABLES[table];
  return {
    id: `${table}.${slug(event)}`,
    event,
    label: event,
    group,
    coach:
      kickoffEventOwner(event, "kicking", "receiving") === "kicking"
        ? "kicking"
        : "receiving",
    format,
  };
}

export const PLAYGROUND_EVENTS: readonly PlaygroundEvent[] = TABLE_IDS.flatMap(
  (table) =>
    Object.values(KICKOFF_TABLES[table])
      .filter((event) => INTERACTIVE_KICKOFF_EVENTS.has(event))
      .map((event) => playgroundEvent(table, event))
);

function placements(side: Side, use: "kick" | "receive"): PlayerPlacement[] {
  const isTeam1 = side === "team1";
  const manager = new FormationManager();
  const positions =
    manager
      .getBuiltInFormations(isTeam1)
      .find((formation) => formation.use === use)?.positions ??
    manager.getDefaultFormation(isTeam1);
  return positions.map(({ x, y }, playerIndex) => ({ playerIndex, x, y }));
}

export function playgroundScenario(config: PlaygroundConfig): Scenario {
  const { kicking, rosters, scene } = config;
  return {
    id: scene.id,
    name: `${scene.group}: ${scene.label}`,
    description: `The ${scene.coach} coach plays ${scene.label}.`,
    setup: {
      team1Placements: placements("team1", kicking === "team1" ? "kick" : "receive"),
      team2Placements: placements("team2", kicking === "team2" ? "kick" : "receive"),
      activeTeam: kicking === "team1" ? "team2" : "team1",
      turn: 1,
      phase: GamePhase.KICKOFF,
      subPhase: SubPhase.RESOLVE_KICKOFF,
      team1Roster: rosters.team1,
      team2Roster: rosters.team2,
    },
  };
}

export function playgroundLanding(
  { setup }: Scenario,
  kicking: Side
): { x: number; y: number } {
  const { cols, rows } = activeLayout();
  const taken = new Set(
    [...setup.team1Placements, ...setup.team2Placements].map(
      ({ x, y }) => `${String(x)},${String(y)}`
    )
  );
  const validator = new SetupValidator();
  const aim = {
    x: Math.round(cols * (kicking === "team1" ? 0.8 : 0.2)),
    y: Math.floor(rows / 2),
  };
  const open = Array.from({ length: cols * rows }, (_, index) => ({
    x: index % cols,
    y: Math.floor(index / cols),
  })).filter(
    ({ x, y }) =>
      isStandableSquare({ x, y }) &&
      !taken.has(`${String(x)},${String(y)}`) &&
      validator.isInSetupZone(x, y, kicking === "team2")
  );
  const distance = (square: { x: number; y: number }) =>
    Math.hypot(square.x - aim.x, square.y - aim.y);
  let best = open[0] ?? aim;
  for (const square of open) {
    if (distance(square) < distance(best)) best = square;
  }
  return best;
}
