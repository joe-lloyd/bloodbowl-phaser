import { z } from "zod";
import { owedOffensiveAssistSchema } from "./OwedOffensiveAssist";
import { playerDriveModifiersSchema } from "./PlayerDriveModifiers";
import type { DriveEffects } from "../../game/kickoff/driveEffects";

export const driveEffectsSchema: z.ZodType<DriveEffects> = z.looseObject({
  freeRerolls: z.record(z.string(), z.number()),
  owedAssists: z.record(z.string(), owedOffensiveAssistSchema),
  playerModifiers: z.record(z.string(), playerDriveModifiersSchema),
  conditions: z
    .union([
      z.literal("seagulls"),
      z.literal("loose-dogs"),
      z.literal("sticky-sludge"),
      z.literal("swarm-of-rats"),
      z.literal("round-on-us"),
    ])
    .array()
    .exactOptional(),
  floodedZone: z.union([z.literal("top"), z.literal("bottom")]).exactOptional(),
});
