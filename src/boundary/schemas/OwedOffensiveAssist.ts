import { z } from "zod";
import type { OwedOffensiveAssist } from "../../game/kickoff/driveEffects";

export const owedOffensiveAssistSchema: z.ZodType<OwedOffensiveAssist> =
  z.looseObject({
    turn: z.number(),
    used: z.boolean(),
  });
