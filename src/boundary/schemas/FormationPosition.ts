import { z } from "zod";
import {
  DEPLOYMENT_ROLES,
  type FormationPosition,
} from "../../types/SetupTypes";

export const formationPositionSchema: z.ZodType<FormationPosition> =
  z.looseObject({
    playerId: z.string(),
    x: z.number(),
    y: z.number(),
    role: z.enum(DEPLOYMENT_ROLES).exactOptional(),
  });
