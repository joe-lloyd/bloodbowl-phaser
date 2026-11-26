import { z } from "zod";
import { playerStatusSchema } from "./PlayerStatus";
import { playerStatsSchema } from "./PlayerStats";
import { playerConditionInstanceSchema } from "./PlayerConditionInstance";
import type { PlayerSnapshot } from "../../headless/serialization";

const positionSchema = z.looseObject({
  x: z.number(),
  y: z.number(),
});

export const playerSnapshotSchema: z.ZodType<PlayerSnapshot> = z.looseObject({
  id: z.string(),
  name: z.string(),
  teamId: z.string(),
  number: z.number(),
  positionName: z.string(),
  position: z.union([z.null(), positionSchema]),
  status: playerStatusSchema,
  stats: playerStatsSchema,
  skills: z.string().array(),
  conditions: playerConditionInstanceSchema.array(),
  movementUsed: z.number(),
});
