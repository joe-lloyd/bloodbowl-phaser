import { z } from "zod";
import { setupRestrictionIdSchema } from "./SetupRestrictionId";
import type { SetupRestriction } from "../../types/SetupTypes";

export const setupRestrictionSchema: z.ZodType<SetupRestriction> =
  z.looseObject({
    id: setupRestrictionIdSchema,
    satisfied: z.boolean(),
    message: z.string(),
    summary: z.string().exactOptional(),
    wideZones: z
      .looseObject({
        top: z.number(),
        bottom: z.number(),
      })
      .exactOptional(),
    satisfiable: z.boolean(),
  });
