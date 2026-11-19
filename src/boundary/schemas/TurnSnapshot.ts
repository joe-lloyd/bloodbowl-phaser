import { z } from "zod";
import type { TurnSnapshot } from "../../headless/serialization";

export const turnSnapshotSchema: z.ZodType<TurnSnapshot> = z.looseObject({
  teamId: z.string(),
  turnNumber: z.number(),
  isHalf2: z.boolean(),
  extraTime: z.union([z.literal(false), z.literal(true)]).exactOptional(),
  activatedPlayerIds: z.string().array(),
  hasBlitzed: z.boolean(),
  hasPassed: z.boolean(),
  hasHandedOff: z.boolean(),
  hasFouled: z.boolean(),
  hasThrownTeamMate: z.boolean(),
  hasKickedTeamMate: z.boolean(),
  hasThrownBomb: z.boolean(),
  movementUsed: z.record(z.string(), z.number()),
});
