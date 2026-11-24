import { z } from "zod";
import { kickoffEventOutcomeSchema } from "./KickoffEventOutcome";
import { kickoffEventSchema } from "./KickoffEvent";
import { kickoffTurnSchema } from "./KickoffTurn";
import { gridPositionSchema } from "./GridPosition";
import type { KickRecord, KickResolution } from "../../game/kickoff/kickRecord";

export const kickResolutionSchema: z.ZodType<KickResolution> = z.looseObject({
  roll: z.number(),
  event: kickoffEventSchema,
  meaning: z.string(),
  outcome: kickoffEventOutcomeSchema,
});

export const kickRecordSchema: z.ZodType<KickRecord> = z.looseObject({
  kickingTeamId: z.string(),
  stage: z.enum([
    "reaction",
    "event",
    "coach",
    "high-kick",
    "scatter",
    "landing",
    "placing",
    "landed",
  ]),
  aim: z.union([
    z.null(),
    z.looseObject({
      playerId: z.string(),
      targetX: z.number(),
      targetY: z.number(),
    }),
  ]),
  touchback: z.boolean(),
  touchbackTeamId: z.union([z.null(), z.string()]),
  scatter: z.number(),
  resolution: z.union([z.null(), kickResolutionSchema]),
  step: z.union([
    z.null(),
    kickoffTurnSchema,
    z.looseObject({
      stage: z.literal("choose"),
      event: kickoffEventSchema,
      teamId: z.string(),
      selectionLimit: z.number(),
      selectedPlayerIds: z.string().array(),
      landingSquare: gridPositionSchema.exactOptional(),
    }),
  ]),
  rehearsal: z.union([
    z.null(),
    z.looseObject({
      event: kickoffEventSchema,
      selectionLimit: z.number().exactOptional(),
    }),
  ]),
});
