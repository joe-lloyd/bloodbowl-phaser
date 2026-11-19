import { z } from "zod";
import type { FormationPosition } from "../../types/SetupTypes";

export const formationPositionSchema: z.ZodType<FormationPosition> =
  z.looseObject({
    playerId: z.string(),
    x: z.number(),
    y: z.number(),
  });
