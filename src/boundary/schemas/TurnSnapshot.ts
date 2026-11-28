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
  spend: z
    .looseObject({
      blitzed: z.string().array(),
      fouled: z.string().array(),
      passes: z.number(),
      handOffs: z.number(),
    })
    .exactOptional(),
  hasThrownTeamMate: z.boolean().default(false),
  hasKickedTeamMate: z.boolean().default(false),
  hasThrownBomb: z.boolean().default(false),
  hasPunted: z.boolean().exactOptional(),
  endsAfterActivation: z.literal(true).exactOptional(),
  scoringTeamIds: z.string().array().exactOptional(),
  movementUsed: z.record(z.string(), z.number()),
});
