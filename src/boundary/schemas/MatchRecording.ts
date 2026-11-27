import { z } from "zod";
import { rosterNameSchema } from "./RosterName";
import { lineupSchema } from "./Lineup";
import { recordedStepSchema } from "./RecordedStep";
import { findingSchema } from "./Finding";
import { teamPlayStatsSchema } from "./TeamPlayStats";
import { gameTypeSchema, venueSchema } from "./GameType";
import type { MatchRecording } from "../../simulation/runMatch";

const finalSchema = z.looseObject({
  phase: z.string(),
  score: z.tuple([z.number(), z.number()]),
  hash: z.string(),
});

export const matchRecordingSchema: z.ZodType<MatchRecording> = z.looseObject({
  format: z.literal("bb7-sim-recording"),
  version: z.literal(1),
  seed: z.number(),
  coachSeed: z.number(),
  rosters: z.tuple([rosterNameSchema, rosterNameSchema]),
  coaches: z.tuple([z.string(), z.string()]),
  rerolls: z.number(),
  lineup: lineupSchema.exactOptional(),
  inducements: z.union([z.literal(false), z.literal(true)]).exactOptional(),
  matchFormat: z
    .object({ gameType: gameTypeSchema, venue: venueSchema })
    .exactOptional(),
  steps: recordedStepSchema.array(),
  final: finalSchema,
  findings: findingSchema.array(),
  stats: z.tuple([teamPlayStatsSchema, teamPlayStatsSchema]).exactOptional(),
});
