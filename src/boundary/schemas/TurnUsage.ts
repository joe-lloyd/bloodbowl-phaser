import { z } from "zod";
import type { TurnUsage } from "../../types/GameState";

export const turnUsageSchema: z.ZodType<TurnUsage> = z.looseObject({
  turn: z.string(),
  teams: z.string().array(),
  once: z.string().array(),
  uses: z.record(z.string(), z.number()),
});
