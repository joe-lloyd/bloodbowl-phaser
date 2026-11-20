import { z } from "zod";
import { gameTypeSchema, venueSchema } from "./GameType";
import type { LobbySettings } from "../../firebase/lobby";

export const lobbySettingsSchema: z.ZodType<LobbySettings> = z.looseObject({
  turnSeconds: z.number(),
  timeoutBankMs: z.number(),
  progressionEnabled: z.boolean(),
  gameType: gameTypeSchema.exactOptional(),
  venue: venueSchema.exactOptional(),
  teamValue: z
    .object({ min: z.number().exactOptional(), max: z.number().exactOptional() })
    .exactOptional(),
});
