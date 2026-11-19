import { z } from "zod";
import type { PlayerDriveModifiers } from "../../game/kickoff/driveEffects";

export const playerDriveModifiersSchema: z.ZodType<PlayerDriveModifiers> =
  z.looseObject({
    maModifier: z.number().exactOptional(),
    avModifier: z.number().exactOptional(),
    confinedToReserves: z
      .union([z.literal(false), z.literal(true)])
      .exactOptional(),
  });
