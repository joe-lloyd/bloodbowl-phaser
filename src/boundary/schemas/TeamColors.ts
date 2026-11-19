import { z } from "zod";
import type { TeamColors } from "../../types/Team";

export const teamColorsSchema: z.ZodType<TeamColors> = z.looseObject({
  primary: z.number(),
  secondary: z.number(),
});
