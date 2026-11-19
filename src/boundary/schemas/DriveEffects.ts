import { z } from "zod";
import { owedOffensiveAssistSchema } from "./OwedOffensiveAssist";
import { playerDriveModifiersSchema } from "./PlayerDriveModifiers";
import type { DriveEffects } from "../../game/kickoff/driveEffects";

export const driveEffectsSchema: z.ZodType<DriveEffects> = z.looseObject({
  freeRerolls: z.record(z.string(), z.number()),
  owedAssists: z.record(z.string(), owedOffensiveAssistSchema),
  playerModifiers: z.record(z.string(), playerDriveModifiersSchema),
});
