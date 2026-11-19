import { z } from "zod";
import type { PenaltyShootout } from "../../competition/types";

export const penaltyShootoutSchema: z.ZodType<PenaltyShootout> = z.looseObject({
  home: z.number(),
  away: z.number(),
});
