import { z } from "zod";
import { gameTypeSchema } from "./GameType";
import type { LobbySettings } from "../../firebase/lobby";

export const lobbySettingsSchema: z.ZodType<LobbySettings> = z.looseObject({
  turnSeconds: z.number(),
  timeoutBankMs: z.number(),
  progressionEnabled: z.boolean(),
  gameType: gameTypeSchema.exactOptional(),
});
