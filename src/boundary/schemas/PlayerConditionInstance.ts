import { z } from "zod";
import { playerConditionSchema } from "./PlayerCondition";
import type { PlayerConditionInstance } from "../../types/Player";

export const playerConditionInstanceSchema: z.ZodType<PlayerConditionInstance> =
  z.looseObject({
    type: playerConditionSchema,
    byPlayerId: z.string().exactOptional(),
  });
