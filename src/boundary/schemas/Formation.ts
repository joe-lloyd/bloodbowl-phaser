import { z } from "zod";
import type { Formation } from "../../types/Team";

export const formationSchema: z.ZodType<Formation> = z.looseObject({
  name: z.string(),
  positions: z
    .looseObject({
      playerId: z.string(),
      x: z.number(),
      y: z.number(),
    })
    .array(),
});
