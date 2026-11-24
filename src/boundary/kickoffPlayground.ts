import { z } from "zod";
import { KickoffEvent } from "../game/kickoff/kickoffEvents";
import {
  PLAYGROUND_EVENTS,
  playgroundEvent,
  type PlaygroundConfig,
} from "../data/kickoffPlayground";
import { RosterName } from "../types/Team";

const side = z.enum(["team1", "team2"]);

const DEFAULTS: PlaygroundConfig = {
  scene: playgroundEvent("sevens", KickoffEvent.CHARGE),
  kicking: "team1",
  rosters: { team1: RosterName.HUMAN, team2: RosterName.ORC },
  players: null,
};

const schema = z.object({
  event: z
    .string()
    .transform((id) => PLAYGROUND_EVENTS.find((entry) => entry.id === id))
    .pipe(z.custom<PlaygroundConfig["scene"]>((entry) => entry !== undefined))
    .catch(DEFAULTS.scene),
  kicking: side.catch(DEFAULTS.kicking),
  team1: z.enum(RosterName).catch(DEFAULTS.rosters.team1),
  team2: z.enum(RosterName).catch(DEFAULTS.rosters.team2),
  players: z.coerce.number().int().min(1).max(7).nullable().catch(null),
});

export function readPlayground(params: URLSearchParams): PlaygroundConfig {
  const read = schema.parse({
    event: params.get("event"),
    kicking: params.get("kicking"),
    team1: params.get("team1"),
    team2: params.get("team2"),
    players: params.get("players") ?? "none",
  });
  return {
    scene: read.event,
    kicking: read.kicking,
    rosters: { team1: read.team1, team2: read.team2 },
    players: read.players,
  };
}

export function playgroundSearch(config: PlaygroundConfig): string {
  const params = new URLSearchParams({
    event: config.scene.id,
    kicking: config.kicking,
    team1: config.rosters.team1,
    team2: config.rosters.team2,
  });
  if (config.players !== null) params.set("players", String(config.players));
  return params.toString();
}
