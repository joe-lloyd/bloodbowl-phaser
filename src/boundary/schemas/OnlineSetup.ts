import { z } from "zod";
import type { OnlineSetup } from "../../competition/types";

export const onlineSetupSchema: z.ZodType<OnlineSetup> = z.looseObject({
  places: z.number().int().min(2),
  listed: z.boolean(),
  roundDays: z.number().positive(),
  computerGames: z.union([z.literal("simulate"), z.literal("play")]),
  startedAt: z.number().exactOptional(),
});
