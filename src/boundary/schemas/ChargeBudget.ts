import { z } from "zod";
import type { ChargeBudget } from "../../game/kickoff/KickoffEventManager";

export const chargeBudgetSchema: z.ZodType<ChargeBudget> = z.looseObject({
  blitz: z.number(),
  throwTeammate: z.number(),
  kickTeammate: z.number(),
});
